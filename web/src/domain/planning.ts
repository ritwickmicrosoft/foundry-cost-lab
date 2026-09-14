import { computeCost } from './computeCost'
import type { FoundryModelCatalogEntry } from './foundryCatalog'
import type { CostConfig } from './types'
import type { RateCard } from './types'

export const WORKLOAD_LABELS: Record<keyof CostConfig['workload'], string> = {
  monthlyUsers: 'Monthly users',
  activeDaysPerMonth: 'Active days',
  requestsPerUserPerDay: 'Requests / user / day',
  agentTurnMultiplier: 'Agent turns per request',
  inputTokensPerTurn: 'Input tokens / turn',
  outputTokensPerTurn: 'Output tokens / turn',
  mcpSchemaTokensPerTurn: 'MCP schema tokens / turn',
}

export function workloadSignature(config: CostConfig) {
  return JSON.stringify({
    workload: config.workload,
    harnesses: config.harnesses,
    models: [config.commercialModel, ...config.modelPortfolio.deployments.map((deployment) => deployment.model)]
      .map((model) => ({ modelId: model.modelId, cachedInputPercent: model.cachedInputPercent })),
    routes: config.modelPortfolio.routes,
  })
}

export function hasObservationPeriod(evidence: CostConfig['planning']['workloadEvidence'], now = new Date()) {
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
  return evidence.source.trim().length > 0 && validDate(evidence.periodStart) && validDate(evidence.periodEnd) &&
    evidence.periodStart <= evidence.periodEnd && evidence.periodEnd <= now.toISOString().slice(0, 10)
}

export function workloadEvidenceStatus(config: CostConfig) {
  const evidence = config.planning?.workloadEvidence
  if (!evidence?.signature) return 'Not supplied'
  return hasObservationPeriod(evidence) && evidence.signature === workloadSignature(config)
    ? 'Measured (user-attested)'
    : 'Needs review'
}

export function analyzePlanning(config: CostConfig, rateCard: RateCard, catalog?: readonly FoundryModelCatalogEntry[]) {
  const percent = Math.min(100, Math.max(0, config.planning?.variationPercent ?? 20))
  const fraction = percent / 100
  const base = computeCost(config, rateCard, catalog)
  const calculate = (change: (draft: CostConfig) => void) => {
    const draft = structuredClone(config)
    change(draft)
    return computeCost(draft, rateCard, catalog)
  }
  const low = calculate((draft) => { draft.workload.monthlyUsers *= 1 - fraction })
  const high = calculate((draft) => { draft.workload.monthlyUsers *= 1 + fraction })
  const sensitivity = (Object.keys(WORKLOAD_LABELS) as Array<keyof CostConfig['workload']>).map((key) => {
    const lower = calculate((draft) => { draft.workload[key] *= 1 - fraction })
    const upper = calculate((draft) => {
      draft.workload[key] *= 1 + fraction
      if (key === 'activeDaysPerMonth') draft.workload[key] = Math.min(31, draft.workload[key])
    })
    return {
      id: String(key), label: WORKLOAD_LABELS[key], lower, upper,
      impact: Math.max(Math.abs(lower.knownGrandTotal - base.knownGrandTotal), Math.abs(upper.knownGrandTotal - base.knownGrandTotal)),
    }
  })
  const lowerCache = calculate((draft) => { draft.commercialModel.cachedInputPercent = Math.max(0, draft.commercialModel.cachedInputPercent - percent) })
  const upperCache = calculate((draft) => { draft.commercialModel.cachedInputPercent = Math.min(100, draft.commercialModel.cachedInputPercent + percent) })
  sensitivity.push({
    id: 'primaryCache', label: 'Primary cache hit rate (percentage points)', lower: lowerCache, upper: upperCache,
    impact: Math.max(Math.abs(lowerCache.knownGrandTotal - base.knownGrandTotal), Math.abs(upperCache.knownGrandTotal - base.knownGrandTotal)),
  })
  return { percent, low, base, high, sensitivity: sensitivity.filter((item) => item.impact > 0).sort((left, right) => right.impact - left.impact).slice(0, 3) }
}