import {
  DEFAULT_FOUNDRY_MODEL_ID,
  defaultDeploymentOption,
  defaultModelDeploymentSku,
  getFoundryModel,
  supportsManagedCompute,
  type FoundryModelCatalogEntry,
} from './foundryCatalog'
import { applyModelPriceSelection, updateActiveModelPriceProfile } from './modelPriceProfiles'
import { createPreset } from './presets'
import { REGION_LABELS, type CommercialModelConfig, type CostConfig, type ModelPortfolioStrategy, type Posture, type RegionId } from './types'

export type GuidedUseCase = 'employee-assistant' | 'customer-agent' | 'workflow-agent' | 'explore'
export type GuidedScale = 'small' | 'medium' | 'large'
export type GuidedHosting = 'pay-per-use' | 'dedicated'
export type GuidedAvailability = 'always' | 'business' | 'custom'
export type GuidedRequirement =
  | 'knowledge'
  | 'private-networking'
  | 'observability'
  | 'disaster-recovery'
  | 'content-safety'
  | 'api-management'

export type GuidedConsiderationField =
  | 'posture'
  | 'region'
  | 'monthly-users'
  | 'hosting'
  | 'availability'
  | 'custom-hours'
  | 'instances'
  | 'vm-rate'
  | 'model-strategy'
  | GuidedRequirement

export interface GuidedConsiderationSuggestion {
  field: GuidedConsiderationField
  label: string
  value: string | number | boolean
}

export interface GuidedEstimateAnswers {
  useCase: GuidedUseCase
  posture: Posture
  region: RegionId
  scale: GuidedScale
  hosting: GuidedHosting
  modelStrategy: ModelPortfolioStrategy
  instances: number
  availability: GuidedAvailability
  customHoursPerMonth: number
  vmHourlyRateCad: number | null
  requirements: GuidedRequirement[]
  monthlyUsersOverride: number | null
  considerations: string
}

export const DEFAULT_GUIDED_ANSWERS: GuidedEstimateAnswers = {
  useCase: 'employee-assistant',
  posture: 'poc',
  region: 'canadacentral',
  scale: 'small',
  hosting: 'pay-per-use',
  modelStrategy: 'single',
  instances: 1,
  availability: 'always',
  customHoursPerMonth: 100,
  vmHourlyRateCad: null,
  requirements: ['knowledge'],
  monthlyUsersOverride: null,
  considerations: '',
}

export const GUIDED_SCALE_USERS: Record<GuidedScale, number> = {
  small: 250,
  medium: 2_000,
  large: 10_000,
}

const DEDICATED_MODEL_ORDER = [
  'qwen--qwen3.6-27b',
  'qwen--qwen3.8-27b',
  'zai-org--glm-5.2-fp8',
]

const STRATEGY_MODELS = {
  'cost-optimized': 'gpt-5.4-nano',
  'quality-focused': 'gpt-5.4-mini',
  multimodal: 'Phi-4-multimodal-instruct',
} as const

const availabilityHours = (answers: GuidedEstimateAnswers) => {
  if (answers.availability === 'always') return 730
  if (answers.availability === 'business') return 176
  return Math.min(730, Math.max(0, answers.customHoursPerMonth))
}

const addSuggestion = (
  suggestions: Map<GuidedConsiderationField, GuidedConsiderationSuggestion>,
  suggestion: GuidedConsiderationSuggestion,
) => suggestions.set(suggestion.field, suggestion)

const requirementSuggestion = (
  text: string,
  field: GuidedRequirement,
  label: string,
  pattern: RegExp,
) => {
  const match = pattern.exec(text)
  if (!match) return null
  const context = text.slice(Math.max(0, match.index - 18), match.index + match[0].length)
  const excluded = /(?:\bno\b|\bwithout\b|\bexclude\b|\bdon't need\b|\bdo not need\b)/i.test(context)
  return {
    field,
    label: `${label}: ${excluded ? 'exclude' : 'include'}`,
    value: !excluded,
  } satisfies GuidedConsiderationSuggestion
}

export function interpretGuidedConsiderations(text: string): GuidedConsiderationSuggestion[] {
  const normalized = text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!normalized) return []
  const suggestions = new Map<GuidedConsiderationField, GuidedConsiderationSuggestion>()

  const users = /\b(\d+(?:\.\d+)?)\s*k\s*(?:monthly\s*)?(?:users?|employees?|customers?)\b/i.exec(normalized) ??
    /\b(\d{1,3}(?:,\d{3})+|\d+)\s*(?:monthly\s*)?(?:users?|employees?|customers?)\b/i.exec(normalized)
  if (users) {
    const value = users[0].toLocaleLowerCase().includes('k')
      ? Number(users[1]) * 1_000
      : Number(users[1]?.replaceAll(',', ''))
    if (Number.isFinite(value) && value > 0 && value <= 1_000_000) {
      addSuggestion(suggestions, { field: 'monthly-users', label: `${value.toLocaleString('en-CA')} monthly users`, value })
    }
  }

  const regions: Array<[RegionId, RegExp]> = [
    ['canadacentral', /\bcanada central\b/i],
    ['canadaeast', /\bcanada east\b/i],
    ['eastus2', /\beast us 2\b|\beastus2\b/i],
    ['eastus', /\beast us\b|\beastus\b/i],
  ]
  for (const [region, pattern] of regions) {
    if (pattern.test(normalized)) {
      addSuggestion(suggestions, { field: 'region', label: `Region: ${REGION_LABELS[region]}`, value: region })
      break
    }
  }

  if (/\bproduction\b|\bgo live\b|\bproduction-ready\b/i.test(normalized)) {
    addSuggestion(suggestions, { field: 'posture', label: 'Stage: Production', value: 'production' })
  } else if (/\bpilot\b|\bpoc\b|\bproof of concept\b/i.test(normalized)) {
    addSuggestion(suggestions, { field: 'posture', label: 'Stage: Pilot', value: 'poc' })
  }

  const dedicated = /\bdedicated\b|\bmanaged compute\b|\bgpu endpoint\b/i.test(normalized)
  const payPerUse = /\bpay[ -]?per[ -]?use\b|\bserverless\b|\btoken billing\b/i.test(normalized)
  if (dedicated !== payPerUse) {
    addSuggestion(suggestions, dedicated
      ? { field: 'hosting', label: 'Hosting: Dedicated endpoint', value: 'dedicated' }
      : { field: 'hosting', label: 'Hosting: Pay per use', value: 'pay-per-use' })
  }

  if (/\b24\s*[x/]\s*7\b|\balways[ -]?on\b/i.test(normalized)) {
    addSuggestion(suggestions, { field: 'availability', label: 'Availability: Always on', value: 'always' })
  } else if (/\bbusiness hours\b|\bworking hours\b/i.test(normalized)) {
    addSuggestion(suggestions, { field: 'availability', label: 'Availability: Business hours', value: 'business' })
  }
  const customHours = /\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s*(?:per|\/)\s*month\b/i.exec(normalized)
  if (customHours) {
    const value = Math.min(730, Math.max(0, Number(customHours[1])))
    addSuggestion(suggestions, { field: 'availability', label: 'Availability: Custom', value: 'custom' })
    addSuggestion(suggestions, { field: 'custom-hours', label: `${value} occupied hours / month`, value })
  }

  const instances = /\b(\d+)\s*(?:(?:gpu|compute)\s*)?(?:instances?|replicas?|nodes?)\b/i.exec(normalized)
  if (instances) {
    const value = Math.min(20, Math.max(1, Number(instances[1])))
    addSuggestion(suggestions, { field: 'instances', label: `${value} dedicated ${value === 1 ? 'instance' : 'instances'}`, value })
  }
  const vmRate = /(?:\bcad\s*|\$\s*)(\d+(?:\.\d+)?)\s*(?:\/|per\s*)(?:hour|hr)\b/i.exec(normalized)
  if (vmRate) {
    const value = Number(vmRate[1])
    if (Number.isFinite(value) && value >= 0) {
      addSuggestion(suggestions, { field: 'vm-rate', label: `VM rate: CAD ${value.toFixed(2)} / hour`, value })
    }
  }

  if (/\bmultimodal\b|\bvision\b|\bimage understanding\b|\baudio input\b/i.test(normalized)) {
    addSuggestion(suggestions, { field: 'model-strategy', label: 'Portfolio: Multimodal', value: 'multimodal' })
  } else if (/\bquality focused\b|\bquality-first\b|\breasoning\b|\bcomplex queries\b/i.test(normalized)) {
    addSuggestion(suggestions, { field: 'model-strategy', label: 'Portfolio: Quality focused', value: 'quality-focused' })
  } else if (/\bcost optimized\b|\bcost-optimized\b|\bcheap model\b|\bfast model\b|\bmodel router\b/i.test(normalized)) {
    addSuggestion(suggestions, { field: 'model-strategy', label: 'Portfolio: Cost optimized', value: 'cost-optimized' })
  } else if (/\bsingle model\b|\bone model\b/i.test(normalized)) {
    addSuggestion(suggestions, { field: 'model-strategy', label: 'Portfolio: Single model', value: 'single' })
  }

  const requirements: Array<[GuidedRequirement, string, RegExp]> = [
    ['knowledge', 'Company knowledge', /\bknowledge\b|\brag\b|\bsearch documents?\b|\bcompany documents?\b/i],
    ['private-networking', 'Private networking', /\bprivate network(?:ing)?\b|\bprivate endpoints?\b|\bvnet\b/i],
    ['observability', 'Production monitoring', /\bobservability\b|\bmonitoring\b|\bapplication insights\b|\blog analytics\b/i],
    ['disaster-recovery', 'Disaster recovery', /\bdisaster recovery\b|\bdr\b|\bmulti[ -]?region\b|\bfailover\b|\bsecondary region\b/i],
    ['content-safety', 'Content safety', /\bcontent safety\b|\bmoderation\b|\bharm filtering\b/i],
    ['api-management', 'API gateway', /\bapi management\b|\bapi gateway\b|\brate limiting\b/i],
  ]
  for (const [field, label, pattern] of requirements) {
    const suggestion = requirementSuggestion(normalized, field, label, pattern)
    if (suggestion) addSuggestion(suggestions, suggestion)
  }

  return [...suggestions.values()]
}

export function applyGuidedConsiderations(
  answers: GuidedEstimateAnswers,
  suggestions: readonly GuidedConsiderationSuggestion[],
): GuidedEstimateAnswers {
  const next = structuredClone(answers)
  for (const suggestion of suggestions) {
    if (suggestion.field === 'posture') next.posture = suggestion.value as Posture
    else if (suggestion.field === 'region') next.region = suggestion.value as RegionId
    else if (suggestion.field === 'monthly-users') next.monthlyUsersOverride = suggestion.value as number
    else if (suggestion.field === 'hosting') next.hosting = suggestion.value as GuidedHosting
    else if (suggestion.field === 'availability') next.availability = suggestion.value as GuidedAvailability
    else if (suggestion.field === 'custom-hours') next.customHoursPerMonth = suggestion.value as number
    else if (suggestion.field === 'instances') next.instances = suggestion.value as number
    else if (suggestion.field === 'vm-rate') next.vmHourlyRateCad = suggestion.value as number
    else if (suggestion.field === 'model-strategy') next.modelStrategy = suggestion.value as ModelPortfolioStrategy
    else {
      const requirement = suggestion.field as GuidedRequirement
      next.requirements = suggestion.value
        ? [...new Set([...next.requirements, requirement])]
        : next.requirements.filter((candidate) => candidate !== requirement)
    }
  }
  return next
}

const applyUseCaseWorkload = (config: CostConfig, useCase: GuidedUseCase) => {
  if (useCase === 'customer-agent') {
    config.workload.activeDaysPerMonth = 30
    config.workload.requestsPerUserPerDay = 10
    config.workload.agentTurnMultiplier = 3
  } else if (useCase === 'workflow-agent') {
    config.workload.activeDaysPerMonth = 22
    config.workload.requestsPerUserPerDay = 16
    config.workload.agentTurnMultiplier = 4
  } else if (useCase === 'explore') {
    config.workload.activeDaysPerMonth = 20
    config.workload.requestsPerUserPerDay = 5
    config.workload.agentTurnMultiplier = 2
  }
}

const recommendedDedicatedModel = (models: readonly FoundryModelCatalogEntry[]) =>
  [...models]
    .filter(supportsManagedCompute)
    .sort((left, right) => {
      const leftIndex = DEDICATED_MODEL_ORDER.indexOf(left.name)
      const rightIndex = DEDICATED_MODEL_ORDER.indexOf(right.name)
      const leftRank = leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex
      const rightRank = rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex
      return leftRank - rightRank || left.name.localeCompare(right.name)
    })[0]

const portfolioModel = (
  modelName: string,
  models: readonly FoundryModelCatalogEntry[],
  template: CommercialModelConfig,
) => {
  const catalogModel = models.find((model) => model.name === modelName)
  if (!catalogModel) return null
  const model = structuredClone(template)
  model.enabled = true
  model.deploymentOption = defaultDeploymentOption(catalogModel)
  applyModelPriceSelection(model, catalogModel, defaultModelDeploymentSku(catalogModel))
  return model
}

const applyModelStrategy = (
  config: CostConfig,
  strategy: ModelPortfolioStrategy,
  models: readonly FoundryModelCatalogEntry[],
) => {
  config.modelPortfolio = {
    strategy,
    deployments: [],
    routes: [{
      id: 'primary-route',
      label: 'Primary requests',
      role: 'primary',
      deploymentId: 'primary',
      mode: 'traffic-share',
      trafficPercent: 100,
    }],
  }
  if (strategy === 'single' || strategy === 'custom') return

  const modelName = STRATEGY_MODELS[strategy]
  const specialist = portfolioModel(modelName, models, createPreset('poc').commercialModel)
  if (!specialist) return
  const role = strategy === 'cost-optimized'
    ? 'fast'
    : strategy === 'quality-focused'
      ? 'reasoning'
      : 'multimodal'
  const deploymentId = `${role}-deployment`
  config.modelPortfolio.deployments.push({
    id: deploymentId,
    label: `${role.charAt(0).toLocaleUpperCase()}${role.slice(1)} deployment`,
    model: specialist,
  })
  if (strategy === 'cost-optimized') {
    config.modelPortfolio.routes[0]!.trafficPercent = 30
    config.modelPortfolio.routes.push({
      id: 'fast-route',
      label: 'Routine requests',
      role: 'fast',
      deploymentId,
      mode: 'traffic-share',
      trafficPercent: 70,
    })
  } else {
    config.modelPortfolio.routes.push({
      id: `${role}-route`,
      label: role === 'reasoning' ? 'Reasoning assist' : 'Multimodal assist',
      role,
      deploymentId,
      mode: 'additive',
      trafficPercent: role === 'reasoning' ? 15 : 10,
    })
  }
}

export function buildGuidedConfig(
  answers: GuidedEstimateAnswers,
  models: readonly FoundryModelCatalogEntry[],
  periodStart: string,
): CostConfig {
  const config = createPreset(answers.posture)
  config.periodStart = periodStart
  config.region = answers.region
  config.workload.monthlyUsers = answers.monthlyUsersOverride ?? GUIDED_SCALE_USERS[answers.scale]
  applyUseCaseWorkload(config, answers.useCase)

  if (answers.hosting === 'dedicated') {
    const model = recommendedDedicatedModel(models)
    if (model) {
      config.commercialModel.deploymentOption = 'Managed Compute'
      applyModelPriceSelection(config.commercialModel, model, 'managed-compute')
    }
    config.commercialModel.managedCompute.instances = Math.max(1, answers.instances)
    config.commercialModel.managedCompute.hoursPerMonth = availabilityHours(answers)
    updateActiveModelPriceProfile(config.commercialModel, {
      managedComputeHourlyRateCad: answers.vmHourlyRateCad,
      source: answers.vmHourlyRateCad === null ? '' : 'Guided estimate VM rate',
      asOf: answers.vmHourlyRateCad === null ? '' : new Date().toISOString().slice(0, 10),
    })
  } else {
    const model = getFoundryModel(DEFAULT_FOUNDRY_MODEL_ID, models)
    if (model) {
      config.commercialModel.deploymentOption = 'AOAI'
      applyModelPriceSelection(config.commercialModel, model, 'global-standard')
    }
  }
  applyModelStrategy(config, answers.modelStrategy, models)

  const requirements = new Set(answers.requirements)
  config.platform.knowledgeSearch.enabled = requirements.has('knowledge')
  config.platform.standardAgentSetup.enabled = requirements.has('knowledge')
  config.platform.privateEndpoints.enabled = requirements.has('private-networking')
  config.networking.privateLinkData.enabled = requirements.has('private-networking')
  config.observability.enabled = requirements.has('observability')
  config.disasterRecovery.enabled = requirements.has('disaster-recovery')
  config.guardrail.contentSafety.enabled = requirements.has('content-safety')
  config.platform.apiManagement.enabled = requirements.has('api-management')
  if (config.disasterRecovery.enabled) {
    config.disasterRecovery.secondarySearchUnits = config.platform.knowledgeSearch.enabled
      ? config.platform.knowledgeSearch.units
      : 0
    config.disasterRecovery.secondaryCosmosRuPerSecond = config.platform.standardAgentSetup.enabled
      ? config.platform.standardAgentSetup.cosmos.provisionedRuPerSecond
      : 0
    config.disasterRecovery.secondaryBlobStorageGb = config.platform.standardAgentSetup.enabled
      ? config.platform.standardAgentSetup.blobStorage.storedGb
      : 0
    config.disasterRecovery.secondaryPrivateEndpoints = config.platform.privateEndpoints.enabled
      ? config.platform.privateEndpoints.endpoints
      : 0
  }

  return config
}
