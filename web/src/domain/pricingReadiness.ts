import {
  MODEL_DEPLOYMENT_SKU_LABELS,
  MODEL_SOURCE_LABELS,
  getFoundryModel,
  type FoundryModelCatalogEntry,
} from './foundryCatalog'
import { findModelPriceProfile } from './modelPriceProfiles'
import { REGION_LABELS, type CommercialModelConfig, type CostConfig, type CostLine, type CostResult, type RateCard } from './types'

export type PricingCoverageStatus = 'exact' | 'manual' | 'mixed' | 'unpriced' | 'inactive'

export interface ModelPriceDimension {
  id: string
  label: string
  value: number | null
  unit: string
  status: Exclude<PricingCoverageStatus, 'mixed'>
  source: string
  asOf: string
  required: boolean
  origin: 'rate-card' | 'profile' | 'none'
}

export interface PricingBlockReadiness {
  id: 'agentTools' | 'rag' | 'observability' | 'networking' | 'disasterRecovery'
  label: string
  status: PricingCoverageStatus
  lineCount: number
  missingDimensions: string[]
}

export interface PricingReadiness {
  modelLabel: string
  modelSource: string
  deploymentSkuLabel: string
  processingBoundary: string
  modelStatus: PricingCoverageStatus
  dimensions: ModelPriceDimension[]
  blocks: PricingBlockReadiness[]
  decisionBlockers: string[]
}

function deploymentProcessingBoundary(model: CommercialModelConfig, config: CostConfig) {
  const sku = model.deploymentSku
  if (sku.startsWith('global-')) return 'Global processing'
  if (sku.startsWith('data-zone-')) return 'Data Zone processing'
  if (sku.startsWith('regional-')) return `${REGION_LABELS[config.region]} processing`
  if (sku === 'managed-compute') return `${REGION_LABELS[config.region]} managed compute`
  if (sku === 'developer') return 'Developer offer processing terms'
  return 'Provider offer processing boundary'
}

export function processingBoundary(config: CostConfig) {
  return deploymentProcessingBoundary(config.commercialModel, config)
}

function coverageStatus(lines: CostLine[], active: boolean): PricingCoverageStatus {
  if (!active || lines.length === 0) return 'inactive'
  if (lines.some((line) => line.amount === null)) return 'unpriced'
  const maintenance = new Set(lines.map((line) => line.provenance.maintenance))
  if (maintenance.size > 1) return 'mixed'
  return maintenance.has('synced') ? 'exact' : 'manual'
}

export function buildPricingReadiness(
  config: CostConfig,
  rateCard: RateCard,
  result: CostResult,
  modelCatalog?: readonly FoundryModelCatalogEntry[],
): PricingReadiness {
  const commercial = config.commercialModel
  const portfolioActive = config.modelPortfolio.deployments.length > 0 || config.modelPortfolio.routes.length > 1
  const referencedDeploymentIds = new Set(
    config.modelPortfolio.routes.filter((route) => route.trafficPercent > 0).map((route) => route.deploymentId),
  )
  const modelEntries = [
    ...(!portfolioActive || referencedDeploymentIds.has('primary')
      ? [{ id: 'primary', label: portfolioActive ? 'Primary' : '', model: commercial }]
      : []),
    ...config.modelPortfolio.deployments
      .filter((deployment) => referencedDeploymentIds.has(deployment.id))
      .map((deployment) => ({ id: deployment.id, label: deployment.label, model: deployment.model })),
  ].filter((entry) => entry.model.enabled)

  const dimensionsFor = (entry: typeof modelEntries[number]): ModelPriceDimension[] => {
    const profile = findModelPriceProfile(entry.model)
    const prefixedLabel = (label: string) => entry.label ? `${entry.label} · ${label}` : label
    const dimension = (
      id: string,
      label: string,
      rateKey: string,
      profileValue: number | null,
      fallbackUnit: string,
      required = true,
    ): ModelPriceDimension => {
      const rate = rateCard.rates[rateKey]
      if (rate?.value !== null && rate?.value !== undefined) {
        return {
          id: entry.label ? `${entry.id}:${id}` : id,
          label: prefixedLabel(label),
          value: rate.value,
          unit: rate.unit,
          status: rate.maintenance === 'synced' ? 'exact' : 'manual',
          source: rate.source,
          asOf: rate.asOf,
          required,
          origin: 'rate-card',
        }
      }
      if (profileValue !== null) {
        return {
          id: entry.label ? `${entry.id}:${id}` : id,
          label: prefixedLabel(label),
          value: profileValue,
          unit: fallbackUnit,
          status: 'manual',
          source: profile?.source.trim() || 'Source required',
          asOf: profile?.asOf || 'Date required',
          required,
          origin: 'profile',
        }
      }
      return {
        id: entry.label ? `${entry.id}:${id}` : id,
        label: prefixedLabel(label),
        value: null,
        unit: rate?.unit ?? fallbackUnit,
        status: 'unpriced',
        source: rate?.unavailableReason ?? 'No exact rate or matching profile',
        asOf: rate?.asOf ?? rateCard.asOf,
        required,
        origin: 'none',
      }
    }

    const model = entry.model
    if (model.billingBasis === 'managed-compute') {
      return [dimension('managed-compute', 'Managed compute', `${model.inputRateKey}.managedComputeHour`, model.managedCompute.instanceHourlyRateCad, 'CAD/instance-hour')]
    }
    if (model.billingBasis === 'usage') {
      return [dimension('usage', `Usage (${model.usage.quantityUnit})`, `${model.inputRateKey}.usage`, model.usage.unitRateCad, `CAD/${model.usage.quantityUnit}`)]
    }
    if (model.purchaseMode === 'batch') {
      return [
        dimension('batch-input', 'Batch input', model.batchInputRateKey, model.customBatchInputRateCadPerMillion, 'CAD/million tokens'),
        dimension('batch-output', 'Batch output', model.batchOutputRateKey, model.customBatchOutputRateCadPerMillion, 'CAD/million tokens'),
      ]
    }
    if (model.purchaseMode === 'ptu') {
      return [
        dimension('ptu', 'Provisioned throughput', model.ptuHourlyRateKey, model.customPtuHourlyRateCad, 'CAD/PTU-hour'),
        dimension('overflow-input', 'PAYG overflow input', model.inputRateKey, model.customInputRateCadPerMillion, 'CAD/million tokens', false),
        dimension('overflow-cached-input', 'PAYG overflow cached input', model.cachedInputRateKey, model.customCachedInputRateCadPerMillion, 'CAD/million cached tokens', false),
        dimension('overflow-output', 'PAYG overflow output', model.outputRateKey, model.customOutputRateCadPerMillion, 'CAD/million tokens', false),
      ]
    }
    return [
      dimension('input', 'Input', model.inputRateKey, model.customInputRateCadPerMillion, 'CAD/million tokens'),
      dimension('cached-input', 'Cached input', model.cachedInputRateKey, model.customCachedInputRateCadPerMillion, 'CAD/million cached tokens', model.cachedInputPercent > 0),
      dimension('output', 'Output', model.outputRateKey, model.customOutputRateCadPerMillion, 'CAD/million tokens'),
    ]
  }

  const dimensions = modelEntries.flatMap(dimensionsFor)

  const requiredDimensions = dimensions.filter((entry) => entry.required)
  const dimensionStatuses = new Set(requiredDimensions.map((entry) => entry.status))
  const modelStatus: PricingCoverageStatus = modelEntries.length === 0
    ? 'inactive'
    : requiredDimensions.some((entry) => entry.status === 'unpriced')
      ? 'unpriced'
      : dimensionStatuses.size > 1
        ? 'mixed'
        : (requiredDimensions[0]?.status ?? 'inactive')

  const blockDefinitions = [
    {
      id: 'agentTools' as const,
      label: 'Agent tools',
      active: Object.values(config.agentTools).some((tool) => tool.enabled),
    },
    {
      id: 'rag' as const,
      label: 'RAG and retrieval',
      active: Object.values(config.rag).some((feature) => feature.enabled),
    },
    { id: 'observability' as const, label: 'Observability', active: config.observability.enabled },
    {
      id: 'networking' as const,
      label: 'Network processing',
      active: Object.values(config.networking).some((feature) => feature.enabled),
    },
    { id: 'disasterRecovery' as const, label: 'Disaster recovery', active: config.disasterRecovery.enabled },
  ]
  const blocks = blockDefinitions.map(({ id, label, active }) => {
    const lines = result.lines.filter((line) => line.blockId === id)
    return {
      id,
      label,
      status: coverageStatus(lines, active),
      lineCount: lines.length,
      missingDimensions: [...new Set(lines.filter((line) => line.amount === null).map((line) => line.label))],
    }
  })

  const decisionBlockers = requiredDimensions
    .filter((entry) => entry.status === 'unpriced')
    .map((entry) => `${entry.label} rate`)
  for (const entry of modelEntries) {
    if (entry.model.purchaseMode === 'ptu' && entry.model.ptuCapacityTokensPerUnitMonth === null) {
      decisionBlockers.push(`${entry.label ? `${entry.label} ` : ''}PTU token capacity per unit`)
    }
    const profile = findModelPriceProfile(entry.model)
    const profileDimensions = dimensions.filter(
      (dimension) => (entry.label ? dimension.id.startsWith(`${entry.id}:`) : !dimension.id.includes(':')) &&
        dimension.origin === 'profile',
    )
    if (profileDimensions.length > 0 && !profile?.source.trim()) {
      decisionBlockers.push(`${entry.label ? `${entry.label} ` : ''}Model/SKU fallback source`)
    }
    if (profileDimensions.length > 0 && !profile?.asOf) {
      decisionBlockers.push(`${entry.label ? `${entry.label} ` : ''}Model/SKU fallback as-of date`)
    }
  }

  const catalogModels = modelEntries.map((entry) => getFoundryModel(entry.model.modelId, modelCatalog))
  const skuLabels = new Set(modelEntries.map((entry) => MODEL_DEPLOYMENT_SKU_LABELS[entry.model.deploymentSku]))
  const boundaries = new Set(modelEntries.map((entry) => deploymentProcessingBoundary(entry.model, config)))

  return {
    modelLabel: portfolioActive
      ? `${config.modelPortfolio.routes.filter((route) => route.trafficPercent > 0).length} routed model roles`
      : catalogModels[0] ? `${catalogModels[0].name} ${catalogModels[0].version}` : commercial.modelId,
    modelSource: portfolioActive
      ? `${modelEntries.length} deployments · ${config.modelPortfolio.strategy.replaceAll('-', ' ')}`
      : catalogModels[0] ? MODEL_SOURCE_LABELS[catalogModels[0].source] : 'Custom catalog model',
    deploymentSkuLabel: skuLabels.size === 1 ? [...skuLabels][0]! : 'Mixed deployment SKUs',
    processingBoundary: boundaries.size === 1 ? [...boundaries][0]! : 'Mixed processing boundaries',
    modelStatus,
    dimensions,
    blocks,
    decisionBlockers: [...new Set(decisionBlockers)],
  }
}