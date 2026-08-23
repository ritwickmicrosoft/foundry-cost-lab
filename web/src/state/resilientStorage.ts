import type { StateStorage } from 'zustand/middleware'

export interface StorageStatus {
  mode: 'browser' | 'memory'
  reason: string | null
}

export interface ResilientStorage {
  storage: StateStorage
  status: StorageStatus
}

function memoryStorage(): StateStorage {
  const values = new Map<string, string>()
  return {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => {
      values.set(name, value)
    },
    removeItem: (name) => {
      values.delete(name)
    },
  }
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function createResilientStorage(getBrowserStorage: () => Storage): ResilientStorage {
  const fallback = memoryStorage()
  const status: StorageStatus = { mode: 'browser', reason: null }
  let browserStorage: Storage | null = null

  const activateFallback = (error: unknown) => {
    status.mode = 'memory'
    status.reason = errorMessage(error)
    browserStorage = null
  }

  try {
    browserStorage = getBrowserStorage()
    const probe = '__foundry_cost_lab_probe__'
    browserStorage.setItem(probe, probe)
    browserStorage.removeItem(probe)
  } catch (error) {
    activateFallback(error)
  }

  return {
    status,
    storage: {
      getItem: (name) => {
        if (!browserStorage) return fallback.getItem(name)
        try {
          return browserStorage.getItem(name)
        } catch (error) {
          activateFallback(error)
          return fallback.getItem(name)
        }
      },
      setItem: (name, value) => {
        if (!browserStorage) return fallback.setItem(name, value)
        try {
          browserStorage.setItem(name, value)
        } catch (error) {
          activateFallback(error)
          fallback.setItem(name, value)
        }
      },
      removeItem: (name) => {
        if (!browserStorage) return fallback.removeItem(name)
        try {
          browserStorage.removeItem(name)
        } catch (error) {
          activateFallback(error)
          fallback.removeItem(name)
        }
      },
    },
  }
}