import { afterEach, describe, expect, it } from 'vitest'
import { clearWorkspaceBrowserData, GUIDED_ESTIMATE_STORAGE_KEY, setWorkspaceOwner, workspaceKey, workspaceOwnerFromPrincipal, WORKSPACE_STORAGE_KEY } from './workspaceStorage'

describe('workspace storage reset', () => {
  afterEach(() => setWorkspaceOwner(''))

  it('isolates reset and summary keys by account without exposing account identifiers', async () => {
    const owner = await workspaceOwnerFromPrincipal({ identityProvider: 'aad', userId: 'user-one', userRoles: ['costlab-user'] })
    expect(owner).toMatch(/^[a-f0-9]{64}$/)
    await expect(workspaceOwnerFromPrincipal({ userId: 'other', userRoles: [] })).rejects.toThrow('Sign in')
    setWorkspaceOwner(owner)
    const own = workspaceKey(WORKSPACE_STORAGE_KEY)
    const values = new Map([[own, 'mine'], [WORKSPACE_STORAGE_KEY, 'legacy'], ['costlab-account:other:foundry-cost-lab', 'other'], [workspaceKey('comparison-brief:one'), 'brief']])
    clearWorkspaceBrowserData({ get length() { return values.size }, key: (index) => [...values.keys()][index] ?? null, removeItem: (key) => { values.delete(key) } })
    expect([...values.values()]).toEqual(['legacy', 'other'])
  })

  it('removes only workspace data and all comparison brief entries', () => {
    const values = new Map([
      [WORKSPACE_STORAGE_KEY, 'saved scenario'],
      [GUIDED_ESTIMATE_STORAGE_KEY, 'complete'],
      ['comparison-brief:first', 'first summary'],
      ['comparison-brief:second', 'second summary'],
      ['display-preference', 'dark'],
      ['unrelated-auth-state', 'keep'],
      ['comparison-other', 'keep'],
    ])
    clearWorkspaceBrowserData({
      get length() { return values.size },
      key: (index) => [...values.keys()][index] ?? null,
      removeItem: (key) => { values.delete(key) },
    })
    expect([...values]).toEqual([
      ['display-preference', 'dark'], ['unrelated-auth-state', 'keep'], ['comparison-other', 'keep'],
    ])
  })

  it('does not silently claim success when storage removal fails', () => {
    expect(() => clearWorkspaceBrowserData({
      length: 0, key: () => null, removeItem: () => { throw new Error('Storage denied') },
    })).toThrow('Storage denied')
  })
})