import type {
  FoundryModelCatalogEntry,
  FoundryModelCatalogSnapshot,
  ModelSourceId,
  RegionId,
} from '../contracts.js'
import {
  FOUNDRY_CATALOG_API_VERSION,
  FOUNDRY_CATALOG_RESOURCE,
  type ArmFoundryModel,
  type FoundryCatalogLookupClient,
} from './foundryCatalogClient.js'

export class ZeroCatalogMatchError extends Error {
  constructor() {
    super('Catalog sync returned zero valid models; the current snapshot was not changed.')
    this.name = 'ZeroCatalogMatchError'
  }
}

export interface CatalogSyncRepository {
  readCurrent(): Promise<FoundryModelCatalogSnapshot | null>
  writeSnapshot(snapshot: FoundryModelCatalogSnapshot): Promise<void>
  promote(snapshot: FoundryModelCatalogSnapshot): Promise<void>
}

const capabilityTasks: Record<string, string> = {
  audio: 'audio-generation',
  audioTranscriptions: 'audio-transcription',
  audioTranslations: 'audio-translation',
  chatCompletion: 'chat-completion',
  completion: 'text-generation',
  embeddings: 'embeddings',
  imageGeneration: 'image-generation',
  responses: 'responses',
}

function assetParts(assetId: string) {
  const match = /registries\/([^/]+)\/models\/([^/]+)\/versions\/([^/]+)/i.exec(assetId)
  return match
    ? { registry: match[1] ?? '', name: match[2] ?? '', version: match[3] ?? '' }
    : { registry: '', name: '', version: '' }
}

function classifySource(registry: string, format: string): ModelSourceId {
  const normalizedRegistry = registry.toLocaleLowerCase()
  if (normalizedRegistry === 'azure-huggingface') return 'hugging-face'
  if (normalizedRegistry === 'azureml-fireworks' || format.toLocaleLowerCase() === 'fireworks') {
    return 'fireworks'
  }
  if (normalizedRegistry === 'azureml') return 'foundry-labs'
  return 'direct-azure'
}

function inferenceTasks(model: ArmFoundryModel['model']): string[] {
  const tasks = Object.entries(model?.capabilities ?? {})
    .filter(([, enabled]) => enabled === true || enabled === 'true')
    .map(([capability]) => capabilityTasks[capability])
    .filter((task): task is string => Boolean(task))
  return [...new Set(tasks)].sort()
}

function deploymentOptions(item: ArmFoundryModel, source: ModelSourceId): string[] {
  if (source === 'hugging-face') return ['Managed Compute', 'MaaP']
  if (source === 'foundry-labs') return ['MaaP']
  if (item.kind?.toLocaleLowerCase() === 'openai') return ['AOAI']
  if (source === 'fireworks') return ['UnifiedEndpointMaaS', 'Serverless API']
  return ['UnifiedEndpointMaaS', 'Serverless API']
}

export function normalizeFoundryCatalog(
  items: ArmFoundryModel[],
  region: RegionId,
): FoundryModelCatalogEntry[] {
  const models = new Map<string, FoundryModelCatalogEntry>()
  for (const item of items) {
    const assetId = item.model?.modelCatalogAssetId?.trim() ?? ''
    const parts = assetParts(assetId)
    const name = item.model?.name?.trim() || parts.name
    const version = item.model?.version?.trim() || parts.version
    if (!name || !version) continue
    const source = classifySource(parts.registry, item.model?.format ?? '')
    const id = `${source}/${name}/${version}`
    models.set(id, {
      id,
      name,
      version,
      publisher: item.model?.publisher?.trim() || item.model?.format?.trim() || 'Microsoft Foundry',
      source,
      inferenceTasks: inferenceTasks(item.model),
      deploymentOptions: deploymentOptions(item, source),
      assetId,
      regionalAvailability: [region],
    })
  }
  return [...models.values()].sort((left, right) =>
    left.name.localeCompare(right.name) || right.version.localeCompare(left.version),
  )
}

export async function executeCatalogSync(
  repository: CatalogSyncRepository,
  client: FoundryCatalogLookupClient,
  region: RegionId,
  now: Date,
): Promise<FoundryModelCatalogSnapshot> {
  const models = normalizeFoundryCatalog(await client.list(region), region)
  if (models.length === 0) throw new ZeroCatalogMatchError()
  const snapshot: FoundryModelCatalogSnapshot = {
    schemaVersion: 1,
    asOf: now.toISOString().slice(0, 10),
    generatedAt: now.toISOString(),
    region,
    sourceUrl: `${FOUNDRY_CATALOG_RESOURCE}/subscriptions/{subscriptionId}/providers/Microsoft.CognitiveServices/locations/${region}/models?api-version=${FOUNDRY_CATALOG_API_VERSION}`,
    models,
  }
  await repository.writeSnapshot(snapshot)
  await repository.promote(snapshot)
  return snapshot
}