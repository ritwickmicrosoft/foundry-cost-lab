import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { createPreset } from './presets'
import { computeCost } from './computeCost'
import { FOUNDRY_MODEL_CATALOG, defaultDeploymentOption, modelRateKeys } from './foundryCatalog'
import { applyModelPriceSelection, updateActiveModelPriceProfile } from './modelPriceProfiles'
import { fallbackRateCard } from './rates'
import { COST_TIERS, type CostConfig, type Rate, type RateCard } from './types'

const rate = (value: number | null, unit = 'CAD/unit', tierMinimumUnits?: number): Rate => ({
  value,
  unit,
  currency: 'CAD',
  source: 'Test fixture meter',
  sourceUrl: 'https://example.test/rates',
  asOf: '2026-08-20',
  maintenance: 'synced',
  ...(tierMinimumUnits !== undefined ? { tierMinimumUnits } : {}),
})

const fixtureRateCard = (): RateCard => ({
  asOf: '2026-08-20',
  region: 'canadacentral',
  syncStatus: 'ok',
  unmatchedKeys: [],
  rates: {
    'model.primary.input': rate(5, 'CAD/million tokens'),
    'model.primary.cachedInput': rate(2, 'CAD/million tokens'),
    'model.primary.output': rate(15, 'CAD/million tokens'),
    'model.primary.batchInput': rate(2.5, 'CAD/million tokens'),
    'model.primary.batchOutput': rate(7.5, 'CAD/million tokens'),
    'model.primary.ptuHour': rate(2, 'CAD/PTU-hour'),
    'agent.hosted.vcpuHour': rate(2, 'CAD/vCPU-hour'),
    'agent.hosted.memoryGiBHour': rate(0.5, 'CAD/GiB-hour'),
    'agent.tool.codeInterpreter.global.session': rate(0.04, 'CAD/session'),
    'agent.tool.fileSearch.global.gbDay': rate(0.14, 'CAD/GB-day'),
    'agent.skills.execution.hour': rate(0.05, 'CAD/hour'),
    'compute.oss.gpuHour': rate(4, 'CAD/GPU-hour'),
    'guardrail.contentSafety.text1k': rate(0.5284, 'CAD/thousand text records'),
    'guardrail.defender.transaction1k': rate(2, 'CAD/thousand transactions'),
    'guardrail.sentinel.gb': rate(3, 'CAD/GB'),
    'guardrail.entra.userMonth': rate(0.1, 'CAD/user-month'),
    'guardrail.purview.capacityHour': rate(0.5, 'CAD/capacity-hour'),
    'platform.apim.unitHour': rate(0.2, 'CAD/unit-hour'),
    'platform.privateEndpoint.endpointHour': rate(0.01, 'CAD/endpoint-hour'),
    'platform.privateEndpoint.ingressGb': rate(0.01, 'CAD/GB'),
    'platform.privateEndpoint.egressGb': rate(0.01, 'CAD/GB'),
    'platform.natGateway.gatewayHour': rate(0.06, 'CAD/hour'),
    'platform.natGateway.dataGb': rate(0.06, 'CAD/GB'),
    'platform.firewall.basic.hour': rate(0.55, 'CAD/hour'),
    'platform.firewall.basic.dataGb': rate(0.09, 'CAD/GB'),
    'platform.dr.interRegionTransferGb': rate(0.05, 'CAD/GB'),
    'platform.observability.analyticsIngestionGb': rate(3.8, 'CAD/GB'),
    'platform.observability.analyticsRetentionGbMonth': rate(0.16, 'CAD/GB-month'),
    'platform.observability.archiveGbMonth': rate(0.03, 'CAD/GB-month'),
    'platform.observability.exportGb': rate(0.16, 'CAD/GB'),
    'platform.observability.logAlert15MinMonth': rate(0.7, 'CAD/alert-month'),
    'platform.network.mgn.out.tier0': rate(0, 'CAD/GB', 0),
    'platform.network.mgn.out.tier1': rate(0.1226, 'CAD/GB', 100),
    'platform.network.mgn.out.tier2': rate(0.117, 'CAD/GB', 10_335),
    'platform.network.mgn.out.tier3': rate(0.0986, 'CAD/GB', 51_295),
    'platform.network.mgn.out.tier4': rate(0.0705, 'CAD/GB', 153_695),
    'platform.network.mgn.out.tier5': rate(0.0705, 'CAD/GB', 512_095),
    'platform.search.unitHour': rate(0.3, 'CAD/unit-hour'),
    'rag.search.semanticRanker.queries1k': rate(1.4, 'CAD/thousand queries'),
    'rag.search.agentic.low.tokens1k': rate(0.001, 'CAD/thousand tokens'),
    'rag.search.imageExtraction.images1k': rate(1.4, 'CAD/thousand images'),
    'rag.search.customEntity.records1k': rate(0.35, 'CAD/thousand text records'),
    'platform.cosmos.provisioned100RuHour': rate(0.0124, 'CAD/100 RU/s-hour'),
    'platform.cosmos.serverlessMillionRu': rate(0.3875, 'CAD/million request units'),
    'platform.cosmos.storageGbMonth': rate(0.3875, 'CAD/GB-month'),
    'platform.agentStorage.hotZrsGbMonth': rate(0.0352, 'CAD/GB-month'),
    'platform.agentStorage.hotZrsWrite10k': rate(0.0969, 'CAD/10K operations'),
    'platform.agentStorage.hotZrsRead10k': rate(0.0062, 'CAD/10K operations'),
    'platform.agentStorage.hotZrsOther10k': rate(0.0062, 'CAD/10K operations'),
    'platform.agentStorage.hotLrsGbMonth': rate(0.0282, 'CAD/GB-month'),
    'platform.agentStorage.hotLrsWrite10k': rate(0.0775, 'CAD/10K operations'),
    'platform.agentStorage.hotLrsRead10k': rate(0.0062, 'CAD/10K operations'),
    'platform.agentStorage.hotLrsOther10k': rate(0.0062, 'CAD/10K operations'),
    'platform.compute.instanceHour': rate(0.2, 'CAD/instance-hour'),
    'change.evaluation.run1k': rate(8, 'CAD/thousand runs'),
    'change.revalidation.hour': rate(150, 'CAD/hour'),
    'change.finops.hour': rate(125, 'CAD/hour'),
    'change.support.month': rate(1_000, 'CAD/plan-month'),
  },
})

const config = (): CostConfig => {
  const value = createPreset('production')
  value.commercialModel.ptuCapacityTokensPerUnitMonth = 12_000_000
  return value
}

describe('computeCost', () => {
  it('keeps POC defaults fully priced and production unknowns limited to explicit decisions', () => {
    const poc = computeCost(createPreset('poc'), fallbackRateCard)
    const production = computeCost(createPreset('production'), fallbackRateCard)

    expect(poc.complete).toBe(true)
    expect(poc.lines.filter((line) => line.amount === null)).toEqual([])
    expect(production.lines.filter((line) => line.amount === null).map((line) => line.id).sort()).toEqual([
      'change-finops',
      'change-revalidation',
      'change-support',
      'guardrail-defender',
      'guardrail-purview',
      'run-commercial-overflow-unpriced',
    ])
  })

  it('is deterministic and does not mutate its inputs', () => {
    const input = config()
    const card = fixtureRateCard()
    const frozenInput = structuredClone(input)
    const frozenCard = structuredClone(card)

    expect(computeCost(input, card)).toEqual(computeCost(input, card))
    expect(input).toEqual(frozenInput)
    expect(card).toEqual(frozenCard)
  })

  it('assigns every line to one tier and tier sums equal the grand total', () => {
    const result = computeCost(config(), fixtureRateCard())
    expect(result.lines.every((line) => COST_TIERS.includes(line.tier))).toBe(true)
    expect(COST_TIERS.reduce((sum, tier) => sum + result.tiers[tier].knownSubtotal, 0)).toBe(
      result.knownGrandTotal,
    )
  })

  it('removes an independently disabled block contribution', () => {
    const enabled = config()
    const enabledResult = computeCost(enabled, fixtureRateCard())
    const blockSubtotal = enabledResult.lines
      .filter((line) => line.blockId === 'sentinel')
      .reduce((sum, line) => sum + (line.amount ?? 0), 0)
    const disabled = structuredClone(enabled)
    disabled.guardrail.sentinel.enabled = false
    const disabledResult = computeCost(disabled, fixtureRateCard())

    expect(disabledResult.lines.some((line) => line.blockId === 'sentinel')).toBe(false)
    expect(enabledResult.knownGrandTotal - disabledResult.knownGrandTotal).toBeCloseTo(blockSubtotal)
  })

  it('does not multiply usage meters by environment count but scales fixed platform meters', () => {
    const oneEnvironment = config()
    oneEnvironment.environments = 1
    oneEnvironment.secondaryRegionRatio = 0
    oneEnvironment.platform.appCompute.enabled = true
    const fourEnvironments = structuredClone(oneEnvironment)
    fourEnvironments.environments = 4
    const one = computeCost(oneEnvironment, fixtureRateCard())
    const four = computeCost(fourEnvironments, fixtureRateCard())

    for (const id of ['guardrail-content-safety', 'guardrail-defender', 'guardrail-sentinel', 'guardrail-entra']) {
      expect(four.lines.find((line) => line.id === id)?.amount).toBe(
        one.lines.find((line) => line.id === id)?.amount,
      )
    }
    const expectedScale = 1 + 3 * oneEnvironment.nonProductionRatio
    expect(four.lines.find((line) => line.id === 'platform-compute')?.amount).toBeCloseTo(
      (one.lines.find((line) => line.id === 'platform-compute')?.amount ?? 0) * expectedScale,
    )
  })

  it('prices Canadian MGN egress by graduated tiers with the first 100 GB free', () => {
    const input = config()
    input.platform.networkEgress.gbPerMonth = 2_000
    const result = computeCost(input, fixtureRateCard())
    const egress = result.lines.filter((line) => line.blockId === 'networkEgress')

    expect(egress).toHaveLength(2)
    expect(egress[0]?.quantity).toBe(100)
    expect(egress[0]?.amount).toBe(0)
    expect(egress[1]?.quantity).toBe(1_900)
    expect(egress[1]?.amount).toBeCloseTo(232.94)
  })

  it('splits prompt-cache hits from standard input at the exact cached rate', () => {
    const input = createPreset('poc')
    input.commercialModel.cachedInputPercent = 50
    const result = computeCost(input, fixtureRateCard())
    const standardInput = result.lines.filter((line) => line.id.endsWith('-input') && !line.id.includes('cached'))
    const cachedInput = result.lines.filter((line) => line.id.endsWith('-cached-input'))

    expect(cachedInput).toHaveLength(2)
    expect(cachedInput.every((line) => line.unitRate === 2)).toBe(true)
    expect(standardInput.reduce((sum, line) => sum + line.quantity, 0)).toBeCloseTo(
      cachedInput.reduce((sum, line) => sum + line.quantity, 0),
    )
  })

  it('uses Batch-specific manual rates when exact Batch meters are unavailable', () => {
    const input = createPreset('poc')
    const card = fixtureRateCard()
    input.commercialModel.deploymentSku = 'global-batch'
    input.commercialModel.purchaseMode = 'batch'
    input.commercialModel.customInputRateCadPerMillion = 99
    input.commercialModel.customOutputRateCadPerMillion = 99
    input.commercialModel.customBatchInputRateCadPerMillion = 1.25
    input.commercialModel.customBatchOutputRateCadPerMillion = 5
    delete card.rates['model.primary.batchInput']
    delete card.rates['model.primary.batchOutput']

    const lines = computeCost(input, card).lines.filter((line) => line.blockId === 'commercialModel')
    expect(lines.filter((line) => line.id.endsWith('-input')).every((line) => line.unitRate === 1.25)).toBe(true)
    expect(lines.filter((line) => line.id.endsWith('-output')).every((line) => line.unitRate === 5)).toBe(true)
  })

  it('uses exact Retail rates ahead of profile fallbacks', () => {
    const input = createPreset('poc')
    input.commercialModel.customInputRateCadPerMillion = 999
    input.commercialModel.customOutputRateCadPerMillion = 999

    const lines = computeCost(input, fixtureRateCard()).lines.filter(
      (line) => line.blockId === 'commercialModel',
    )
    expect(lines.filter((line) => line.id.endsWith('-input')).every((line) => line.unitRate === 5)).toBe(true)
    expect(lines.filter((line) => line.id.endsWith('-output')).every((line) => line.unitRate === 15)).toBe(true)
    expect(lines.every((line) => line.provenance.source === 'Test fixture meter')).toBe(true)
  })

  it('carries a manual model/SKU profile source and date into cost lines', () => {
    const input = createPreset('poc')
    const model = FOUNDRY_MODEL_CATALOG.find((candidate) => candidate.publisher === 'Anthropic')!
    applyModelPriceSelection(input.commercialModel, model, 'global-standard')
    updateActiveModelPriceProfile(input.commercialModel, {
      source: 'Enterprise Marketplace offer',
      asOf: '2026-08-21',
      inputRateCadPerMillion: 4.25,
      outputRateCadPerMillion: 21.5,
    })

    const lines = computeCost(input, fixtureRateCard()).lines.filter(
      (line) => line.blockId === 'commercialModel',
    )
    expect(lines.every((line) => line.amount !== null)).toBe(true)
    expect(lines.every((line) => line.provenance.source === 'Enterprise Marketplace offer')).toBe(true)
    expect(lines.every((line) => line.provenance.asOf === '2026-08-21')).toBe(true)
  })

  it('prices exact agent-tool, RAG, observability, networking, and DR blocks independently', () => {
    const input = createPreset('poc')
    input.agentTools.codeInterpreter.enabled = true
    input.agentTools.fileSearch.enabled = true
    input.agentTools.skillsExecution.enabled = true
    input.rag.semanticRanker.enabled = true
    input.rag.agenticRetrieval.enabled = true
    input.rag.imageExtraction.enabled = true
    input.rag.customEntity.enabled = true
    input.observability.enabled = true
    input.observability.billableRetentionGbMonth = 10
    input.observability.archiveGbMonth = 20
    input.observability.dataExportGbPerMonth = 5
    input.networking.privateLinkData.enabled = true
    input.networking.natGateway.enabled = true
    input.networking.firewallBasic.enabled = true
    input.disasterRecovery.enabled = true
    input.disasterRecovery.secondaryApiManagementUnits = 1
    input.disasterRecovery.secondarySearchUnits = 1
    input.disasterRecovery.secondaryCosmosRuPerSecond = 3_000
    input.disasterRecovery.secondaryBlobStorageGb = 10
    input.disasterRecovery.secondaryPrivateEndpoints = 2
    input.disasterRecovery.interRegionTransferGbPerMonth = 100
    const result = computeCost(input, fixtureRateCard())
    const coveredBlocks = ['agentTools', 'rag', 'observability', 'networking', 'disasterRecovery']

    expect(coveredBlocks.every((blockId) => result.lines.some((line) => line.blockId === blockId))).toBe(true)
    expect(result.lines.filter((line) => coveredBlocks.includes(line.blockId)).every((line) => line.amount !== null)).toBe(true)
  })

  it('does not charge External ID for internal members or the first 50,000 external MAU', () => {
    const internal = config()
    internal.guardrail.entra.enabled = false
    expect(computeCost(internal, fixtureRateCard()).lines.some((line) => line.blockId === 'entra')).toBe(false)

    const external = structuredClone(internal)
    external.guardrail.entra.enabled = true
    external.workload.monthlyUsers = 50_000
    const line = computeCost(external, fixtureRateCard()).lines.find((candidate) => candidate.id === 'guardrail-entra-free')
    expect(line?.amount).toBe(0)
    expect(line?.quantity).toBe(50_000)
  })

  it('uses Canada East Content Safety for Canada Central and regional pricing elsewhere', () => {
    const input = config()
    input.guardrail.contentSafety.enabled = true
    input.guardrail.contentSafety.monthlyTextRecords = 10_000
    const centralLine = computeCost(input, fixtureRateCard()).lines.find((candidate) => candidate.id === 'guardrail-content-safety')
    input.region = 'eastus'
    const eastUsLine = computeCost(input, fixtureRateCard()).lines.find((candidate) => candidate.id === 'guardrail-content-safety')

    expect(centralLine?.amount).toBeCloseTo(5.284)
    expect(centralLine?.quantityUnit).toBe('thousand text records')
    expect(centralLine?.detail).toContain('Canada East Standard')
    expect(eastUsLine?.detail).toContain('East US Standard')
  })

  it('emits explicit PAYG spillover when PTU capacity is exceeded', () => {
    const input = config()
    input.commercialModel.purchaseMode = 'ptu'
    input.commercialModel.ptuUnits = 1
    input.commercialModel.ptuCapacityTokensPerUnitMonth = 1
    const result = computeCost(input, fixtureRateCard())

    expect(result.lines.find((line) => line.id === 'run-commercial-overflow-input')?.amount).toBeGreaterThan(0)
    expect(result.lines.find((line) => line.id === 'run-commercial-overflow-output')?.amount).toBeGreaterThan(0)
  })

  it('leaves PTU overflow unpriced when model-specific capacity is unknown', () => {
    const input = config()
    input.commercialModel.purchaseMode = 'ptu'
    input.commercialModel.ptuCapacityTokensPerUnitMonth = null
    const result = computeCost(input, fixtureRateCard())

    expect(result.lines.find((line) => line.id === 'run-commercial-overflow-unpriced')?.amount).toBeNull()
    expect(result.complete).toBe(false)
    expect(result.breakeven.feasibleWithinCapacity).toBeNull()
  })

  it('amplifies commercial token cost exactly with the agent turn multiplier', () => {
    const once = config()
    once.commercialModel.purchaseMode = 'payg'
    once.workload.agentTurnMultiplier = 1
    const fiveTimes = structuredClone(once)
    fiveTimes.workload.agentTurnMultiplier = 5
    const tokenSubtotal = (input: CostConfig) =>
      computeCost(input, fixtureRateCard()).lines
        .filter((line) => line.blockId === 'commercialModel')
        .reduce((sum, line) => sum + (line.amount ?? 0), 0)

    expect(tokenSubtotal(fiveTimes)).toBeCloseTo(tokenSubtotal(once) * 5)
  })

  it('gives equal-share harnesses with different overhead profiles different subtotals', () => {
    const input = config()
    input.commercialModel.purchaseMode = 'payg'
    input.harnesses = [
      { id: 'lean', label: 'Lean', enabled: true, share: 1, inputOverheadPercent: 0, outputOverheadPercent: 0 },
      { id: 'heavy', label: 'Heavy', enabled: true, share: 1, inputOverheadPercent: 50, outputOverheadPercent: 50 },
    ]
    const result = computeCost(input, fixtureRateCard())
    const subtotal = (id: string) =>
      result.lines
        .filter((line) => line.id.includes(`-${id}-`))
        .reduce((sum, line) => sum + (line.amount ?? 0), 0)

    expect(subtotal('heavy')).toBeGreaterThan(subtotal('lean'))
  })

  it('prices OSS models by GPU-hour independently of token volume', () => {
    const lowTokens = config()
    lowTokens.ossModel.enabled = true
    const highTokens = structuredClone(lowTokens)
    highTokens.workload.inputTokensPerTurn *= 100
    highTokens.workload.outputTokensPerTurn *= 100

    expect(computeCost(lowTokens, fixtureRateCard()).lines.find((line) => line.id === 'run-oss-gpu')?.amount).toBe(
      computeCost(highTokens, fixtureRateCard()).lines.find((line) => line.id === 'run-oss-gpu')?.amount,
    )
  })

  it('prices a Fireworks catalog model with explicit token rates', () => {
    const model = FOUNDRY_MODEL_CATALOG.find((entry) => entry.source === 'fireworks')
    expect(model).toBeDefined()
    const input = config()
    const keys = modelRateKeys(model!)
    input.commercialModel.modelId = model!.id
    input.commercialModel.deploymentOption = defaultDeploymentOption(model!)
    input.commercialModel.billingBasis = 'tokens'
    input.commercialModel.purchaseMode = 'payg'
    input.commercialModel.inputRateKey = keys.input
    input.commercialModel.outputRateKey = keys.output
    input.commercialModel.customInputRateCadPerMillion = 2
    input.commercialModel.customOutputRateCadPerMillion = 8

    const result = computeCost(input, fixtureRateCard())
    const modelLines = result.lines.filter((line) => line.blockId === 'commercialModel')
    expect(modelLines).toHaveLength(4)
    expect(modelLines.every((line) => line.amount !== null)).toBe(true)
    expect(modelLines.every((line) => line.label.includes(model!.name))).toBe(true)
    expect(modelLines.every((line) => line.detail.includes('Fireworks on Foundry'))).toBe(true)
  })

  it('prices a Hugging Face model by managed-compute instance-hours', () => {
    const model = FOUNDRY_MODEL_CATALOG.find((entry) => entry.source === 'hugging-face')
    expect(model).toBeDefined()
    const input = config()
    input.commercialModel.modelId = model!.id
    input.commercialModel.deploymentOption = 'Managed Compute'
    input.commercialModel.billingBasis = 'managed-compute'
    input.commercialModel.managedCompute.instances = 2
    input.commercialModel.managedCompute.hoursPerMonth = 100
    input.commercialModel.managedCompute.instanceHourlyRateCad = 5

    const result = computeCost(input, fixtureRateCard())
    const compute = result.lines.find((line) => line.id === 'run-commercial-managed-compute')
    expect(compute?.amount).toBe(1_000)
    expect(compute?.quantity).toBe(200)
    expect(compute?.detail).toContain('Hugging Face')
  })

  it('prices enabled Foundry services independently of model usage', () => {
    const input = config()
    const speech = input.foundryServices.selections.find((service) => service.id === 'speech-to-text')
    expect(speech).toBeDefined()
    speech!.enabled = true
    speech!.monthlyQuantity = 40
    speech!.customUnitRateCad = 2.5

    const result = computeCost(input, fixtureRateCard())
    const line = result.lines.find((candidate) => candidate.id === 'run-foundry-service-speech-to-text')
    expect(line?.amount).toBe(100)
    expect(line?.quantityUnit).toBe('audio hours')
    expect(line?.tier).toBe('run')
  })

  it('prices hosted agents by active session CPU and memory without environment scaling', () => {
    const oneEnvironment = config()
    oneEnvironment.hostedAgent.enabled = true
    oneEnvironment.hostedAgent.sandboxSize = '1vcpu-2gb'
    oneEnvironment.hostedAgent.sessionsPerMonth = 120
    oneEnvironment.hostedAgent.activeMinutesPerSession = 30
    oneEnvironment.environments = 1
    oneEnvironment.secondaryRegionRatio = 0
    const fourEnvironments = structuredClone(oneEnvironment)
    fourEnvironments.environments = 4

    const one = computeCost(oneEnvironment, fixtureRateCard())
    const four = computeCost(fourEnvironments, fixtureRateCard())
    expect(one.lines.find((line) => line.id === 'run-hosted-agent-vcpu')?.amount).toBe(120)
    expect(one.lines.find((line) => line.id === 'run-hosted-agent-memory')?.amount).toBe(60)
    expect(four.lines.find((line) => line.id === 'run-hosted-agent-vcpu')?.amount).toBe(120)
    expect(four.lines.find((line) => line.id === 'run-hosted-agent-memory')?.amount).toBe(60)
  })

  it('models Standard Agent Setup resources while keeping one Search charge', () => {
    const input = config()
    input.environments = 1
    input.secondaryRegionRatio = 0
    input.platform.standardAgentSetup.enabled = true
    input.platform.standardAgentSetup.cosmos.billingMode = 'provisioned'
    input.platform.standardAgentSetup.cosmos.provisionedRuPerSecond = 3_000
    input.platform.standardAgentSetup.cosmos.storageGb = 10
    input.platform.standardAgentSetup.blobStorage.storedGb = 10
    input.platform.standardAgentSetup.blobStorage.writeOperationsPerMonth = 100_000
    input.platform.standardAgentSetup.blobStorage.readOperationsPerMonth = 500_000
    input.platform.standardAgentSetup.blobStorage.otherOperationsPerMonth = 100_000

    const result = computeCost(input, fixtureRateCard())
    expect(result.lines.find((line) => line.id === 'platform-agent-cosmos-throughput')?.quantity).toBe(21_900)
    expect(result.lines.find((line) => line.id === 'platform-agent-cosmos-storage')?.amount).toBe(3.875)
    expect(result.lines.find((line) => line.id === 'platform-agent-blob-capacity')?.amount).toBeCloseTo(0.352)
    expect(result.lines.filter((line) => line.id === 'platform-search')).toHaveLength(1)
  })

  it('uses Hot LRS for Canada East because the region has no availability zones', () => {
    const input = createPreset('poc')
    input.region = 'canadaeast'
    const card = fixtureRateCard()
    card.region = 'canadaeast'

    const result = computeCost(input, card)
    const capacity = result.lines.find((line) => line.id === 'platform-agent-blob-capacity')
    const writes = result.lines.find((line) => line.id === 'platform-agent-blob-writes')

    expect(capacity?.rateKey).toBe('platform.agentStorage.hotLrsGbMonth')
    expect(capacity?.detail).toContain('Hot LRS')
    expect(capacity?.assumption).toContain('no availability zones')
    expect(capacity?.amount).toBeCloseTo(0.282)
    expect(writes?.rateKey).toBe('platform.agentStorage.hotLrsWrite10k')
    expect(writes?.amount).toBeCloseTo(0.775)
  })

  it('uses region-priced Hot ZRS for East US and East US 2', () => {
    for (const region of ['eastus', 'eastus2'] as const) {
      const input = createPreset('poc')
      input.region = region
      const card = fixtureRateCard()
      card.region = region

      const capacity = computeCost(input, card).lines.find(
        (line) => line.id === 'platform-agent-blob-capacity',
      )
      expect(capacity?.rateKey).toBe('platform.agentStorage.hotZrsGbMonth')
      expect(capacity?.detail).toContain('Hot ZRS')
      expect(capacity?.assumption).toContain(region === 'eastus' ? 'East US' : 'East US 2')
    }
  })

  it('supports serverless Cosmos requests and independently shared BYO resources', () => {
    const input = config()
    input.environments = 1
    input.secondaryRegionRatio = 0
    input.platform.standardAgentSetup.cosmos.billingMode = 'serverless'
    input.platform.standardAgentSetup.cosmos.serverlessRequestUnitsPerMonth = 10_000_000
    input.platform.standardAgentSetup.blobStorage.enabled = false

    const result = computeCost(input, fixtureRateCard())
    expect(result.lines.find((line) => line.id === 'platform-agent-cosmos-requests')?.amount).toBe(3.875)
    expect(result.lines.some((line) => line.blockId === 'standardAgentStorage')).toBe(false)
    expect(result.lines.filter((line) => line.id === 'platform-search')).toHaveLength(1)
  })

  it('applies MCP schema tokens to every agent turn', () => {
    const input = config()
    input.harnesses = [
      { id: 'direct', label: 'Direct', enabled: true, share: 1, inputOverheadPercent: 0, outputOverheadPercent: 0 },
    ]
    const result = computeCost(input, fixtureRateCard())

    expect(result.metrics.mcpSchemaTokens).toBe(
      result.metrics.monthlyTurns * input.workload.mcpSchemaTokensPerTurn,
    )
    expect(result.metrics.primaryInputTokens).toBe(
      result.metrics.monthlyTurns *
        (input.workload.inputTokensPerTurn + input.workload.mcpSchemaTokensPerTurn),
    )
  })

  it('returns 30 cumulative projection points ending at the known monthly total', () => {
    const result = computeCost(config(), fixtureRateCard())
    expect(result.projection).toHaveLength(30)
    expect(result.projection.at(-1)?.cumulative).toBeCloseTo(result.dailyBurn * 30)
    expect(result.projection.at(-1)?.cumulative).toBeCloseTo(result.knownGrandTotal)
  })

  it('marks enabled missing rates as unpriced instead of fabricating a cost', () => {
    const card = fixtureRateCard()
    card.rates['guardrail.sentinel.gb'] = {
      ...rate(null),
      unavailableReason: 'No exact regional meter matched.',
    }
    const result = computeCost(config(), card)
    const sentinel = result.lines.find((line) => line.id === 'guardrail-sentinel')

    expect(sentinel?.amount).toBeNull()
    expect(sentinel?.provenance.unavailableReason).toBe('No exact regional meter matched.')
    expect(result.complete).toBe(false)
    expect(result.missingRateKeys).toContain('guardrail.sentinel.gb')
  })

  it('exposes a PTU breakeven and capacity feasibility result', () => {
    const result = computeCost(config(), fixtureRateCard())
    expect(result.breakeven.tokensPerMonth).toBeGreaterThan(0)
    expect(typeof result.breakeven.feasibleWithinCapacity).toBe('boolean')
  })

  it('never reduces cost when additional fixed environments are added', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 7 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (environments, nonProductionRatio) => {
          const smaller = config()
          smaller.environments = environments
          smaller.nonProductionRatio = nonProductionRatio
          smaller.platform.apiManagement.enabled = true
          smaller.commercialOffsetPercent = 0
          const larger = structuredClone(smaller)
          larger.environments += 1

          expect(computeCost(larger, fixtureRateCard()).knownGrandTotal).toBeGreaterThanOrEqual(
            computeCost(smaller, fixtureRateCard()).knownGrandTotal,
          )
        },
      ),
    )
  })

  it('recalculates a full production configuration under 100ms p95', () => {
    const input = config()
    const card = fixtureRateCard()
    for (let index = 0; index < 20; index += 1) computeCost(input, card)
    const durations = Array.from({ length: 200 }, () => {
      const started = performance.now()
      computeCost(input, card)
      return performance.now() - started
    }).sort((left, right) => left - right)
    const p95 = durations[Math.floor(durations.length * 0.95)] ?? Number.POSITIVE_INFINITY

    expect(p95).toBeLessThan(100)
  })
})