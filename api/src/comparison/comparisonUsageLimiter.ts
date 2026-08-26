import { createHash } from 'node:crypto'
import { BlobServiceClient, type BlockBlobClient } from '@azure/storage-blob'
import { productionCredential } from '../storage/rateRepository.js'

export interface ComparisonUsageLimiter {
  consume(userKey: string): Promise<number>
}

const usageId = (userKey: string) => createHash('sha256').update(userKey).digest('hex').slice(0, 32)

export class MemoryComparisonUsageLimiter implements ComparisonUsageLimiter {
  private readonly counts = new Map<string, number>()

  constructor(private readonly limit = 20, private readonly now = () => new Date()) {}

  async consume(userKey: string): Promise<number> {
    const key = `${this.now().toISOString().slice(0, 10)}:${usageId(userKey)}`
    const next = (this.counts.get(key) ?? 0) + 1
    if (next > this.limit) throw Object.assign(new Error('Daily comparison explanation limit reached.'), { code: 'daily-limit' })
    this.counts.set(key, next)
    return this.limit - next
  }
}

export class BlobComparisonUsageLimiter implements ComparisonUsageLimiter {
  private readonly container

  constructor(
    accountUrl: string,
    containerName: string,
    private readonly limit = 20,
    private readonly now = () => new Date(),
  ) {
    this.container = new BlobServiceClient(accountUrl, productionCredential()).getContainerClient(containerName)
  }

  private client(userKey: string): BlockBlobClient {
    const date = this.now().toISOString().slice(0, 10)
    return this.container.getBlockBlobClient(`comparison-ai-usage/${date}/${usageId(userKey)}.json`)
  }

  async consume(userKey: string): Promise<number> {
    const client = this.client(userKey)
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let count = 0
      let etag: string | undefined
      try {
        const [content, properties] = await Promise.all([client.downloadToBuffer(), client.getProperties()])
        count = (JSON.parse(content.toString('utf8')) as { count?: number }).count ?? 0
        etag = properties.etag
      } catch (error) {
        if ((error as { statusCode?: number }).statusCode !== 404) throw error
      }
      if (count >= this.limit) {
        throw Object.assign(new Error('Daily comparison explanation limit reached.'), { code: 'daily-limit' })
      }
      const body = JSON.stringify({ count: count + 1 })
      try {
        await client.upload(body, Buffer.byteLength(body), {
          blobHTTPHeaders: { blobContentType: 'application/json' },
          conditions: etag ? { ifMatch: etag } : { ifNoneMatch: '*' },
        })
        return this.limit - count - 1
      } catch (error) {
        if ((error as { statusCode?: number }).statusCode !== 412) throw error
      }
    }
    throw new Error('Comparison usage could not be recorded.')
  }
}

export function getComparisonDailyLimit(): number {
  const configuredLimit = Number(process.env.COMPARISON_AI_DAILY_LIMIT ?? 20)
  return Number.isInteger(configuredLimit) && configuredLimit > 0 ? configuredLimit : 20
}

export function createComparisonUsageLimiter(): ComparisonUsageLimiter {
  const limit = getComparisonDailyLimit()
  const accountUrl = process.env.RATE_STORAGE_ACCOUNT_URL
  return accountUrl
    ? new BlobComparisonUsageLimiter(accountUrl, process.env.RATE_STORAGE_CONTAINER ?? 'rate-cards', limit)
    : new MemoryComparisonUsageLimiter(limit)
}