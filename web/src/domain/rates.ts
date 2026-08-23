import { isRegionId, type Rate, type RateCard, type RegionId } from './types.js'

export const RETAIL_PRICES_URL = 'https://prices.azure.com/api/retail/prices'
const CARD_AS_OF = '2026-08-20'

const syncedRate = (
  value: number,
  unit: string,
  meter: string,
  effective: string,
  sourceRegion = 'Canada Central',
  tierMinimumUnits?: number,
): Rate => ({
  value,
  unit,
  currency: 'CAD',
  source: `Azure Retail Prices API - ${meter} - ${sourceRegion} - effective ${effective}`,
  sourceUrl: RETAIL_PRICES_URL,
  asOf: CARD_AS_OF,
  maintenance: 'synced',
  ...(tierMinimumUnits !== undefined ? { tierMinimumUnits } : {}),
})

const unavailableRate = (label: string, reason: string): Rate => ({
  value: null,
  unit: 'unpriced',
  currency: 'CAD',
  source: `Manual review required - ${label}`,
  sourceUrl: '',
  asOf: CARD_AS_OF,
  maintenance: 'manual',
  lastReviewed: CARD_AS_OF,
  unavailableReason: reason,
})

export const fallbackRateCard: RateCard = {
  asOf: CARD_AS_OF,
  region: 'canadacentral',
  syncStatus: 'partial',
  unmatchedKeys: [
    'compute.oss.gpuHour',
    'guardrail.defender.transaction1k',
    'guardrail.entra.userMonth',
    'guardrail.purview.capacityHour',
    'platform.compute.instanceHour',
    'platform.agentStorage.hotLrsGbMonth',
    'platform.agentStorage.hotLrsWrite10k',
    'platform.agentStorage.hotLrsRead10k',
    'platform.agentStorage.hotLrsOther10k',
    'service.contentUnderstanding.layout.pages1k',
    'service.contentUnderstanding.invoice.pages1k',
    'service.contentUnderstanding.callCenter.audioHour',
    'service.contentUnderstanding.taxUs.pages1k',
    'service.contentUnderstanding.ocrRead.pages1k',
    'service.contentUnderstanding.documentFields.pages1k',
    'service.speech.voiceLive.audioHour',
    'service.language.detection.records1k',
    'service.language.textPii.records1k',
    'service.language.health.records1k',
    'service.language.conversationPii.records1k',
    'change.evaluation.run1k',
    'change.revalidation.hour',
    'change.finops.hour',
    'change.support.month',
  ],
  rates: {
    'model.primary.input': syncedRate(
      3.5,
      'CAD/million tokens',
      'gpt 4o 1120 Inp glbl Tokens (0.0035 CAD/1K, normalized to 1M)',
      '2025-04-01',
    ),
    'model.primary.cachedInput': syncedRate(
      1.8,
      'CAD/million tokens',
      'gpt 4o 1120 cached Inp glbl Tokens (0.0018 CAD/1K, normalized to 1M)',
      '2025-04-01',
    ),
    'model.primary.output': syncedRate(
      14.1,
      'CAD/million tokens',
      'gpt 4o 1120 Outp glbl Tokens (0.0141 CAD/1K, normalized to 1M)',
      '2025-04-01',
    ),
    'model.primary.batchInput': syncedRate(
      1.8,
      'CAD/million tokens',
      'gpt 4o 1120 Batch Inp glbl Tokens (0.0018 CAD/1K, normalized to 1M)',
      '2025-04-01',
    ),
    'model.primary.batchOutput': syncedRate(
      7,
      'CAD/million tokens',
      'gpt 4o 1120 Batch Outp glbl Tokens (0.0070 CAD/1K, normalized to 1M)',
      '2025-04-01',
    ),
    'model.primary.ptuHour': syncedRate(
      1.409,
      'CAD/PTU-hour',
      'Provisioned Managed Global Unit',
      '2024-11-01',
    ),
    'agent.hosted.vcpuHour': syncedRate(
      0.1541,
      'CAD/vCPU-hour',
      'Foundry Agents Hosted vCPU Usage',
      '2026-05-01',
    ),
    'agent.hosted.memoryGiBHour': syncedRate(
      0.0183,
      'CAD/GiB-hour',
      'Foundry Agents Hosted Memory Usage',
      '2026-05-01',
    ),
    'agent.tool.codeInterpreter.global.session': syncedRate(0.0423, 'CAD/session', 'Code-Interpreter-global Session', '2024-06-01'),
    'agent.tool.codeInterpreter.regional.session': syncedRate(0.0511, 'CAD/session', 'Code-Interpreter-regnl EP Session', '2025-09-01'),
    'agent.tool.fileSearch.global.gbDay': syncedRate(0.1409, 'CAD/GB-day', 'Assistants-File Search-glbl GB', '2024-06-01'),
    'agent.tool.fileSearch.regional.gbDay': syncedRate(0.1705, 'CAD/GB-day', 'Assistants-File Search-regnl GB', '2025-09-01'),
    'agent.skills.execution.hour': syncedRate(0.0511, 'CAD/hour', 'Foundry Agents Skills Execution Container', '2026-04-01'),
    'guardrail.sentinel.gb': syncedRate(
      7.2707,
      'CAD/GB',
      'Sentinel Pay-as-you-go Analysis',
      '2023-07-01',
    ),
    'guardrail.contentSafety.text1k': syncedRate(
      0.5284,
      'CAD/thousand text records',
      'Content Safety Standard Text Records',
      '2025-09-01',
      'Canada East',
    ),
    'platform.apim.unitHour': syncedRate(
      0.2895,
      'CAD/unit-hour',
      'API Management Basic v2 Unit',
      '2024-03-01',
    ),
    'platform.privateEndpoint.endpointHour': syncedRate(
      0.0141,
      'CAD/endpoint-hour',
      'Virtual Network Private Link Standard Private Endpoint',
      '2020-02-01',
      'Global',
    ),
    'platform.privateEndpoint.ingressGb': syncedRate(0.0141, 'CAD/GB', 'Virtual Network Private Link Standard Data Processed - Ingress', '2021-11-01', 'Global'),
    'platform.privateEndpoint.egressGb': syncedRate(0.0141, 'CAD/GB', 'Virtual Network Private Link Standard Data Processed - Egress', '2021-11-01', 'Global'),
    'platform.natGateway.gatewayHour': syncedRate(0.0634, 'CAD/hour', 'NAT Gateway Standard Gateway', '2020-02-01', 'Global'),
    'platform.natGateway.dataGb': syncedRate(0.0634, 'CAD/GB', 'NAT Gateway Standard Data Processed', '2020-02-01', 'Global'),
    'platform.firewall.basic.hour': syncedRate(0.5566, 'CAD/hour', 'Azure Firewall Basic Deployment', '2023-03-01'),
    'platform.firewall.basic.dataGb': syncedRate(0.0916, 'CAD/GB', 'Azure Firewall Basic Data Processed', '2023-03-01'),
    'platform.dr.interRegionTransferGb': syncedRate(0.0493, 'CAD/GB', 'Global Virtual Network Peering Inter-Region Egress', '2018-06-01'),
    'platform.observability.analyticsIngestionGb': syncedRate(3.889, 'CAD/GB', 'Log Analytics Analytics Logs Data Ingestion', '2018-02-01'),
    'platform.observability.analyticsRetentionGbMonth': syncedRate(0.1691, 'CAD/GB-month', 'Log Analytics Analytics Logs Data Retention', '2018-02-01'),
    'platform.observability.archiveGbMonth': syncedRate(0.0338, 'CAD/GB-month', 'Azure Monitor Data Archive', '2022-10-01'),
    'platform.observability.exportGb': syncedRate(0.1691, 'CAD/GB', 'Azure Monitor Log Analytics data export Data Exported', '2022-10-01'),
    'platform.observability.logAlert15MinMonth': syncedRate(0.7045, 'CAD/alert-month', 'Azure Monitor Alerts System Log Monitored at 15 Minute Frequency', '2018-02-01'),
    'platform.search.unitHour': syncedRate(
      0.5208,
      'CAD/unit-hour',
      'Azure AI Search Standard S1 CC Unit',
      '2025-09-01',
    ),
    'rag.search.semanticRanker.queries1k': syncedRate(1.409, 'CAD/thousand queries', 'Azure AI Search Semantic Ranker queries', '2023-12-01'),
    'rag.search.agentic.low.tokens1k': syncedRate(0, 'CAD/thousand tokens', 'Azure AI Search Agentic Retrieval Low Reasoning Tokens', '2025-07-01'),
    'rag.search.agentic.minimum.tokens1k': syncedRate(0, 'CAD/thousand tokens', 'Azure AI Search Agentic Retrieval Minimum Reasoning Tokens', '2026-05-01'),
    'rag.search.imageExtraction.images1k': syncedRate(1.409, 'CAD/thousand images', 'Azure AI Search Document Cracking Image Extraction', '2019-07-01'),
    'rag.search.customEntity.records1k': syncedRate(0.3523, 'CAD/thousand text records', 'Azure AI Search Custom Entity Skills Text Records', '2021-05-01'),
    'platform.cosmos.provisioned100RuHour': syncedRate(
      0.0124,
      'CAD/100 RU/s-hour',
      'Azure Cosmos DB RUs 100 RU/s',
      '2020-01-01',
    ),
    'platform.cosmos.serverlessMillionRu': syncedRate(
      0.3875,
      'CAD/million request units',
      'Azure Cosmos DB serverless 1M RUs',
      '2021-07-01',
    ),
    'platform.cosmos.storageGbMonth': syncedRate(
      0.3875,
      'CAD/GB-month',
      'Azure Cosmos DB RUs Data Stored',
      '2020-01-01',
    ),
    'platform.agentStorage.hotZrsGbMonth': syncedRate(
      0.0352,
      'CAD/GB-month',
      'General Block Blob v2 Hot ZRS Data Stored',
      '2018-07-01',
    ),
    'platform.agentStorage.hotZrsWrite10k': syncedRate(
      0.0969,
      'CAD/10K operations',
      'General Block Blob v2 Hot ZRS Write Operations',
      '2020-01-01',
    ),
    'platform.agentStorage.hotZrsRead10k': syncedRate(
      0.0062,
      'CAD/10K operations',
      'General Block Blob v2 Hot ZRS Read Operations',
      '2020-01-01',
    ),
    'platform.agentStorage.hotZrsOther10k': syncedRate(
      0.0062,
      'CAD/10K operations',
      'General Block Blob v2 Hot ZRS All Other Operations',
      '2020-01-01',
    ),
    'platform.agentStorage.hotLrsGbMonth': unavailableRate(
      'Hot LRS Blob capacity',
      'The first successful regional Retail Prices API synchronization is required.',
    ),
    'platform.agentStorage.hotLrsWrite10k': unavailableRate(
      'Hot LRS Blob writes',
      'The first successful regional Retail Prices API synchronization is required.',
    ),
    'platform.agentStorage.hotLrsRead10k': unavailableRate(
      'Hot LRS Blob reads',
      'The first successful regional Retail Prices API synchronization is required.',
    ),
    'platform.agentStorage.hotLrsOther10k': unavailableRate(
      'Hot LRS Blob other operations',
      'The first successful regional Retail Prices API synchronization is required.',
    ),
    'platform.network.mgn.out.tier0': syncedRate(
      0,
      'CAD/GB',
      'Rtn Preference: MGN Standard Data Transfer Out',
      '2022-05-01',
      'Canada Central',
      0,
    ),
    'platform.network.mgn.out.tier1': syncedRate(
      0.1226,
      'CAD/GB',
      'Rtn Preference: MGN Standard Data Transfer Out',
      '2022-05-01',
      'Canada Central',
      100,
    ),
    'platform.network.mgn.out.tier2': syncedRate(
      0.117,
      'CAD/GB',
      'Rtn Preference: MGN Standard Data Transfer Out',
      '2022-05-01',
      'Canada Central',
      10_335,
    ),
    'platform.network.mgn.out.tier3': syncedRate(
      0.0986,
      'CAD/GB',
      'Rtn Preference: MGN Standard Data Transfer Out',
      '2022-05-01',
      'Canada Central',
      51_295,
    ),
    'platform.network.mgn.out.tier4': syncedRate(
      0.0705,
      'CAD/GB',
      'Rtn Preference: MGN Standard Data Transfer Out',
      '2022-05-01',
      'Canada Central',
      153_695,
    ),
    'platform.network.mgn.out.tier5': syncedRate(
      0.0705,
      'CAD/GB',
      'Rtn Preference: MGN Standard Data Transfer Out',
      '2022-05-01',
      'Canada Central',
      512_095,
    ),
    'service.speech.speechToText.audioHour': syncedRate(
      1.409,
      'CAD/audio hour',
      'Azure Speech S1 Speech To Text',
      '2018-11-01',
    ),
    'service.speech.textToSpeech.characters1m': syncedRate(
      21.1357,
      'CAD/million characters',
      'Azure Speech S1 Neural Text To Speech Characters',
      '2024-02-01',
    ),
    'service.speech.avatar.minute': syncedRate(
      0.7045,
      'CAD/minute',
      'Azure Speech TTS Standard Avatar Realtime Speech',
      '2026-01-01',
    ),
    'service.speech.translation.audioHour': syncedRate(
      3.5226,
      'CAD/audio hour',
      'Azure Speech S1 Speech Translation',
      '2018-11-01',
    ),
    'service.translator.text.characters1m': syncedRate(
      14.0905,
      'CAD/million characters',
      'Translator Text S1 Characters',
      '2025-05-01',
    ),
    'service.translator.document.characters1m': syncedRate(
      21.1357,
      'CAD/million characters',
      'Translator Text S1 Document Characters',
      '2025-05-01',
    ),
    'service.language.documentPii.pages1k': syncedRate(
      14.0905,
      'CAD/thousand pages',
      'Azure Language Doc-PII Redaction Pages',
      '2026-07-01',
    ),
    'service.contentUnderstanding.layout.pages1k': unavailableRate(
      'Content Understanding Layout Analyzer',
      'The Retail API exposes base document extraction and add-on layout meters; select the analyzer composition before pricing.',
    ),
    'service.contentUnderstanding.invoice.pages1k': unavailableRate(
      'Content Understanding Invoice Analyzer',
      'Invoice analysis can combine extraction, contextualization, and field-generation meters; no single invoice meter was found.',
    ),
    'service.contentUnderstanding.callCenter.audioHour': unavailableRate(
      'Content Understanding Call Center Analyzer',
      'Audio extraction is only one component of this analyzer; select all enabled processing meters before pricing.',
    ),
    'service.contentUnderstanding.taxUs.pages1k': unavailableRate(
      'Content Understanding Tax Analyzer',
      'No exact Tax Analyzer CAD meter was found; generic document extraction would understate the analyzer composition.',
    ),
    'service.contentUnderstanding.ocrRead.pages1k': unavailableRate(
      'Content Understanding OCR Read Analyzer',
      'Several document extraction levels exist and the curated analyzer does not identify one exact SKU.',
    ),
    'service.contentUnderstanding.documentFields.pages1k': unavailableRate(
      'Content Understanding Document Fields Analyzer',
      'Field extraction can combine document extraction and contextualization meters; choose the deployed analyzer composition.',
    ),
    'service.speech.voiceLive.audioHour': unavailableRate(
      'Azure Speech Voice Live',
      'Voice Live bills separate speech, model, audio, text, and optional image token meters; a single audio-hour rate is not defensible.',
    ),
    'service.language.detection.records1k': unavailableRate(
      'Azure Language Detection',
      'The Retail API exposes graduated generic Standard Text Records rather than a feature-specific flat meter.',
    ),
    'service.language.textPii.records1k': unavailableRate(
      'Azure Language Text PII',
      'No feature-specific Text PII meter was found; applying generic graduated Text Records as one flat rate would be misleading.',
    ),
    'service.language.health.records1k': unavailableRate(
      'Azure Language Health',
      'Health Text Records include a free allowance and graduated CAD tiers that require tier-aware quantity modeling.',
    ),
    'service.language.conversationPii.records1k': unavailableRate(
      'Azure Language Conversational PII',
      'No exact Conversational PII CAD meter was found for the configured text-record unit.',
    ),
    'compute.oss.gpuHour': unavailableRate(
      'OSS GPU compute',
      'A VM meter cannot be converted to a GPU-hour without an explicit VM SKU and GPU count.',
    ),
    'guardrail.defender.transaction1k': unavailableRate(
      'Defender for AI workloads',
      'No defensible transaction meter was matched.',
    ),
    'guardrail.entra.userMonth': unavailableRate(
      'Microsoft Entra External ID overage',
      'No native CAD Retail Prices API meter was found above the first 50,000 free external MAU; use an exact tenant offer.',
    ),
    'guardrail.purview.capacityHour': unavailableRate(
      'Microsoft Purview',
      'The applicable Purview workload and capacity meter must be selected explicitly.',
    ),
    'platform.compute.instanceHour': unavailableRate(
      'Application compute',
      'Select an explicit hosting SKU before pricing application compute.',
    ),
    'change.evaluation.run1k': unavailableRate(
      'Evaluation operations',
      'Supply an approved internal evaluation rate.',
    ),
    'change.revalidation.hour': unavailableRate(
      'Security re-validation',
      'Supply an approved internal labour rate.',
    ),
    'change.finops.hour': unavailableRate(
      'FinOps operations',
      'Supply an approved internal labour rate.',
    ),
    'change.support.month': unavailableRate(
      'Support allocation',
      'Select the applicable support plan rather than applying a hidden percentage.',
    ),
  },
}

export function fallbackRateCardFor(region: RegionId): RateCard {
  const card = structuredClone(fallbackRateCard)
  if (region === 'canadacentral') return card

  card.region = region
  for (const [key, rate] of Object.entries(card.rates)) {
    if (rate.maintenance !== 'synced') continue
    if (
      (region === 'canadaeast' && key === 'guardrail.contentSafety.text1k') ||
      key === 'platform.privateEndpoint.endpointHour'
    ) continue
    card.rates[key] = {
      value: null,
      unit: 'unpriced',
      currency: 'CAD',
      source: `Built-in ${region} card unavailable - first successful sync required`,
      sourceUrl: '',
      asOf: CARD_AS_OF,
      maintenance: 'manual',
      lastReviewed: CARD_AS_OF,
      unavailableReason: 'No dated last-good card is bundled for this region.',
    }
  }
  card.syncStatus = 'partial'
  card.unmatchedKeys = Object.entries(card.rates)
    .filter(([, rate]) => rate.value === null)
    .map(([key]) => key)
    .sort()
  return card
}

export type FreshnessLevel = 'fresh' | 'aging' | 'stale'

export function getRateCardFreshness(rateCard: RateCard, now: Date): FreshnessLevel {
  if (rateCard.syncStatus === 'failed') return 'stale'
  const synchronizedAt = rateCard.generatedAt ?? `${rateCard.asOf}T00:00:00Z`
  const ageHours = (now.getTime() - new Date(synchronizedAt).getTime()) / 3_600_000
  if (ageHours <= 24) return 'fresh'
  if (ageHours <= 24 * 7) return 'aging'
  return 'stale'
}

export interface RateDiff {
  key: string
  previousValue: number | null
  currentValue: number | null
  unit: string
}

export function diffRateCards(previous: RateCard, current: RateCard): RateDiff[] {
  const keys = new Set([...Object.keys(previous.rates), ...Object.keys(current.rates)])
  return [...keys]
    .filter((key) => previous.rates[key]?.value !== current.rates[key]?.value)
    .sort()
    .map((key) => ({
      key,
      previousValue: previous.rates[key]?.value ?? null,
      currentValue: current.rates[key]?.value ?? null,
      unit: current.rates[key]?.unit ?? previous.rates[key]?.unit ?? 'unknown',
    }))
}

export function validateRateCard(value: unknown): RateCard {
  if (!value || typeof value !== 'object') throw new Error('Rate card must be an object.')
  const candidate = value as Partial<RateCard>
  if (typeof candidate.asOf !== 'string' || !candidate.asOf) throw new Error('Rate card asOf is required.')
  if (!candidate.region || !isRegionId(candidate.region)) {
    throw new Error('Rate card region is invalid.')
  }
  if (!candidate.rates || typeof candidate.rates !== 'object') throw new Error('Rate card rates are required.')

  for (const [key, entry] of Object.entries(candidate.rates)) {
    if (!entry || typeof entry !== 'object') throw new Error(`Rate ${key} must be an object.`)
    if (typeof entry.source !== 'string' || !entry.source) throw new Error(`Rate ${key} source is required.`)
    if (typeof entry.asOf !== 'string' || !entry.asOf) throw new Error(`Rate ${key} asOf is required.`)
    if (typeof entry.unit !== 'string' || !entry.unit) throw new Error(`Rate ${key} unit is required.`)
    if (entry.currency !== 'CAD') throw new Error(`Rate ${key} currency must be CAD.`)
    if (entry.value !== null && (typeof entry.value !== 'number' || !Number.isFinite(entry.value))) {
      throw new Error(`Rate ${key} value must be finite or null.`)
    }
    if (entry.tierMinimumUnits !== undefined && (
      typeof entry.tierMinimumUnits !== 'number' ||
      !Number.isFinite(entry.tierMinimumUnits) ||
      entry.tierMinimumUnits < 0
    )) {
      throw new Error(`Rate ${key} tierMinimumUnits must be a non-negative finite number.`)
    }
  }

  return candidate as RateCard
}