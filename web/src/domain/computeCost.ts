import {
  COST_TIERS,
  HOSTED_AGENT_SANDBOXES,
  REGION_LABELS,
  type CostConfig,
  type CostLine,
  type CostResult,
  type CostTier,
  type HarnessConfig,
  type LineProvenance,
  type Rate,
  type RateCard,
  type TierTotal,
} from './types'
import { getFoundryModel, MODEL_SOURCE_LABELS } from './foundryCatalog'
import type { FoundryModelCatalogEntry } from './foundryCatalog'
import { getFoundryService } from './foundryServices'

const HOURS_PER_MONTH = 730
const DAYS_PER_PROJECTION = 30
const TOKENS_PER_MILLION = 1_000_000
const ENTRA_EXTERNAL_ID_FREE_MAU = 50_000
const ENTRA_PRICING_URL = 'https://azure.microsoft.com/pricing/details/microsoft-entra-external-id/'
const NETWORK_EGRESS_TIERS = [
  { suffix: 'tier0', minimumGb: 0 },
  { suffix: 'tier1', minimumGb: 100 },
  { suffix: 'tier2', minimumGb: 10_335 },
  { suffix: 'tier3', minimumGb: 51_295 },
  { suffix: 'tier4', minimumGb: 153_695 },
  { suffix: 'tier5', minimumGb: 512_095 },
] as const

interface RateLineInput {
  id: string
  blockId: string
  label: string
  detail: string
  tier: CostTier
  rateKey: string
  quantity: number
  quantityUnit: string
  formula: string
  assumption: string
  scale?: number
  manualRate?: number | null
  manualRateUnit?: string
  manualRateSource?: string
  manualRateSourceUrl?: string
  manualRateAsOf?: string
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))

const nonNegative = (value: number) => Math.max(0, value)

const rateProvenance = (rate: Rate): LineProvenance => ({
  source: rate.source,
  sourceUrl: rate.sourceUrl,
  asOf: rate.asOf,
  maintenance: rate.maintenance,
  ...(rate.lastReviewed ? { lastReviewed: rate.lastReviewed } : {}),
  ...(rate.unavailableReason ? { unavailableReason: rate.unavailableReason } : {}),
})

function addRateLine(lines: CostLine[], rateCard: RateCard, input: RateLineInput) {
  const rate = rateCard.rates[input.rateKey]
  const scale = input.scale ?? 1
  const usesRateCard = rate?.value !== null && rate?.value !== undefined
  const value = usesRateCard ? rate.value : (input.manualRate ?? null)
  const usesManualRate = !usesRateCard && input.manualRate !== null && input.manualRate !== undefined
  const manualProvenance: LineProvenance = {
    source: input.manualRateSource ?? `Scenario rate required: ${input.rateKey}`,
    sourceUrl: input.manualRateSourceUrl ?? '',
    asOf: input.manualRateAsOf || rateCard.asOf,
    maintenance: 'manual',
  }

  lines.push({
    id: input.id,
    blockId: input.blockId,
    label: input.label,
    detail: input.detail,
    tier: input.tier,
    amount: value === null ? null : nonNegative(input.quantity) * value * scale,
    quantity: nonNegative(input.quantity),
    quantityUnit: input.quantityUnit,
    unitRate: value,
    rateUnit: usesRateCard ? rate.unit : (input.manualRateUnit ?? rate?.unit ?? 'unavailable'),
    rateKey: input.rateKey,
    formula: input.formula,
    assumption: input.assumption,
    scale,
    provenance: usesRateCard || (!usesManualRate && rate)
      ? rateProvenance(rate)
      : manualProvenance,
  })
}

function activeHarnesses(harnesses: HarnessConfig[]) {
  const active = harnesses.filter((harness) => harness.enabled)
  if (active.length > 0) return active

  return [
    {
      id: 'direct',
      label: 'Direct model calls',
      enabled: true,
      share: 1,
      inputOverheadPercent: 0,
      outputOverheadPercent: 0,
    },
  ]
}

function createTierTotals(lines: CostLine[]): Record<CostTier, TierTotal> {
  return Object.fromEntries(
    COST_TIERS.map((tier) => {
      const tierLines = lines.filter((line) => line.tier === tier)
      return [
        tier,
        {
          tier,
          knownSubtotal: tierLines.reduce((sum, line) => sum + (line.amount ?? 0), 0),
          unpricedLineCount: tierLines.filter((line) => line.amount === null).length,
        },
      ]
    }),
  ) as Record<CostTier, TierTotal>
}

export function computeCost(
  config: CostConfig,
  rateCard: RateCard,
  modelCatalog?: readonly FoundryModelCatalogEntry[],
): CostResult {
  const lines: CostLine[] = []
  const monthlyTurns =
    nonNegative(config.workload.monthlyUsers) *
    nonNegative(config.workload.activeDaysPerMonth) *
    nonNegative(config.workload.requestsPerUserPerDay) *
    nonNegative(config.workload.agentTurnMultiplier)
  const mcpSchemaTokens = monthlyTurns * nonNegative(config.workload.mcpSchemaTokensPerTurn)
  const fixedEnvironmentScale =
    1 + nonNegative(config.environments - 1) * clamp(config.nonProductionRatio, 0, 1)
  const resilienceScale = config.disasterRecovery.enabled
    ? 1
    : 1 + clamp(config.secondaryRegionRatio, 0, 1)
  const fixedScale = fixedEnvironmentScale * resilienceScale
  const harnesses = activeHarnesses(config.harnesses)
  const totalHarnessShare = harnesses.reduce((sum, harness) => sum + nonNegative(harness.share), 0) || 1

  let primaryInputTokens = 0
  let primaryOutputTokens = 0
  const harnessVolumes = harnesses.map((harness) => {
    const share = nonNegative(harness.share) / totalHarnessShare
    const inputTokens =
      monthlyTurns *
      (nonNegative(config.workload.inputTokensPerTurn) +
        nonNegative(config.workload.mcpSchemaTokensPerTurn)) *
      share *
      (1 + nonNegative(harness.inputOverheadPercent) / 100)
    const outputTokens =
      monthlyTurns *
      nonNegative(config.workload.outputTokensPerTurn) *
      share *
      (1 + nonNegative(harness.outputOverheadPercent) / 100)
    primaryInputTokens += inputTokens
    primaryOutputTokens += outputTokens
    return { harness, inputTokens, outputTokens }
  })

  const selectedModel = getFoundryModel(config.commercialModel.modelId, modelCatalog)
  const selectedModelLabel = selectedModel
    ? `${selectedModel.name} ${selectedModel.version}`
    : config.commercialModel.modelId
  const selectedModelSource = selectedModel
    ? MODEL_SOURCE_LABELS[selectedModel.source]
    : 'Custom catalog model'
  const deploymentSkuLabel = config.commercialModel.deploymentSku.replaceAll('-', ' ')
  const modelDetail = `${selectedModelSource}; ${config.commercialModel.deploymentOption}; ${deploymentSkuLabel}`
  const modelPriceProfile = config.commercialModel.priceProfiles.find(
    (profile) => profile.modelId === config.commercialModel.modelId &&
      profile.deploymentSku === config.commercialModel.deploymentSku,
  )
  const modelManualProvenance = {
    manualRateSource: modelPriceProfile?.source.trim() ||
      `Scenario price profile: ${config.commercialModel.modelId} / ${config.commercialModel.deploymentSku}`,
    manualRateAsOf: modelPriceProfile?.asOf || rateCard.asOf,
  }

  if (config.commercialModel.enabled) {
    if (config.commercialModel.billingBasis === 'managed-compute') {
      addRateLine(lines, rateCard, {
        id: 'run-commercial-managed-compute',
        blockId: 'commercialModel',
        label: `${selectedModelLabel} managed compute`,
        detail: `${modelDetail}; ${config.commercialModel.managedCompute.instances} instance(s)`,
        tier: 'run',
        rateKey: `${config.commercialModel.inputRateKey}.managedComputeHour`,
        quantity:
          nonNegative(config.commercialModel.managedCompute.instances) *
          nonNegative(config.commercialModel.managedCompute.hoursPerMonth),
        quantityUnit: 'instance-hours',
        formula: 'instances x occupied hours per month',
        assumption: 'Managed compute is billed for occupied VM hours; select a concrete VM SKU rate.',
        manualRate: config.commercialModel.managedCompute.instanceHourlyRateCad,
        manualRateUnit: 'CAD/instance-hour',
        manualRateSourceUrl: 'https://learn.microsoft.com/azure/machine-learning/how-to-deploy-models-managed',
        ...modelManualProvenance,
      })
    } else if (config.commercialModel.billingBasis === 'usage') {
      addRateLine(lines, rateCard, {
        id: 'run-commercial-model-usage',
        blockId: 'commercialModel',
        label: `${selectedModelLabel} usage`,
        detail: modelDetail,
        tier: 'run',
        rateKey: `${config.commercialModel.inputRateKey}.usage`,
        quantity: config.commercialModel.usage.monthlyQuantity,
        quantityUnit: config.commercialModel.usage.quantityUnit,
        formula: 'monthly model-specific usage x approved CAD unit rate',
        assumption: 'Non-token model meters vary by modality; quantity and rate are explicit scenario inputs.',
        manualRate: config.commercialModel.usage.unitRateCad,
        manualRateUnit: `CAD/${config.commercialModel.usage.quantityUnit}`,
        ...modelManualProvenance,
      })
    } else if (config.commercialModel.purchaseMode === 'ptu') {
      const ptuUnits = nonNegative(config.commercialModel.ptuUnits)
      addRateLine(lines, rateCard, {
        id: 'run-commercial-ptu',
        blockId: 'commercialModel',
        label: `${selectedModelLabel} PTU reservation`,
        detail: `${modelDetail}; ${ptuUnits} provisioned throughput units`,
        tier: 'run',
        rateKey: config.commercialModel.ptuHourlyRateKey,
        quantity: ptuUnits * HOURS_PER_MONTH,
        quantityUnit: 'PTU-hours',
        formula: `${ptuUnits} PTUs x ${HOURS_PER_MONTH} hours`,
        assumption: 'PTU reservations are billed for the full month.',
        manualRate: config.commercialModel.customPtuHourlyRateCad,
        manualRateUnit: 'CAD/PTU-hour',
        ...modelManualProvenance,
      })

      const capacityPerUnit = config.commercialModel.ptuCapacityTokensPerUnitMonth
      const capacityTokens =
        capacityPerUnit === null ? null : ptuUnits * nonNegative(capacityPerUnit)
      const totalTokens = primaryInputTokens + primaryOutputTokens
      const overflowRatio =
        capacityTokens === null || totalTokens === 0
          ? null
          : nonNegative(totalTokens - capacityTokens) / totalTokens
      if (overflowRatio === null) {
        lines.push({
          id: 'run-commercial-overflow-unpriced',
          blockId: 'commercialModel',
          label: 'PAYG overflow - capacity required',
          detail: 'Enter model-specific monthly token capacity per PTU to price spillover.',
          tier: 'run',
          amount: null,
          quantity: totalTokens,
          quantityUnit: 'tokens',
          unitRate: null,
          rateUnit: 'capacity unavailable',
          formula: 'max(total tokens - PTU capacity, 0)',
          assumption: 'PTU capacity varies by model and workload; no default is assumed.',
          scale: 1,
          provenance: {
            source: 'Scenario input required: model-specific PTU capacity',
            sourceUrl: 'https://learn.microsoft.com/azure/ai-services/openai/concepts/provisioned-throughput',
            asOf: rateCard.asOf,
            maintenance: 'manual',
          },
        })
      } else if (overflowRatio > 0) {
        addRateLine(lines, rateCard, {
          id: 'run-commercial-overflow-input',
          blockId: 'commercialModel',
          label: 'PAYG overflow - input tokens',
          detail: 'Input volume above configured PTU capacity',
          tier: 'run',
          rateKey: config.commercialModel.inputRateKey,
          quantity: (primaryInputTokens * overflowRatio) / TOKENS_PER_MILLION,
          quantityUnit: 'million tokens',
          formula: 'Input tokens x overflow share / 1,000,000',
          assumption: 'Capacity overflow is allocated across input and output in their observed ratio.',
          manualRate: config.commercialModel.customInputRateCadPerMillion,
          manualRateUnit: 'CAD/million tokens',
          ...modelManualProvenance,
        })
        addRateLine(lines, rateCard, {
          id: 'run-commercial-overflow-output',
          blockId: 'commercialModel',
          label: 'PAYG overflow - output tokens',
          detail: 'Output volume above configured PTU capacity',
          tier: 'run',
          rateKey: config.commercialModel.outputRateKey,
          quantity: (primaryOutputTokens * overflowRatio) / TOKENS_PER_MILLION,
          quantityUnit: 'million tokens',
          formula: 'Output tokens x overflow share / 1,000,000',
          assumption: 'Capacity overflow is allocated across input and output in their observed ratio.',
          manualRate: config.commercialModel.customOutputRateCadPerMillion,
          manualRateUnit: 'CAD/million tokens',
          ...modelManualProvenance,
        })
      }
    } else {
      const isBatch = config.commercialModel.purchaseMode === 'batch'
      const cachedInputShare = isBatch
        ? 0
        : clamp(config.commercialModel.cachedInputPercent, 0, 100) / 100
      for (const volume of harnessVolumes) {
        const uncachedInputTokens = volume.inputTokens * (1 - cachedInputShare)
        if (uncachedInputTokens > 0) {
          addRateLine(lines, rateCard, {
            id: `run-commercial-${volume.harness.id}-input`,
            blockId: 'commercialModel',
            label: `${selectedModelLabel} - ${volume.harness.label} input`,
            detail: `${modelDetail}; ${volume.harness.inputOverheadPercent}% harness overhead`,
            tier: 'run',
            rateKey: isBatch
              ? config.commercialModel.batchInputRateKey
              : config.commercialModel.inputRateKey,
            quantity: uncachedInputTokens / TOKENS_PER_MILLION,
            quantityUnit: 'million tokens',
            formula: '(turn input + MCP schema) x turns x harness share x overhead x uncached share',
            assumption: 'Harness shares are normalized across enabled harnesses; cached input is separated when configured.',
            manualRate: isBatch
              ? config.commercialModel.customBatchInputRateCadPerMillion
              : config.commercialModel.customInputRateCadPerMillion,
            manualRateUnit: 'CAD/million tokens',
            ...modelManualProvenance,
          })
        }
        if (cachedInputShare > 0) {
          addRateLine(lines, rateCard, {
            id: `run-commercial-${volume.harness.id}-cached-input`,
            blockId: 'commercialModel',
            label: `${selectedModelLabel} - ${volume.harness.label} cached input`,
            detail: `${modelDetail}; ${(cachedInputShare * 100).toFixed(1)}% cache-hit share`,
            tier: 'run',
            rateKey: config.commercialModel.cachedInputRateKey,
            quantity: (volume.inputTokens * cachedInputShare) / TOKENS_PER_MILLION,
            quantityUnit: 'million tokens',
            formula: '(turn input + MCP schema) x turns x harness share x overhead x cache-hit share',
            assumption: 'Only identical supported prompt prefixes reported as cached input are eligible for the cached meter.',
            manualRate: config.commercialModel.customCachedInputRateCadPerMillion,
            manualRateUnit: 'CAD/million cached tokens',
            ...modelManualProvenance,
          })
        }
        addRateLine(lines, rateCard, {
          id: `run-commercial-${volume.harness.id}-output`,
          blockId: 'commercialModel',
          label: `${selectedModelLabel} - ${volume.harness.label} output`,
          detail: `${modelDetail}; ${volume.harness.outputOverheadPercent}% harness overhead`,
          tier: 'run',
          rateKey: isBatch
            ? config.commercialModel.batchOutputRateKey
            : config.commercialModel.outputRateKey,
          quantity: volume.outputTokens / TOKENS_PER_MILLION,
          quantityUnit: 'million tokens',
          formula: 'turn output x turns x harness share x overhead',
          assumption: 'Harness shares are normalized across enabled harnesses.',
          manualRate: isBatch
            ? config.commercialModel.customBatchOutputRateCadPerMillion
            : config.commercialModel.customOutputRateCadPerMillion,
          manualRateUnit: 'CAD/million tokens',
          ...modelManualProvenance,
        })
      }
    }
  }

  if (config.hostedAgent.enabled) {
    const sandbox = HOSTED_AGENT_SANDBOXES[config.hostedAgent.sandboxSize]
    const activeSessionHours =
      (nonNegative(config.hostedAgent.sessionsPerMonth) *
        nonNegative(config.hostedAgent.activeMinutesPerSession)) /
      60
    addRateLine(lines, rateCard, {
      id: 'run-hosted-agent-vcpu',
      blockId: 'hostedAgent',
      label: 'Hosted agent vCPU',
      detail: `${sandbox.label}; ${config.hostedAgent.sessionsPerMonth} monthly sessions`,
      tier: 'run',
      rateKey: config.hostedAgent.vcpuRateKey,
      quantity: activeSessionHours * sandbox.vcpu,
      quantityUnit: 'vCPU-hours',
      formula: 'sessions x active minutes / 60 x vCPU per session',
      assumption: 'Active time includes the configured idle window and is not scaled by environment count.',
    })
    addRateLine(lines, rateCard, {
      id: 'run-hosted-agent-memory',
      blockId: 'hostedAgent',
      label: 'Hosted agent memory',
      detail: `${sandbox.label}; ${config.hostedAgent.activeMinutesPerSession} billed minutes per session`,
      tier: 'run',
      rateKey: config.hostedAgent.memoryRateKey,
      quantity: activeSessionHours * sandbox.memoryGiB,
      quantityUnit: 'GiB-hours',
      formula: 'sessions x active minutes / 60 x GiB per session',
      assumption: 'Foundry bills CPU and memory across active session sandboxes, including idle timeout.',
    })
  }

  if (config.agentTools.codeInterpreter.enabled) {
    const scope = config.agentTools.codeInterpreter.scope
    addRateLine(lines, rateCard, {
      id: 'run-agent-tool-code-interpreter',
      blockId: 'agentTools',
      label: 'Agent Code Interpreter',
      detail: `${config.agentTools.codeInterpreter.sessionsPerMonth} ${scope} sessions per month`,
      tier: 'run',
      rateKey: `agent.tool.codeInterpreter.${scope}.session`,
      quantity: config.agentTools.codeInterpreter.sessionsPerMonth,
      quantityUnit: 'sessions',
      formula: 'billable Code Interpreter sessions per month',
      assumption: 'A session is billed separately per concurrent thread and is active for up to one hour.',
    })
  }
  if (config.agentTools.fileSearch.enabled) {
    const scope = config.agentTools.fileSearch.scope
    addRateLine(lines, rateCard, {
      id: 'run-agent-tool-file-search',
      blockId: 'agentTools',
      label: 'Agent File Search vector storage',
      detail: `${config.agentTools.fileSearch.averageStorageGb} average GB for ${config.agentTools.fileSearch.activeDaysPerMonth} days`,
      tier: 'run',
      rateKey: `agent.tool.fileSearch.${scope}.gbDay`,
      quantity:
        nonNegative(config.agentTools.fileSearch.averageStorageGb) *
        nonNegative(config.agentTools.fileSearch.activeDaysPerMonth),
      quantityUnit: 'GB-days',
      formula: 'average vector-store GB x active days',
      assumption: 'File Search is billed by vector storage retained per day; model inference is priced separately.',
    })
  }
  if (config.agentTools.skillsExecution.enabled) {
    addRateLine(lines, rateCard, {
      id: 'run-agent-skills-execution',
      blockId: 'agentTools',
      label: 'Foundry skills execution',
      detail: `${config.agentTools.skillsExecution.hoursPerMonth} container hours`,
      tier: 'run',
      rateKey: 'agent.skills.execution.hour',
      quantity: config.agentTools.skillsExecution.hoursPerMonth,
      quantityUnit: 'container-hours',
      formula: 'skills execution container hours',
      assumption: 'Tool-side downstream services and model calls remain separate lines.',
    })
  }
  if (config.agentTools.webSearch.enabled) {
    addRateLine(lines, rateCard, {
      id: 'run-agent-tool-web-search',
      blockId: 'agentTools',
      label: 'Agent Web Search / Bing grounding',
      detail: `${config.agentTools.webSearch.searchesPerMonth} searches per month`,
      tier: 'run',
      rateKey: 'agent.tool.webSearch.searches1k',
      quantity: config.agentTools.webSearch.searchesPerMonth / 1_000,
      quantityUnit: 'thousand searches',
      formula: 'web searches / 1,000 x contracted unit rate',
      assumption: 'Grounding terms and price can be tenant or offer specific; response-model tokens are separate.',
      manualRate: config.agentTools.webSearch.customRateCadPerThousand,
      manualRateUnit: 'CAD/thousand searches',
      manualRateSource: 'Scenario input: Bing/Web Search offer rate',
      manualRateSourceUrl: 'https://learn.microsoft.com/azure/foundry/agents/how-to/tools/web-search',
    })
  }

  for (const selection of config.foundryServices.selections.filter((service) => service.enabled)) {
    const service = getFoundryService(selection.id)
    if (!service) continue
    addRateLine(lines, rateCard, {
      id: `run-foundry-service-${service.id}`,
      blockId: 'foundryServices',
      label: service.name,
      detail: `${service.type} service playground`,
      tier: 'run',
      rateKey: service.rateKey,
      quantity: selection.monthlyQuantity,
      quantityUnit: service.quantityUnit,
      formula: 'monthly service usage x CAD unit rate',
      assumption: 'Service usage is independent of model-token volume and is entered explicitly.',
      manualRate: selection.customUnitRateCad,
      manualRateUnit: `CAD/${service.quantityUnit}`,
      manualRateSource: `Scenario input: ${service.name} unit rate`,
    })
  }

  if (config.ossModel.enabled) {
    const utilization = clamp(config.ossModel.utilizationPercent, 0, 100) / 100
    addRateLine(lines, rateCard, {
      id: 'run-oss-gpu',
      blockId: 'ossModel',
      label: 'OSS model GPU compute',
      detail: `${config.ossModel.instances} instance(s) at ${config.ossModel.utilizationPercent}% utilisation`,
      tier: 'run',
      rateKey: config.ossModel.gpuHourlyRateKey,
      quantity:
        nonNegative(config.ossModel.instances) *
        nonNegative(config.ossModel.hoursPerDay) *
        DAYS_PER_PROJECTION *
        utilization,
      quantityUnit: 'GPU-hours',
      formula: 'instances x hours/day x 30 days x utilisation',
      assumption: 'OSS inference is priced by occupied GPU time, independent of token volume.',
    })
  }

  if (config.guardrail.contentSafety.enabled) {
    const contentSafetyRegion = config.region === 'canadacentral' ? 'canadaeast' : config.region
    addRateLine(lines, rateCard, {
      id: 'guardrail-content-safety',
      blockId: 'contentSafety',
      label: 'Standalone Azure AI Content Safety',
      detail: `${config.guardrail.contentSafety.monthlyTextRecords} text records in ${REGION_LABELS[contentSafetyRegion]} Standard`,
      tier: 'guardrail',
      rateKey: config.guardrail.contentSafety.rateKey,
      quantity: config.guardrail.contentSafety.monthlyTextRecords / 1_000,
      quantityUnit: 'thousand text records',
      formula: 'explicit monthly text records / 1,000',
      assumption: 'A text record contains up to 1,000 Unicode code points; this is separate from integrated Foundry model filtering.',
    })
  }
  if (config.guardrail.defenderForAi.enabled) {
    addRateLine(lines, rateCard, {
      id: 'guardrail-defender',
      blockId: 'defenderForAi',
      label: 'Defender for AI workloads',
      detail: 'Protected AI transactions',
      tier: 'guardrail',
      rateKey: config.guardrail.defenderForAi.rateKey,
      quantity: monthlyTurns / 1_000,
      quantityUnit: 'thousand transactions',
      formula: 'monthly turns / 1,000',
      assumption: 'Usage follows turns and is not multiplied by environment count.',
    })
  }
  if (config.guardrail.sentinel.enabled) {
    addRateLine(lines, rateCard, {
      id: 'guardrail-sentinel',
      blockId: 'sentinel',
      label: 'Microsoft Sentinel ingestion',
      detail: `${config.guardrail.sentinel.ingestedGbPerMonth} GB monthly ingestion`,
      tier: 'guardrail',
      rateKey: config.guardrail.sentinel.rateKey,
      quantity: config.guardrail.sentinel.ingestedGbPerMonth,
      quantityUnit: 'GB',
      formula: 'monthly ingested GB',
      assumption: 'Ingestion is a workload total and is not multiplied by environment count.',
    })
  }
  if (config.guardrail.entra.enabled) {
    const externalMau = nonNegative(config.workload.monthlyUsers)
    const freeMau = Math.min(externalMau, ENTRA_EXTERNAL_ID_FREE_MAU)
    lines.push({
      id: 'guardrail-entra-free',
      blockId: 'entra',
      label: 'Microsoft Entra External ID Basic',
      detail: `${freeMau} of ${externalMau} external monthly active users in the free tier`,
      tier: 'guardrail',
      amount: 0,
      quantity: freeMau,
      quantityUnit: 'external MAU',
      unitRate: 0,
      rateUnit: 'CAD/external MAU',
      formula: `min(external MAU, ${ENTRA_EXTERNAL_ID_FREE_MAU}) x CAD 0`,
      assumption: 'Basic External ID is free for the first 50,000 external MAU; internal tenant members do not consume this line.',
      scale: 1,
      provenance: {
        source: 'Microsoft Entra External ID pricing - Basic MAU tier',
        sourceUrl: ENTRA_PRICING_URL,
        asOf: rateCard.asOf,
        maintenance: 'manual',
        lastReviewed: rateCard.asOf,
      },
    })
    if (externalMau > ENTRA_EXTERNAL_ID_FREE_MAU) {
      addRateLine(lines, rateCard, {
        id: 'guardrail-entra-paid',
        blockId: 'entra',
        label: 'Microsoft Entra External ID overage',
        detail: `${externalMau - ENTRA_EXTERNAL_ID_FREE_MAU} external MAU above the free tier`,
        tier: 'guardrail',
        rateKey: config.guardrail.entra.rateKey,
        quantity: externalMau - ENTRA_EXTERNAL_ID_FREE_MAU,
        quantityUnit: 'external MAU',
        formula: `max(external MAU - ${ENTRA_EXTERNAL_ID_FREE_MAU}, 0)`,
        assumption: 'Above-threshold CAD pricing remains unpriced until an exact tenant offer or native CAD meter is supplied.',
      })
    }
  }
  if (config.guardrail.purview.enabled) {
    addRateLine(lines, rateCard, {
      id: 'guardrail-purview',
      blockId: 'purview',
      label: 'Microsoft Purview capacity',
      detail: `${config.guardrail.purview.capacityUnits} capacity unit(s)`,
      tier: 'guardrail',
      rateKey: config.guardrail.purview.rateKey,
      quantity: config.guardrail.purview.capacityUnits * HOURS_PER_MONTH,
      quantityUnit: 'capacity-hours',
      formula: `capacity units x ${HOURS_PER_MONTH} hours`,
      assumption: 'Capacity is entered as a workload-wide compliance allocation.',
    })
  }

  if (config.platform.apiManagement.enabled) {
    addRateLine(lines, rateCard, {
      id: 'platform-apim',
      blockId: 'apiManagement',
      label: 'Azure API Management',
      detail: `${config.platform.apiManagement.units} production unit(s)`,
      tier: 'platform',
      rateKey: config.platform.apiManagement.rateKey,
      quantity: config.platform.apiManagement.units * HOURS_PER_MONTH,
      quantityUnit: 'unit-hours',
      formula: `units x ${HOURS_PER_MONTH} hours x environment scale x resilience scale`,
      assumption: 'Fixed infrastructure scales for non-production and secondary-region posture.',
      scale: fixedScale,
    })
  }
  if (config.platform.privateEndpoints.enabled) {
    addRateLine(lines, rateCard, {
      id: 'platform-private-endpoints',
      blockId: 'privateEndpoints',
      label: 'Private endpoints',
      detail: `${config.platform.privateEndpoints.endpoints} endpoint(s)`,
      tier: 'platform',
      rateKey: config.platform.privateEndpoints.rateKey,
      quantity: config.platform.privateEndpoints.endpoints * HOURS_PER_MONTH,
      quantityUnit: 'endpoint-hours',
      formula: `endpoints x ${HOURS_PER_MONTH} hours x environment x resilience`,
      assumption: 'Endpoint count is the production baseline per environment; Private Link ingress and egress data processing are separate usage meters.',
      scale: fixedScale,
    })
  }
  if (config.platform.networkEgress.enabled) {
    const monthlyGb = nonNegative(config.platform.networkEgress.gbPerMonth)
    NETWORK_EGRESS_TIERS.forEach((tier, index) => {
      const nextTier = NETWORK_EGRESS_TIERS[index + 1]
      const upperBound = nextTier?.minimumGb ?? Number.POSITIVE_INFINITY
      const quantity = Math.min(Math.max(monthlyGb - tier.minimumGb, 0), upperBound - tier.minimumGb)
      if (quantity <= 0) return
      const rateKey = `${config.platform.networkEgress.rateKey}.${tier.suffix}`
      const synchronizedMinimum = rateCard.rates[rateKey]?.tierMinimumUnits
      addRateLine(lines, rateCard, {
        id: `platform-network-${tier.suffix}`,
        blockId: 'networkEgress',
        label: tier.minimumGb === 0 ? 'Network egress - free tier' : 'Network egress - graduated tier',
        detail: `${quantity} GB from the ${synchronizedMinimum ?? tier.minimumGb} GB tier`,
        tier: 'platform',
        rateKey,
        quantity,
        quantityUnit: 'GB',
        formula: nextTier
          ? `min(max(monthly GB - ${tier.minimumGb}, 0), ${upperBound - tier.minimumGb})`
          : `max(monthly GB - ${tier.minimumGb}, 0)`,
        assumption: 'Microsoft Global Network routing-preference internet egress, entered as an all-environment total.',
      })
    })
  }
  if (config.platform.standardAgentSetup.enabled) {
    const cosmos = config.platform.standardAgentSetup.cosmos
    if (cosmos.enabled) {
      if (cosmos.billingMode === 'provisioned') {
        addRateLine(lines, rateCard, {
          id: 'platform-agent-cosmos-throughput',
          blockId: 'standardAgentCosmos',
          label: 'Agent thread storage - Cosmos DB throughput',
          detail: `${cosmos.provisionedRuPerSecond} RU/s provisioned; Standard Setup requires at least 3,000 RU/s`,
          tier: 'platform',
          rateKey: cosmos.provisionedThroughputRateKey,
          quantity: (nonNegative(cosmos.provisionedRuPerSecond) / 100) * HOURS_PER_MONTH,
          quantityUnit: '100 RU/s-hours',
          formula: `RU/s / 100 x ${HOURS_PER_MONTH} hours x environment x resilience`,
          assumption: 'Provisioned throughput is a fixed per-project baseline for messages and agent metadata.',
          scale: fixedScale,
        })
      } else {
        addRateLine(lines, rateCard, {
          id: 'platform-agent-cosmos-requests',
          blockId: 'standardAgentCosmos',
          label: 'Agent thread storage - Cosmos DB requests',
          detail: `${cosmos.serverlessRequestUnitsPerMonth} serverless request units per production baseline`,
          tier: 'platform',
          rateKey: cosmos.serverlessRequestRateKey,
          quantity: nonNegative(cosmos.serverlessRequestUnitsPerMonth) / TOKENS_PER_MILLION,
          quantityUnit: 'million request units',
          formula: 'request units / 1,000,000 x environment x resilience',
          assumption: 'Serverless request-unit volume is entered per production baseline.',
          scale: fixedScale,
        })
      }
      addRateLine(lines, rateCard, {
        id: 'platform-agent-cosmos-storage',
        blockId: 'standardAgentCosmos',
        label: 'Agent thread storage - Cosmos DB data',
        detail: `${cosmos.storageGb} GB for messages, conversation history, and agent metadata`,
        tier: 'platform',
        rateKey: cosmos.storageRateKey,
        quantity: nonNegative(cosmos.storageGb),
        quantityUnit: 'GB-months',
        formula: 'stored GB x environment x resilience',
        assumption: 'Storage is a per-project production baseline.',
        scale: fixedScale,
      })
    }

    const blobStorage = config.platform.standardAgentSetup.blobStorage
    if (blobStorage.enabled) {
      const usesHotLrs = config.region === 'canadaeast'
      const redundancy = usesHotLrs ? 'Hot LRS' : 'Hot ZRS'
      const blobRateKeys = usesHotLrs
        ? {
            capacity: 'platform.agentStorage.hotLrsGbMonth',
            write: 'platform.agentStorage.hotLrsWrite10k',
            read: 'platform.agentStorage.hotLrsRead10k',
            other: 'platform.agentStorage.hotLrsOther10k',
          }
        : {
            capacity: blobStorage.capacityRateKey,
            write: blobStorage.writeRateKey,
            read: blobStorage.readRateKey,
            other: blobStorage.otherOperationsRateKey,
          }
      const redundancyAssumption = usesHotLrs
        ? 'Canada East has no availability zones; Hot LRS is the in-region option and provides lower resilience than ZRS.'
        : `Hot ZRS provides zone-redundant storage in ${REGION_LABELS[config.region]} and matches the Standard Agent Setup pattern.`
      addRateLine(lines, rateCard, {
        id: 'platform-agent-blob-capacity',
        blockId: 'standardAgentStorage',
        label: 'Agent file storage - Blob capacity',
        detail: `${blobStorage.storedGb} GB ${redundancy} for files, chunks, and embeddings`,
        tier: 'platform',
        rateKey: blobRateKeys.capacity,
        quantity: nonNegative(blobStorage.storedGb),
        quantityUnit: 'GB-months',
        formula: 'stored GB x environment x resilience',
        assumption: redundancyAssumption,
        scale: fixedScale,
      })
      addRateLine(lines, rateCard, {
        id: 'platform-agent-blob-writes',
        blockId: 'standardAgentStorage',
        label: 'Agent file storage - writes',
        detail: `${redundancy}; ${blobStorage.writeOperationsPerMonth} write operations per production baseline`,
        tier: 'platform',
        rateKey: blobRateKeys.write,
        quantity: nonNegative(blobStorage.writeOperationsPerMonth) / 10_000,
        quantityUnit: '10K operations',
        formula: 'write operations / 10,000 x environment x resilience',
        assumption: `Uploads and generated intermediate data are entered explicitly. ${redundancyAssumption}`,
        scale: fixedScale,
      })
      addRateLine(lines, rateCard, {
        id: 'platform-agent-blob-reads',
        blockId: 'standardAgentStorage',
        label: 'Agent file storage - reads',
        detail: `${redundancy}; ${blobStorage.readOperationsPerMonth} read operations per production baseline`,
        tier: 'platform',
        rateKey: blobRateKeys.read,
        quantity: nonNegative(blobStorage.readOperationsPerMonth) / 10_000,
        quantityUnit: '10K operations',
        formula: 'read operations / 10,000 x environment x resilience',
        assumption: `File and intermediate-data reads are entered explicitly. ${redundancyAssumption}`,
        scale: fixedScale,
      })
      addRateLine(lines, rateCard, {
        id: 'platform-agent-blob-other',
        blockId: 'standardAgentStorage',
        label: 'Agent file storage - other operations',
        detail: `${redundancy}; ${blobStorage.otherOperationsPerMonth} list and other operations per production baseline`,
        tier: 'platform',
        rateKey: blobRateKeys.other,
        quantity: nonNegative(blobStorage.otherOperationsPerMonth) / 10_000,
        quantityUnit: '10K operations',
        formula: 'other operations / 10,000 x environment x resilience',
        assumption: `Container creation is rare; recurring list and metadata operations use the lower other-operations meter. ${redundancyAssumption}`,
        scale: fixedScale,
      })
    }
  }
  if (config.platform.knowledgeSearch.enabled) {
    addRateLine(lines, rateCard, {
      id: 'platform-search',
      blockId: 'knowledgeSearch',
      label: 'Azure AI Search',
      detail: `${config.platform.knowledgeSearch.units} search unit(s)`,
      tier: 'platform',
      rateKey: config.platform.knowledgeSearch.rateKey,
      quantity: config.platform.knowledgeSearch.units * HOURS_PER_MONTH,
      quantityUnit: 'unit-hours',
      formula: `search units x ${HOURS_PER_MONTH} hours x environment scale x resilience scale`,
      assumption: 'Search units are the fixed production baseline.',
      scale: fixedScale,
    })
  }
  if (config.platform.appCompute.enabled) {
    addRateLine(lines, rateCard, {
      id: 'platform-compute',
      blockId: 'appCompute',
      label: 'Application compute',
      detail: `${config.platform.appCompute.instances} baseline instance(s)`,
      tier: 'platform',
      rateKey: config.platform.appCompute.rateKey,
      quantity: config.platform.appCompute.instances * HOURS_PER_MONTH,
      quantityUnit: 'instance-hours',
      formula: `instances x ${HOURS_PER_MONTH} hours x environment x resilience`,
      assumption: 'Compute instances are the fixed production baseline.',
      scale: fixedScale,
    })
  }

  if (config.rag.semanticRanker.enabled) {
    addRateLine(lines, rateCard, {
      id: 'platform-rag-semantic-ranker',
      blockId: 'rag',
      label: 'Azure AI Search semantic ranker',
      detail: `${config.rag.semanticRanker.queriesPerMonth} semantic queries`,
      tier: 'platform',
      rateKey: 'rag.search.semanticRanker.queries1k',
      quantity: config.rag.semanticRanker.queriesPerMonth / 1_000,
      quantityUnit: 'thousand queries',
      formula: 'semantic queries / 1,000',
      assumption: 'Semantic ranker is a premium feature billed independently from dedicated Search Units.',
    })
  }
  if (config.rag.agenticRetrieval.enabled) {
    addRateLine(lines, rateCard, {
      id: 'platform-rag-agentic-reasoning',
      blockId: 'rag',
      label: 'Azure AI Search agentic retrieval reasoning',
      detail: `${config.rag.agenticRetrieval.reasoningEffort} reasoning effort`,
      tier: 'platform',
      rateKey: `rag.search.agentic.${config.rag.agenticRetrieval.reasoningEffort}.tokens1k`,
      quantity: config.rag.agenticRetrieval.reasoningTokensPerMonth / 1_000,
      quantityUnit: 'thousand reasoning tokens',
      formula: 'agentic retrieval reasoning tokens / 1,000',
      assumption: 'The Search retrieval-token meter is separate from model tokens used for planning and answer formulation.',
    })
    addRateLine(lines, rateCard, {
      id: 'run-rag-agentic-planner-input',
      blockId: 'rag',
      label: 'Agentic retrieval planner input',
      detail: `${selectedModelLabel}; query planning and expansion`,
      tier: 'run',
      rateKey: config.commercialModel.inputRateKey,
      quantity: config.rag.agenticRetrieval.plannerInputTokensPerMonth / TOKENS_PER_MILLION,
      quantityUnit: 'million tokens',
      formula: 'planner input tokens / 1,000,000',
      assumption: 'Planner-model usage is billed by the selected model provider in addition to Search retrieval.',
      manualRate: config.commercialModel.customInputRateCadPerMillion,
      manualRateUnit: 'CAD/million tokens',
      ...modelManualProvenance,
    })
    addRateLine(lines, rateCard, {
      id: 'run-rag-agentic-planner-output',
      blockId: 'rag',
      label: 'Agentic retrieval planner output',
      detail: `${selectedModelLabel}; answer formulation`,
      tier: 'run',
      rateKey: config.commercialModel.outputRateKey,
      quantity: config.rag.agenticRetrieval.plannerOutputTokensPerMonth / TOKENS_PER_MILLION,
      quantityUnit: 'million tokens',
      formula: 'planner output tokens / 1,000,000',
      assumption: 'Answer-synthesis model usage is billed separately from Search retrieval tokens.',
      manualRate: config.commercialModel.customOutputRateCadPerMillion,
      manualRateUnit: 'CAD/million tokens',
      ...modelManualProvenance,
    })
  }
  if (config.rag.imageExtraction.enabled) {
    addRateLine(lines, rateCard, {
      id: 'platform-rag-image-extraction',
      blockId: 'rag',
      label: 'Search image extraction',
      detail: `${config.rag.imageExtraction.imagesPerMonth} images extracted during indexing`,
      tier: 'platform',
      rateKey: 'rag.search.imageExtraction.images1k',
      quantity: config.rag.imageExtraction.imagesPerMonth / 1_000,
      quantityUnit: 'thousand images',
      formula: 'images extracted / 1,000',
      assumption: 'Text extraction is included; image extraction is a separately billed enrichment feature.',
    })
  }
  if (config.rag.customEntity.enabled) {
    addRateLine(lines, rateCard, {
      id: 'platform-rag-custom-entity',
      blockId: 'rag',
      label: 'Search Custom Entity Lookup skill',
      detail: `${config.rag.customEntity.textRecordsPerMonth} text records enriched`,
      tier: 'platform',
      rateKey: 'rag.search.customEntity.records1k',
      quantity: config.rag.customEntity.textRecordsPerMonth / 1_000,
      quantityUnit: 'thousand text records',
      formula: 'text records / 1,000',
      assumption: 'Custom Entity Lookup is billed separately from Search Units.',
    })
  }
  if (config.rag.embeddings.enabled) {
    addRateLine(lines, rateCard, {
      id: 'run-rag-embeddings',
      blockId: 'rag',
      label: 'RAG embedding model usage',
      detail: `${config.rag.embeddings.inputTokensPerMonth} input tokens for indexing and query vectorization`,
      tier: 'run',
      rateKey: 'rag.embedding.inputTokens',
      quantity: config.rag.embeddings.inputTokensPerMonth / TOKENS_PER_MILLION,
      quantityUnit: 'million input tokens',
      formula: 'embedding input tokens / 1,000,000',
      assumption: 'Vectorizer calls are billed by the selected embedding-model provider, not by the Search Unit meter.',
      manualRate: config.rag.embeddings.customRateCadPerMillion,
      manualRateUnit: 'CAD/million input tokens',
      manualRateSource: 'Scenario input: embedding model rate',
    })
  }

  if (config.observability.enabled) {
    addRateLine(lines, rateCard, {
      id: 'platform-observability-ingestion',
      blockId: 'observability',
      label: 'Application Insights / Analytics Logs ingestion',
      detail: `${config.observability.analyticsIngestionGbPerMonth} GB billable ingestion`,
      tier: 'platform',
      rateKey: 'platform.observability.analyticsIngestionGb',
      quantity: config.observability.analyticsIngestionGbPerMonth,
      quantityUnit: 'GB',
      formula: 'billable analytics-log GB ingested',
      assumption: 'Enter billable volume after applicable free allowance, sampling, and commitment-tier effects.',
    })
    if (config.observability.billableRetentionGbMonth > 0) addRateLine(lines, rateCard, {
      id: 'platform-observability-retention', blockId: 'observability', label: 'Analytics Logs retention',
      detail: `${config.observability.billableRetentionGbMonth} GB-month beyond included retention`, tier: 'platform',
      rateKey: 'platform.observability.analyticsRetentionGbMonth', quantity: config.observability.billableRetentionGbMonth,
      quantityUnit: 'GB-month', formula: 'billable retained GB-month', assumption: 'Only retention beyond the included period is entered.',
    })
    if (config.observability.archiveGbMonth > 0) addRateLine(lines, rateCard, {
      id: 'platform-observability-archive', blockId: 'observability', label: 'Log data archive',
      detail: `${config.observability.archiveGbMonth} archived GB-month`, tier: 'platform',
      rateKey: 'platform.observability.archiveGbMonth', quantity: config.observability.archiveGbMonth,
      quantityUnit: 'GB-month', formula: 'archived GB-month', assumption: 'Archive storage is separate from analytics retention and restore/search charges.',
    })
    if (config.observability.dataExportGbPerMonth > 0) addRateLine(lines, rateCard, {
      id: 'platform-observability-export', blockId: 'observability', label: 'Log Analytics data export',
      detail: `${config.observability.dataExportGbPerMonth} GB exported`, tier: 'platform',
      rateKey: 'platform.observability.exportGb', quantity: config.observability.dataExportGbPerMonth,
      quantityUnit: 'GB', formula: 'exported GB', assumption: 'Destination ingestion and network charges are not included in this line.',
    })
    if (config.observability.logAlerts15Minute > 0) addRateLine(lines, rateCard, {
      id: 'platform-observability-alerts', blockId: 'observability', label: '15-minute log alert rules',
      detail: `${config.observability.logAlerts15Minute} monitored log alerts`, tier: 'platform',
      rateKey: 'platform.observability.logAlert15MinMonth', quantity: config.observability.logAlerts15Minute,
      quantityUnit: 'alert-months', formula: '15-minute log alerts per month', assumption: 'Notification-channel charges, if any, are separate.',
    })
  }

  if (config.networking.privateLinkData.enabled) {
    addRateLine(lines, rateCard, {
      id: 'platform-private-link-ingress', blockId: 'networking', label: 'Private Link data processing - ingress',
      detail: `${config.networking.privateLinkData.ingressGbPerMonth} GB`, tier: 'platform',
      rateKey: 'platform.privateEndpoint.ingressGb', quantity: config.networking.privateLinkData.ingressGbPerMonth,
      quantityUnit: 'GB', formula: 'Private Link ingress GB', assumption: 'Endpoint-hours are priced separately under fixed infrastructure.',
    })
    addRateLine(lines, rateCard, {
      id: 'platform-private-link-egress', blockId: 'networking', label: 'Private Link data processing - egress',
      detail: `${config.networking.privateLinkData.egressGbPerMonth} GB`, tier: 'platform',
      rateKey: 'platform.privateEndpoint.egressGb', quantity: config.networking.privateLinkData.egressGbPerMonth,
      quantityUnit: 'GB', formula: 'Private Link egress GB', assumption: 'Internet and inter-region egress are separate meters.',
    })
  }
  if (config.networking.natGateway.enabled) {
    addRateLine(lines, rateCard, {
      id: 'platform-nat-gateway-hours', blockId: 'networking', label: 'NAT Gateway',
      detail: `${config.networking.natGateway.gateways} gateway(s)`, tier: 'platform',
      rateKey: 'platform.natGateway.gatewayHour', quantity: config.networking.natGateway.gateways * HOURS_PER_MONTH,
      quantityUnit: 'gateway-hours', formula: `gateways x ${HOURS_PER_MONTH} hours`, assumption: 'Public IP and internet egress charges are separate.',
    })
    addRateLine(lines, rateCard, {
      id: 'platform-nat-gateway-data', blockId: 'networking', label: 'NAT Gateway data processing',
      detail: `${config.networking.natGateway.processedGbPerMonth} GB`, tier: 'platform',
      rateKey: 'platform.natGateway.dataGb', quantity: config.networking.natGateway.processedGbPerMonth,
      quantityUnit: 'GB', formula: 'NAT-processed GB', assumption: 'Internet egress is still charged separately.',
    })
  }
  if (config.networking.firewallBasic.enabled) {
    addRateLine(lines, rateCard, {
      id: 'platform-firewall-basic-hours', blockId: 'networking', label: 'Azure Firewall Basic',
      detail: `${config.networking.firewallBasic.deployments} deployment(s)`, tier: 'platform',
      rateKey: 'platform.firewall.basic.hour', quantity: config.networking.firewallBasic.deployments * HOURS_PER_MONTH,
      quantityUnit: 'deployment-hours', formula: `deployments x ${HOURS_PER_MONTH} hours`, assumption: 'Firewall Manager, public IP, and other network services are separate.',
    })
    addRateLine(lines, rateCard, {
      id: 'platform-firewall-basic-data', blockId: 'networking', label: 'Azure Firewall Basic data processing',
      detail: `${config.networking.firewallBasic.processedGbPerMonth} GB`, tier: 'platform',
      rateKey: 'platform.firewall.basic.dataGb', quantity: config.networking.firewallBasic.processedGbPerMonth,
      quantityUnit: 'GB', formula: 'firewall-processed GB', assumption: 'This block models Basic; select another tier through a future explicit SKU profile.',
    })
  }

  if (config.disasterRecovery.enabled) {
    const dr = config.disasterRecovery
    if (dr.secondaryPtuUnits > 0) addRateLine(lines, rateCard, {
      id: 'platform-dr-ptu', blockId: 'disasterRecovery', label: 'DR model provisioned capacity',
      detail: `${dr.secondaryPtuUnits} secondary PTUs`, tier: 'platform', rateKey: config.commercialModel.ptuHourlyRateKey,
      quantity: dr.secondaryPtuUnits * HOURS_PER_MONTH, quantityUnit: 'PTU-hours', formula: `secondary PTUs x ${HOURS_PER_MONTH} hours`,
      assumption: 'Warm provisioned model capacity is billed continuously; verify model minimums and regional availability.',
      manualRate: config.commercialModel.customPtuHourlyRateCad, manualRateUnit: 'CAD/PTU-hour', manualRateSource: 'Scenario input: DR PTU rate',
    })
    if (dr.secondaryApiManagementUnits > 0) addRateLine(lines, rateCard, {
      id: 'platform-dr-apim', blockId: 'disasterRecovery', label: 'DR API Management', detail: `${dr.secondaryApiManagementUnits} secondary unit(s)`,
      tier: 'platform', rateKey: config.platform.apiManagement.rateKey, quantity: dr.secondaryApiManagementUnits * HOURS_PER_MONTH,
      quantityUnit: 'unit-hours', formula: `secondary units x ${HOURS_PER_MONTH} hours`, assumption: 'Secondary APIM capacity is explicit and not inferred from the primary environment.',
    })
    if (dr.secondarySearchUnits > 0) addRateLine(lines, rateCard, {
      id: 'platform-dr-search', blockId: 'disasterRecovery', label: 'DR Azure AI Search', detail: `${dr.secondarySearchUnits} secondary search unit(s)`,
      tier: 'platform', rateKey: config.platform.knowledgeSearch.rateKey, quantity: dr.secondarySearchUnits * HOURS_PER_MONTH,
      quantityUnit: 'unit-hours', formula: `secondary search units x ${HOURS_PER_MONTH} hours`, assumption: 'Search indexes are not automatically replicated across services; ingestion costs are separate.',
    })
    if (dr.secondaryCosmosRuPerSecond > 0) addRateLine(lines, rateCard, {
      id: 'platform-dr-cosmos', blockId: 'disasterRecovery', label: 'DR Cosmos DB throughput', detail: `${dr.secondaryCosmosRuPerSecond} secondary RU/s`,
      tier: 'platform', rateKey: config.platform.standardAgentSetup.cosmos.provisionedThroughputRateKey,
      quantity: (dr.secondaryCosmosRuPerSecond / 100) * HOURS_PER_MONTH, quantityUnit: '100 RU/s-hours',
      formula: `secondary RU/s / 100 x ${HOURS_PER_MONTH} hours`, assumption: 'Multi-region write and consistency premiums require the exact deployed Cosmos topology.',
    })
    if (dr.secondaryBlobStorageGb > 0) addRateLine(lines, rateCard, {
      id: 'platform-dr-blob', blockId: 'disasterRecovery', label: 'DR Blob capacity', detail: `${dr.secondaryBlobStorageGb} secondary GB`,
      tier: 'platform', rateKey: config.region === 'canadaeast' ? 'platform.agentStorage.hotLrsGbMonth' : 'platform.agentStorage.hotZrsGbMonth',
      quantity: dr.secondaryBlobStorageGb, quantityUnit: 'GB-month', formula: 'secondary stored GB',
      assumption: 'This is explicit secondary capacity; GRS/GZRS replication should use its exact storage SKU instead.',
    })
    if (dr.secondaryPrivateEndpoints > 0) addRateLine(lines, rateCard, {
      id: 'platform-dr-private-endpoints', blockId: 'disasterRecovery', label: 'DR private endpoints', detail: `${dr.secondaryPrivateEndpoints} secondary endpoints`,
      tier: 'platform', rateKey: 'platform.privateEndpoint.endpointHour', quantity: dr.secondaryPrivateEndpoints * HOURS_PER_MONTH,
      quantityUnit: 'endpoint-hours', formula: `secondary endpoints x ${HOURS_PER_MONTH} hours`, assumption: 'Private Link data processing is configured separately.',
    })
    if (dr.secondaryAppInstances > 0) addRateLine(lines, rateCard, {
      id: 'platform-dr-app-compute', blockId: 'disasterRecovery', label: 'DR application compute', detail: `${dr.secondaryAppInstances} secondary instance(s)`,
      tier: 'platform', rateKey: 'platform.dr.compute.instanceHour', quantity: dr.secondaryAppInstances * HOURS_PER_MONTH,
      quantityUnit: 'instance-hours', formula: `secondary instances x ${HOURS_PER_MONTH} hours`, assumption: 'Select the exact secondary hosting SKU before approval.',
      manualRate: dr.customAppComputeHourlyRateCad, manualRateUnit: 'CAD/instance-hour', manualRateSource: 'Scenario input: DR compute SKU rate',
    })
    if (dr.interRegionTransferGbPerMonth > 0) addRateLine(lines, rateCard, {
      id: 'platform-dr-transfer', blockId: 'disasterRecovery', label: 'Inter-region replication traffic', detail: `${dr.interRegionTransferGbPerMonth} GB per month`,
      tier: 'platform', rateKey: 'platform.dr.interRegionTransferGb', quantity: dr.interRegionTransferGbPerMonth,
      quantityUnit: 'GB', formula: 'inter-region replicated GB', assumption: 'The exact rate depends on source/destination region pair and transfer direction.',
      manualRate: dr.customInterRegionRateCadPerGb, manualRateUnit: 'CAD/GB', manualRateSource: 'Scenario input: inter-region transfer rate',
    })
  }

  if (config.change.evaluation.enabled) {
    addRateLine(lines, rateCard, {
      id: 'change-evaluation',
      blockId: 'evaluation',
      label: 'Automated evaluation',
      detail: `${config.change.evaluation.runsPerMonth} evaluation runs`,
      tier: 'change',
      rateKey: config.change.evaluation.rateKey,
      quantity: config.change.evaluation.runsPerMonth / 1_000,
      quantityUnit: 'thousand runs',
      formula: 'evaluation runs / 1,000',
      assumption: 'Evaluation volume is entered explicitly for the month.',
    })
  }
  if (config.change.revalidation.enabled) {
    addRateLine(lines, rateCard, {
      id: 'change-revalidation',
      blockId: 'revalidation',
      label: 'Security re-validation',
      detail: `${config.change.revalidation.hoursPerMonth} specialist hours`,
      tier: 'change',
      rateKey: config.change.revalidation.rateKey,
      quantity: config.change.revalidation.hoursPerMonth,
      quantityUnit: 'hours',
      formula: 'specialist hours per month',
      assumption: 'Labour rate is a manually reviewed planning input.',
    })
  }
  if (config.change.finOps.enabled) {
    addRateLine(lines, rateCard, {
      id: 'change-finops',
      blockId: 'finOps',
      label: 'FinOps operations',
      detail: `${config.change.finOps.hoursPerMonth} analyst hours`,
      tier: 'change',
      rateKey: config.change.finOps.rateKey,
      quantity: config.change.finOps.hoursPerMonth,
      quantityUnit: 'hours',
      formula: 'analyst hours per month',
      assumption: 'Labour rate is a manually reviewed planning input.',
    })
  }
  if (config.change.support.enabled) {
    addRateLine(lines, rateCard, {
      id: 'change-support',
      blockId: 'support',
      label: 'Support allocation',
      detail: `${config.change.support.plans} support plan allocation(s)`,
      tier: 'change',
      rateKey: config.change.support.rateKey,
      quantity: config.change.support.plans,
      quantityUnit: 'plan-months',
      formula: 'monthly support plan allocations',
      assumption: 'Support is an explicit fixed allocation, not a hidden percentage.',
    })
  }

  const grossKnownSubtotal = lines.reduce((sum, line) => sum + (line.amount ?? 0), 0)
  const offsetPercent = clamp(config.commercialOffsetPercent, 0, 100)
  if (offsetPercent > 0) {
    lines.push({
      id: 'change-commercial-offset',
      blockId: 'commercialOffset',
      label: 'Commercial offset',
      detail: `${offsetPercent}% scenario-level adjustment`,
      tier: 'change',
      amount: -(grossKnownSubtotal * offsetPercent) / 100,
      quantity: offsetPercent,
      quantityUnit: 'percent',
      unitRate: grossKnownSubtotal / 100,
      rateUnit: 'CAD per percentage point',
      formula: 'known gross subtotal x offset percentage',
      assumption: 'User-entered commercial assumption; not an Azure list-price rate.',
      scale: 1,
      provenance: {
        source: 'Scenario input: commercial offset',
        sourceUrl: '',
        asOf: rateCard.asOf,
        maintenance: 'manual',
      },
    })
  }

  const tiers = createTierTotals(lines)
  const knownGrandTotal = COST_TIERS.reduce(
    (sum, tier) => sum + tiers[tier].knownSubtotal,
    0,
  )
  const missingRateKeys = [
    ...new Set(
      lines
        .filter((line) => line.amount === null && line.rateKey)
        .map((line) => line.rateKey as string),
    ),
  ]
  const dailyBurn = knownGrandTotal / DAYS_PER_PROJECTION
  const projection = Array.from({ length: DAYS_PER_PROJECTION }, (_, index) => ({
    day: index + 1,
    cumulative: dailyBurn * (index + 1),
  }))

  const inputRate =
    rateCard.rates[config.commercialModel.inputRateKey]?.value ??
    config.commercialModel.customInputRateCadPerMillion
  const cachedInputRate =
    rateCard.rates[config.commercialModel.cachedInputRateKey]?.value ??
    config.commercialModel.customCachedInputRateCadPerMillion
  const outputRate =
    rateCard.rates[config.commercialModel.outputRateKey]?.value ??
    config.commercialModel.customOutputRateCadPerMillion
  const ptuRate =
    rateCard.rates[config.commercialModel.ptuHourlyRateKey]?.value ??
    config.commercialModel.customPtuHourlyRateCad
  const totalPrimaryTokens = primaryInputTokens + primaryOutputTokens
  const cachedInputShare = clamp(config.commercialModel.cachedInputPercent, 0, 100) / 100
  const effectiveInputRate = inputRate === null
    ? null
    : cachedInputShare > 0
      ? cachedInputRate === null
        ? null
        : inputRate * (1 - cachedInputShare) + cachedInputRate * cachedInputShare
      : inputRate
  const blendedPaygRate =
    effectiveInputRate === null || outputRate === null || totalPrimaryTokens === 0
      ? null
      : (primaryInputTokens / totalPrimaryTokens) * effectiveInputRate +
        (primaryOutputTokens / totalPrimaryTokens) * outputRate
  const ptuMonthlyCost =
    ptuRate === null
      ? null
      : ptuRate * nonNegative(config.commercialModel.ptuUnits) * HOURS_PER_MONTH
  const tokensPerMonth =
    config.commercialModel.billingBasis !== 'tokens' ||
    blendedPaygRate === null || blendedPaygRate <= 0 || ptuMonthlyCost === null
      ? null
      : (ptuMonthlyCost / blendedPaygRate) * TOKENS_PER_MILLION
  const capacityTokensPerMonth =
    config.commercialModel.ptuCapacityTokensPerUnitMonth === null
      ? null
      : nonNegative(config.commercialModel.ptuUnits) *
        nonNegative(config.commercialModel.ptuCapacityTokensPerUnitMonth)

  return {
    lines,
    tiers,
    knownGrandTotal,
    complete: lines.every((line) => line.amount !== null),
    missingRateKeys,
    dailyBurn,
    projection,
    metrics: {
      monthlyTurns,
      primaryInputTokens,
      primaryOutputTokens,
      mcpSchemaTokens,
      fixedEnvironmentScale,
      resilienceScale,
    },
    breakeven: {
      tokensPerMonth,
      capacityTokensPerMonth,
      feasibleWithinCapacity:
        tokensPerMonth === null || capacityTokensPerMonth === null
          ? null
          : tokensPerMonth <= capacityTokensPerMonth,
    },
  }
}