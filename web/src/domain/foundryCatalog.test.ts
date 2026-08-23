import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FOUNDRY_MODEL_ID,
  FOUNDRY_MODEL_CATALOG,
  MODEL_SOURCE_IDS,
  availableModelDeploymentSkus,
  billingBasisForDeploymentSku,
  defaultBillingBasis,
  defaultDeploymentOption,
  defaultModelDeploymentSku,
  getFoundryModel,
  mergeFoundryCatalog,
  modelRateKeys,
  purchaseModeForDeploymentSku,
} from './foundryCatalog'

describe('Foundry model catalog snapshot', () => {
  it('contains the complete dated snapshot across every requested source', () => {
    expect(FOUNDRY_MODEL_CATALOG).toHaveLength(150)
    for (const source of MODEL_SOURCE_IDS) {
      expect(FOUNDRY_MODEL_CATALOG.some((model) => model.source === source)).toBe(true)
    }
  })

  it('maps only verified GPT-4o deployment SKUs to exact CAD rate keys', () => {
    const model = getFoundryModel(DEFAULT_FOUNDRY_MODEL_ID)
    expect(model?.name).toBe('gpt-4o')
    expect(model && modelRateKeys(model, 'global-standard')).toMatchObject({
      input: 'model.primary.input',
      cachedInput: 'model.primary.cachedInput',
      output: 'model.primary.output',
    })
    expect(model && modelRateKeys(model, 'global-batch')).toMatchObject({
      batchInput: 'model.primary.batchInput',
      batchOutput: 'model.primary.batchOutput',
    })
    expect(model && modelRateKeys(model, 'global-provisioned')).toMatchObject({
      input: 'model.primary.input',
      cachedInput: 'model.primary.cachedInput',
      output: 'model.primary.output',
      ptuHour: 'model.primary.ptuHour',
    })
    expect(model && modelRateKeys(model, 'data-zone-standard').input).toContain(
      '.data-zone-standard.input',
    )
  })

  it('routes providers and deployment SKUs to their supported billing modes', () => {
    const huggingFace = FOUNDRY_MODEL_CATALOG.find((model) => model.source === 'hugging-face')
    const fireworks = FOUNDRY_MODEL_CATALOG.find((model) => model.source === 'fireworks')

    expect(huggingFace && defaultBillingBasis(huggingFace)).toBe('managed-compute')
    expect(huggingFace && defaultDeploymentOption(huggingFace)).toBe('Managed Compute')
    expect(huggingFace && defaultModelDeploymentSku(huggingFace)).toBe('managed-compute')
    expect(huggingFace && availableModelDeploymentSkus(huggingFace)).toContain('managed-compute')
    expect(fireworks && defaultBillingBasis(fireworks)).toBe('tokens')
    expect(fireworks && defaultDeploymentOption(fireworks)).toBe('Serverless API')
    expect(fireworks && defaultModelDeploymentSku(fireworks)).toBe('marketplace')
    expect(purchaseModeForDeploymentSku('global-batch')).toBe('batch')
    expect(purchaseModeForDeploymentSku('global-provisioned')).toBe('ptu')
    expect(billingBasisForDeploymentSku('managed-compute')).toBe('managed-compute')
  })

  it('merges live regional entries without dropping bundled provider families', () => {
    const bundled = FOUNDRY_MODEL_CATALOG[0]!
    const liveOnly = {
      ...bundled,
      id: 'fireworks/live-only/1',
      name: 'live-only',
      version: '1',
      source: 'fireworks' as const,
      regionalAvailability: ['eastus2' as const],
    }
    const merged = mergeFoundryCatalog({
      schemaVersion: 1,
      asOf: '2026-08-21',
      generatedAt: '2026-08-21T10:00:00Z',
      region: 'eastus2',
      sourceUrl: 'https://management.azure.com/catalog',
      models: [
        { ...bundled, deploymentOptions: ['AOAI'], regionalAvailability: ['eastus2'] },
        liveOnly,
      ],
    }, 'eastus2')

    expect(merged.models).toHaveLength(FOUNDRY_MODEL_CATALOG.length + 1)
    expect(merged.models.find((model) => model.id === bundled.id)?.regionalAvailability).toContain('eastus2')
    expect(merged.models.some((model) => model.source === 'hugging-face')).toBe(true)
    expect(merged.regionConfirmedCount).toBe(2)
    expect(merged.bundledOnlyCount).toBe(FOUNDRY_MODEL_CATALOG.length - 1)
    expect(merged.bundledOnlyBySource['hugging-face']).toBeGreaterThan(0)
    expect(merged.liveAsOf).toBe('2026-08-21')
  })
})