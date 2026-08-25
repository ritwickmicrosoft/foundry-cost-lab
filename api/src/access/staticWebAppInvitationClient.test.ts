import type { AccessToken, TokenCredential } from '@azure/identity'
import { describe, expect, it, vi } from 'vitest'
import { StaticWebAppInvitationClient } from './staticWebAppInvitationClient.js'

const credential: TokenCredential = {
  getToken: async (): Promise<AccessToken> => ({ token: 'test-token', expiresOnTimestamp: Date.now() + 60_000 }),
}

describe('Static Web Apps invitation client', () => {
  it('reads the site domain and creates a bounded AAD role invitation', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        properties: { defaultHostname: 'foundry.example.azurestaticapps.net' },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        properties: {
          invitationUrl: 'https://foundry.example.azurestaticapps.net/?invite=token',
          expiresOn: '2026-08-24T10:00:00Z',
        },
      }), { status: 200 }))
    const client = new StaticWebAppInvitationClient(
      'subscription-id',
      'resource-group',
      'static-site',
      credential,
      fetcher,
    )

    await expect(client.createInvitation('person@example.com', 'costlab-user', 500)).resolves.toEqual({
      invitationUrl: 'https://foundry.example.azurestaticapps.net/?invite=token',
      expiresOn: '2026-08-24T10:00:00Z',
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[1]?.[0]).toContain('/staticSites/static-site/createUserInvitation?api-version=2024-11-01')
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' })
    expect(JSON.parse(fetcher.mock.calls[1]?.[1]?.body as string)).toEqual({
      properties: {
        domain: 'foundry.example.azurestaticapps.net',
        numHoursToExpiration: 168,
        provider: 'aad',
        roles: 'costlab-user',
        userDetails: 'person@example.com',
      },
    })
  })

  it('reports only sanitized ARM diagnostics on invitation failure', async () => {
    const forbidden = new StaticWebAppInvitationClient(
      'subscription-id',
      'resource-group',
      'static-site',
      credential,
      async () => new Response(JSON.stringify({
        error: {
          code: 'AuthorizationFailed',
          message: "Sensitive details cannot perform action 'Microsoft.Web/staticSites/createUserInvitation/action' over scope '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/staticSites/site'",
        },
      }), {
        status: 403,
        statusText: 'Forbidden',
        headers: { 'x-ms-correlation-request-id': '12345678-1234-1234-1234-123456789abc' },
      }),
    )

    const error = await forbidden.createInvitation('private@example.com').catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('code=AuthorizationFailed')
    expect((error as Error).message).toContain('action=Microsoft.Web/staticSites/createUserInvitation/action')
    expect((error as Error).message).not.toContain('private@example.com')
  })
})