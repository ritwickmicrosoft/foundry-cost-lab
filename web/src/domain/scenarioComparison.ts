import { REGION_LABELS, type CostConfig, type CostLine, type CostResult, type CostTier, type RateCard } from './types'

export const MAX_COMPARISON_SCENARIOS = 3
export const COMPARISON_KEYS = ['A', 'B', 'C'] as const

export type ComparisonKey = (typeof COMPARISON_KEYS)[number]
export type BuyerLens = 'executive' | 'finance' | 'security' | 'architecture'
export type CompetitorLens = 'none' | 'aws' | 'google' | 'databricks'
export type ComparisonValueState = 'priced' | 'unpriced' | 'inactive'

export interface ComparisonSource {
  id: string
  name: string
  savedRateCardAsOf: string
  config: CostConfig
  result: CostResult
  rateCard: RateCard
}

export interface ComparisonValue {
  state: ComparisonValueState
  amount: number | null
}

export interface ComparisonScenarioSummary {
  id: string
  key: ComparisonKey
  name: string
  savedRateCardAsOf: string
  comparisonRateCardAsOf: string
  regionLabel: string
  knownMonthlyTotal: number
  knownAnnualTotal: number
  costPerMonthlyUser: number | null
  costPerThousandTurns: number | null
  complete: boolean
  unpricedLineCount: number
  securityControlCount: number
  privateNetworking: boolean
  disasterRecovery: boolean
  tiers: Record<CostTier, number>
}

export interface ComparisonCostDriver {
  id: string
  label: string
  tier: CostTier
  values: ComparisonValue[]
  deltasFromBaseline: Array<number | null>
  maxAbsoluteDelta: number
  hasUnpricedValue: boolean
}

export interface ComparisonAssumption {
  id: string
  label: string
  values: string[]
  differs: boolean
}

export interface ComparisonFact {
  id: string
  category: 'economics' | 'coverage' | 'architecture' | 'driver'
  scenarioKeys: ComparisonKey[]
  text: string
}

export interface ScenarioComparisonAnalysis {
  baselineIndex: number
  summaries: ComparisonScenarioSummary[]
  drivers: ComparisonCostDriver[]
  assumptions: ComparisonAssumption[]
  lowestKnownIndex: number
  facts: ComparisonFact[]
}

const securityControlCount = (config: CostConfig) => [
  config.guardrail.contentSafety.enabled,
  config.guardrail.defenderForAi.enabled,
  config.guardrail.sentinel.enabled,
  config.guardrail.entra.enabled,
  config.guardrail.purview.enabled,
].filter(Boolean).length

const lineValue = (line: CostLine | undefined): ComparisonValue => {
  if (!line) return { state: 'inactive', amount: 0 }
  if (line.amount === null) return { state: 'unpriced', amount: null }
  return { state: 'priced', amount: line.amount }
}

const portfolioSummary = (config: CostConfig) => {
  const deployments = new Map([
    ['primary', config.commercialModel.modelId],
    ...config.modelPortfolio.deployments.map((deployment) => [deployment.id, deployment.model.modelId] as const),
  ])
  return config.modelPortfolio.routes.map((route) => {
    const routing = route.mode === 'traffic-share'
      ? `${route.trafficPercent}% shared`
      : `${route.trafficPercent}% additional`
    return `${route.label}: ${deployments.get(route.deploymentId) ?? 'Unresolved'} (${routing})`
  }).join(' | ')
}

const portfolioDeploymentValues = (config: CostConfig, field: 'deploymentSku' | 'purchaseMode') => {
  const values = [
    config.commercialModel[field],
    ...config.modelPortfolio.deployments.map((deployment) => deployment.model[field]),
  ]
  return [...new Set(values)].map((value) => String(value).toUpperCase()).join(', ')
}

const assumptionRows = (sources: readonly ComparisonSource[]): ComparisonAssumption[] => {
  const rows: Array<Omit<ComparisonAssumption, 'differs'>> = [
    { id: 'posture', label: 'Posture', values: sources.map((source) => source.config.posture === 'production' ? 'Production' : 'Lean POC') },
    { id: 'region', label: 'Region', values: sources.map((source) => REGION_LABELS[source.config.region]) },
    { id: 'environments', label: 'Environments', values: sources.map((source) => String(source.config.environments)) },
    { id: 'monthly-users', label: 'Monthly users', values: sources.map((source) => source.config.workload.monthlyUsers.toLocaleString('en-CA')) },
    { id: 'model-portfolio', label: 'Model portfolio', values: sources.map((source) => portfolioSummary(source.config)) },
    { id: 'deployment-sku', label: 'Deployment SKUs', values: sources.map((source) => portfolioDeploymentValues(source.config, 'deploymentSku')) },
    { id: 'purchase-mode', label: 'Purchase modes', values: sources.map((source) => portfolioDeploymentValues(source.config, 'purchaseMode')) },
    { id: 'standard-agent', label: 'Standard Agent Setup', values: sources.map((source) => source.config.platform.standardAgentSetup.enabled ? 'Included' : 'Excluded') },
    { id: 'private-networking', label: 'Private networking', values: sources.map((source) => source.config.platform.privateEndpoints.enabled || source.config.networking.privateLinkData.enabled ? 'Included' : 'Excluded') },
    { id: 'disaster-recovery', label: 'Disaster recovery', values: sources.map((source) => source.config.disasterRecovery.enabled ? 'Included' : 'Excluded') },
  ]
  return rows.map((row) => ({ ...row, differs: new Set(row.values).size > 1 }))
}

export function buildScenarioComparison(
  sources: readonly ComparisonSource[],
  baselineId?: string,
): ScenarioComparisonAnalysis {
  if (sources.length < 2 || sources.length > MAX_COMPARISON_SCENARIOS) {
    throw new Error('Scenario comparison requires two or three saved scenarios.')
  }
  const requestedBaseline = sources.findIndex((source) => source.id === baselineId)
  const baselineIndex = requestedBaseline >= 0 ? requestedBaseline : 0
  const summaries = sources.map((source, index): ComparisonScenarioSummary => {
    const monthlyUsers = source.config.workload.monthlyUsers
    const monthlyTurns = source.result.metrics.monthlyTurns
    return {
      id: source.id,
      key: COMPARISON_KEYS[index],
      name: source.name,
      savedRateCardAsOf: source.savedRateCardAsOf,
      comparisonRateCardAsOf: source.rateCard.asOf,
      regionLabel: REGION_LABELS[source.config.region],
      knownMonthlyTotal: source.result.knownGrandTotal,
      knownAnnualTotal: source.result.knownGrandTotal * 12,
      costPerMonthlyUser: monthlyUsers > 0 ? source.result.knownGrandTotal / monthlyUsers : null,
      costPerThousandTurns: monthlyTurns > 0 ? source.result.knownGrandTotal / monthlyTurns * 1000 : null,
      complete: source.result.complete,
      unpricedLineCount: source.result.lines.filter((line) => line.amount === null).length,
      securityControlCount: securityControlCount(source.config),
      privateNetworking: source.config.platform.privateEndpoints.enabled || source.config.networking.privateLinkData.enabled,
      disasterRecovery: source.config.disasterRecovery.enabled,
      tiers: {
        run: source.result.tiers.run.knownSubtotal,
        guardrail: source.result.tiers.guardrail.knownSubtotal,
        platform: source.result.tiers.platform.knownSubtotal,
        change: source.result.tiers.change.knownSubtotal,
      },
    }
  })

  const lineIds = [...new Set(sources.flatMap((source) => source.result.lines.map((line) => line.id)))]
  const baselineLines = new Map(sources[baselineIndex].result.lines.map((line) => [line.id, line]))
  const drivers = lineIds.map((id): ComparisonCostDriver => {
    const lines = sources.map((source) => source.result.lines.find((line) => line.id === id))
    const representative = lines.find(Boolean) as CostLine
    const values = lines.map(lineValue)
    const baseline = lineValue(baselineLines.get(id))
    const deltasFromBaseline = values.map((value) =>
      value.amount === null || baseline.amount === null ? null : value.amount - baseline.amount,
    )
    return {
      id,
      label: representative.label,
      tier: representative.tier,
      values,
      deltasFromBaseline,
      maxAbsoluteDelta: Math.max(0, ...deltasFromBaseline.filter((delta): delta is number => delta !== null).map(Math.abs)),
      hasUnpricedValue: values.some((value) => value.state === 'unpriced'),
    }
  }).filter((driver) => driver.maxAbsoluteDelta > 0 || new Set(driver.values.map((value) => value.state)).size > 1)
    .sort((left, right) => right.maxAbsoluteDelta - left.maxAbsoluteDelta || left.label.localeCompare(right.label))

  const lowestKnownIndex = summaries.reduce(
    (lowest, summary, index) => summary.knownMonthlyTotal < summaries[lowest].knownMonthlyTotal ? index : lowest,
    0,
  )
  const facts: ComparisonFact[] = summaries.flatMap((summary) => [
    {
      id: `scenario:${summary.key}:monthly-known`,
      category: 'economics' as const,
      scenarioKeys: [summary.key],
      text: `Scenario ${summary.key} has a known monthly subtotal of CAD ${summary.knownMonthlyTotal.toFixed(2)}.`,
    },
    {
      id: `scenario:${summary.key}:coverage`,
      category: 'coverage' as const,
      scenarioKeys: [summary.key],
      text: summary.complete
        ? `Scenario ${summary.key} has all active cost lines priced.`
        : `Scenario ${summary.key} has ${summary.unpricedLineCount} active unpriced cost lines.`,
    },
    {
      id: `scenario:${summary.key}:architecture`,
      category: 'architecture' as const,
      scenarioKeys: [summary.key],
      text: `Scenario ${summary.key} uses ${summary.regionLabel}; private networking is ${summary.privateNetworking ? 'included' : 'excluded'} and disaster recovery is ${summary.disasterRecovery ? 'included' : 'excluded'}.`,
    },
  ])
  drivers.slice(0, 8).forEach((driver) => {
    facts.push({
      id: `driver:${driver.id}`,
      category: 'driver',
      scenarioKeys: summaries.map((summary) => summary.key),
      text: `${driver.label} differs by up to CAD ${driver.maxAbsoluteDelta.toFixed(2)} from the baseline among priced values.`,
    })
  })

  return {
    baselineIndex,
    summaries,
    drivers,
    assumptions: assumptionRows(sources),
    lowestKnownIndex,
    facts,
  }
}