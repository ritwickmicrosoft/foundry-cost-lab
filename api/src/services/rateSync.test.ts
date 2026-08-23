import { describe, expect, it } from 'vitest'
import { fallbackRateCard } from '../fallbackRateCard.js'
import type { RateCard } from '../contracts.js'
import type { RateLookupClient, RetailPriceItem } from './retailPricesClient.js'
import { executeRateSync, ZeroMeterMatchError, type SyncRepository } from './rateSync.js'

const inputMeter = (price = 0.003): RetailPriceItem => ({
  currencyCode: 'CAD',
  retailPrice: price,
  unitPrice: price,
  armRegionName: 'canadacentral',
  effectiveStartDate: '2026-01-01T00:00:00Z',
  meterName: 'gpt 4o 1120 Inp glbl Tokens',
  productName: 'Azure OpenAI',
  skuName: 'gpt 4o 1120 Inp glbl',
  serviceName: 'Foundry Models',
  unitOfMeasure: '1K',
  isPrimaryMeterRegion: true,
})

const cadMeter = (
  meterName: string,
  productName: string,
  skuName: string,
  retailPrice: number,
  unitOfMeasure: string,
  tierMinimumUnits = 0,
): RetailPriceItem => ({
  currencyCode: 'CAD',
  tierMinimumUnits,
  retailPrice,
  unitPrice: retailPrice,
  armRegionName: 'canadacentral',
  effectiveStartDate: '2026-01-01T00:00:00Z',
  meterName,
  productName,
  skuName,
  serviceName: 'Test service',
  unitOfMeasure,
  isPrimaryMeterRegion: true,
})

class RecordingRepository implements SyncRepository {
  readonly events: string[] = []
  constructor(private readonly current: RateCard | null = structuredClone(fallbackRateCard)) {}
  async readCurrent() {
    this.events.push('read')
    return this.current
  }
  async writeSnapshot() {
    this.events.push('snapshot')
  }
  async promote() {
    this.events.push('promote')
  }
}

describe('rate sync transaction', () => {
  it('normalizes a partial token match and preserves manual rates', async () => {
    const repository = new RecordingRepository()
    const client: RateLookupClient = { query: async () => [inputMeter()] }
    const outcome = await executeRateSync(repository, client, new Date('2026-08-20T10:00:00Z'))

    expect(outcome.rateCard.rates['model.primary.input']?.value).toBe(3)
    expect(outcome.rateCard.rates['model.primary.input']?.currency).toBe('CAD')
    expect(outcome.rateCard.rates['model.primary.input']?.asOf).toBe('2026-08-20')
    expect(outcome.rateCard.rates['change.finops.hour']?.maintenance).toBe('manual')
    expect(outcome.rateCard.syncStatus).toBe('partial')
    expect(outcome.rateCard.unmatchedKeys).toContain('model.primary.output')
    expect(repository.events).toEqual(['read', 'snapshot', 'promote'])
  })

  it('aborts without writes when zero meters match', async () => {
    const repository = new RecordingRepository()
    const client: RateLookupClient = { query: async () => [] }

    await expect(executeRateSync(repository, client, new Date('2026-08-20T10:00:00Z'))).rejects.toBeInstanceOf(
      ZeroMeterMatchError,
    )
    expect(repository.events).toEqual(['read'])
  })

  it('preserves the current card when the retail network fails', async () => {
    const repository = new RecordingRepository()
    const client: RateLookupClient = { query: async () => { throw new Error('network unavailable') } }

    await expect(executeRateSync(repository, client, new Date('2026-08-20T10:00:00Z'))).rejects.toThrow(
      'network unavailable',
    )
    expect(repository.events).toEqual(['read'])
  })

  it('matches exact hosted-agent and Standard Setup CAD meters', async () => {
    const repository = new RecordingRepository()
    const meters = [
      cadMeter('gpt 4o 1120 cached Inp glbl Tokens', 'Azure OpenAI', 'gpt 4o 1120 cached Inp glbl', 0.0018, '1K'),
      cadMeter('Hosted vCPU Usage', 'Foundry Agents', 'Hosted', 0.1541, '1 Hour'),
      cadMeter('Hosted Memory Usage', 'Foundry Agents', 'Hosted', 0.0183, '1 Hour'),
      cadMeter('Code-Interpreter-global Session', 'Azure OpenAI', 'Code-Interpreter-global', 0.0423, '1'),
      cadMeter('Assistants-File Search-glbl GB', 'Azure OpenAI', 'Assistants-File Search-glbl', 0.1409, '1/Day'),
      cadMeter('Skills Execution Container', 'Foundry Agents', 'Skills Execution', 0.0511, '1 Hour'),
      cadMeter('100 RU/s', 'Azure Cosmos DB', 'RUs', 0.0124, '1/Hour'),
      cadMeter('Data Stored', 'Azure Cosmos DB', 'RUs', 0.3875, '1 GB/Month'),
      cadMeter('1M RUs', 'Azure Cosmos DB serverless', 'RUs', 0.3875, '1M'),
      cadMeter('Hot ZRS Data Stored', 'General Block Blob v2', 'Hot ZRS', 0.0352, '1 GB/Month'),
      cadMeter('Hot ZRS Write Operations', 'General Block Blob v2', 'Hot ZRS', 0.0969, '10K'),
      cadMeter('Hot ZRS Read Operations', 'General Block Blob v2', 'Hot ZRS', 0.0062, '10K'),
      cadMeter('All Other Operations', 'General Block Blob v2', 'Hot ZRS', 0.0062, '10K'),
      cadMeter('Hot LRS Data Stored', 'General Block Blob v2', 'Hot LRS', 0.0282, '1 GB/Month'),
      cadMeter('Hot LRS Write Operations', 'General Block Blob v2', 'Hot LRS', 0.0775, '10K'),
      cadMeter('Hot Read Operations', 'General Block Blob v2', 'Hot LRS', 0.0062, '10K'),
      cadMeter('All Other Operations', 'General Block Blob v2', 'Hot LRS', 0.0062, '10K'),
      cadMeter('Standard S1 Unit', 'Azure AI Search', 'Standard S1', 0.4734, '1 Hour'),
      cadMeter('Semantic Ranker queries', 'Azure AI Search', 'Semantic Ranker', 1.409, '1K'),
      cadMeter('Agentic Retrieval Low Reasoning Tokens', 'Azure AI Search', 'Agentic Retrieval Low Reasoning', 0, '1K'),
      cadMeter('Document Cracking Image Extraction', 'Azure AI Search', 'Document Cracking', 1.409, '1K'),
      cadMeter('Custom Entity Skills Text Records', 'Azure AI Search', 'Custom Entity Skills', 0.3523, '1K'),
      cadMeter('Standard Private Endpoint', 'Virtual Network Private Link', 'Standard', 0.0141, '1 Hour'),
      cadMeter('Standard Data Processed - Ingress', 'Virtual Network Private Link', 'Standard', 0.0141, '1 GB'),
      cadMeter('Standard Gateway', 'NAT Gateway', 'Standard', 0.0634, '1 Hour'),
      cadMeter('Basic Deployment', 'Azure Firewall', 'Basic', 0.5566, '1 Hour'),
      cadMeter('Basic Data Processed', 'Azure Firewall', 'Basic', 0.0916, '1 GB'),
      cadMeter('Inter-Region Egress', 'Global Virtual Network Peering', 'Inter-Region', 0.0493, '1 GB'),
      cadMeter('Standard Text Records', 'Content Safety', 'Standard', 0.5284, '1K'),
      cadMeter('Analytics Logs Data Ingestion', 'Log Analytics', 'Analytics Logs', 0, '1 GB'),
      cadMeter('Analytics Logs Data Ingestion', 'Log Analytics', 'Analytics Logs', 3.889, '1 GB', 5),
      cadMeter('Analytics Logs Data Retention', 'Log Analytics', 'Analytics Logs', 0.1691, '1 GB/Month'),
      cadMeter('Data Archive', 'Azure Monitor', 'Data Archive', 0.0338, '1 GB/Month'),
      cadMeter('Log Analytics data export Data Exported', 'Azure Monitor', 'Log Analytics data export', 0.1691, '1 GB'),
      cadMeter('Alerts System Log Monitored at 15 Minute Frequency', 'Azure Monitor', 'Alerts', 0.7045, '1/Month'),
      cadMeter('S1 Speech To Text', 'Azure Speech', 'S1', 1.409, '1 Hour'),
      cadMeter('S1 Neural Text To Speech Characters', 'Azure Speech', 'S1', 21.1357, '1M'),
      cadMeter('TTS Standard Avatar Realtime Speech', 'Azure Speech', 'TTS Standard Avatar Realtime', 0.7045, '1 Minute'),
      cadMeter('S1 Speech Translation', 'Azure Speech', 'S1', 3.5226, '1 Hour'),
      cadMeter('S1 Characters', 'Translator Text', 'S1', 14.0905, '1M'),
      cadMeter('S1 Document Characters', 'Translator Text', 'S1', 21.1357, '1M'),
      cadMeter('Doc-PII Redaction Pages', 'Azure Language', 'Doc-PII Redaction Pages', 14.0905, '1K'),
    ]
    const client: RateLookupClient = { query: async () => meters }

    const outcome = await executeRateSync(repository, client, new Date('2026-08-20T10:00:00Z'))

    expect(outcome.rateCard.rates['model.primary.cachedInput']?.value).toBe(1.8)
    expect(outcome.rateCard.rates['agent.hosted.vcpuHour']?.value).toBe(0.1541)
    expect(outcome.rateCard.rates['agent.hosted.memoryGiBHour']?.value).toBe(0.0183)
    expect(outcome.rateCard.rates['agent.tool.codeInterpreter.global.session']?.value).toBe(0.0423)
    expect(outcome.rateCard.rates['agent.tool.fileSearch.global.gbDay']?.value).toBe(0.1409)
    expect(outcome.rateCard.rates['agent.skills.execution.hour']?.value).toBe(0.0511)
    expect(outcome.rateCard.rates['platform.cosmos.provisioned100RuHour']?.value).toBe(0.0124)
    expect(outcome.rateCard.rates['platform.cosmos.serverlessMillionRu']?.value).toBe(0.3875)
    expect(outcome.rateCard.rates['platform.agentStorage.hotZrsGbMonth']?.value).toBe(0.0352)
    expect(outcome.rateCard.rates['platform.agentStorage.hotZrsWrite10k']?.value).toBe(0.0969)
    expect(outcome.rateCard.rates['platform.agentStorage.hotLrsGbMonth']?.value).toBe(0.0282)
    expect(outcome.rateCard.rates['platform.agentStorage.hotLrsWrite10k']?.value).toBe(0.0775)
    expect(outcome.rateCard.rates['platform.search.unitHour']?.value).toBe(0.4734)
    expect(outcome.rateCard.rates['rag.search.semanticRanker.queries1k']?.value).toBe(1.409)
    expect(outcome.rateCard.rates['rag.search.agentic.low.tokens1k']?.value).toBe(0)
    expect(outcome.rateCard.rates['rag.search.imageExtraction.images1k']?.value).toBe(1.409)
    expect(outcome.rateCard.rates['platform.privateEndpoint.endpointHour']?.value).toBe(0.0141)
    expect(outcome.rateCard.rates['platform.privateEndpoint.ingressGb']?.value).toBe(0.0141)
    expect(outcome.rateCard.rates['platform.natGateway.gatewayHour']?.value).toBe(0.0634)
    expect(outcome.rateCard.rates['platform.firewall.basic.hour']?.value).toBe(0.5566)
    expect(outcome.rateCard.rates['platform.dr.interRegionTransferGb']?.value).toBe(0.0493)
    expect(outcome.rateCard.rates['guardrail.contentSafety.text1k']?.value).toBe(0.5284)
    expect(outcome.rateCard.rates['platform.observability.analyticsIngestionGb']?.value).toBe(3.889)
    expect(outcome.rateCard.rates['platform.observability.analyticsIngestionGb']?.tierMinimumUnits).toBe(5)
    expect(outcome.rateCard.rates['platform.observability.archiveGbMonth']?.value).toBe(0.0338)
    expect(outcome.rateCard.rates['service.speech.speechToText.audioHour']?.value).toBe(1.409)
    expect(outcome.rateCard.rates['service.translator.document.characters1m']?.value).toBe(21.1357)
    expect(outcome.rateCard.rates['service.language.documentPii.pages1k']?.value).toBe(14.0905)
  })
})