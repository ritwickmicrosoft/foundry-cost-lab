import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { productionCredential } from '../storage/rateRepository.js'

export type AccessRequestStatus = 'pending' | 'approved' | 'rejected'

export interface AccessRequestRecord {
  schemaVersion: 1
  requestId: string
  identityProvider: 'aad'
  userId: string
  userDetails: string
  reason: string
  status: AccessRequestStatus
  requestedAt: string
  updatedAt: string
  decidedAt?: string
  decidedByUserId?: string
  invitationUrl?: string
  invitationExpiresOn?: string
  appUrl?: string
  accessGrantedAt?: string
  emailDeliveryStatus?: 'not-configured' | 'pending' | 'sent' | 'failed'
  emailSentAt?: string
  emailOperationId?: string
  emailErrorCode?: string
}

export interface AccessRequestRepository {
  read(requestId: string): Promise<AccessRequestRecord | null>
  write(record: AccessRequestRecord): Promise<void>
  list(): Promise<AccessRequestRecord[]>
}

function parseRecord(value: string): AccessRequestRecord {
  const record = JSON.parse(value) as Partial<AccessRequestRecord>
  if (
    record.schemaVersion !== 1 ||
    typeof record.requestId !== 'string' ||
    !/^[a-f0-9]{24}$/.test(record.requestId) ||
    record.identityProvider !== 'aad' ||
    typeof record.userId !== 'string' ||
    typeof record.userDetails !== 'string' ||
    typeof record.reason !== 'string' ||
    !['pending', 'approved', 'rejected'].includes(record.status ?? '') ||
    typeof record.requestedAt !== 'string' ||
    typeof record.updatedAt !== 'string'
  ) {
    throw new Error('Stored access request is invalid.')
  }
  if (
    record.emailDeliveryStatus !== undefined &&
    !['not-configured', 'pending', 'sent', 'failed'].includes(record.emailDeliveryStatus)
  ) {
    throw new Error('Stored access request email status is invalid.')
  }
  return record as AccessRequestRecord
}

const sortRequests = (records: AccessRequestRecord[]) => records.sort((left, right) =>
  right.updatedAt.localeCompare(left.updatedAt),
)

export class FileAccessRequestRepository implements AccessRequestRepository {
  constructor(private readonly directory: string) {}

  private recordPath(requestId: string) {
    return path.join(this.directory, `${requestId}.json`)
  }

  async read(requestId: string): Promise<AccessRequestRecord | null> {
    try {
      return parseRecord(await readFile(this.recordPath(requestId), 'utf8'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  async write(record: AccessRequestRecord): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    const target = this.recordPath(record.requestId)
    const temporary = `${target}.next`
    await writeFile(temporary, JSON.stringify(record, null, 2), 'utf8')
    await rename(temporary, target)
  }

  async list(): Promise<AccessRequestRecord[]> {
    try {
      const names = (await readdir(this.directory)).filter((name) => name.endsWith('.json'))
      return sortRequests(await Promise.all(
        names.map(async (name) => parseRecord(await readFile(path.join(this.directory, name), 'utf8'))),
      ))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }
}

export class BlobAccessRequestRepository implements AccessRequestRepository {
  private readonly container: ContainerClient

  constructor(
    accountUrl: string,
    containerName: string,
    private readonly prefix = 'access-requests',
  ) {
    this.container = new BlobServiceClient(accountUrl, productionCredential()).getContainerClient(containerName)
  }

  private blobName(requestId: string) {
    return `${this.prefix}/${requestId}.json`
  }

  async read(requestId: string): Promise<AccessRequestRecord | null> {
    try {
      const buffer = await this.container.getBlockBlobClient(this.blobName(requestId)).downloadToBuffer()
      return parseRecord(buffer.toString('utf8'))
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 404) return null
      throw error
    }
  }

  async write(record: AccessRequestRecord): Promise<void> {
    const body = JSON.stringify(record, null, 2)
    await this.container.getBlockBlobClient(this.blobName(record.requestId)).upload(
      body,
      Buffer.byteLength(body),
      { blobHTTPHeaders: { blobContentType: 'application/json' } },
    )
  }

  async list(): Promise<AccessRequestRecord[]> {
    const records: AccessRequestRecord[] = []
    for await (const blob of this.container.listBlobsFlat({ prefix: `${this.prefix}/` })) {
      if (!blob.name.endsWith('.json')) continue
      const requestId = path.posix.basename(blob.name, '.json')
      const record = await this.read(requestId)
      if (record) records.push(record)
    }
    return sortRequests(records)
  }
}

export function createAccessRequestRepository(): AccessRequestRepository {
  const accountUrl = process.env.RATE_STORAGE_ACCOUNT_URL
  if (accountUrl) {
    return new BlobAccessRequestRepository(
      accountUrl,
      process.env.RATE_STORAGE_CONTAINER ?? 'rate-cards',
    )
  }
  return new FileAccessRequestRepository(
    path.join(process.env.RATE_STORAGE_DIRECTORY ?? path.resolve(process.cwd(), 'data'), 'access-requests'),
  )
}
