export const COST_TIERS = ['run', 'guardrail', 'platform', 'change'] as const

export type CostTier = (typeof COST_TIERS)[number]
export const REGION_LABELS = {
  canadacentral: 'Canada Central',
  canadaeast: 'Canada East',
  eastus: 'East US',
  eastus2: 'East US 2',
} as const
export type RegionId = keyof typeof REGION_LABELS
export const REGION_IDS = Object.keys(REGION_LABELS) as RegionId[]
export function isRegionId(value: string): value is RegionId {
  return REGION_IDS.includes(value as RegionId)
}
export type RateMaintenance = 'synced' | 'manual'
export type PurchaseMode = 'payg' | 'ptu' | 'batch'
export type ModelDeploymentSku =
  | 'global-standard'
  | 'data-zone-standard'
  | 'regional-standard'
  | 'global-batch'
  | 'data-zone-batch'
  | 'global-provisioned'
  | 'data-zone-provisioned'
  | 'regional-provisioned'
  | 'developer'
  | 'marketplace'
  | 'managed-compute'
export type Posture = 'poc' | 'production'
export type CosmosBillingMode = 'provisioned' | 'serverless'
export type ModelSourceId = 'direct-azure' | 'foundry-labs' | 'hugging-face' | 'fireworks'
export type ModelBillingBasis = 'tokens' | 'managed-compute' | 'usage'
export type ModelPortfolioStrategy = 'single' | 'cost-optimized' | 'quality-focused' | 'multimodal' | 'custom'
export type ModelRouteRole = 'primary' | 'fast' | 'reasoning' | 'multimodal'
export type ModelRouteMode = 'traffic-share' | 'additive'
export type ToolBillingScope = 'global' | 'regional'
export type AgenticReasoningEffort = 'minimum' | 'low'

export interface ModelPriceProfile {
  modelId: string
  deploymentSku: ModelDeploymentSku
  source: string
  asOf: string
  inputRateCadPerMillion: number | null
  cachedInputRateCadPerMillion: number | null
  outputRateCadPerMillion: number | null
  batchInputRateCadPerMillion: number | null
  batchOutputRateCadPerMillion: number | null
  ptuHourlyRateCad: number | null
  managedComputeHourlyRateCad: number | null
  usageUnitRateCad: number | null
}

export interface CommercialModelConfig {
  enabled: boolean
  modelId: string
  deploymentOption: string
  deploymentSku: ModelDeploymentSku
  billingBasis: ModelBillingBasis
  purchaseMode: PurchaseMode
  inputRateKey: string
  cachedInputRateKey: string
  outputRateKey: string
  batchInputRateKey: string
  batchOutputRateKey: string
  ptuHourlyRateKey: string
  ptuUnits: number
  ptuCapacityTokensPerUnitMonth: number | null
  customInputRateCadPerMillion: number | null
  customCachedInputRateCadPerMillion: number | null
  customOutputRateCadPerMillion: number | null
  customBatchInputRateCadPerMillion: number | null
  customBatchOutputRateCadPerMillion: number | null
  customPtuHourlyRateCad: number | null
  managedCompute: {
    instanceHourlyRateCad: number | null
    instances: number
    hoursPerMonth: number
  }
  usage: {
    monthlyQuantity: number
    quantityUnit: string
    unitRateCad: number | null
  }
  cachedInputPercent: number
  priceProfiles: ModelPriceProfile[]
}

export interface ModelPortfolioDeployment {
  id: string
  label: string
  model: CommercialModelConfig
}

export interface ModelPortfolioRoute {
  id: string
  label: string
  role: ModelRouteRole
  deploymentId: string
  mode: ModelRouteMode
  trafficPercent: number
}

export interface ModelPortfolioConfig {
  strategy: ModelPortfolioStrategy
  deployments: ModelPortfolioDeployment[]
  routes: ModelPortfolioRoute[]
}

export const HOSTED_AGENT_SANDBOXES = {
  '0.5vcpu-1gb': { label: '0.5 vCPU / 1 GiB', vcpu: 0.5, memoryGiB: 1 },
  '1vcpu-2gb': { label: '1 vCPU / 2 GiB', vcpu: 1, memoryGiB: 2 },
  '2vcpu-4gb': { label: '2 vCPU / 4 GiB', vcpu: 2, memoryGiB: 4 },
} as const

export type HostedAgentSandboxSize = keyof typeof HOSTED_AGENT_SANDBOXES

export interface Rate {
  value: number | null
  unit: string
  currency: 'CAD'
  source: string
  sourceUrl: string
  asOf: string
  maintenance: RateMaintenance
  lastReviewed?: string
  unavailableReason?: string
  tierMinimumUnits?: number
}

export interface RateCard {
  asOf: string
  generatedAt?: string
  region: RegionId
  syncStatus: 'ok' | 'partial' | 'failed'
  unmatchedKeys: string[]
  rates: Record<string, Rate>
}

export interface HarnessConfig {
  id: string
  label: string
  enabled: boolean
  share: number
  inputOverheadPercent: number
  outputOverheadPercent: number
}

export interface FoundryServiceConfig {
  id: string
  enabled: boolean
  monthlyQuantity: number
  customUnitRateCad: number | null
}

export interface CostConfig {
  posture: Posture
  region: RegionId
  periodStart: string
  environments: number
  nonProductionRatio: number
  secondaryRegionRatio: number
  commercialOffsetPercent: number
  workload: {
    monthlyUsers: number
    activeDaysPerMonth: number
    requestsPerUserPerDay: number
    agentTurnMultiplier: number
    inputTokensPerTurn: number
    outputTokensPerTurn: number
    mcpSchemaTokensPerTurn: number
  }
  commercialModel: CommercialModelConfig
  modelPortfolio: ModelPortfolioConfig
  hostedAgent: {
    enabled: boolean
    sandboxSize: HostedAgentSandboxSize
    sessionsPerMonth: number
    activeMinutesPerSession: number
    vcpuRateKey: string
    memoryRateKey: string
  }
  agentTools: {
    codeInterpreter: {
      enabled: boolean
      scope: ToolBillingScope
      sessionsPerMonth: number
    }
    fileSearch: {
      enabled: boolean
      scope: ToolBillingScope
      averageStorageGb: number
      activeDaysPerMonth: number
    }
    skillsExecution: {
      enabled: boolean
      hoursPerMonth: number
    }
    webSearch: {
      enabled: boolean
      searchesPerMonth: number
      customRateCadPerThousand: number | null
    }
  }
  rag: {
    semanticRanker: { enabled: boolean; queriesPerMonth: number }
    agenticRetrieval: {
      enabled: boolean
      reasoningEffort: AgenticReasoningEffort
      reasoningTokensPerMonth: number
      plannerInputTokensPerMonth: number
      plannerOutputTokensPerMonth: number
    }
    imageExtraction: { enabled: boolean; imagesPerMonth: number }
    customEntity: { enabled: boolean; textRecordsPerMonth: number }
    embeddings: {
      enabled: boolean
      inputTokensPerMonth: number
      customRateCadPerMillion: number | null
    }
  }
  foundryServices: {
    selections: FoundryServiceConfig[]
  }
  ossModel: {
    enabled: boolean
    gpuHourlyRateKey: string
    instances: number
    hoursPerDay: number
    utilizationPercent: number
  }
  harnesses: HarnessConfig[]
  guardrail: {
    contentSafety: { enabled: boolean; rateKey: string; monthlyTextRecords: number }
    defenderForAi: { enabled: boolean; rateKey: string }
    sentinel: { enabled: boolean; rateKey: string; ingestedGbPerMonth: number }
    entra: { enabled: boolean; rateKey: string }
    purview: { enabled: boolean; rateKey: string; capacityUnits: number }
  }
  platform: {
    apiManagement: { enabled: boolean; rateKey: string; units: number }
    privateEndpoints: { enabled: boolean; rateKey: string; endpoints: number }
    networkEgress: { enabled: boolean; rateKey: string; gbPerMonth: number }
    knowledgeSearch: { enabled: boolean; rateKey: string; units: number }
    standardAgentSetup: {
      enabled: boolean
      cosmos: {
        enabled: boolean
        billingMode: CosmosBillingMode
        provisionedRuPerSecond: number
        serverlessRequestUnitsPerMonth: number
        storageGb: number
        provisionedThroughputRateKey: string
        serverlessRequestRateKey: string
        storageRateKey: string
      }
      blobStorage: {
        enabled: boolean
        storedGb: number
        writeOperationsPerMonth: number
        readOperationsPerMonth: number
        otherOperationsPerMonth: number
        capacityRateKey: string
        writeRateKey: string
        readRateKey: string
        otherOperationsRateKey: string
      }
    }
    appCompute: { enabled: boolean; rateKey: string; instances: number }
  }
  observability: {
    enabled: boolean
    analyticsIngestionGbPerMonth: number
    billableRetentionGbMonth: number
    archiveGbMonth: number
    dataExportGbPerMonth: number
    logAlerts15Minute: number
  }
  networking: {
    privateLinkData: { enabled: boolean; ingressGbPerMonth: number; egressGbPerMonth: number }
    natGateway: { enabled: boolean; gateways: number; processedGbPerMonth: number }
    firewallBasic: { enabled: boolean; deployments: number; processedGbPerMonth: number }
  }
  disasterRecovery: {
    enabled: boolean
    secondaryPtuUnits: number
    secondaryApiManagementUnits: number
    secondarySearchUnits: number
    secondaryCosmosRuPerSecond: number
    secondaryBlobStorageGb: number
    secondaryPrivateEndpoints: number
    secondaryAppInstances: number
    customAppComputeHourlyRateCad: number | null
    interRegionTransferGbPerMonth: number
    customInterRegionRateCadPerGb: number | null
  }
  change: {
    evaluation: { enabled: boolean; rateKey: string; runsPerMonth: number }
    revalidation: { enabled: boolean; rateKey: string; hoursPerMonth: number }
    finOps: { enabled: boolean; rateKey: string; hoursPerMonth: number }
    support: { enabled: boolean; rateKey: string; plans: number }
  }
}

export interface LineProvenance {
  source: string
  sourceUrl: string
  asOf: string
  maintenance: RateMaintenance
  lastReviewed?: string
  unavailableReason?: string
}

export interface CostLine {
  id: string
  blockId: string
  label: string
  detail: string
  tier: CostTier
  amount: number | null
  quantity: number
  quantityUnit: string
  unitRate: number | null
  rateUnit: string
  rateKey?: string
  formula: string
  assumption: string
  scale: number
  provenance: LineProvenance
}

export interface TierTotal {
  tier: CostTier
  knownSubtotal: number
  unpricedLineCount: number
}

export interface ProjectionPoint {
  day: number
  cumulative: number
}

export interface CostResult {
  lines: CostLine[]
  tiers: Record<CostTier, TierTotal>
  knownGrandTotal: number
  complete: boolean
  missingRateKeys: string[]
  dailyBurn: number
  projection: ProjectionPoint[]
  metrics: {
    monthlyTurns: number
    primaryInputTokens: number
    primaryOutputTokens: number
    mcpSchemaTokens: number
    fixedEnvironmentScale: number
    resilienceScale: number
  }
  breakeven: {
    tokensPerMonth: number | null
    capacityTokensPerMonth: number | null
    feasibleWithinCapacity: boolean | null
  }
}