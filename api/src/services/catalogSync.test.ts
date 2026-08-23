import { describe, expect, it } from 'vitest'
import type { FoundryModelCatalogSnapshot } from '../contracts.js'
import type { ArmFoundryModel, FoundryCatalogLookupClient } from './foundryCatalogClient.js'
import {
  executeCatalogSync,
  normalizeFoundryCatalog,
  ZeroCatalogMatchError,
  type CatalogSyncRepository,
} from './catalogSync.js'

const model = (
  assetId: string,
  kind: string,
  format: string,
  capabilities: Record<string, string> = { chatCompletion: 'true' },
): ArmFoundryModel => {
  const parts = assetId.split('/')
  return {
    kind,
    model: {
      capabilities,
      format,
      modelCatalogAssetId: assetId,
      name: parts.at(-3),
      publisher: format,
      version: parts.at(-1),
    },
  }
}

class RecordingRepository implements CatalogSyncRepository {
  readonly events: string[] = []
  snapshot: FoundryModelCatalogSnapshot | null = null
  async readCurrent() { return this.snapshot }
  async writeSnapshot(snapshot: FoundryModelCatalogSnapshot) {
    this.events.push('snapshot')
    this.snapshot = snapshot
  }
  async promote(snapshot: FoundryModelCatalogSnapshot) {
    this.events.push('promote')
    this.snapshot = snapshot
  }
}

describe('Foundry catalog synchronization', () => {
  it('normalizes requested provider sources and regional availability', () => {
    const entries = normalizeFoundryCatalog([
      model('azureml://registries/azure-openai/models/gpt-test/versions/1', 'OpenAI', 'OpenAI', { responses: 'true' }),
      model('azureml://registries/azureml/models/lab-test/versions/2', 'MaaS', 'Microsoft'),
      model('azureml://registries/azure-huggingface/models/hf-test/versions/3', 'MaaP', 'HuggingFace'),
      model('azureml://registries/azureml-fireworks/models/fw-test/versions/4', 'AIServices', 'Fireworks'),
    ], 'canadacentral')

    expect(entries.map(({ source }) => source).sort()).toEqual([
      'direct-azure',
      'fireworks',
      'foundry-labs',
      'hugging-face',
    ])
    expect(entries.find(({ source }) => source === 'direct-azure')?.deploymentOptions).toEqual(['AOAI'])
    expect(entries.find(({ source }) => source === 'fireworks')?.deploymentOptions).toContain('Serverless API')
    expect(entries.every(({ regionalAvailability }) => regionalAvailability[0] === 'canadacentral')).toBe(true)
  })

  it('writes and promotes a non-empty dated snapshot', async () => {
    const repository = new RecordingRepository()
    const client: FoundryCatalogLookupClient = {
      list: async () => [model('azureml://registries/azure-openai/models/gpt-test/versions/1', 'OpenAI', 'OpenAI')],
    }
    const snapshot = await executeCatalogSync(
      repository,
      client,
      'canadacentral',
      new Date('2026-08-21T10:15:00Z'),
    )

    expect(snapshot.asOf).toBe('2026-08-21')
    expect(snapshot.models).toHaveLength(1)
    expect(repository.events).toEqual(['snapshot', 'promote'])
  })

  it('does not replace the last-good snapshot when no valid models are returned', async () => {
    const repository = new RecordingRepository()
    const client: FoundryCatalogLookupClient = { list: async () => [] }

    await expect(executeCatalogSync(
      repository,
      client,
      'canadacentral',
      new Date('2026-08-21T10:15:00Z'),
    )).rejects.toBeInstanceOf(ZeroCatalogMatchError)
    expect(repository.events).toEqual([])
  })
})