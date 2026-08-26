import { HttpRequest } from '@azure/functions'
import { afterEach, describe, expect, it } from 'vitest'
import { comparisonAiStatus, explainComparison } from './comparisonExplain.js'

const request = (roles?: string[], method = 'GET') => new HttpRequest({
  method,
  url: 'https://example.test/api/comparison/explain',
  headers: roles ? {
    'content-type': 'application/json',
    'x-ms-client-principal': Buffer.from(JSON.stringify({
      identityProvider: 'aad',
      userId: 'user-id',
      userDetails: 'person@example.com',
      userRoles: roles,
    })).toString('base64'),
  } : undefined,
  body: method === 'POST' ? { string: '{}' } : undefined,
})

const originalEnabled = process.env.COMPARISON_AI_ENABLED
afterEach(() => { process.env.COMPARISON_AI_ENABLED = originalEnabled })

describe('comparison explanation Functions', () => {
  it('requires authentication and costlab-user', () => {
    expect(comparisonAiStatus(request())).toMatchObject({ status: 401 })
    expect(comparisonAiStatus(request(['authenticated']))).toMatchObject({ status: 403 })
  })

  it('reports disabled configuration without exposing settings', () => {
    process.env.COMPARISON_AI_ENABLED = 'false'
    expect(comparisonAiStatus(request(['authenticated', 'costlab-user']))).toMatchObject({
      status: 200,
      jsonBody: { enabled: false },
    })
  })

  it('fails closed before parsing content when AI is disabled', async () => {
    process.env.COMPARISON_AI_ENABLED = 'false'
    await expect(explainComparison(
      request(['authenticated', 'costlab-user'], 'POST'),
      { log: () => undefined, error: () => undefined } as never,
    )).resolves.toMatchObject({ status: 503 })
  })
})