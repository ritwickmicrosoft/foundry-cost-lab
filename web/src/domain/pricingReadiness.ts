import {
  MODEL_DEPLOYMENT_SKU_LABELS,
  MODEL_SOURCE_LABELS,
  getFoundryModel,
  type FoundryModelCatalogEntry,
} from './foundryCatalog'
import { findModelPriceProfile } from './modelPriceProfiles'
import { REGION_LABELS, type CostConfig, type CostLine, type CostResult, type RateCard } from './types'

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

export function processingBoundary(config: CostConfig) {
  const sku = config.commercialModel.deploymentSku
  if (sku.startsWith('global-')) return 'Global processing'
  if (sku.startsWith('data-zone-')) return 'Data Zone processing'
  if (sku.startsWith('regional-')) return `${REGION_LABELS[config.region]} processing`
  if (sku === 'managed-compute') return `${REGION_LABELS[config.region]} managed compute`
  if (sku === 'developer') return 'Developer offer processing terms'
  return 'Provider offer processing boundary'
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
  const model = getFoundryModel(config.commercialModel.modelId, modelCatalog)
  const profile = findModelPriceProfile(config.commercialModel)

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
        id,
        label,
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
        id,
        label,
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
      id,
      label,
      value: null,
      unit: rate?.unit ?? fallbackUnit,
      status: 'unpriced',
      source: rate?.unavailableReason ?? 'No exact rate or matching profile',
      asOf: rate?.asOf ?? rateCard.asOf,
      required,
      origin: 'none',
    }
  }

  const dimensions: ModelPriceDimension[] = []
  const commercial = config.commercialModel
  if (commercial.enabled) {
    if (commercial.billingBasis === 'managed-compute') {
      dimensions.push(dimension(
        'managed-compute',
        'Managed compute',
        `${commercial.inputRateKey}.managedComputeHour`,
        commercial.managedCompute.instanceHourlyRateCad,
        'CAD/instance-hour',
      ))
    } else if (commercial.billingBasis === 'usage') {
      dimensions.push(dimension(
        'usage',
        `Usage (${commercial.usage.quantityUnit})`,
        `${commercial.inputRateKey}.usage`,
        commercial.usage.unitRateCad,
        `CAD/${commercial.usage.quantityUnit}`,
      ))
    } else if (commercial.purchaseMode === 'batch') {
      dimensions.push(
        dimension('batch-input', 'Batch input', commercial.batchInputRateKey, commercial.customBatchInputRateCadPerMillion, 'CAD/million tokens'),
        dimension('batch-output', 'Batch output', commercial.batchOutputRateKey, commercial.customBatchOutputRateCadPerMillion, 'CAD/million tokens'),
      )
    } else if (commercial.purchaseMode === 'ptu') {
      dimensions.push(
        dimension('ptu', 'Provisioned throughput', commercial.ptuHourlyRateKey, commercial.customPtuHourlyRateCad, 'CAD/PTU-hour'),
        dimension('overflow-input', 'PAYG overflow input', commercial.inputRateKey, commercial.customInputRateCadPerMillion, 'CAD/million tokens', false),
        dimension('overflow-cached-input', 'PAYG overflow cached input', commercial.cachedInputRateKey, commercial.customCachedInputRateCadPerMillion, 'CAD/million cached tokens', false),
        dimension('overflow-output', 'PAYG overflow output', commercial.outputRateKey, commercial.customOutputRateCadPerMillion, 'CAD/million tokens', false),
      )
    } else {
      dimensions.push(
        dimension('input', 'Input', commercial.inputRateKey, commercial.customInputRateCadPerMillion, 'CAD/million tokens'),
        dimension('cached-input', 'Cached input', commercial.cachedInputRateKey, commercial.customCachedInputRateCadPerMillion, 'CAD/million cached tokens', commercial.cachedInputPercent > 0),
        dimension('output', 'Output', commercial.outputRateKey, commercial.customOutputRateCadPerMillion, 'CAD/million tokens'),
      )
    }
  }

  const requiredDimensions = dimensions.filter((entry) => entry.required)
  const dimensionStatuses = new Set(requiredDimensions.map((entry) => entry.status))
  const modelStatus: PricingCoverageStatus = !commercial.enabled
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
  if (commercial.purchaseMode === 'ptu' && commercial.ptuCapacityTokensPerUnitMonth === null) {
    decisionBlockers.push('PTU token capacity per unit')
  }
  const profileDimensions = dimensions.filter((entry) => entry.origin === 'profile')
  if (profileDimensions.length > 0 && !profile?.source.trim()) {
    decisionBlockers.push('Model/SKU fallback source')
  }
  if (profileDimensions.length > 0 && !profile?.asOf) {
    decisionBlockers.push('Model/SKU fallback as-of date')
  }

  return {
    modelLabel: model ? `${model.name} ${model.version}` : commercial.modelId,
    modelSource: model ? MODEL_SOURCE_LABELS[model.source] : 'Custom catalog model',
    deploymentSkuLabel: MODEL_DEPLOYMENT_SKU_LABELS[commercial.deploymentSku],
    processingBoundary: processingBoundary(config),
    modelStatus,
    dimensions,
    blocks,
    decisionBlockers: [...new Set(decisionBlockers)],
  }
}