import type { Rate, RateCard, RegionId } from './contracts.js'

const AS_OF = '2026-08-20'
const SOURCE_URL = 'https://prices.azure.com/api/retail/prices'

const synced = (
  value: number,
  unit: string,
  meter: string,
  sourceRegion = 'Canada Central',
  tierMinimumUnits?: number,
): Rate => ({
  value,
  unit,
  currency: 'CAD',
  source: `Azure Retail Prices API - ${meter} - ${sourceRegion}`,
  sourceUrl: SOURCE_URL,
  asOf: AS_OF,
  maintenance: 'synced',
  ...(tierMinimumUnits !== undefined ? { tierMinimumUnits } : {}),
})

const manual = (label: string, reason: string): Rate => ({
  value: null,
  unit: 'unpriced',
  currency: 'CAD',
  source: `Manual review required - ${label}`,
  sourceUrl: '',
  asOf: AS_OF,
  maintenance: 'manual',
  lastReviewed: AS_OF,
  unavailableReason: reason,
})

export const fallbackRateCard: RateCard = {
  asOf: AS_OF,
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
    'change.support.month'
  ],
  rates: {
    'model.primary.input': synced(3.5, 'CAD/million tokens', 'gpt 4o 1120 Inp glbl Tokens'),
    'model.primary.cachedInput': synced(1.8, 'CAD/million tokens', 'gpt 4o 1120 cached Inp glbl Tokens'),
    'model.primary.output': synced(14.1, 'CAD/million tokens', 'gpt 4o 1120 Outp glbl Tokens'),
    'model.primary.batchInput': synced(1.8, 'CAD/million tokens', 'gpt 4o 1120 Batch Inp glbl Tokens'),
    'model.primary.batchOutput': synced(7, 'CAD/million tokens', 'gpt 4o 1120 Batch Outp glbl Tokens'),
    'model.primary.ptuHour': synced(1.409, 'CAD/PTU-hour', 'Provisioned Managed Global Unit'),
    'agent.hosted.vcpuHour': synced(0.1541, 'CAD/vCPU-hour', 'Foundry Agents Hosted vCPU Usage'),
    'agent.hosted.memoryGiBHour': synced(0.0183, 'CAD/GiB-hour', 'Foundry Agents Hosted Memory Usage'),
    'agent.tool.codeInterpreter.global.session': synced(0.0423, 'CAD/session', 'Azure OpenAI Code-Interpreter-global Session'),
    'agent.tool.codeInterpreter.regional.session': synced(0.0511, 'CAD/session', 'Azure OpenAI Code-Interpreter-regnl EP Session'),
    'agent.tool.fileSearch.global.gbDay': synced(0.1409, 'CAD/GB-day', 'Azure OpenAI Assistants-File Search-glbl GB'),
    'agent.tool.fileSearch.regional.gbDay': synced(0.1705, 'CAD/GB-day', 'Azure OpenAI Assistants-File Search-regnl GB'),
    'agent.skills.execution.hour': synced(0.0511, 'CAD/hour', 'Foundry Agents Skills Execution Container'),
    'guardrail.sentinel.gb': synced(7.2707, 'CAD/GB', 'Sentinel Pay-as-you-go Analysis'),
    'guardrail.contentSafety.text1k': synced(
      0.5284,
      'CAD/thousand text records',
      'Content Safety Standard Text Records',
      'Canada East',
    ),
    'platform.apim.unitHour': synced(0.2895, 'CAD/unit-hour', 'API Management Basic v2 Unit'),
    'platform.privateEndpoint.endpointHour': synced(0.0141, 'CAD/endpoint-hour', 'Virtual Network Private Link Standard Private Endpoint', 'Global'),
    'platform.privateEndpoint.ingressGb': synced(0.0141, 'CAD/GB', 'Virtual Network Private Link Standard Data Processed - Ingress', 'Global'),
    'platform.privateEndpoint.egressGb': synced(0.0141, 'CAD/GB', 'Virtual Network Private Link Standard Data Processed - Egress', 'Global'),
    'platform.natGateway.gatewayHour': synced(0.0634, 'CAD/hour', 'NAT Gateway Standard Gateway', 'Global'),
    'platform.natGateway.dataGb': synced(0.0634, 'CAD/GB', 'NAT Gateway Standard Data Processed', 'Global'),
    'platform.firewall.basic.hour': synced(0.5566, 'CAD/hour', 'Azure Firewall Basic Deployment'),
    'platform.firewall.basic.dataGb': synced(0.0916, 'CAD/GB', 'Azure Firewall Basic Data Processed'),
    'platform.dr.interRegionTransferGb': synced(0.0493, 'CAD/GB', 'Global Virtual Network Peering Inter-Region Egress'),
    'platform.observability.analyticsIngestionGb': synced(3.889, 'CAD/GB', 'Log Analytics Analytics Logs Data Ingestion'),
    'platform.observability.analyticsRetentionGbMonth': synced(0.1691, 'CAD/GB-month', 'Log Analytics Analytics Logs Data Retention'),
    'platform.observability.archiveGbMonth': synced(0.0338, 'CAD/GB-month', 'Azure Monitor Data Archive'),
    'platform.observability.exportGb': synced(0.1691, 'CAD/GB', 'Azure Monitor Log Analytics data export Data Exported'),
    'platform.observability.logAlert15MinMonth': synced(0.7045, 'CAD/alert-month', 'Azure Monitor Alerts System Log Monitored at 15 Minute Frequency'),
    'platform.search.unitHour': synced(0.5208, 'CAD/unit-hour', 'Azure AI Search Standard S1 CC Unit'),
    'rag.search.semanticRanker.queries1k': synced(1.409, 'CAD/thousand queries', 'Azure AI Search Semantic Ranker queries'),
    'rag.search.agentic.low.tokens1k': synced(0, 'CAD/thousand tokens', 'Azure AI Search Agentic Retrieval Low Reasoning Tokens'),
    'rag.search.agentic.minimum.tokens1k': synced(0, 'CAD/thousand tokens', 'Azure AI Search Agentic Retrieval Minimum Reasoning Tokens'),
    'rag.search.imageExtraction.images1k': synced(1.409, 'CAD/thousand images', 'Azure AI Search Document Cracking Image Extraction'),
    'rag.search.customEntity.records1k': synced(0.3523, 'CAD/thousand text records', 'Azure AI Search Custom Entity Skills Text Records'),
    'platform.cosmos.provisioned100RuHour': synced(0.0124, 'CAD/100 RU/s-hour', 'Azure Cosmos DB RUs 100 RU/s'),
    'platform.cosmos.serverlessMillionRu': synced(0.3875, 'CAD/million request units', 'Azure Cosmos DB serverless 1M RUs'),
    'platform.cosmos.storageGbMonth': synced(0.3875, 'CAD/GB-month', 'Azure Cosmos DB RUs Data Stored'),
    'platform.agentStorage.hotZrsGbMonth': synced(0.0352, 'CAD/GB-month', 'General Block Blob v2 Hot ZRS Data Stored'),
    'platform.agentStorage.hotZrsWrite10k': synced(0.0969, 'CAD/10K operations', 'General Block Blob v2 Hot ZRS Write Operations'),
    'platform.agentStorage.hotZrsRead10k': synced(0.0062, 'CAD/10K operations', 'General Block Blob v2 Hot ZRS Read Operations'),
    'platform.agentStorage.hotZrsOther10k': synced(0.0062, 'CAD/10K operations', 'General Block Blob v2 Hot ZRS All Other Operations'),
    'platform.agentStorage.hotLrsGbMonth': manual('Hot LRS Blob capacity', 'The first successful regional Retail Prices API synchronization is required.'),
    'platform.agentStorage.hotLrsWrite10k': manual('Hot LRS Blob writes', 'The first successful regional Retail Prices API synchronization is required.'),
    'platform.agentStorage.hotLrsRead10k': manual('Hot LRS Blob reads', 'The first successful regional Retail Prices API synchronization is required.'),
    'platform.agentStorage.hotLrsOther10k': manual('Hot LRS Blob other operations', 'The first successful regional Retail Prices API synchronization is required.'),
    'platform.network.mgn.out.tier0': synced(0, 'CAD/GB', 'Rtn Preference: MGN Standard Data Transfer Out', 'Canada Central', 0),
    'platform.network.mgn.out.tier1': synced(0.1226, 'CAD/GB', 'Rtn Preference: MGN Standard Data Transfer Out', 'Canada Central', 100),
    'platform.network.mgn.out.tier2': synced(0.117, 'CAD/GB', 'Rtn Preference: MGN Standard Data Transfer Out', 'Canada Central', 10_335),
    'platform.network.mgn.out.tier3': synced(0.0986, 'CAD/GB', 'Rtn Preference: MGN Standard Data Transfer Out', 'Canada Central', 51_295),
    'platform.network.mgn.out.tier4': synced(0.0705, 'CAD/GB', 'Rtn Preference: MGN Standard Data Transfer Out', 'Canada Central', 153_695),
    'platform.network.mgn.out.tier5': synced(0.0705, 'CAD/GB', 'Rtn Preference: MGN Standard Data Transfer Out', 'Canada Central', 512_095),
    'service.speech.speechToText.audioHour': synced(1.409, 'CAD/audio hour', 'Azure Speech S1 Speech To Text'),
    'service.speech.textToSpeech.characters1m': synced(21.1357, 'CAD/million characters', 'Azure Speech S1 Neural Text To Speech Characters'),
    'service.speech.avatar.minute': synced(0.7045, 'CAD/minute', 'Azure Speech TTS Standard Avatar Realtime Speech'),
    'service.speech.translation.audioHour': synced(3.5226, 'CAD/audio hour', 'Azure Speech S1 Speech Translation'),
    'service.translator.text.characters1m': synced(14.0905, 'CAD/million characters', 'Translator Text S1 Characters'),
    'service.translator.document.characters1m': synced(21.1357, 'CAD/million characters', 'Translator Text S1 Document Characters'),
    'service.language.documentPii.pages1k': synced(14.0905, 'CAD/thousand pages', 'Azure Language Doc-PII Redaction Pages'),
    'service.contentUnderstanding.layout.pages1k': manual('Content Understanding Layout Analyzer', 'Base extraction and add-on layout are separate meters; select the analyzer composition.'),
    'service.contentUnderstanding.invoice.pages1k': manual('Content Understanding Invoice Analyzer', 'No single invoice meter represents extraction, contextualization, and field generation.'),
    'service.contentUnderstanding.callCenter.audioHour': manual('Content Understanding Call Center Analyzer', 'Audio extraction is only one component of the analyzer.'),
    'service.contentUnderstanding.taxUs.pages1k': manual('Content Understanding Tax Analyzer', 'No exact Tax Analyzer CAD meter was found.'),
    'service.contentUnderstanding.ocrRead.pages1k': manual('Content Understanding OCR Read Analyzer', 'The analyzer does not identify one exact document extraction SKU.'),
    'service.contentUnderstanding.documentFields.pages1k': manual('Content Understanding Document Fields Analyzer', 'Field extraction can combine extraction and contextualization meters.'),
    'service.speech.voiceLive.audioHour': manual('Azure Speech Voice Live', 'Voice Live bills multiple speech, model, audio, text, and optional image token meters.'),
    'service.language.detection.records1k': manual('Azure Language Detection', 'Only graduated generic Standard Text Records were found.'),
    'service.language.textPii.records1k': manual('Azure Language Text PII', 'No feature-specific flat Text PII meter was found.'),
    'service.language.health.records1k': manual('Azure Language Health', 'Health Text Records use a free allowance and graduated CAD tiers.'),
    'service.language.conversationPii.records1k': manual('Azure Language Conversational PII', 'No exact CAD meter was found for the configured unit.'),
    'compute.oss.gpuHour': manual('OSS GPU compute', 'Select an explicit VM SKU and GPU count.'),
    'guardrail.defender.transaction1k': manual('Defender for AI workloads', 'No defensible transaction meter was matched.'),
    'guardrail.entra.userMonth': manual('Microsoft Entra External ID overage', 'No native CAD meter was found above the first 50,000 free external MAU.'),
    'guardrail.purview.capacityHour': manual('Microsoft Purview', 'Select the applicable workload and capacity meter.'),
    'platform.compute.instanceHour': manual('Application compute', 'Select an explicit hosting SKU.'),
    'change.evaluation.run1k': manual('Evaluation operations', 'Supply an approved internal rate.'),
    'change.revalidation.hour': manual('Security re-validation', 'Supply an approved internal labour rate.'),
    'change.finops.hour': manual('FinOps operations', 'Supply an approved internal labour rate.'),
    'change.support.month': manual('Support allocation', 'Select the applicable support plan.')
  }
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
      asOf: AS_OF,
      maintenance: 'manual',
      lastReviewed: AS_OF,
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