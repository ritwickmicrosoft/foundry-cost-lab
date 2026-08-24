import type { TokenCredential } from '@azure/identity'
import { productionCredential } from '../storage/rateRepository.js'

const ARM_RESOURCE = 'https://management.azure.com'
const ARM_SCOPE = `${ARM_RESOURCE}/.default`
const API_VERSION = '2024-11-01'

interface StaticSiteResponse {
  properties?: { defaultHostname?: string }
}

interface InvitationResponse {
  properties?: {
    invitationUrl?: string
    expiresOn?: string
  }
}

export interface AccessInvitation {
  invitationUrl: string
  expiresOn: string
}

export class StaticWebAppInvitationClient {
  constructor(
    private readonly subscriptionId: string,
    private readonly resourceGroup: string,
    private readonly staticSiteName: string,
    private readonly credential: TokenCredential = productionCredential(),
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private siteUrl(suffix = '') {
    return `${ARM_RESOURCE}/subscriptions/${encodeURIComponent(this.subscriptionId)}` +
      `/resourceGroups/${encodeURIComponent(this.resourceGroup)}` +
      `/providers/Microsoft.Web/staticSites/${encodeURIComponent(this.staticSiteName)}` +
      `${suffix}?api-version=${API_VERSION}`
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const token = await this.credential.getToken(ARM_SCOPE)
    if (!token) throw new Error('Managed identity could not acquire an Azure Resource Manager token.')
    const response = await this.fetcher(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token.token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    })
    if (!response.ok) {
      throw new Error(`Static Web Apps invitation API returned ${response.status} ${response.statusText}.`)
    }
    return await response.json() as T
  }

  async createInvitation(
    userDetails: string,
    roles = 'costlab-user',
    hoursToExpiration = 24,
  ): Promise<AccessInvitation> {
    const site = await this.request<StaticSiteResponse>(this.siteUrl())
    const domain = site.properties?.defaultHostname?.trim()
    if (!domain) throw new Error('Static Web App default hostname is unavailable.')

    const invitation = await this.request<InvitationResponse>(this.siteUrl('/createUserInvitation'), {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          domain,
          numHoursToExpiration: Math.min(168, Math.max(1, Math.round(hoursToExpiration))),
          provider: 'aad',
          roles,
          userDetails,
        },
      }),
    })
    const invitationUrl = invitation.properties?.invitationUrl?.trim()
    const expiresOn = invitation.properties?.expiresOn?.trim()
    if (!invitationUrl || !expiresOn || new URL(invitationUrl).protocol !== 'https:') {
      throw new Error('Static Web Apps invitation response is incomplete.')
    }
    return { invitationUrl, expiresOn }
  }
}

export function createStaticWebAppInvitationClient() {
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID?.trim()
  const resourceGroup = process.env.AZURE_RESOURCE_GROUP?.trim()
  const staticSiteName = process.env.STATIC_WEB_APP_NAME?.trim()
  if (!subscriptionId || !resourceGroup || !staticSiteName) {
    throw new Error('Static Web Apps invitation configuration is incomplete.')
  }
  return new StaticWebAppInvitationClient(
    subscriptionId,
    resourceGroup,
    staticSiteName,
  )
}