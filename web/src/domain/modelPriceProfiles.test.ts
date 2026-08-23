import { describe, expect, it } from 'vitest'
import { createPreset } from './presets'
import {
  DEFAULT_FOUNDRY_MODEL_ID,
  FOUNDRY_MODEL_CATALOG,
  getFoundryModel,
} from './foundryCatalog'
import {
  applyModelPriceSelection,
  findModelPriceProfile,
  updateActiveModelPriceProfile,
} from './modelPriceProfiles'

describe('model price profiles', () => {
  it('uses exact keys only for the verified GPT-4o SKU', () => {
    const config = createPreset('poc').commercialModel
    const model = getFoundryModel(DEFAULT_FOUNDRY_MODEL_ID)!

    applyModelPriceSelection(config, model, 'global-standard')

    expect(config.purchaseMode).toBe('payg')
    expect(config.inputRateKey).toBe('model.primary.input')
    expect(config.cachedInputRateKey).toBe('model.primary.cachedInput')
    expect(config.outputRateKey).toBe('model.primary.output')
    expect(config.batchInputRateKey).toContain('.global-standard.batchInput')
  })

  it('keeps manual prices scoped to one model and deployment SKU', () => {
    const config = createPreset('poc').commercialModel
    const model = FOUNDRY_MODEL_CATALOG.find((candidate) => candidate.publisher === 'Anthropic')!

    applyModelPriceSelection(config, model, 'global-standard')
    updateActiveModelPriceProfile(config, {
      source: 'Enterprise Marketplace offer',
      asOf: '2026-08-21',
      inputRateCadPerMillion: 4.25,
      outputRateCadPerMillion: 21.5,
    })

    expect(findModelPriceProfile(config)?.source).toBe('Enterprise Marketplace offer')
    expect(config.customInputRateCadPerMillion).toBe(4.25)

    applyModelPriceSelection(config, model, 'data-zone-standard')
    expect(config.customInputRateCadPerMillion).toBeNull()
    expect(findModelPriceProfile(config)).toBeUndefined()

    applyModelPriceSelection(config, model, 'global-standard')
    expect(config.customInputRateCadPerMillion).toBe(4.25)
    expect(config.customOutputRateCadPerMillion).toBe(21.5)
    expect(config.priceProfiles).toHaveLength(1)
  })

  it('keeps batch offer rates separate from synchronous token rates', () => {
    const config = createPreset('poc').commercialModel
    const model = getFoundryModel(DEFAULT_FOUNDRY_MODEL_ID)!

    applyModelPriceSelection(config, model, 'global-batch')
    updateActiveModelPriceProfile(config, {
      batchInputRateCadPerMillion: 1.25,
      batchOutputRateCadPerMillion: 5,
    })

    expect(config.purchaseMode).toBe('batch')
    expect(config.customBatchInputRateCadPerMillion).toBe(1.25)
    expect(config.customBatchOutputRateCadPerMillion).toBe(5)
    expect(config.customInputRateCadPerMillion).toBeNull()
  })
})