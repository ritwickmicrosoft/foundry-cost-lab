import {
  availableBillingBases,
  billingBasisForDeploymentSku,
  modelRateKeys,
  purchaseModeForDeploymentSku,
  usageUnitFor,
  type FoundryModelCatalogEntry,
} from './foundryCatalog'
import type { CostConfig, ModelDeploymentSku, ModelPriceProfile } from './types'

type CommercialModelConfig = CostConfig['commercialModel']

export function findModelPriceProfile(
  config: CommercialModelConfig,
  modelId = config.modelId,
  deploymentSku = config.deploymentSku,
) {
  return config.priceProfiles.find(
    (profile) => profile.modelId === modelId && profile.deploymentSku === deploymentSku,
  )
}

function applyProfileRates(
  config: CommercialModelConfig,
  profile: ModelPriceProfile | undefined,
) {
  config.customInputRateCadPerMillion = profile?.inputRateCadPerMillion ?? null
  config.customCachedInputRateCadPerMillion = profile?.cachedInputRateCadPerMillion ?? null
  config.customOutputRateCadPerMillion = profile?.outputRateCadPerMillion ?? null
  config.customBatchInputRateCadPerMillion = profile?.batchInputRateCadPerMillion ?? null
  config.customBatchOutputRateCadPerMillion = profile?.batchOutputRateCadPerMillion ?? null
  config.customPtuHourlyRateCad = profile?.ptuHourlyRateCad ?? null
  config.managedCompute.instanceHourlyRateCad = profile?.managedComputeHourlyRateCad ?? null
  config.usage.unitRateCad = profile?.usageUnitRateCad ?? null
}

export function applyModelPriceSelection(
  config: CommercialModelConfig,
  model: FoundryModelCatalogEntry,
  deploymentSku: ModelDeploymentSku,
) {
  const keys = modelRateKeys(model, deploymentSku)
  const billingBases = availableBillingBases(model)
  const preferredBasis = billingBasisForDeploymentSku(deploymentSku)

  config.modelId = model.id
  config.deploymentSku = deploymentSku
  config.billingBasis = billingBases.includes(preferredBasis)
    ? preferredBasis
    : (billingBases[0] ?? 'usage')
  config.purchaseMode = config.billingBasis === 'tokens'
    ? purchaseModeForDeploymentSku(deploymentSku)
    : 'payg'
  config.inputRateKey = keys.input
  config.cachedInputRateKey = keys.cachedInput
  config.outputRateKey = keys.output
  config.batchInputRateKey = keys.batchInput
  config.batchOutputRateKey = keys.batchOutput
  config.ptuHourlyRateKey = keys.ptuHour
  config.usage.quantityUnit = usageUnitFor(model)
  applyProfileRates(config, findModelPriceProfile(config, model.id, deploymentSku))
}

function profileFromConfig(config: CommercialModelConfig): ModelPriceProfile {
  return {
    modelId: config.modelId,
    deploymentSku: config.deploymentSku,
    source: '',
    asOf: '',
    inputRateCadPerMillion: config.customInputRateCadPerMillion,
    cachedInputRateCadPerMillion: config.customCachedInputRateCadPerMillion,
    outputRateCadPerMillion: config.customOutputRateCadPerMillion,
    batchInputRateCadPerMillion: config.customBatchInputRateCadPerMillion,
    batchOutputRateCadPerMillion: config.customBatchOutputRateCadPerMillion,
    ptuHourlyRateCad: config.customPtuHourlyRateCad,
    managedComputeHourlyRateCad: config.managedCompute.instanceHourlyRateCad,
    usageUnitRateCad: config.usage.unitRateCad,
  }
}

export function updateActiveModelPriceProfile(
  config: CommercialModelConfig,
  change: Partial<Omit<ModelPriceProfile, 'modelId' | 'deploymentSku'>>,
) {
  const index = config.priceProfiles.findIndex(
    (profile) => profile.modelId === config.modelId && profile.deploymentSku === config.deploymentSku,
  )
  const profile = {
    ...profileFromConfig(config),
    ...(index >= 0 ? config.priceProfiles[index] : {}),
    ...change,
  }

  if (index >= 0) config.priceProfiles[index] = profile
  else config.priceProfiles.push(profile)
  applyProfileRates(config, profile)
  return profile
}