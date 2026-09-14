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
import { captureEstimateRevision, type EstimateRevision } from './estimateRevision'
import { validateRateCard } from './rates'
import { MODEL_SOURCE_IDS, type FoundryModelCatalogEntry } from './foundryCatalog'
import type { SavedScenario } from '../state/useLabStore'

export interface ScenarioExport {
  schemaVersion: 2
  revision: EstimateRevision
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
  models?: readonly FoundryModelCatalogEntry[],
): ScenarioExport {
  return {
    schemaVersion: 2,
    revision: captureEstimateRevision(config, result, rateCard, models, exportedAt),
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

export function parseScenarioExport(value: unknown): Pick<ScenarioExport, 'config' | 'rateCard' | 'exportedAt'> & { revision?: EstimateRevision } {
  if (!isRecord(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2) || !isRecord(value.rateCard) || !isRecord(value.config)) {
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
  const revision = value.schemaVersion === 2 ? parseRevision(value.revision) : undefined
  return {
    config,
    ...(revision ? { revision } : {}),
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

function parseRevision(value: unknown): EstimateRevision {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id ||
    typeof value.capturedAt !== 'string' || !Number.isFinite(Date.parse(value.capturedAt)) ||
    typeof value.calculationVersion !== 'string' || !value.calculationVersion || !isRecord(value.result) ||
    !Array.isArray(value.models) || value.models.length > 9) throw new Error('Invalid estimate revision.')
  const rateCard = validateRateCard(value.rateCard)
  const { config } = parseScenarioExport({ schemaVersion: 1, config: value.config, rateCard: { ...rateCard, currency: 'CAD' } })
  if (config.region !== rateCard.region) throw new Error('Revision region does not match its rates.')
  const result = value.result
  const finite = (candidate: unknown) => typeof candidate === 'number' && Number.isFinite(candidate)
  const text = (candidate: unknown) => typeof candidate === 'string'
  const validateProvenance = (provenance: Record<string, unknown>) => {
    if (!['synced', 'manual'].includes(String(provenance.maintenance)) ||
      !['source', 'sourceUrl', 'asOf'].every((key) => text(provenance[key])) ||
      !['lastReviewed', 'unavailableReason'].every((key) => provenance[key] === undefined || text(provenance[key]))) {
      throw new Error('Invalid archived provenance.')
    }
    if (provenance.sourceUrl) {
      let protocol = ''
      try { protocol = new URL(String(provenance.sourceUrl)).protocol } catch {}
      if (protocol !== 'https:' && protocol !== 'http:') throw new Error('Archived source links must use HTTP or HTTPS.')
    }
    if (provenance.verification !== undefined) {
      const verification = provenance.verification
      if (!isRecord(verification) || !['verified', 'unmatched', 'ambiguous'].includes(String(verification.status)) ||
        !text(verification.checkedAt) || (verification.reason !== undefined && !text(verification.reason))) {
        throw new Error('Invalid archived verification.')
      }
    }
  }
  for (const rate of Object.values(rateCard.rates)) validateProvenance(rate as unknown as Record<string, unknown>)
  for (const model of value.models) {
    if (!isRecord(model) || !['id', 'name', 'version', 'publisher', 'assetId'].every((key) => text(model[key])) ||
      !MODEL_SOURCE_IDS.some((source) => source === model.source) ||
      !Array.isArray(model.inferenceTasks) || !model.inferenceTasks.every(text) ||
      !Array.isArray(model.deploymentOptions) || !model.deploymentOptions.every(text) ||
      (model.regionalAvailability !== undefined && (!Array.isArray(model.regionalAvailability) || !model.regionalAvailability.every(isRegionId)))) {
      throw new Error('Invalid archived model metadata.')
    }
  }
  const models = value.models as FoundryModelCatalogEntry[]
  if (!Array.isArray(result.lines) || result.lines.length > 1000 || !isRecord(result.tiers) ||
    !isRecord(result.metrics) || !isRecord(result.breakeven) || !Array.isArray(result.projection) ||
    !Array.isArray(result.missingRateKeys) || !result.missingRateKeys.every(text) || !finite(result.dailyBurn) ||
    !finite(result.knownGrandTotal) || typeof result.complete !== 'boolean') throw new Error('Invalid archived result.')
  for (const line of result.lines) {
    if (!isRecord(line) || !['run', 'guardrail', 'platform', 'change'].includes(String(line.tier)) ||
      !['id', 'blockId', 'label', 'detail', 'quantityUnit', 'rateUnit', 'formula', 'assumption'].every((key) => text(line[key])) ||
      !finite(line.quantity) || !finite(line.scale) || (line.amount !== null && !finite(line.amount)) ||
      (line.unitRate !== null && !finite(line.unitRate)) || !isRecord(line.provenance) ||
      !['source', 'sourceUrl', 'asOf', 'maintenance'].every((key) => text(line.provenance && (line.provenance as Record<string, unknown>)[key]))) {
      throw new Error('Invalid archived cost line.')
    }
    validateProvenance(line.provenance as Record<string, unknown>)
  }
  const lines = result.lines as CostResult['lines']
  for (const tier of ['run', 'guardrail', 'platform', 'change']) {
    const total = result.tiers[tier]
    const tierLines = lines.filter((line) => line.tier === tier)
    const expected = tierLines.reduce((sum, line) => sum + (line.amount ?? 0), 0)
    if (!isRecord(total) || !finite(total.knownSubtotal) || Math.abs(Number(total.knownSubtotal) - expected) > 0.0001 ||
      total.unpricedLineCount !== tierLines.filter((line) => line.amount === null).length) throw new Error('Inconsistent archived tier totals.')
  }
  if (Math.abs(Number(result.knownGrandTotal) - lines.reduce((sum, line) => sum + (line.amount ?? 0), 0)) > 0.0001 ||
    result.complete !== lines.every((line) => line.amount !== null)) throw new Error('Inconsistent archived total.')
  for (const key of ['monthlyTurns', 'primaryInputTokens', 'primaryOutputTokens', 'mcpSchemaTokens', 'fixedEnvironmentScale', 'resilienceScale']) {
    if (!finite(result.metrics[key])) throw new Error('Invalid archived workload metrics.')
  }
  if (result.projection.length > 366 || !result.projection.every((point) => isRecord(point) && finite(point.day) && finite(point.cumulative)) ||
    !['tokensPerMonth', 'capacityTokensPerMonth'].every((key) => result.breakeven && ((result.breakeven as Record<string, unknown>)[key] === null || finite((result.breakeven as Record<string, unknown>)[key]))) ||
    (result.breakeven.feasibleWithinCapacity !== null && typeof result.breakeven.feasibleWithinCapacity !== 'boolean')) throw new Error('Invalid archived projection or capacity.')
  return structuredClone({ id: value.id, capturedAt: value.capturedAt, calculationVersion: value.calculationVersion,
    config, rateCard, models, result: result as unknown as CostResult })
}

export function buildWorkspaceBackup(current: ScenarioExport, scenarios: readonly SavedScenario[]) {
  return { format: 'foundry-cost-lab-workspace-v1', current, scenarios: structuredClone(scenarios) }
}

export function parseWorkspaceBackup(value: unknown) {
  if (!isRecord(value) || value.format !== 'foundry-cost-lab-workspace-v1' || !Array.isArray(value.scenarios) || value.scenarios.length > 1000) {
    throw new Error('Invalid workspace backup.')
  }
  const current = parseScenarioExport(value.current)
  const scenarios = value.scenarios.map((scenario): SavedScenario => {
    if (!isRecord(scenario) || typeof scenario.name !== 'string' || !scenario.name.trim() ||
      typeof scenario.rateCardAsOf !== 'string' || typeof scenario.createdAt !== 'string' || typeof scenario.updatedAt !== 'string' ||
      (scenario.revisions !== undefined && (!Array.isArray(scenario.revisions) || scenario.revisions.length > 1000))) throw new Error('Invalid saved scenario in backup.')
    const { config } = parseScenarioExport({ schemaVersion: 1, config: scenario.config, rateCard: { asOf: scenario.rateCardAsOf, currency: 'CAD' } })
    return {
      id: crypto.randomUUID(), name: scenario.name.trim().slice(0, 80), config,
      rateCardAsOf: scenario.rateCardAsOf, createdAt: scenario.createdAt, updatedAt: scenario.updatedAt,
      revisions: Array.isArray(scenario.revisions) ? scenario.revisions.map(parseRevision) : [],
    }
  })
  return { current, scenarios }
}