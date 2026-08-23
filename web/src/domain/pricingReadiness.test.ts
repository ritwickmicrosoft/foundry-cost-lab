import { describe, expect, it } from 'vitest'
import { computeCost } from './computeCost'
import { FOUNDRY_MODEL_CATALOG } from './foundryCatalog'
import { applyModelPriceSelection, updateActiveModelPriceProfile } from './modelPriceProfiles'
import { createPreset } from './presets'
import { buildPricingReadiness } from './pricingReadiness'
import { fallbackRateCard } from './rates'

describe('pricing readiness', () => {
  it('reports exact dimensions and the selected processing boundary', () => {
    const config = createPreset('poc')
    const result = computeCost(config, fallbackRateCard, FOUNDRY_MODEL_CATALOG)
    const readiness = buildPricingReadiness(config, fallbackRateCard, result, FOUNDRY_MODEL_CATALOG)

    expect(readiness.modelStatus).toBe('exact')
    expect(readiness.processingBoundary).toBe('Global processing')
    expect(readiness.dimensions.find((entry) => entry.id === 'input')?.status).toBe('exact')
    expect(readiness.blocks.every((block) => block.status === 'inactive')).toBe(true)
  })

  it('marks unsupported model/SKU dimensions unpriced until a matching profile exists', () => {
    const config = createPreset('poc')
    const model = FOUNDRY_MODEL_CATALOG.find((candidate) => candidate.publisher === 'Anthropic')!
    applyModelPriceSelection(config.commercialModel, model, 'data-zone-standard')

    let result = computeCost(config, fallbackRateCard, FOUNDRY_MODEL_CATALOG)
    let readiness = buildPricingReadiness(config, fallbackRateCard, result, FOUNDRY_MODEL_CATALOG)
    expect(readiness.modelStatus).toBe('unpriced')
    expect(readiness.decisionBlockers).toEqual(expect.arrayContaining(['Input rate', 'Output rate']))

    updateActiveModelPriceProfile(config.commercialModel, {
      source: 'Enterprise Marketplace offer',
      asOf: '2026-08-21',
      inputRateCadPerMillion: 4.25,
      outputRateCadPerMillion: 21.5,
    })
    result = computeCost(config, fallbackRateCard, FOUNDRY_MODEL_CATALOG)
    readiness = buildPricingReadiness(config, fallbackRateCard, result, FOUNDRY_MODEL_CATALOG)
    expect(readiness.modelStatus).toBe('manual')
    expect(readiness.decisionBlockers).toEqual([])
    expect(readiness.dimensions.filter((entry) => entry.required).every(
      (entry) => entry.source === 'Enterprise Marketplace offer' && entry.asOf === '2026-08-21',
    )).toBe(true)
  })

  it('names missing audit metadata as model/SKU fallback blockers', () => {
    const config = createPreset('poc')
    const model = FOUNDRY_MODEL_CATALOG.find((candidate) => candidate.publisher === 'Anthropic')!
    applyModelPriceSelection(config.commercialModel, model, 'global-standard')
    updateActiveModelPriceProfile(config.commercialModel, {
      inputRateCadPerMillion: 4.25,
      outputRateCadPerMillion: 21.5,
    })

    const result = computeCost(config, fallbackRateCard, FOUNDRY_MODEL_CATALOG)
    const readiness = buildPricingReadiness(config, fallbackRateCard, result, FOUNDRY_MODEL_CATALOG)

    expect(readiness.decisionBlockers).toEqual([
      'Model/SKU fallback source',
      'Model/SKU fallback as-of date',
    ])
  })

  it('summarizes technical products independently', () => {
    const config = createPreset('poc')
    config.agentTools.codeInterpreter.enabled = true
    config.rag.semanticRanker.enabled = true
    config.observability.enabled = true
    const result = computeCost(config, fallbackRateCard, FOUNDRY_MODEL_CATALOG)
    const readiness = buildPricingReadiness(config, fallbackRateCard, result, FOUNDRY_MODEL_CATALOG)

    expect(readiness.blocks.find((block) => block.id === 'agentTools')?.status).toBe('exact')
    expect(readiness.blocks.find((block) => block.id === 'rag')?.status).toBe('exact')
    expect(readiness.blocks.find((block) => block.id === 'observability')?.status).toBe('exact')
    expect(readiness.blocks.find((block) => block.id === 'networking')?.status).toBe('inactive')
  })
})