import type { HttpRequest } from '@azure/functions'

export interface ClientPrincipal {
  identityProvider: string
  userId: string
  userDetails: string
  userRoles: string[]
}

export function parseClientPrincipal(request: HttpRequest): ClientPrincipal | null {
  const header = request.headers.get('x-ms-client-principal')
  if (!header) return null

  try {
    const value = JSON.parse(Buffer.from(header, 'base64').toString('utf8')) as Partial<ClientPrincipal>
    if (
      typeof value.identityProvider !== 'string' ||
      typeof value.userId !== 'string' ||
      typeof value.userDetails !== 'string' ||
      !Array.isArray(value.userRoles) ||
      value.userRoles.some((role) => typeof role !== 'string')
    ) {
      return null
    }
    return {
      identityProvider: value.identityProvider.toLocaleLowerCase(),
      userId: value.userId,
      userDetails: value.userDetails,
      userRoles: value.userRoles.map((role) => role.toLocaleLowerCase()),
    }
  } catch {
    return null
  }
}

export function hasRole(principal: ClientPrincipal | null, role: string): boolean {
  return principal?.userRoles.includes(role.toLocaleLowerCase()) ?? false
}

export function isAuthenticated(principal: ClientPrincipal | null): principal is ClientPrincipal {
  return Boolean(principal && hasRole(principal, 'authenticated'))
}