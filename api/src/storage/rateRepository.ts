import { DefaultAzureCredential, ManagedIdentityCredential, type TokenCredential } from '@azure/identity'
import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { RateCard, RegionId } from '../contracts.js'
import type { SyncRepository } from '../services/rateSync.js'

export interface RateRepository extends SyncRepository {
  readHistory(limit: number): Promise<RateCard[]>
}

function parseRateCard(value: string): RateCard {
  const parsed = JSON.parse(value) as Partial<RateCard>
  if (!parsed.asOf || !parsed.rates || !parsed.region) throw new Error('Stored rate card is invalid.')
  for (const [key, rate] of Object.entries(parsed.rates)) {
    if (!rate.source || !rate.asOf) throw new Error(`Stored rate ${key} lacks provenance.`)
    if (rate.currency !== 'CAD') throw new Error(`Stored rate ${key} currency must be CAD.`)
  }
  return parsed as RateCard
}

export class FileRateRepository implements RateRepository {
  constructor(private readonly directory: string) {}

  private get currentPath() {
    return path.join(this.directory, 'current.json')
  }

  private get historyDirectory() {
    return path.join(this.directory, 'history')
  }

  async readCurrent(): Promise<RateCard | null> {
    try {
      return parseRateCard(await readFile(this.currentPath, 'utf8'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  async writeSnapshot(rateCard: RateCard): Promise<void> {
    await mkdir(this.historyDirectory, { recursive: true })
    const target = path.join(this.historyDirectory, `${rateCard.asOf}.json`)
    await writeFile(target, JSON.stringify(rateCard, null, 2), 'utf8')
  }

  async promote(rateCard: RateCard): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    const temporary = `${this.currentPath}.next`
    await writeFile(temporary, JSON.stringify(rateCard, null, 2), 'utf8')
    await rename(temporary, this.currentPath)
  }

  async readHistory(limit: number): Promise<RateCard[]> {
    try {
      const names = (await readdir(this.historyDirectory))
        .filter((name) => name.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, Math.max(0, limit))
      return Promise.all(
        names.map(async (name) => parseRateCard(await readFile(path.join(this.historyDirectory, name), 'utf8'))),
      )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }
}

export function productionCredential(): TokenCredential {
  if (process.env.AZURE_FUNCTIONS_ENVIRONMENT === 'Development') {
    return new DefaultAzureCredential()
  }
  return process.env.AZURE_CLIENT_ID
    ? new ManagedIdentityCredential(process.env.AZURE_CLIENT_ID)
    : new ManagedIdentityCredential()
}

export class BlobRateRepository implements RateRepository {
  private readonly container: ContainerClient

  constructor(
    accountUrl: string,
    containerName: string,
    credential: TokenCredential = productionCredential(),
    private readonly prefix = '',
  ) {
    this.container = new BlobServiceClient(accountUrl, credential).getContainerClient(containerName)
  }

  private blobName(name: string) {
    return this.prefix ? `${this.prefix}/${name}` : name
  }

  private async readBlob(name: string): Promise<RateCard | null> {
    try {
      const buffer = await this.container.getBlockBlobClient(this.blobName(name)).downloadToBuffer()
      return parseRateCard(buffer.toString('utf8'))
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 404) return null
      throw error
    }
  }

  private async writeBlob(name: string, rateCard: RateCard) {
    const body = JSON.stringify(rateCard, null, 2)
    await this.container.getBlockBlobClient(this.blobName(name)).upload(body, Buffer.byteLength(body), {
      blobHTTPHeaders: { blobContentType: 'application/json' },
    })
  }

  readCurrent() {
    return this.readBlob('current.json')
  }

  writeSnapshot(rateCard: RateCard) {
    return this.writeBlob(`history/${rateCard.asOf}.json`, rateCard)
  }

  promote(rateCard: RateCard) {
    return this.writeBlob('current.json', rateCard)
  }

  async readHistory(limit: number): Promise<RateCard[]> {
    const names: string[] = []
    const prefix = this.blobName('history/')
    for await (const blob of this.container.listBlobsFlat({ prefix })) {
      if (blob.name.endsWith('.json')) {
        names.push(this.prefix ? blob.name.slice(this.prefix.length + 1) : blob.name)
      }
    }
    names.sort().reverse()
    const selected = names.slice(0, Math.max(0, limit))
    const cards = await Promise.all(selected.map((name) => this.readBlob(name)))
    return cards.filter((card): card is RateCard => card !== null)
  }
}

export function createRateRepository(region: RegionId = 'canadacentral'): RateRepository {
  const accountUrl = process.env.RATE_STORAGE_ACCOUNT_URL
  if (accountUrl) {
    return new BlobRateRepository(
      accountUrl,
      process.env.RATE_STORAGE_CONTAINER ?? 'rate-cards',
      productionCredential(),
      region,
    )
  }
  return new FileRateRepository(
    path.join(process.env.RATE_STORAGE_DIRECTORY ?? path.resolve(process.cwd(), 'data'), region),
  )
}