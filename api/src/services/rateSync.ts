import type { Rate, RateCard, RateDiff } from '../contracts.js'
import { fallbackRateCard } from '../fallbackRateCard.js'
import { meterSpecs, type MeterSpec } from './meterSpecs.js'
import { RETAIL_PRICES_URL, type RateLookupClient, type RetailPriceItem } from './retailPricesClient.js'

export class ZeroMeterMatchError extends Error {
  constructor() {
    super('Rate sync matched zero meters; the current card was not changed.')
    this.name = 'ZeroMeterMatchError'
  }
}

export interface SyncRepository {
  readCurrent(): Promise<RateCard | null>
  writeSnapshot(rateCard: RateCard): Promise<void>
  promote(rateCard: RateCard): Promise<void>
}

interface SyncOutcome {
  rateCard: RateCard
  matchedKeys: string[]
}

const isEffective = (item: RetailPriceItem, now: Date) => {
  const start = new Date(item.effectiveStartDate)
  const end = item.effectiveEndDate ? new Date(item.effectiveEndDate) : null
  return start <= now && (!end || end >= now)
}

function selectMeter(spec: MeterSpec, items: RetailPriceItem[], now: Date) {
  return items
    .filter((item) => spec.matches(item) && isEffective(item, now))
    .sort((left, right) => {
      if (left.isPrimaryMeterRegion !== right.isPrimaryMeterRegion) {
        return left.isPrimaryMeterRegion ? -1 : 1
      }
      return right.effectiveStartDate.localeCompare(left.effectiveStartDate)
    })[0]
}

const sourceFor = (item: RetailPriceItem) =>
  `Azure Retail Prices API - ${item.meterName} - ${item.skuName} - ${item.armRegionName} - effective ${item.effectiveStartDate.slice(0, 10)}`

const syncedRate = (item: RetailPriceItem, value: number, unit: string, asOf: string): Rate => ({
  value,
  unit,
  currency: 'CAD',
  source: sourceFor(item),
  sourceUrl: RETAIL_PRICES_URL,
  asOf,
  maintenance: 'synced',
  ...(item.tierMinimumUnits !== undefined ? { tierMinimumUnits: item.tierMinimumUnits } : {}),
})

export async function buildSyncedRateCard(
  current: RateCard,
  client: RateLookupClient,
  now: Date,
): Promise<SyncOutcome> {
  const asOf = now.toISOString().slice(0, 10)
  const rates = structuredClone(current.rates)
  const matchedKeys: string[] = []
  const unmatchedKeys = new Set(
    Object.entries(rates)
      .filter(([, rate]) => rate.value === null)
      .map(([key]) => key),
  )
  const queryCache = new Map<string, Promise<RetailPriceItem[]>>()

  for (const spec of meterSpecs) {
    const filter = spec.filter(current.region)
    let query = queryCache.get(filter)
    if (!query) {
      query = client.query(filter)
      queryCache.set(filter, query)
    }
    const match = selectMeter(spec, await query, now)
    const normalized = match ? spec.normalize(match) : null
    if (!match || !normalized) {
      unmatchedKeys.add(spec.key)
      continue
    }
    rates[spec.key] = syncedRate(match, normalized.value, normalized.unit, asOf)
    matchedKeys.push(spec.key)
    unmatchedKeys.delete(spec.key)
  }

  if (matchedKeys.length === 0) throw new ZeroMeterMatchError()

  return {
    matchedKeys,
    rateCard: {
      asOf,
      generatedAt: now.toISOString(),
      region: current.region,
      syncStatus: unmatchedKeys.size > 0 ? 'partial' : 'ok',
      unmatchedKeys: [...unmatchedKeys].sort(),
      rates,
    },
  }
}

export async function executeRateSync(
  repository: SyncRepository,
  client: RateLookupClient,
  now: Date,
  seedRateCard: RateCard = fallbackRateCard,
): Promise<SyncOutcome> {
  const current = (await repository.readCurrent()) ?? structuredClone(seedRateCard)
  const outcome = await buildSyncedRateCard(current, client, now)
  await repository.writeSnapshot(outcome.rateCard)
  await repository.promote(outcome.rateCard)
  return outcome
}

export function diffRateCards(previous: RateCard, current: RateCard): RateDiff[] {
  const keys = new Set([...Object.keys(previous.rates), ...Object.keys(current.rates)])
  return [...keys]
    .filter((key) => previous.rates[key]?.value !== current.rates[key]?.value)
    .sort()
    .map((key) => ({
      key,
      previousValue: previous.rates[key]?.value ?? null,
      currentValue: current.rates[key]?.value ?? null,
      unit: current.rates[key]?.unit ?? previous.rates[key]?.unit ?? 'unknown',
    }))
}