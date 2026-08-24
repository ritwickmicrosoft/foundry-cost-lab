import { HttpRequest } from '@azure/functions'
import { describe, expect, it } from 'vitest'
import { hasRole, isAuthenticated, parseClientPrincipal } from './clientPrincipal.js'

const requestWithPrincipal = (principal: unknown) => new HttpRequest({
  method: 'GET',
  url: 'https://example.test/api/access/request',
  headers: {
    'x-ms-client-principal': Buffer.from(JSON.stringify(principal)).toString('base64'),
  },
})

describe('Static Web Apps client principal', () => {
  it('normalizes a valid authenticated AAD principal and its roles', () => {
    const principal = parseClientPrincipal(requestWithPrincipal({
      identityProvider: 'AAD',
      userId: 'user-123',
      userDetails: 'person@example.com',
      userRoles: ['anonymous', 'authenticated', 'CostLab-Admin'],
    }))

    expect(principal).toEqual({
      identityProvider: 'aad',
      userId: 'user-123',
      userDetails: 'person@example.com',
      userRoles: ['anonymous', 'authenticated', 'costlab-admin'],
    })
    expect(isAuthenticated(principal)).toBe(true)
    expect(hasRole(principal, 'costlab-admin')).toBe(true)
  })

  it('rejects missing, malformed, or incomplete principal headers', () => {
    expect(parseClientPrincipal(new HttpRequest({ method: 'GET', url: 'https://example.test' }))).toBeNull()
    expect(parseClientPrincipal(new HttpRequest({
      method: 'GET',
      url: 'https://example.test',
      headers: { 'x-ms-client-principal': 'not-base64-json' },
    }))).toBeNull()
    expect(parseClientPrincipal(requestWithPrincipal({ userId: 'missing-fields' }))).toBeNull()
  })
})