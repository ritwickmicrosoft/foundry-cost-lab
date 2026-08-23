import { app, type InvocationContext, type Timer } from '@azure/functions'
import { REGION_IDS, type RegionId } from '../contracts.js'
import { fallbackRateCardFor } from '../fallbackRateCard.js'
import { executeCatalogSync } from '../services/catalogSync.js'
import { FoundryCatalogClient } from '../services/foundryCatalogClient.js'
import { RetailPricesClient } from '../services/retailPricesClient.js'
import { executeRateSync } from '../services/rateSync.js'
import { createCatalogRepository } from '../storage/catalogRepository.js'
import { createRateRepository, productionCredential } from '../storage/rateRepository.js'

const torontoClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const rateRegions: readonly RegionId[] = REGION_IDS

export function isTorontoSyncTime(now: Date): boolean {
  const values = Object.fromEntries(
    torontoClock.formatToParts(now).map((part) => [part.type, part.value]),
  )
  return values.hour === '06'
}

export function isRateSyncForced(value = process.env.FORCE_RATE_SYNC): boolean {
  return value?.trim().toLocaleLowerCase() === 'true'
}

export async function hasCompleteSnapshotSet(
  regions: readonly RegionId[],
  readRateCard: (region: RegionId) => Promise<unknown | null>,
  readCatalog: (region: RegionId) => Promise<unknown | null>,
): Promise<boolean> {
  const results = await Promise.allSettled(
    regions.flatMap((region) => [readRateCard(region), readCatalog(region)]),
  )
  return results.every((result) => result.status === 'fulfilled' && result.value !== null)
}

interface RegionalSyncSuccess {
  region: RegionId
  matchedCount: number
  unmatchedCount: number
}

interface RegionalSyncFailure {
  region: RegionId
  error: unknown
}

export async function runRegionalRateSync(
  regions: readonly RegionId[],
  synchronize: (region: RegionId) => Promise<{ matchedCount: number; unmatchedCount: number }>,
): Promise<{ successes: RegionalSyncSuccess[]; failures: RegionalSyncFailure[] }> {
  const successes: RegionalSyncSuccess[] = []
  const failures: RegionalSyncFailure[] = []
  for (const region of regions) {
    try {
      successes.push({ region, ...(await synchronize(region)) })
    } catch (error) {
      failures.push({ region, error })
    }
  }
  return { successes, failures }
}

export async function syncRates(_timer: Timer, context: InvocationContext): Promise<void> {
  const now = new Date()
  const forceSync = isRateSyncForced()
  if (!forceSync && !isTorontoSyncTime(now)) {
    const snapshotsComplete = await hasCompleteSnapshotSet(
      rateRegions,
      (region) => createRateRepository(region).readCurrent(),
      (region) => createCatalogRepository(region).readCurrent(),
    )
    if (snapshotsComplete) {
      context.debug('Skipping hourly tick outside 06:00 America/Toronto.')
      return
    }
    context.log('Required snapshots are missing; running bootstrap synchronization outside the daily window.')
  }
  if (forceSync) context.log('FORCE_RATE_SYNC enabled; running synchronization outside the daily window.')

  const client = new RetailPricesClient()
  const report = await runRegionalRateSync(rateRegions, async (region) => {
      const outcome = await executeRateSync(
        createRateRepository(region),
        client,
        now,
        fallbackRateCardFor(region),
      )
      return {
        matchedCount: outcome.matchedKeys.length,
        unmatchedCount: outcome.rateCard.unmatchedKeys.length,
      }
  })

  for (const success of report.successes) {
    context.log(`RATE_SYNC_REGION_SUCCESS ${JSON.stringify({ ...success, asOf: now.toISOString() })}`)
  }
  for (const failure of report.failures) {
    context.error(`RATE_SYNC_REGION_FAILURE ${JSON.stringify({ region: failure.region, asOf: now.toISOString() })}`, failure.error)
  }

  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID
  const catalogClient = subscriptionId
    ? new FoundryCatalogClient(subscriptionId, productionCredential())
    : null
  const catalogReport = await runRegionalRateSync(rateRegions, async (region) => {
    if (!catalogClient) throw new Error('AZURE_SUBSCRIPTION_ID is required for model-catalog synchronization.')
    const snapshot = await executeCatalogSync(
      createCatalogRepository(region),
      catalogClient,
      region,
      now,
    )
    return { matchedCount: snapshot.models.length, unmatchedCount: 0 }
  })

  for (const success of catalogReport.successes) {
    context.log(`CATALOG_SYNC_REGION_SUCCESS ${JSON.stringify({ region: success.region, modelCount: success.matchedCount, asOf: now.toISOString() })}`)
  }
  for (const failure of catalogReport.failures) {
    context.error(`CATALOG_SYNC_REGION_FAILURE ${JSON.stringify({ region: failure.region, asOf: now.toISOString() })}`, failure.error)
  }

  const failures = [...report.failures, ...catalogReport.failures]
  if (failures.length > 0) {
    context.error(`MORNING_SYNC_FAILURE ${JSON.stringify({ rateRegions: report.failures.map(({ region }) => region), catalogRegions: catalogReport.failures.map(({ region }) => region), asOf: now.toISOString() })}`)
    throw new AggregateError(
      failures.map(({ error }) => error),
      'Morning synchronization was incomplete; successful last-good snapshots were preserved.',
    )
  }

  context.log(`MORNING_SYNC_SUCCESS ${JSON.stringify({ regions: rateRegions, asOf: now.toISOString() })}`)
}

app.timer('syncRates', {
  schedule: '0 0 * * * *',
  runOnStartup: false,
  useMonitor: true,
  handler: syncRates,
})