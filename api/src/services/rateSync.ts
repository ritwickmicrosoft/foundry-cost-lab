import type { Rate, RateCard, RateDiff, RateVerification, RegionId } from '../contracts.js'
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

function selectMeter(spec: MeterSpec, items: RetailPriceItem[], now: Date, region: RegionId): {
  item?: RetailPriceItem
  status: RateVerification['status']
  reason?: string
} {
  const candidates = items
    .filter((item) => spec.matches(item, region) && isEffective(item, now))
    .sort((left, right) => {
      if (left.isPrimaryMeterRegion !== right.isPrimaryMeterRegion) {
        return left.isPrimaryMeterRegion ? -1 : 1
      }
      return right.effectiveStartDate.localeCompare(left.effectiveStartDate)
    })
  const preferred = candidates[0]
  if (!preferred) return { status: 'unmatched', reason: 'No current matching Retail meter was returned.' }
  const peers = candidates.filter((item) =>
    item.isPrimaryMeterRegion === preferred.isPrimaryMeterRegion &&
    item.effectiveStartDate === preferred.effectiveStartDate,
  )
  const identities = new Set(peers.map((item) => JSON.stringify([
    item.meterId, item.productId, item.skuId, item.type,
    item.currencyCode, item.armRegionName, item.productName, item.skuName,
    item.meterName, item.unitOfMeasure, item.tierMinimumUnits ?? 0,
    item.retailPrice, item.unitPrice, item.effectiveEndDate,
  ])))
  if (identities.size > 1) {
    return { status: 'ambiguous', reason: 'Conflicting current Retail meters require review; no new price was selected.' }
  }
  return { item: preferred, status: 'verified' }
}

const sourceFor = (item: RetailPriceItem) =>
  `Azure Retail Prices API - ${item.meterName} - ${item.skuName} - ${item.armRegionName} - effective ${item.effectiveStartDate.slice(0, 10)}`

const syncedRate = (item: RetailPriceItem, value: number, unit: string, asOf: string, checkedAt: string): Rate => ({
  value,
  unit,
  currency: 'CAD',
  source: sourceFor(item),
  sourceUrl: RETAIL_PRICES_URL,
  asOf,
  maintenance: 'synced',
  verification: { status: 'verified', checkedAt },
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
    const selection = selectMeter(spec, await query, now, current.region)
    const match = selection.item
    const normalized = match ? spec.normalize(match) : null
    if (!match || !normalized) {
      unmatchedKeys.add(spec.key)
      const previous: Rate = rates[spec.key] ?? {
        value: null,
        unit: 'unpriced',
        currency: 'CAD',
        source: `Azure Retail Prices API - no verified match for ${spec.key} in ${current.region}`,
        sourceUrl: RETAIL_PRICES_URL,
        asOf,
        maintenance: 'synced',
      }
      rates[spec.key] = {
        ...previous,
        verification: {
          status: selection.status === 'ambiguous' ? 'ambiguous' : 'unmatched',
          checkedAt: now.toISOString(),
          reason: selection.reason ?? 'The current Retail meter could not be normalized.',
        },
      }
      continue
    }
    rates[spec.key] = syncedRate(match, normalized.value, normalized.unit, asOf, now.toISOString())
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