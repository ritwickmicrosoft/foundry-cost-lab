import { REGION_IDS, type FoundryModelCatalogSnapshot, type RateCard, type RegionId } from '../contracts.js'

const MAX_SNAPSHOT_AGE_HOURS = 36

interface SnapshotHealth {
  available: boolean
  asOf: string | null
  lastSuccessfulSync: string | null
  ageHours: number | null
  stale: boolean
}

export interface RegionHealth {
  rateCard: SnapshotHealth & {
    syncStatus: RateCard['syncStatus'] | null
    unmatchedCount: number | null
  }
  catalog: SnapshotHealth & {
    modelCount: number | null
  }
}

export interface HealthReport {
  status: 'healthy' | 'unhealthy'
  checkedAt: string
  maximumSnapshotAgeHours: number
  regions: Record<RegionId, RegionHealth>
}

const snapshotTime = (asOf: string, generatedAt?: string) =>
  new Date(generatedAt ?? `${asOf}T00:00:00Z`).getTime()

function ageHours(asOf: string, generatedAt: string | undefined, now: Date) {
  return Math.max(0, (now.getTime() - snapshotTime(asOf, generatedAt)) / 3_600_000)
}

export async function buildHealthReport(
  now: Date,
  readRateCard: (region: RegionId) => Promise<RateCard | null>,
  readCatalog: (region: RegionId) => Promise<FoundryModelCatalogSnapshot | null>,
): Promise<HealthReport> {
  const entries = await Promise.all(REGION_IDS.map(async (region) => {
    const [rateResult, catalogResult] = await Promise.allSettled([
      readRateCard(region),
      readCatalog(region),
    ])
    const rateCard = rateResult.status === 'fulfilled' ? rateResult.value : null
    const catalog = catalogResult.status === 'fulfilled' ? catalogResult.value : null
    const rateAge = rateCard ? ageHours(rateCard.asOf, rateCard.generatedAt, now) : null
    const catalogAge = catalog ? ageHours(catalog.asOf, catalog.generatedAt, now) : null
    return [region, {
      rateCard: {
        available: rateCard !== null,
        asOf: rateCard?.asOf ?? null,
        lastSuccessfulSync: rateCard?.generatedAt ?? (rateCard ? `${rateCard.asOf}T00:00:00Z` : null),
        ageHours: rateAge,
        stale: rateAge === null || rateAge > MAX_SNAPSHOT_AGE_HOURS,
        syncStatus: rateCard?.syncStatus ?? null,
        unmatchedCount: rateCard?.unmatchedKeys.length ?? null,
      },
      catalog: {
        available: catalog !== null,
        asOf: catalog?.asOf ?? null,
        lastSuccessfulSync: catalog?.generatedAt ?? null,
        ageHours: catalogAge,
        stale: catalogAge === null || catalogAge > MAX_SNAPSHOT_AGE_HOURS,
        modelCount: catalog?.models.length ?? null,
      },
    }] as const
  }))
  const regionHealth = Object.fromEntries(entries) as Record<RegionId, RegionHealth>
  const unhealthy = Object.values(regionHealth).some(
    ({ rateCard, catalog }) => rateCard.stale || catalog.stale,
  )
  return {
    status: unhealthy ? 'unhealthy' : 'healthy',
    checkedAt: now.toISOString(),
    maximumSnapshotAgeHours: MAX_SNAPSHOT_AGE_HOURS,
    regions: regionHealth,
  }
}