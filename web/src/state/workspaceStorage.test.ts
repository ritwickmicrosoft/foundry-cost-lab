import { describe, expect, it } from 'vitest'
import { clearWorkspaceBrowserData, GUIDED_ESTIMATE_STORAGE_KEY, WORKSPACE_STORAGE_KEY } from './workspaceStorage'

describe('workspace storage reset', () => {
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