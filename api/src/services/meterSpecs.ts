import type { RegionId } from '../contracts.js'
import type { RetailPriceItem } from './retailPricesClient.js'

export interface NormalizedMeter {
  value: number
  unit: string
}

export interface MeterSpec {
  key: string
  filter: (region: RegionId) => string
  matches: (item: RetailPriceItem) => boolean
  normalize: (item: RetailPriceItem) => NormalizedMeter | null
}

const regionAndProduct = (region: string, product: string) =>
  `armRegionName eq '${region}' and productName eq '${product}'`

const exactMeter = (name: string) => (item: RetailPriceItem) =>
  item.meterName.toLocaleLowerCase() === name.toLocaleLowerCase() && item.currencyCode === 'CAD'

const exactSkuMeter = (name: string, sku: string, baseTierOnly = false) =>
  (item: RetailPriceItem) =>
    exactMeter(name)(item) &&
    item.skuName.toLocaleLowerCase() === sku.toLocaleLowerCase() &&
    (!baseTierOnly || (item.tierMinimumUnits ?? 0) === 0)

const exactTierSkuMeter = (name: string, sku: string, tierMinimumUnits: number) =>
  (item: RetailPriceItem) =>
    exactSkuMeter(name, sku)(item) && item.tierMinimumUnits === tierMinimumUnits

const regexMeter = (pattern: RegExp) => (item: RetailPriceItem) =>
  pattern.test(item.meterName) && item.currencyCode === 'CAD'

const direct = (unit: string) => (item: RetailPriceItem): NormalizedMeter | null =>
  Number.isFinite(item.retailPrice) && item.retailPrice >= 0
    ? { value: item.retailPrice, unit }
    : null

const perMillionTokens = (item: RetailPriceItem): NormalizedMeter | null => {
  if (!Number.isFinite(item.retailPrice) || item.retailPrice < 0) return null
  if (item.unitOfMeasure.toLocaleLowerCase() === '1k') {
    return { value: item.retailPrice * 1_000, unit: 'CAD/million tokens' }
  }
  return null
}

const openAiFilter = (region: RegionId) => regionAndProduct(region, 'Azure OpenAI')
const contentSafetyRegion = (region: RegionId): RegionId =>
  region === 'canadacentral' ? 'canadaeast' : region
const networkEgressTiers = [0, 100, 10_335, 51_295, 153_695, 512_095] as const

export const meterSpecs: MeterSpec[] = [
  {
    key: 'model.primary.input',
    filter: openAiFilter,
    matches: exactMeter('gpt 4o 1120 Inp glbl Tokens'),
    normalize: perMillionTokens,
  },
  {
    key: 'model.primary.cachedInput',
    filter: openAiFilter,
    matches: exactMeter('gpt 4o 1120 cached Inp glbl Tokens'),
    normalize: perMillionTokens,
  },
  {
    key: 'model.primary.output',
    filter: openAiFilter,
    matches: exactMeter('gpt 4o 1120 Outp glbl Tokens'),
    normalize: perMillionTokens,
  },
  {
    key: 'model.primary.batchInput',
    filter: openAiFilter,
    matches: exactMeter('gpt 4o 1120 Batch Inp glbl Tokens'),
    normalize: perMillionTokens,
  },
  {
    key: 'model.primary.batchOutput',
    filter: openAiFilter,
    matches: exactMeter('gpt 4o 1120 Batch Outp glbl Tokens'),
    normalize: perMillionTokens,
  },
  {
    key: 'model.primary.ptuHour',
    filter: openAiFilter,
    matches: exactMeter('Provisioned Managed Global Unit'),
    normalize: direct('CAD/PTU-hour'),
  },
  {
    key: 'agent.hosted.vcpuHour',
    filter: (region) => regionAndProduct(region, 'Foundry Agents'),
    matches: exactSkuMeter('Hosted vCPU Usage', 'Hosted'),
    normalize: direct('CAD/vCPU-hour'),
  },
  {
    key: 'agent.hosted.memoryGiBHour',
    filter: (region) => regionAndProduct(region, 'Foundry Agents'),
    matches: exactSkuMeter('Hosted Memory Usage', 'Hosted'),
    normalize: direct('CAD/GiB-hour'),
  },
  {
    key: 'agent.tool.codeInterpreter.global.session',
    filter: openAiFilter,
    matches: exactSkuMeter('Code-Interpreter-global Session', 'Code-Interpreter-global'),
    normalize: direct('CAD/session'),
  },
  {
    key: 'agent.tool.codeInterpreter.regional.session',
    filter: openAiFilter,
    matches: exactSkuMeter('Code-Interpreter-regnl EP Session', 'Code-Interpreter-regnl EP'),
    normalize: direct('CAD/session'),
  },
  {
    key: 'agent.tool.fileSearch.global.gbDay',
    filter: openAiFilter,
    matches: exactSkuMeter('Assistants-File Search-glbl GB', 'Assistants-File Search-glbl'),
    normalize: direct('CAD/GB-day'),
  },
  {
    key: 'agent.tool.fileSearch.regional.gbDay',
    filter: openAiFilter,
    matches: exactSkuMeter('Assistants-File Search-regnl GB', 'Assistants-File Search-regnl'),
    normalize: direct('CAD/GB-day'),
  },
  {
    key: 'agent.skills.execution.hour',
    filter: (region) => regionAndProduct(region, 'Foundry Agents'),
    matches: exactSkuMeter('Skills Execution Container', 'Skills Execution'),
    normalize: direct('CAD/hour'),
  },
  {
    key: 'guardrail.sentinel.gb',
    filter: (region) => regionAndProduct(region, 'Sentinel'),
    matches: exactMeter('Pay-as-you-go Analysis'),
    normalize: direct('CAD/GB'),
  },
  {
    key: 'platform.apim.unitHour',
    filter: (region) => regionAndProduct(region, 'API Management'),
    matches: exactMeter('Basic v2 Unit'),
    normalize: direct('CAD/unit-hour'),
  },
  {
    key: 'platform.search.unitHour',
    filter: (region) => regionAndProduct(region, 'Azure AI Search'),
    matches: regexMeter(/^Standard S1(?: (?:CC|CE))? Unit$/i),
    normalize: direct('CAD/unit-hour'),
  },
  {
    key: 'rag.search.semanticRanker.queries1k',
    filter: (region) => regionAndProduct(region, 'Azure AI Search'),
    matches: exactSkuMeter('Semantic Ranker queries', 'Semantic Ranker'),
    normalize: direct('CAD/thousand queries'),
  },
  {
    key: 'rag.search.agentic.low.tokens1k',
    filter: (region) => regionAndProduct(region, 'Azure AI Search'),
    matches: exactSkuMeter('Agentic Retrieval Low Reasoning Tokens', 'Agentic Retrieval Low Reasoning'),
    normalize: direct('CAD/thousand tokens'),
  },
  {
    key: 'rag.search.agentic.minimum.tokens1k',
    filter: (region) => regionAndProduct(region, 'Azure AI Search'),
    matches: exactSkuMeter('Agentic Retrieval Minimum Reasoning Tokens', 'Agentic Retrieval Minimum Reasoning'),
    normalize: direct('CAD/thousand tokens'),
  },
  {
    key: 'rag.search.imageExtraction.images1k',
    filter: (region) => regionAndProduct(region, 'Azure AI Search'),
    matches: exactSkuMeter('Document Cracking Image Extraction', 'Document Cracking'),
    normalize: direct('CAD/thousand images'),
  },
  {
    key: 'rag.search.customEntity.records1k',
    filter: (region) => regionAndProduct(region, 'Azure AI Search'),
    matches: exactSkuMeter('Custom Entity Skills Text Records', 'Custom Entity Skills'),
    normalize: direct('CAD/thousand text records'),
  },
  {
    key: 'platform.cosmos.provisioned100RuHour',
    filter: (region) => regionAndProduct(region, 'Azure Cosmos DB'),
    matches: exactSkuMeter('100 RU/s', 'RUs'),
    normalize: direct('CAD/100 RU/s-hour'),
  },
  {
    key: 'platform.cosmos.serverlessMillionRu',
    filter: (region) => regionAndProduct(region, 'Azure Cosmos DB serverless'),
    matches: exactSkuMeter('1M RUs', 'RUs'),
    normalize: direct('CAD/million request units'),
  },
  {
    key: 'platform.cosmos.storageGbMonth',
    filter: (region) => regionAndProduct(region, 'Azure Cosmos DB'),
    matches: exactSkuMeter('Data Stored', 'RUs'),
    normalize: direct('CAD/GB-month'),
  },
  {
    key: 'platform.agentStorage.hotZrsGbMonth',
    filter: (region) => regionAndProduct(region, 'General Block Blob v2'),
    matches: exactSkuMeter('Hot ZRS Data Stored', 'Hot ZRS', true),
    normalize: direct('CAD/GB-month'),
  },
  {
    key: 'platform.agentStorage.hotZrsWrite10k',
    filter: (region) => regionAndProduct(region, 'General Block Blob v2'),
    matches: exactSkuMeter('Hot ZRS Write Operations', 'Hot ZRS'),
    normalize: direct('CAD/10K operations'),
  },
  {
    key: 'platform.agentStorage.hotZrsRead10k',
    filter: (region) => regionAndProduct(region, 'General Block Blob v2'),
    matches: exactSkuMeter('Hot ZRS Read Operations', 'Hot ZRS'),
    normalize: direct('CAD/10K operations'),
  },
  {
    key: 'platform.agentStorage.hotZrsOther10k',
    filter: (region) => regionAndProduct(region, 'General Block Blob v2'),
    matches: exactSkuMeter('All Other Operations', 'Hot ZRS'),
    normalize: direct('CAD/10K operations'),
  },
  {
    key: 'platform.agentStorage.hotLrsGbMonth',
    filter: (region) => regionAndProduct(region, 'General Block Blob v2'),
    matches: exactSkuMeter('Hot LRS Data Stored', 'Hot LRS', true),
    normalize: direct('CAD/GB-month'),
  },
  {
    key: 'platform.agentStorage.hotLrsWrite10k',
    filter: (region) => regionAndProduct(region, 'General Block Blob v2'),
    matches: exactSkuMeter('Hot LRS Write Operations', 'Hot LRS'),
    normalize: direct('CAD/10K operations'),
  },
  {
    key: 'platform.agentStorage.hotLrsRead10k',
    filter: (region) => regionAndProduct(region, 'General Block Blob v2'),
    matches: exactSkuMeter('Hot Read Operations', 'Hot LRS'),
    normalize: direct('CAD/10K operations'),
  },
  {
    key: 'platform.agentStorage.hotLrsOther10k',
    filter: (region) => regionAndProduct(region, 'General Block Blob v2'),
    matches: exactSkuMeter('All Other Operations', 'Hot LRS'),
    normalize: direct('CAD/10K operations'),
  },
  {
    key: 'guardrail.contentSafety.text1k',
    filter: (region) => regionAndProduct(contentSafetyRegion(region), 'Content Safety'),
    matches: exactSkuMeter('Standard Text Records', 'Standard'),
    normalize: direct('CAD/thousand text records'),
  },
  ...networkEgressTiers.map((tierMinimumUnits, index): MeterSpec => ({
    key: `platform.network.mgn.out.tier${index}`,
    filter: (region) => regionAndProduct(region, 'Rtn Preference: MGN'),
    matches: exactTierSkuMeter('Standard Data Transfer Out', 'Standard', tierMinimumUnits),
    normalize: direct('CAD/GB'),
  })),
  {
    key: 'service.speech.speechToText.audioHour',
    filter: (region) => regionAndProduct(region, 'Azure Speech'),
    matches: exactSkuMeter('S1 Speech To Text', 'S1'),
    normalize: direct('CAD/audio hour'),
  },
  {
    key: 'service.speech.textToSpeech.characters1m',
    filter: (region) => regionAndProduct(region, 'Azure Speech'),
    matches: exactSkuMeter('S1 Neural Text To Speech Characters', 'S1'),
    normalize: direct('CAD/million characters'),
  },
  {
    key: 'service.speech.avatar.minute',
    filter: (region) => regionAndProduct(region, 'Azure Speech'),
    matches: exactSkuMeter('TTS Standard Avatar Realtime Speech', 'TTS Standard Avatar Realtime'),
    normalize: direct('CAD/minute'),
  },
  {
    key: 'service.speech.translation.audioHour',
    filter: (region) => regionAndProduct(region, 'Azure Speech'),
    matches: exactSkuMeter('S1 Speech Translation', 'S1'),
    normalize: direct('CAD/audio hour'),
  },
  {
    key: 'service.translator.text.characters1m',
    filter: (region) => regionAndProduct(region, 'Translator Text'),
    matches: exactSkuMeter('S1 Characters', 'S1'),
    normalize: direct('CAD/million characters'),
  },
  {
    key: 'service.translator.document.characters1m',
    filter: (region) => regionAndProduct(region, 'Translator Text'),
    matches: exactSkuMeter('S1 Document Characters', 'S1'),
    normalize: direct('CAD/million characters'),
  },
  {
    key: 'service.language.documentPii.pages1k',
    filter: (region) => regionAndProduct(region, 'Azure Language'),
    matches: exactSkuMeter('Doc-PII Redaction Pages', 'Doc-PII Redaction Pages'),
    normalize: direct('CAD/thousand pages'),
  },
  {
    key: 'platform.privateEndpoint.endpointHour',
    filter: () => regionAndProduct('Global', 'Virtual Network Private Link'),
    matches: exactSkuMeter('Standard Private Endpoint', 'Standard'),
    normalize: direct('CAD/endpoint-hour'),
  },
  {
    key: 'platform.privateEndpoint.ingressGb',
    filter: () => regionAndProduct('Global', 'Virtual Network Private Link'),
    matches: exactSkuMeter('Standard Data Processed - Ingress', 'Standard'),
    normalize: direct('CAD/GB'),
  },
  {
    key: 'platform.privateEndpoint.egressGb',
    filter: () => regionAndProduct('Global', 'Virtual Network Private Link'),
    matches: exactSkuMeter('Standard Data Processed - Egress', 'Standard'),
    normalize: direct('CAD/GB'),
  },
  {
    key: 'platform.natGateway.gatewayHour',
    filter: () => regionAndProduct('Global', 'NAT Gateway'),
    matches: exactSkuMeter('Standard Gateway', 'Standard'),
    normalize: direct('CAD/hour'),
  },
  {
    key: 'platform.natGateway.dataGb',
    filter: () => regionAndProduct('Global', 'NAT Gateway'),
    matches: exactSkuMeter('Standard Data Processed', 'Standard'),
    normalize: direct('CAD/GB'),
  },
  {
    key: 'platform.firewall.basic.hour',
    filter: (region) => regionAndProduct(region, 'Azure Firewall'),
    matches: exactSkuMeter('Basic Deployment', 'Basic'),
    normalize: direct('CAD/hour'),
  },
  {
    key: 'platform.firewall.basic.dataGb',
    filter: (region) => regionAndProduct(region, 'Azure Firewall'),
    matches: exactSkuMeter('Basic Data Processed', 'Basic'),
    normalize: direct('CAD/GB'),
  },
  {
    key: 'platform.dr.interRegionTransferGb',
    filter: (region) => regionAndProduct(region, 'Global Virtual Network Peering'),
    matches: exactSkuMeter('Inter-Region Egress', 'Inter-Region'),
    normalize: direct('CAD/GB'),
  },
  {
    key: 'platform.observability.analyticsIngestionGb',
    filter: (region) => regionAndProduct(region, 'Log Analytics'),
    matches: exactTierSkuMeter('Analytics Logs Data Ingestion', 'Analytics Logs', 5),
    normalize: direct('CAD/GB'),
  },
  {
    key: 'platform.observability.analyticsRetentionGbMonth',
    filter: (region) => regionAndProduct(region, 'Log Analytics'),
    matches: exactSkuMeter('Analytics Logs Data Retention', 'Analytics Logs'),
    normalize: direct('CAD/GB-month'),
  },
  {
    key: 'platform.observability.archiveGbMonth',
    filter: (region) => regionAndProduct(region, 'Azure Monitor'),
    matches: exactSkuMeter('Data Archive', 'Data Archive'),
    normalize: direct('CAD/GB-month'),
  },
  {
    key: 'platform.observability.exportGb',
    filter: (region) => regionAndProduct(region, 'Azure Monitor'),
    matches: exactSkuMeter('Log Analytics data export Data Exported', 'Log Analytics data export'),
    normalize: direct('CAD/GB'),
  },
  {
    key: 'platform.observability.logAlert15MinMonth',
    filter: (region) => regionAndProduct(region, 'Azure Monitor'),
    matches: exactSkuMeter('Alerts System Log Monitored at 15 Minute Frequency', 'Alerts'),
    normalize: direct('CAD/alert-month'),
  },
]