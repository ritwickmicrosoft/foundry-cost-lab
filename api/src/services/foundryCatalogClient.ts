import type { AccessToken, TokenCredential } from '@azure/identity'
import type { RegionId } from '../contracts.js'

export const FOUNDRY_CATALOG_API_VERSION = '2025-09-01'
export const FOUNDRY_CATALOG_RESOURCE = 'https://management.azure.com'

export interface ArmFoundryModel {
  kind?: string
  model?: {
    capabilities?: Record<string, string | boolean | null>
    format?: string | null
    lifecycleStatus?: string | null
    modelCatalogAssetId?: string | null
    name?: string | null
    publisher?: string | null
    skus?: Array<{ name?: string | null }> | null
    version?: string | null
  }
  skuName?: string
}

interface ArmListResponse {
  value?: ArmFoundryModel[]
  nextLink?: string | null
}

export interface FoundryCatalogLookupClient {
  list(region: RegionId): Promise<ArmFoundryModel[]>
}

export class FoundryCatalogClient implements FoundryCatalogLookupClient {
  constructor(
    private readonly subscriptionId: string,
    private readonly credential: TokenCredential,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async list(region: RegionId): Promise<ArmFoundryModel[]> {
    const token: AccessToken | null = await this.credential.getToken(`${FOUNDRY_CATALOG_RESOURCE}/.default`)
    if (!token) throw new Error('Managed identity did not return an Azure Resource Manager token.')

    const firstPage = new URL(
      `/subscriptions/${encodeURIComponent(this.subscriptionId)}/providers/Microsoft.CognitiveServices/locations/${region}/models`,
      FOUNDRY_CATALOG_RESOURCE,
    )
    firstPage.searchParams.set('api-version', FOUNDRY_CATALOG_API_VERSION)

    const models: ArmFoundryModel[] = []
    const visited = new Set<string>()
    let nextPage: string | null = firstPage.toString()
    while (nextPage) {
      if (visited.has(nextPage)) throw new Error('Foundry catalog API returned a pagination loop.')
      visited.add(nextPage)
      const response = await this.fetcher(nextPage, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token.token}`,
        },
      })
      if (!response.ok) {
        throw new Error(`Foundry catalog API returned ${response.status} ${response.statusText}.`)
      }
      const page = (await response.json()) as ArmListResponse
      if (!Array.isArray(page.value)) throw new Error('Foundry catalog API response omitted value.')
      models.push(...page.value)
      nextPage = page.nextLink ? new URL(page.nextLink, FOUNDRY_CATALOG_RESOURCE).toString() : null
    }
    return models
  }
}