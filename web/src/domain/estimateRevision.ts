import { computeCost } from './computeCost'
import { FOUNDRY_MODEL_CATALOG, type FoundryModelCatalogEntry } from './foundryCatalog'
import type { CostConfig, CostResult, RateCard } from './types'

export const CALCULATION_VERSION = '2026-09-14.1'

export interface EstimateRevision {
  id: string
  capturedAt: string
  calculationVersion: string
  config: CostConfig
  result: CostResult
  rateCard: RateCard
  models: FoundryModelCatalogEntry[]
}

export function captureEstimateRevision(config: CostConfig, result: CostResult, rateCard: RateCard,
  models: readonly FoundryModelCatalogEntry[] = FOUNDRY_MODEL_CATALOG, capturedAt = new Date().toISOString()): EstimateRevision {
  if (config.region !== rateCard.region) throw new Error('Cannot capture an estimate with another region\'s rates.')
  const modelIds = new Set([config.commercialModel.modelId, ...config.modelPortfolio.deployments.map((deployment) => deployment.model.modelId)])
  return structuredClone({
    id: crypto.randomUUID(), capturedAt, calculationVersion: CALCULATION_VERSION,
    config, result, rateCard, models: models.filter((model) => modelIds.has(model.id)),
  })
}

export function repriceEstimateRevision(revision: EstimateRevision, rateCard: RateCard, models: readonly FoundryModelCatalogEntry[]) {
  if (revision.config.region !== rateCard.region) throw new Error('Repricing requires the saved region.')
  const replay = computeCost(revision.config, revision.rateCard, revision.models)
  const ratesOnly = computeCost(revision.config, rateCard, revision.models)
  const repriced = computeCost(revision.config, rateCard, models)
  return {
    repriced,
    rateDelta: ratesOnly.knownGrandTotal - replay.knownGrandTotal,
    calculationDelta: replay.knownGrandTotal - revision.result.knownGrandTotal,
    catalogDelta: repriced.knownGrandTotal - ratesOnly.knownGrandTotal,
    totalDelta: repriced.knownGrandTotal - revision.result.knownGrandTotal,
  }
}