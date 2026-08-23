export const REGION_IDS = ['canadacentral', 'canadaeast', 'eastus', 'eastus2'] as const

export type RegionId = (typeof REGION_IDS)[number]

export function isRegionId(value: string): value is RegionId {
  return (REGION_IDS as readonly string[]).includes(value)
}
export type RateMaintenance = 'synced' | 'manual'
export type ModelSourceId = 'direct-azure' | 'foundry-labs' | 'hugging-face' | 'fireworks'

export interface Rate {
  value: number | null
  unit: string
  currency: 'CAD'
  source: string
  sourceUrl: string
  asOf: string
  maintenance: RateMaintenance
  lastReviewed?: string
  unavailableReason?: string
  tierMinimumUnits?: number
}

export interface RateCard {
  asOf: string
  generatedAt?: string
  region: RegionId
  syncStatus: 'ok' | 'partial' | 'failed'
  unmatchedKeys: string[]
  rates: Record<string, Rate>
}

export interface RateDiff {
  key: string
  previousValue: number | null
  currentValue: number | null
  unit: string
}

export interface FoundryModelCatalogEntry {
  id: string
  name: string
  version: string
  publisher: string
  source: ModelSourceId
  inferenceTasks: string[]
  deploymentOptions: string[]
  assetId: string
  regionalAvailability: RegionId[]
}

export interface FoundryModelCatalogSnapshot {
  schemaVersion: 1
  asOf: string
  generatedAt: string
  region: RegionId
  sourceUrl: string
  models: FoundryModelCatalogEntry[]
}