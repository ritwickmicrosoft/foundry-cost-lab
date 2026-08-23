import catalogSnapshot from './foundryModelCatalog.json'
import { isRegionId, type ModelBillingBasis, type ModelSourceId, type RegionId } from './types'
import type { ModelDeploymentSku, PurchaseMode } from './types'

export type { ModelBillingBasis, ModelSourceId } from './types'

export const MODEL_SOURCE_IDS = [
  'direct-azure',
  'foundry-labs',
  'hugging-face',
  'fireworks',
] as const

export const MODEL_SOURCE_LABELS: Record<ModelSourceId, string> = {
  'direct-azure': 'Direct from Azure',
  'foundry-labs': 'Foundry Labs',
  'hugging-face': 'Hugging Face',
  fireworks: 'Fireworks on Foundry',
}

export interface FoundryModelCatalogEntry {
  id: string
  name: string
  version: string
  publisher: string
  source: ModelSourceId
  inferenceTasks: string[]
  deploymentOptions: string[]
  assetId: string
  regionalAvailability?: RegionId[]
}

export interface FoundryModelCatalogSnapshot {
  schemaVersion?: 1
  asOf: string
  generatedAt?: string
  region?: RegionId
  sourceUrl: string
  models: FoundryModelCatalogEntry[]
}

export interface ActiveFoundryCatalog {
  models: FoundryModelCatalogEntry[]
  liveAsOf: string | null
  bundledAsOf: string
  sourceUrl: string
  region: RegionId
  regionConfirmedCount: number
  bundledOnlyCount: number
  bundledOnlyBySource: Record<ModelSourceId, number>
}

const snapshot = catalogSnapshot as FoundryModelCatalogSnapshot

export const FOUNDRY_MODEL_CATALOG_AS_OF = snapshot.asOf
export const FOUNDRY_MODEL_CATALOG = snapshot.models
export const DEFAULT_FOUNDRY_MODEL_ID = 'direct-azure/gpt-4o/2024-11-20'

export const MODEL_DEPLOYMENT_SKU_LABELS: Record<ModelDeploymentSku, string> = {
  'global-standard': 'Global Standard',
  'data-zone-standard': 'Data Zone Standard',
  'regional-standard': 'Regional Standard',
  'global-batch': 'Global Batch',
  'data-zone-batch': 'Data Zone Batch',
  'global-provisioned': 'Global Provisioned',
  'data-zone-provisioned': 'Data Zone Provisioned',
  'regional-provisioned': 'Regional Provisioned',
  developer: 'Developer',
  marketplace: 'Marketplace / provider offer',
  'managed-compute': 'Managed compute',
}

const pairedTokenTasks = new Set(['chat-completion', 'messages', 'responses', 'text-generation'])
const managedComputeOptions = new Set(['Managed Compute'])

export function getFoundryModel(
  modelId: string,
  models: readonly FoundryModelCatalogEntry[] = FOUNDRY_MODEL_CATALOG,
) {
  return models.find((model) => model.id === modelId)
}

const sourceIds = new Set<ModelSourceId>(MODEL_SOURCE_IDS)

export function validateFoundryCatalogSnapshot(value: unknown): FoundryModelCatalogSnapshot {
  if (!value || typeof value !== 'object') throw new Error('Model catalog must be an object.')
  const candidate = value as Partial<FoundryModelCatalogSnapshot>
  if (!candidate.asOf || !candidate.sourceUrl || !Array.isArray(candidate.models) || candidate.models.length === 0) {
    throw new Error('Model catalog metadata is incomplete.')
  }
  if (!candidate.region || !isRegionId(candidate.region)) {
    throw new Error('Model catalog region is invalid.')
  }
  for (const model of candidate.models) {
    if (
      !model.id ||
      !model.name ||
      !model.version ||
      !model.publisher ||
      !sourceIds.has(model.source) ||
      !Array.isArray(model.inferenceTasks) ||
      !Array.isArray(model.deploymentOptions) ||
      !Array.isArray(model.regionalAvailability)
    ) {
      throw new Error(`Model catalog entry ${model.id || '(unknown)'} is invalid.`)
    }
  }
  return candidate as FoundryModelCatalogSnapshot
}

export function bundledFoundryCatalog(region: RegionId): ActiveFoundryCatalog {
  const bundledOnlyBySource = Object.fromEntries(
    MODEL_SOURCE_IDS.map((source) => [
      source,
      FOUNDRY_MODEL_CATALOG.filter((model) => model.source === source).length,
    ]),
  ) as Record<ModelSourceId, number>
  return {
    models: FOUNDRY_MODEL_CATALOG.map((model) => ({ ...model, regionalAvailability: [] })),
    liveAsOf: null,
    bundledAsOf: FOUNDRY_MODEL_CATALOG_AS_OF,
    sourceUrl: snapshot.sourceUrl,
    region,
    regionConfirmedCount: 0,
    bundledOnlyCount: FOUNDRY_MODEL_CATALOG.length,
    bundledOnlyBySource,
  }
}

export function mergeFoundryCatalog(
  liveSnapshot: FoundryModelCatalogSnapshot,
  region: RegionId,
): ActiveFoundryCatalog {
  const liveModels = new Map(liveSnapshot.models.map((model) => [model.id, model]))
  const merged: FoundryModelCatalogEntry[] = FOUNDRY_MODEL_CATALOG.map((bundled) => {
    const live = liveModels.get(bundled.id)
    if (!live) return { ...bundled, regionalAvailability: [] }
    liveModels.delete(bundled.id)
    return {
      ...bundled,
      ...live,
      inferenceTasks: [...new Set([...bundled.inferenceTasks, ...live.inferenceTasks])],
      deploymentOptions: [...new Set([...bundled.deploymentOptions, ...live.deploymentOptions])],
      regionalAvailability: [...new Set(live.regionalAvailability ?? [region])],
    }
  })
  merged.push(...liveModels.values())
  const sourceOrder = new Map(MODEL_SOURCE_IDS.map((source, index) => [source, index]))
  merged.sort((left, right) =>
    (sourceOrder.get(left.source) ?? 99) - (sourceOrder.get(right.source) ?? 99) ||
    left.name.localeCompare(right.name) ||
    right.version.localeCompare(left.version),
  )
  const bundledOnlyModels = merged.filter(
    (model) => !(model.regionalAvailability ?? []).includes(region),
  )
  const bundledOnlyBySource = Object.fromEntries(
    MODEL_SOURCE_IDS.map((source) => [
      source,
      bundledOnlyModels.filter((model) => model.source === source).length,
    ]),
  ) as Record<ModelSourceId, number>
  return {
    models: merged,
    liveAsOf: liveSnapshot.asOf,
    bundledAsOf: FOUNDRY_MODEL_CATALOG_AS_OF,
    sourceUrl: liveSnapshot.sourceUrl,
    region,
    regionConfirmedCount: merged.length - bundledOnlyModels.length,
    bundledOnlyCount: bundledOnlyModels.length,
    bundledOnlyBySource,
  }
}

export function supportsTokenBilling(model: FoundryModelCatalogEntry) {
  return model.inferenceTasks.some((task) => pairedTokenTasks.has(task)) &&
    model.deploymentOptions.some((option) =>
      option === 'AOAI' ||
      option === 'Instant' ||
      option.includes('Serverless') ||
      option.includes('UnifiedEndpoint'),
    )
}

export function supportsManagedCompute(model: FoundryModelCatalogEntry) {
  return model.deploymentOptions.some((option) => managedComputeOptions.has(option))
}

export function availableBillingBases(model: FoundryModelCatalogEntry): ModelBillingBasis[] {
  const bases: ModelBillingBasis[] = []
  if (supportsTokenBilling(model)) bases.push('tokens')
  if (supportsManagedCompute(model)) bases.push('managed-compute')
  if (bases.length === 0 || model.inferenceTasks.some((task) => !pairedTokenTasks.has(task))) {
    bases.push('usage')
  }
  return [...new Set(bases)]
}

export function defaultBillingBasis(model: FoundryModelCatalogEntry): ModelBillingBasis {
  if (model.source === 'hugging-face' && supportsManagedCompute(model)) return 'managed-compute'
  if (supportsTokenBilling(model)) return 'tokens'
  if (supportsManagedCompute(model)) return 'managed-compute'
  return 'usage'
}

const deploymentPreference: Record<ModelSourceId, string[]> = {
  'direct-azure': ['AOAI', 'Serverless API', 'UnifiedEndpointMaaS', 'Instant', 'ServerlessMaaS', 'MaaP'],
  'foundry-labs': ['UnifiedEndpointMaaS', 'ServerlessMaaS', 'MaaP', 'Managed Compute'],
  'hugging-face': ['Managed Compute', 'MaaP'],
  fireworks: ['Serverless API', 'UnifiedEndpointMaaS', 'ServerlessMaaS'],
}

export function defaultDeploymentOption(model: FoundryModelCatalogEntry) {
  return deploymentPreference[model.source].find((option) => model.deploymentOptions.includes(option)) ??
    model.deploymentOptions[0] ??
    'Catalog only'
}

export function availableModelDeploymentSkus(model: FoundryModelCatalogEntry): ModelDeploymentSku[] {
  const skus: ModelDeploymentSku[] = []
  if (supportsTokenBilling(model)) {
    if (model.source === 'direct-azure') {
      skus.push(
        'global-standard',
        'data-zone-standard',
        'regional-standard',
        'global-batch',
        'data-zone-batch',
        'global-provisioned',
        'data-zone-provisioned',
        'regional-provisioned',
        'developer',
      )
    } else {
      skus.push('marketplace')
    }
  }
  if (supportsManagedCompute(model)) skus.push('managed-compute')
  if (skus.length === 0) skus.push('marketplace')
  return [...new Set(skus)]
}

export function defaultModelDeploymentSku(model: FoundryModelCatalogEntry): ModelDeploymentSku {
  if (model.source === 'hugging-face' && supportsManagedCompute(model)) return 'managed-compute'
  if (model.source === 'direct-azure' && supportsTokenBilling(model)) return 'global-standard'
  if (supportsTokenBilling(model)) return 'marketplace'
  if (supportsManagedCompute(model)) return 'managed-compute'
  return 'marketplace'
}

export function purchaseModeForDeploymentSku(sku: ModelDeploymentSku): PurchaseMode {
  if (sku === 'global-batch' || sku === 'data-zone-batch') return 'batch'
  if (sku.includes('provisioned')) return 'ptu'
  return 'payg'
}

export function billingBasisForDeploymentSku(sku: ModelDeploymentSku): ModelBillingBasis {
  return sku === 'managed-compute' ? 'managed-compute' : 'tokens'
}

const rateSlug = (model: FoundryModelCatalogEntry) =>
  `${model.source}.${model.name}.${model.version}`.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-')

export function modelRateKeys(
  model: FoundryModelCatalogEntry,
  deploymentSku: ModelDeploymentSku = defaultModelDeploymentSku(model),
) {
  const prefix = `model.catalog.${rateSlug(model)}.${deploymentSku}`
  const keys = {
    input: `${prefix}.input`,
    cachedInput: `${prefix}.cachedInput`,
    output: `${prefix}.output`,
    batchInput: `${prefix}.batchInput`,
    batchOutput: `${prefix}.batchOutput`,
    ptuHour: `${prefix}.ptuHour`,
  }
  if (model.id !== DEFAULT_FOUNDRY_MODEL_ID) return keys

  if (deploymentSku === 'global-standard') {
    keys.input = 'model.primary.input'
    keys.cachedInput = 'model.primary.cachedInput'
    keys.output = 'model.primary.output'
  } else if (deploymentSku === 'global-batch') {
    keys.batchInput = 'model.primary.batchInput'
    keys.batchOutput = 'model.primary.batchOutput'
  } else if (deploymentSku === 'global-provisioned') {
    keys.input = 'model.primary.input'
    keys.cachedInput = 'model.primary.cachedInput'
    keys.output = 'model.primary.output'
    keys.ptuHour = 'model.primary.ptuHour'
  }
  return keys
}

export function usageUnitFor(model: FoundryModelCatalogEntry) {
  const tasks = model.inferenceTasks.join(' ')
  if (/image|vision/.test(tasks)) return 'images'
  if (/audio|speech|transcri/.test(tasks)) return 'minutes'
  if (/embedding|rerank|classification/.test(tasks)) return 'million input tokens'
  if (/time-series|forecast/.test(tasks)) return 'series'
  if (/protein/.test(tasks)) return 'sequences'
  return 'operations'
}