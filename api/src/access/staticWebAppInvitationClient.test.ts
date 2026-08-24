import type { AccessToken, TokenCredential } from '@azure/identity'
import { describe, expect, it, vi } from 'vitest'
import { StaticWebAppInvitationClient } from './staticWebAppInvitationClient.js'

const credential: TokenCredential = {
  getToken: async (): Promise<AccessToken> => ({ token: 'managed-identity-token', expiresOnTimestamp: Date.now() + 60_000 }),
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
    expect(fetcher.mock.calls[0]?.[0]).toContain('/staticSites/static-site?api-version=2024-11-01')
    expect(fetcher.mock.calls[1]?.[0]).toContain('/staticSites/static-site/createUserInvitation?api-version=2024-11-01')
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer managed-identity-token',
    })
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

  it('fails closed on ARM errors or incomplete invitation responses', async () => {
    const forbidden = new StaticWebAppInvitationClient(
      'subscription-id',
      'resource-group',
      'static-site',
      credential,
      async () => new Response('{}', { status: 403, statusText: 'Forbidden' }),
    )
    await expect(forbidden.createInvitation('person@example.com')).rejects.toThrow('403 Forbidden')
  })
})