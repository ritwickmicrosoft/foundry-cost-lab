import { isRegionId, type CostConfig, type CostResult, type RateCard } from './types'
import { createPreset } from './presets'

export interface ScenarioExport {
  schemaVersion: 1
  exportedAt: string
  rateCard: {
    asOf: string
    region: RateCard['region']
    syncStatus: RateCard['syncStatus']
    currency: 'CAD'
  }
  config: CostConfig
  result: Pick<CostResult, 'knownGrandTotal' | 'complete' | 'missingRateKeys' | 'tiers' | 'lines'>
}

export function buildScenarioExport(
  config: CostConfig,
  result: CostResult,
  rateCard: RateCard,
  exportedAt: string,
): ScenarioExport {
  return {
    schemaVersion: 1,
    exportedAt,
    rateCard: {
      asOf: rateCard.asOf,
      region: rateCard.region,
      syncStatus: rateCard.syncStatus,
      currency: 'CAD',
    },
    config: structuredClone(config),
    result: {
      knownGrandTotal: result.knownGrandTotal,
      complete: result.complete,
      missingRateKeys: [...result.missingRateKeys],
      tiers: structuredClone(result.tiers),
      lines: structuredClone(result.lines),
    },
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

function hydrateFromTemplate(template: unknown, candidate: unknown): unknown {
  if (template === null) {
    return candidate === null || (typeof candidate === 'number' && Number.isFinite(candidate))
      ? candidate
      : null
  }
  if (Array.isArray(template)) {
    if (!Array.isArray(candidate) || template.length === 0) return structuredClone(template)
    return candidate.map((entry) => hydrateFromTemplate(template[0], entry))
  }
  if (isRecord(template)) {
    const source = isRecord(candidate) ? candidate : {}
    return Object.fromEntries(
      Object.entries(template).map(([key, defaultValue]) => [
        key,
        hydrateFromTemplate(defaultValue, source[key]),
      ]),
    )
  }
  if (typeof template === 'number') {
    return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : template
  }
  return typeof candidate === typeof template ? candidate : template
}

export function parseScenarioExport(value: unknown): Pick<ScenarioExport, 'config' | 'rateCard' | 'exportedAt'> {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.rateCard) || !isRecord(value.config)) {
    throw new Error('This file is not a Foundry Cost Lab scenario export.')
  }
  if (value.rateCard.currency !== 'CAD' || typeof value.rateCard.asOf !== 'string') {
    throw new Error('Scenario imports must use a dated CAD rate card.')
  }
  const posture = value.config.posture === 'production' ? 'production' : value.config.posture === 'poc' ? 'poc' : null
  if (!posture) throw new Error('Scenario posture is invalid.')
  const config = hydrateFromTemplate(createPreset(posture), value.config) as CostConfig
  if (!isRegionId(config.region)) {
    throw new Error('Scenario region is invalid.')
  }
  return {
    config,
    exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : '',
    rateCard: {
      asOf: value.rateCard.asOf,
      region: typeof value.rateCard.region === 'string' && isRegionId(value.rateCard.region)
        ? value.rateCard.region
        : config.region,
      syncStatus: value.rateCard.syncStatus === 'ok' || value.rateCard.syncStatus === 'failed'
        ? value.rateCard.syncStatus
        : 'partial',
      currency: 'CAD',
    },
  }
}