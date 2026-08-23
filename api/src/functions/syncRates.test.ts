import { describe, expect, it } from 'vitest'
import { REGION_IDS } from '../contracts.js'
import { hasCompleteSnapshotSet, isRateSyncForced, isTorontoSyncTime, runRegionalRateSync } from './syncRates.js'

describe('Toronto rate-sync schedule', () => {
  it('selects the full 06:00 local hour during both standard and daylight time', () => {
    expect(isTorontoSyncTime(new Date('2026-01-15T11:00:00Z'))).toBe(true)
    expect(isTorontoSyncTime(new Date('2026-07-15T10:00:00Z'))).toBe(true)
    expect(isTorontoSyncTime(new Date('2026-07-15T10:47:00Z'))).toBe(true)
    expect(isTorontoSyncTime(new Date('2026-07-15T11:00:00Z'))).toBe(false)
  })

  it('requires an explicit true value for an off-hour forced refresh', () => {
    expect(isRateSyncForced('true')).toBe(true)
    expect(isRateSyncForced(' TRUE ')).toBe(true)
    expect(isRateSyncForced('false')).toBe(false)
    expect(isRateSyncForced(undefined)).toBe(false)
  })

  it('requires every regional rate and catalog snapshot before skipping an off-hour tick', async () => {
    const available = await hasCompleteSnapshotSet(
      REGION_IDS,
      async () => ({}),
      async (region) => region === 'canadacentral' ? {} : null,
    )
    const complete = await hasCompleteSnapshotSet(
      REGION_IDS,
      async () => ({}),
      async () => ({}),
    )

    expect(available).toBe(false)
    expect(complete).toBe(true)
  })

  it('attempts every region and reports partial failure after successful work', async () => {
    const attempted: string[] = []
    const report = await runRegionalRateSync(REGION_IDS, async (region) => {
      attempted.push(region)
      if (region === 'canadacentral') throw new Error('central unavailable')
      return { matchedCount: 12, unmatchedCount: 2 }
    })

    expect(attempted).toEqual(REGION_IDS)
    expect(report.successes.map(({ region }) => region)).toEqual(['canadaeast', 'eastus', 'eastus2'])
    expect(report.failures[0]?.region).toBe('canadacentral')
  })
})