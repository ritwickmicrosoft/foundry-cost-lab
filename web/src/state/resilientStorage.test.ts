import { describe, expect, it } from 'vitest'
import { createResilientStorage } from './resilientStorage'

describe('resilient storage', () => {
  it('degrades to in-memory storage when browser storage throws SecurityError', () => {
    const selection = createResilientStorage(() => {
      throw new DOMException('Blocked by policy', 'SecurityError')
    })

    selection.storage.setItem('scenario', 'kept for session')
    expect(selection.storage.getItem('scenario')).toBe('kept for session')
    expect(selection.status.mode).toBe('memory')
    expect(selection.status.reason).toContain('Blocked by policy')
  })

  it('switches to memory if an initially available storage fails later', () => {
    let shouldThrow = false
    const values = new Map<string, string>()
    const browserStorage = {
      get length() {
        return values.size
      },
      clear: () => values.clear(),
      key: () => null,
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (shouldThrow) throw new DOMException('Quota blocked', 'SecurityError')
        values.set(key, value)
      },
      removeItem: (key: string) => values.delete(key),
    } satisfies Storage
    const selection = createResilientStorage(() => browserStorage)
    shouldThrow = true
    selection.storage.setItem('scenario', 'memory copy')

    expect(selection.status.mode).toBe('memory')
    expect(selection.storage.getItem('scenario')).toBe('memory copy')
  })
})