import { COMPARISON_BRIEF_CACHE_PREFIX } from '../domain/comparisonBrief'

export const WORKSPACE_STORAGE_KEY = 'foundry-cost-lab'
export const GUIDED_ESTIMATE_STORAGE_KEY = 'foundry-cost-lab-guided-estimate-v1'

export const isLocalWorkspace = () => typeof window === 'undefined' || ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
let workspacePrefix = isLocalWorkspace() ? '' : 'unverified:'

export function setWorkspaceOwner(owner: string) {
  workspacePrefix = owner ? `costlab-account:${owner}:` : ''
}

export const workspaceKey = (name: string) => `${workspacePrefix}${name}`

export async function workspaceOwnerFromPrincipal(value: unknown) {
  const principal = value as { identityProvider?: unknown; userId?: unknown; userRoles?: unknown } | null
  if (!principal || typeof principal.userId !== 'string' || !principal.userId ||
    typeof principal.identityProvider !== 'string' || !Array.isArray(principal.userRoles) ||
    !principal.userRoles.includes('costlab-user')) throw new Error('Sign in with an account that has Cost Lab access.')
  if (!crypto.subtle) throw new Error('A secure HTTPS connection is required to restore account data.')
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${principal.identityProvider}:${principal.userId}`))
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function clearWorkspaceBrowserData(storage: Pick<Storage, 'length' | 'key' | 'removeItem'>, prefix = workspacePrefix) {
  const keys = [`${prefix}${WORKSPACE_STORAGE_KEY}`, `${prefix}${GUIDED_ESTIMATE_STORAGE_KEY}`]
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key?.startsWith(`${prefix}${COMPARISON_BRIEF_CACHE_PREFIX}`)) keys.push(key)
  }
  for (const key of keys) storage.removeItem(key)
}