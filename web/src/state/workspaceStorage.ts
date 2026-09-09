import { COMPARISON_BRIEF_CACHE_PREFIX } from '../domain/comparisonBrief'

export const WORKSPACE_STORAGE_KEY = 'foundry-cost-lab'
export const GUIDED_ESTIMATE_STORAGE_KEY = 'foundry-cost-lab-guided-estimate-v1'

export function clearWorkspaceBrowserData(storage: Pick<Storage, 'length' | 'key' | 'removeItem'>) {
  const keys = [WORKSPACE_STORAGE_KEY, GUIDED_ESTIMATE_STORAGE_KEY]
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key?.startsWith(COMPARISON_BRIEF_CACHE_PREFIX)) keys.push(key)
  }
  for (const key of keys) storage.removeItem(key)
}