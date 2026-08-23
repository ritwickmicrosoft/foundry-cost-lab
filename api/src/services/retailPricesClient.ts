export const RETAIL_PRICES_URL = 'https://prices.azure.com/api/retail/prices'

export interface RetailPriceItem {
  currencyCode: string
  tierMinimumUnits?: number
  retailPrice: number
  unitPrice: number
  armRegionName: string
  effectiveStartDate: string
  effectiveEndDate?: string
  meterName: string
  productName: string
  skuName: string
  serviceName: string
  unitOfMeasure: string
  isPrimaryMeterRegion: boolean
}

interface RetailPriceResponse {
  Items: RetailPriceItem[]
  NextPageLink: string | null
}

export interface RateLookupClient {
  query(filter: string): Promise<RetailPriceItem[]>
}

interface RetailPricesClientOptions {
  maxRetries?: number
  delay?: (milliseconds: number) => Promise<void>
}

const retryableStatuses = new Set([429, 500, 502, 503, 504])

const defaultDelay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

function retryDelay(response: Response | null, retry: number) {
  const retryAfter = response?.headers.get('Retry-After')
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000
    const date = Date.parse(retryAfter)
    if (Number.isFinite(date)) return Math.max(0, date - Date.now())
  }
  return Math.min(10_000, 1_000 * 2 ** retry)
}

export class RetailPricesClient implements RateLookupClient {
  private readonly maxRetries: number
  private readonly delay: (milliseconds: number) => Promise<void>

  constructor(
    private readonly fetcher: typeof fetch = fetch,
    options: RetailPricesClientOptions = {},
  ) {
    this.maxRetries = Math.max(0, options.maxRetries ?? 4)
    this.delay = options.delay ?? defaultDelay
  }

  private async fetchPage(url: string) {
    let lastError: unknown
    for (let retry = 0; retry <= this.maxRetries; retry += 1) {
      let response: Response | null = null
      try {
        response = await this.fetcher(url, { headers: { Accept: 'application/json' } })
        if (response.ok) return response
        if (!retryableStatuses.has(response.status) || retry === this.maxRetries) {
          throw new Error(`Retail Prices API returned ${response.status} ${response.statusText}.`)
        }
        lastError = new Error(`Retail Prices API returned ${response.status} ${response.statusText}.`)
      } catch (error) {
        if (retry === this.maxRetries || (response && !retryableStatuses.has(response.status))) throw error
        lastError = error
      }
      await this.delay(retryDelay(response, retry))
    }
    throw lastError instanceof Error ? lastError : new Error('Retail Prices API request failed.')
  }

  async query(filter: string): Promise<RetailPriceItem[]> {
    const firstPage = new URL(RETAIL_PRICES_URL)
    firstPage.searchParams.set('$filter', filter)
    firstPage.searchParams.set('$top', '1000')
    firstPage.searchParams.set('currencyCode', "'CAD'")

    const items: RetailPriceItem[] = []
    const visited = new Set<string>()
    let nextPage: string | null = firstPage.toString()

    while (nextPage) {
      if (visited.has(nextPage)) throw new Error('Retail Prices API returned a pagination loop.')
      visited.add(nextPage)
      const response = await this.fetchPage(nextPage)
      const page = (await response.json()) as Partial<RetailPriceResponse>
      if (!Array.isArray(page.Items)) throw new Error('Retail Prices API response omitted Items.')
      items.push(...page.Items)
      nextPage = page.NextPageLink ? new URL(page.NextPageLink, RETAIL_PRICES_URL).toString() : null
    }

    return items
  }
}