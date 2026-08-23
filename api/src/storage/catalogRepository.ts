import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { FoundryModelCatalogSnapshot, RegionId } from '../contracts.js'
import type { CatalogSyncRepository } from '../services/catalogSync.js'
import { productionCredential } from './rateRepository.js'

function parseCatalog(value: string): FoundryModelCatalogSnapshot {
  const snapshot = JSON.parse(value) as Partial<FoundryModelCatalogSnapshot>
  if (
    snapshot.schemaVersion !== 1 ||
    !snapshot.asOf ||
    !snapshot.generatedAt ||
    !snapshot.region ||
    !snapshot.sourceUrl ||
    !Array.isArray(snapshot.models) ||
    snapshot.models.length === 0
  ) {
    throw new Error('Stored Foundry model catalog is invalid.')
  }
  return snapshot as FoundryModelCatalogSnapshot
}

export class FileCatalogRepository implements CatalogSyncRepository {
  constructor(private readonly directory: string) {}

  private get currentPath() {
    return path.join(this.directory, 'current.json')
  }

  async readCurrent(): Promise<FoundryModelCatalogSnapshot | null> {
    try {
      return parseCatalog(await readFile(this.currentPath, 'utf8'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  async writeSnapshot(snapshot: FoundryModelCatalogSnapshot): Promise<void> {
    const historyDirectory = path.join(this.directory, 'history')
    await mkdir(historyDirectory, { recursive: true })
    await writeFile(path.join(historyDirectory, `${snapshot.asOf}.json`), JSON.stringify(snapshot, null, 2), 'utf8')
  }

  async promote(snapshot: FoundryModelCatalogSnapshot): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    const temporary = `${this.currentPath}.next`
    await writeFile(temporary, JSON.stringify(snapshot, null, 2), 'utf8')
    await rename(temporary, this.currentPath)
  }
}

export class BlobCatalogRepository implements CatalogSyncRepository {
  private readonly container: ContainerClient

  constructor(accountUrl: string, containerName: string, private readonly prefix: string) {
    this.container = new BlobServiceClient(accountUrl, productionCredential()).getContainerClient(containerName)
  }

  private blobName(name: string) {
    return `${this.prefix}/${name}`
  }

  async readCurrent(): Promise<FoundryModelCatalogSnapshot | null> {
    try {
      const buffer = await this.container.getBlockBlobClient(this.blobName('current.json')).downloadToBuffer()
      return parseCatalog(buffer.toString('utf8'))
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 404) return null
      throw error
    }
  }

  private async writeBlob(name: string, snapshot: FoundryModelCatalogSnapshot) {
    const body = JSON.stringify(snapshot, null, 2)
    await this.container.getBlockBlobClient(this.blobName(name)).upload(body, Buffer.byteLength(body), {
      blobHTTPHeaders: { blobContentType: 'application/json' },
    })
  }

  writeSnapshot(snapshot: FoundryModelCatalogSnapshot) {
    return this.writeBlob(`history/${snapshot.asOf}.json`, snapshot)
  }

  promote(snapshot: FoundryModelCatalogSnapshot) {
    return this.writeBlob('current.json', snapshot)
  }
}

export function createCatalogRepository(region: RegionId): CatalogSyncRepository {
  const accountUrl = process.env.RATE_STORAGE_ACCOUNT_URL
  if (accountUrl) {
    return new BlobCatalogRepository(
      accountUrl,
      process.env.RATE_STORAGE_CONTAINER ?? 'rate-cards',
      `catalog/${region}`,
    )
  }
  return new FileCatalogRepository(
    path.join(process.env.RATE_STORAGE_DIRECTORY ?? path.resolve(process.cwd(), 'data'), 'catalog', region),
  )
}