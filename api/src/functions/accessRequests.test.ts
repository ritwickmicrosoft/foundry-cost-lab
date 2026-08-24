import { HttpRequest } from '@azure/functions'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  decideAccessRequest,
  getOwnAccessRequest,
  listAccessRequests,
  submitAccessRequest,
} from './accessRequests.js'

const requestWithPrincipal = (
  url: string,
  principal?: { userRoles: string[] },
  method = 'GET',
) => new HttpRequest({
  method,
  url,
  headers: principal
    ? {
        'content-type': 'application/json',
        'x-ms-client-principal': Buffer.from(JSON.stringify({
          identityProvider: 'aad',
          userId: 'user-id',
          userDetails: 'person@example.com',
          ...principal,
        })).toString('base64'),
      }
    : undefined,
  body: method === 'POST' ? { string: JSON.stringify({ reason: 'Need access', decision: 'approve' }) } : undefined,
})

const context = { log: () => undefined } as never
const originalDirectory = process.env.RATE_STORAGE_DIRECTORY
const cleanupDirectories: string[] = []

afterEach(async () => {
  process.env.RATE_STORAGE_DIRECTORY = originalDirectory
  await Promise.all(cleanupDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ))
})

describe('access request Functions authorization', () => {
  it('rejects unauthenticated request reads and submissions', async () => {
    await expect(getOwnAccessRequest(requestWithPrincipal('https://example.test/api/access/request')))
      .resolves.toMatchObject({ status: 401 })
    await expect(submitAccessRequest(
      requestWithPrincipal('https://example.test/api/access/request', undefined, 'POST'),
      context,
    )).resolves.toMatchObject({ status: 401 })
  })

  it('rejects authenticated non-admin callers from list and decision endpoints', async () => {
    const authenticated = { userRoles: ['anonymous', 'authenticated'] }
    await expect(listAccessRequests(requestWithPrincipal(
      'https://example.test/api/access/requests',
      authenticated,
    ))).resolves.toMatchObject({ status: 403 })
    await expect(decideAccessRequest(
      requestWithPrincipal(
        'https://example.test/api/access/requests/aaaaaaaaaaaaaaaaaaaaaaaa',
        authenticated,
        'POST',
      ),
      context,
    )).resolves.toMatchObject({ status: 403 })
  })

  it('persists an authenticated request and exposes it to the admin queue', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'foundry-cost-handler-'))
    cleanupDirectories.push(directory)
    process.env.RATE_STORAGE_DIRECTORY = directory
    const authenticated = { userRoles: ['anonymous', 'authenticated'] }
    const administrator = {
      userRoles: ['anonymous', 'authenticated', 'costlab-user', 'costlab-admin'],
    }

    const submitted = await submitAccessRequest(
      requestWithPrincipal('https://example.test/api/access/request', authenticated, 'POST'),
      context,
    )
    const own = await getOwnAccessRequest(requestWithPrincipal(
      'https://example.test/api/access/request',
      authenticated,
    ))
    const queue = await listAccessRequests(requestWithPrincipal(
      'https://example.test/api/access/requests',
      administrator,
    ))

    expect(submitted).toMatchObject({ status: 202, jsonBody: { status: 'pending' } })
    expect(own).toMatchObject({ status: 200, jsonBody: { status: 'pending' } })
    expect(queue).toMatchObject({
      status: 200,
      jsonBody: { requests: [{ userDetails: 'person@example.com', status: 'pending' }] },
    })
  })
})