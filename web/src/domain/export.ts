import {
  isRegionId,
  type CommercialModelConfig,
  type CostConfig,
  type CostResult,
  type ModelPortfolioConfig,
  type ModelPriceProfile,
  type RateCard,
} from './types'
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

const priceProfileTemplate: ModelPriceProfile = {
  modelId: '',
  deploymentSku: 'marketplace',
  source: '',
  asOf: '',
  inputRateCadPerMillion: null,
  cachedInputRateCadPerMillion: null,
  outputRateCadPerMillion: null,
  batchInputRateCadPerMillion: null,
  batchOutputRateCadPerMillion: null,
  ptuHourlyRateCad: null,
  managedComputeHourlyRateCad: null,
  usageUnitRateCad: null,
}

function hydrateCommercialModel(
  template: CommercialModelConfig,
  candidate: unknown,
): CommercialModelConfig {
  const hydrated = hydrateFromTemplate(template, candidate) as CommercialModelConfig
  const source = isRecord(candidate) ? candidate : {}
  if (Array.isArray(source.priceProfiles) && source.priceProfiles.length > 50) {
    throw new Error('A model can contain at most 50 price profiles.')
  }
  hydrated.priceProfiles = Array.isArray(source.priceProfiles)
    ? source.priceProfiles
      .filter(isRecord)
      .slice(0, 50)
      .map((profile) => hydrateFromTemplate(priceProfileTemplate, profile) as ModelPriceProfile)
    : []
  return hydrated
}

function hydrateModelPortfolio(
  template: ModelPortfolioConfig,
  candidate: unknown,
  commercialTemplate: CommercialModelConfig,
): ModelPortfolioConfig {
  if (!isRecord(candidate)) return structuredClone(template)
  if (Array.isArray(candidate.deployments) && candidate.deployments.length > 8) {
    throw new Error('A scenario can contain at most 8 model deployments.')
  }
  if (Array.isArray(candidate.routes) && candidate.routes.length > 12) {
    throw new Error('A scenario can contain at most 12 model routes.')
  }
  const deployments = Array.isArray(candidate.deployments)
    ? candidate.deployments
      .filter(isRecord)
      .slice(0, 8)
      .flatMap((deployment) => {
        if (
          typeof deployment.id !== 'string' ||
          !/^[a-zA-Z0-9._-]{1,80}$/.test(deployment.id) ||
          deployment.id === 'primary' ||
          typeof deployment.label !== 'string' ||
          !isRecord(deployment.model)
        ) return []
        return [{
          id: deployment.id,
          label: deployment.label.trim().slice(0, 80) || 'Additional deployment',
          model: hydrateCommercialModel(commercialTemplate, deployment.model),
        }]
      })
    : []
  const deploymentIds = new Set(['primary', ...deployments.map((deployment) => deployment.id)])
  const roles = new Set(['primary', 'fast', 'reasoning', 'multimodal'])
  const modes = new Set(['traffic-share', 'additive'])
  const routeIds = new Set<string>()
  const routes = Array.isArray(candidate.routes)
    ? candidate.routes
      .filter(isRecord)
      .slice(0, 12)
      .flatMap((route) => {
        if (
          typeof route.id !== 'string' ||
          !/^[a-zA-Z0-9._-]{1,80}$/.test(route.id) ||
          routeIds.has(route.id) ||
          typeof route.label !== 'string' ||
          typeof route.role !== 'string' ||
          !roles.has(route.role) ||
          typeof route.deploymentId !== 'string' ||
          !deploymentIds.has(route.deploymentId) ||
          typeof route.mode !== 'string' ||
          !modes.has(route.mode) ||
          typeof route.trafficPercent !== 'number' ||
          !Number.isFinite(route.trafficPercent)
        ) return []
        routeIds.add(route.id)
        return [{
          id: route.id,
          label: route.label.trim().slice(0, 80) || 'Model route',
          role: route.role as ModelPortfolioConfig['routes'][number]['role'],
          deploymentId: route.deploymentId,
          mode: route.mode as ModelPortfolioConfig['routes'][number]['mode'],
          trafficPercent: Math.min(100, Math.max(0, route.trafficPercent)),
        }]
      })
    : []
  const strategies = new Set(['single', 'cost-optimized', 'quality-focused', 'multimodal', 'custom'])
  return {
    strategy: typeof candidate.strategy === 'string' && strategies.has(candidate.strategy)
      ? candidate.strategy as ModelPortfolioConfig['strategy']
      : 'custom',
    deployments,
    routes: routes.length > 0 ? routes : structuredClone(template.routes),
  }
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
  const template = createPreset(posture)
  const config = hydrateFromTemplate(template, value.config) as CostConfig
  config.commercialModel = hydrateCommercialModel(template.commercialModel, value.config.commercialModel)
  config.modelPortfolio = hydrateModelPortfolio(
    template.modelPortfolio,
    value.config.modelPortfolio,
    template.commercialModel,
  )
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