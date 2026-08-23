import { describe, expect, it } from 'vitest'
import type { FoundryModelCatalogSnapshot, RateCard, RegionId } from '../contracts.js'
import { fallbackRateCardFor } from '../fallbackRateCard.js'
import { buildHealthReport } from './health.js'

const rateCard = (region: RegionId): RateCard => ({
  ...fallbackRateCardFor(region),
  asOf: '2026-08-21',
  generatedAt: '2026-08-21T10:15:00Z',
})

const catalog = (region: RegionId): FoundryModelCatalogSnapshot => ({
  schemaVersion: 1,
  asOf: '2026-08-21',
  generatedAt: '2026-08-21T10:20:00Z',
  region,
  sourceUrl: 'https://management.azure.com/catalog',
  models: [{
    id: 'direct-azure/test/1',
    name: 'test',
    version: '1',
    publisher: 'Microsoft',
    source: 'direct-azure',
    inferenceTasks: ['chat-completion'],
    deploymentOptions: ['AOAI'],
    assetId: 'azureml://registries/azure-openai/models/test/versions/1',
    regionalAvailability: [region],
  }],
})

describe('morning synchronization health', () => {
  it('is healthy when all regional snapshots are within 36 hours', async () => {
    const report = await buildHealthReport(
      new Date('2026-08-22T10:00:00Z'),
      async (region) => rateCard(region),
      async (region) => catalog(region),
    )

    expect(report.status).toBe('healthy')
    expect(report.regions.canadacentral.rateCard.unmatchedCount).toBeGreaterThan(0)
    expect(report.regions.canadaeast.catalog.modelCount).toBe(1)
    expect(report.regions.eastus.catalog.modelCount).toBe(1)
    expect(report.regions.eastus2.rateCard.available).toBe(true)
  })

  it('is unhealthy when a snapshot is missing or stale', async () => {
    const report = await buildHealthReport(
      new Date('2026-08-23T23:00:00Z'),
      async (region) => region === 'canadacentral' ? rateCard(region) : null,
      async (region) => catalog(region),
    )

    expect(report.status).toBe('unhealthy')
    expect(report.regions.canadaeast.rateCard.available).toBe(false)
    expect(report.regions.eastus.rateCard.available).toBe(false)
    expect(report.regions.canadacentral.catalog.stale).toBe(true)
  })
})