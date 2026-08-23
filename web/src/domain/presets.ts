import type { CostConfig, Posture } from './types'
import { DEFAULT_FOUNDRY_MODEL_ID } from './foundryCatalog'
import { createFoundryServiceSelections } from './foundryServices'

const commonConfig: Omit<CostConfig, 'posture'> = {
  region: 'canadacentral',
  periodStart: '2026-08-01',
  environments: 1,
  nonProductionRatio: 0.35,
  secondaryRegionRatio: 0,
  commercialOffsetPercent: 0,
  workload: {
    monthlyUsers: 250,
    activeDaysPerMonth: 22,
    requestsPerUserPerDay: 8,
    agentTurnMultiplier: 2,
    inputTokensPerTurn: 1800,
    outputTokensPerTurn: 600,
    mcpSchemaTokensPerTurn: 450,
  },
  commercialModel: {
    enabled: true,
    modelId: DEFAULT_FOUNDRY_MODEL_ID,
    deploymentOption: 'AOAI',
    deploymentSku: 'global-standard',
    billingBasis: 'tokens',
    purchaseMode: 'payg',
    inputRateKey: 'model.primary.input',
    cachedInputRateKey: 'model.primary.cachedInput',
    outputRateKey: 'model.primary.output',
    batchInputRateKey: 'model.primary.batchInput',
    batchOutputRateKey: 'model.primary.batchOutput',
    ptuHourlyRateKey: 'model.primary.ptuHour',
    ptuUnits: 10,
    ptuCapacityTokensPerUnitMonth: null,
    customInputRateCadPerMillion: null,
    customCachedInputRateCadPerMillion: null,
    customOutputRateCadPerMillion: null,
    customBatchInputRateCadPerMillion: null,
    customBatchOutputRateCadPerMillion: null,
    customPtuHourlyRateCad: null,
    managedCompute: {
      instanceHourlyRateCad: null,
      instances: 1,
      hoursPerMonth: 730,
    },
    usage: {
      monthlyQuantity: 1_000,
      quantityUnit: 'operations',
      unitRateCad: null,
    },
    cachedInputPercent: 0,
    priceProfiles: [],
  },
  hostedAgent: {
    enabled: false,
    sandboxSize: '1vcpu-2gb',
    sessionsPerMonth: 1_000,
    activeMinutesPerSession: 15,
    vcpuRateKey: 'agent.hosted.vcpuHour',
    memoryRateKey: 'agent.hosted.memoryGiBHour',
  },
  agentTools: {
    codeInterpreter: { enabled: false, scope: 'global', sessionsPerMonth: 1_000 },
    fileSearch: { enabled: false, scope: 'global', averageStorageGb: 10, activeDaysPerMonth: 30 },
    skillsExecution: { enabled: false, hoursPerMonth: 100 },
    webSearch: { enabled: false, searchesPerMonth: 10_000, customRateCadPerThousand: null },
  },
  rag: {
    semanticRanker: { enabled: false, queriesPerMonth: 100_000 },
    agenticRetrieval: {
      enabled: false,
      reasoningEffort: 'low',
      reasoningTokensPerMonth: 10_000_000,
      plannerInputTokensPerMonth: 5_000_000,
      plannerOutputTokensPerMonth: 1_000_000,
    },
    imageExtraction: { enabled: false, imagesPerMonth: 10_000 },
    customEntity: { enabled: false, textRecordsPerMonth: 100_000 },
    embeddings: { enabled: false, inputTokensPerMonth: 100_000_000, customRateCadPerMillion: null },
  },
  foundryServices: {
    selections: createFoundryServiceSelections(),
  },
  ossModel: {
    enabled: false,
    gpuHourlyRateKey: 'compute.oss.gpuHour',
    instances: 1,
    hoursPerDay: 8,
    utilizationPercent: 65,
  },
  harnesses: [
    {
      id: 'foundry-agent-service',
      label: 'Foundry Agent Service',
      enabled: true,
      share: 0.7,
      inputOverheadPercent: 12,
      outputOverheadPercent: 4,
    },
    {
      id: 'semantic-kernel',
      label: 'Semantic Kernel',
      enabled: true,
      share: 0.3,
      inputOverheadPercent: 5,
      outputOverheadPercent: 2,
    },
  ],
  guardrail: {
    contentSafety: {
      enabled: false,
      rateKey: 'guardrail.contentSafety.text1k',
      monthlyTextRecords: 88_000,
    },
    defenderForAi: { enabled: false, rateKey: 'guardrail.defender.transaction1k' },
    sentinel: { enabled: false, rateKey: 'guardrail.sentinel.gb' , ingestedGbPerMonth: 25 },
    entra: { enabled: false, rateKey: 'guardrail.entra.userMonth' },
    purview: { enabled: false, rateKey: 'guardrail.purview.capacityHour', capacityUnits: 1 },
  },
  platform: {
    apiManagement: { enabled: false, rateKey: 'platform.apim.unitHour', units: 1 },
    privateEndpoints: { enabled: false, rateKey: 'platform.privateEndpoint.endpointHour', endpoints: 3 },
    networkEgress: { enabled: true, rateKey: 'platform.network.mgn.out', gbPerMonth: 100 },
    knowledgeSearch: { enabled: true, rateKey: 'platform.search.unitHour', units: 1 },
    standardAgentSetup: {
      enabled: true,
      cosmos: {
        enabled: true,
        billingMode: 'provisioned',
        provisionedRuPerSecond: 3_000,
        serverlessRequestUnitsPerMonth: 10_000_000,
        storageGb: 10,
        provisionedThroughputRateKey: 'platform.cosmos.provisioned100RuHour',
        serverlessRequestRateKey: 'platform.cosmos.serverlessMillionRu',
        storageRateKey: 'platform.cosmos.storageGbMonth',
      },
      blobStorage: {
        enabled: true,
        storedGb: 10,
        writeOperationsPerMonth: 100_000,
        readOperationsPerMonth: 500_000,
        otherOperationsPerMonth: 100_000,
        capacityRateKey: 'platform.agentStorage.hotZrsGbMonth',
        writeRateKey: 'platform.agentStorage.hotZrsWrite10k',
        readRateKey: 'platform.agentStorage.hotZrsRead10k',
        otherOperationsRateKey: 'platform.agentStorage.hotZrsOther10k',
      },
    },
    appCompute: { enabled: false, rateKey: 'platform.compute.instanceHour', instances: 1 },
  },
  observability: {
    enabled: false,
    analyticsIngestionGbPerMonth: 50,
    billableRetentionGbMonth: 0,
    archiveGbMonth: 0,
    dataExportGbPerMonth: 0,
    logAlerts15Minute: 2,
  },
  networking: {
    privateLinkData: { enabled: false, ingressGbPerMonth: 100, egressGbPerMonth: 100 },
    natGateway: { enabled: false, gateways: 1, processedGbPerMonth: 100 },
    firewallBasic: { enabled: false, deployments: 1, processedGbPerMonth: 100 },
  },
  disasterRecovery: {
    enabled: false,
    secondaryPtuUnits: 0,
    secondaryApiManagementUnits: 0,
    secondarySearchUnits: 0,
    secondaryCosmosRuPerSecond: 0,
    secondaryBlobStorageGb: 0,
    secondaryPrivateEndpoints: 0,
    secondaryAppInstances: 0,
    customAppComputeHourlyRateCad: null,
    interRegionTransferGbPerMonth: 0,
    customInterRegionRateCadPerGb: null,
  },
  change: {
    evaluation: { enabled: false, rateKey: 'change.evaluation.run1k', runsPerMonth: 2_000 },
    revalidation: { enabled: false, rateKey: 'change.revalidation.hour', hoursPerMonth: 8 },
    finOps: { enabled: false, rateKey: 'change.finops.hour', hoursPerMonth: 4 },
    support: { enabled: false, rateKey: 'change.support.month', plans: 1 },
  },
}

const clone = <T>(value: T): T => structuredClone(value)

export function createPreset(posture: Posture): CostConfig {
  const config: CostConfig = { ...clone(commonConfig), posture }

  if (posture === 'production') {
    config.environments = 3
    config.secondaryRegionRatio = 0
    config.workload.monthlyUsers = 4_000
    config.workload.requestsPerUserPerDay = 14
    config.workload.agentTurnMultiplier = 5
    config.commercialModel.purchaseMode = 'ptu'
    config.commercialModel.deploymentSku = 'global-provisioned'
    config.commercialModel.ptuUnits = 60
    config.hostedAgent.sessionsPerMonth = 100_000
    config.guardrail.defenderForAi.enabled = true
    config.guardrail.sentinel.enabled = true
    config.guardrail.sentinel.ingestedGbPerMonth = 25_000
    config.guardrail.contentSafety.monthlyTextRecords = 6_160_000
    config.guardrail.purview.enabled = true
    config.platform.apiManagement.enabled = true
    config.platform.privateEndpoints.enabled = true
    config.platform.privateEndpoints.endpoints = 8
    config.platform.networkEgress.gbPerMonth = 2_000
    config.platform.knowledgeSearch.units = 3
    config.platform.standardAgentSetup.cosmos.storageGb = 100
    config.platform.standardAgentSetup.blobStorage.storedGb = 250
    config.platform.standardAgentSetup.blobStorage.writeOperationsPerMonth = 5_000_000
    config.platform.standardAgentSetup.blobStorage.readOperationsPerMonth = 20_000_000
    config.platform.standardAgentSetup.blobStorage.otherOperationsPerMonth = 5_000_000
    config.platform.appCompute.instances = 4
    config.change.evaluation.runsPerMonth = 40_000
    config.change.revalidation.enabled = true
    config.change.finOps.enabled = true
    config.change.support.enabled = true
    config.observability.enabled = true
    config.observability.analyticsIngestionGbPerMonth = 250
    config.networking.privateLinkData.enabled = true
    config.networking.natGateway.enabled = true
    config.disasterRecovery.enabled = true
    config.disasterRecovery.secondaryPtuUnits = 60
    config.disasterRecovery.secondaryApiManagementUnits = 1
    config.disasterRecovery.secondarySearchUnits = 3
    config.disasterRecovery.secondaryCosmosRuPerSecond = 3_000
    config.disasterRecovery.secondaryBlobStorageGb = 250
    config.disasterRecovery.secondaryPrivateEndpoints = 8
    config.disasterRecovery.interRegionTransferGbPerMonth = 2_000
  }

  return config
}