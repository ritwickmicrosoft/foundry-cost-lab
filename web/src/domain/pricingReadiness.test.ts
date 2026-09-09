import { describe, expect, it } from 'vitest'
import { computeCost } from './computeCost'
import { FOUNDRY_MODEL_CATALOG, modelRateKeys } from './foundryCatalog'
import { buildGuidedConfig, DEFAULT_GUIDED_ANSWERS } from './guidedEstimate'
import { applyModelPriceSelection, updateActiveModelPriceProfile } from './modelPriceProfiles'
import { createPreset } from './presets'
import { buildPricingReadiness } from './pricingReadiness'
import { getLastKnownRateLines, getPricingCoverageSummary } from './pricingVerification'
import { fallbackRateCard } from './rates'

describe('pricing readiness', () => {
  it('consumes synced mini rates only for the reviewed version and Global Standard SKU', () => {
    const config = createPreset('poc')
    config.region = 'eastus'
    const mini = FOUNDRY_MODEL_CATALOG.find((model) => model.id === 'direct-azure/gpt-5.4-mini/2026-03-17')!
    expect(mini).toBeDefined()
    const keys = modelRateKeys(mini, 'global-standard')
    const prefix = 'model.catalog.direct-azure-gpt-5-4-mini-2026-03-17.global-standard'
    expect(keys.input).toBe(`${prefix}.input`)
    expect(keys.cachedInput).toBe(`${prefix}.cachedInput`)
    expect(keys.output).toBe(`${prefix}.output`)
    const card = structuredClone(fallbackRateCard)
    card.region = 'eastus'
    for (const [key, value] of [[keys.input, 1.0395], [keys.cachedInput, 0.104], [keys.output, 6.2372]] as const) {
      card.rates[key] = {
        value, unit: 'CAD/million tokens', currency: 'CAD', maintenance: 'synced',
        source: 'Azure Retail Prices API - Azure OpenAI GPT5', sourceUrl: 'https://prices.azure.com/api/retail/prices',
        asOf: card.asOf, verification: { status: 'verified', checkedAt: `${card.asOf}T10:00:00Z` },
      }
    }
    applyModelPriceSelection(config.commercialModel, mini, 'global-standard')
    config.commercialModel.cachedInputPercent = 20
    const result = computeCost(config, card)
    const readiness = buildPricingReadiness(config, card, result)
    expect(readiness.modelStatus).toBe('exact')
    expect(readiness.decisionBlockers).toEqual([])
    expect(result.lines.filter((line) => line.blockId === 'commercialModel').every((line) => line.amount !== null)).toBe(true)

    for (const sku of ['data-zone-standard', 'regional-standard', 'global-batch', 'global-provisioned'] as const) {
      applyModelPriceSelection(config.commercialModel, mini, sku)
      expect(buildPricingReadiness(config, card, computeCost(config, card)).modelStatus).toBe('unpriced')
    }
    const anotherVersion = { ...mini, id: 'direct-azure/gpt-5.4-mini/2099-01-01', version: '2099-01-01' }
    expect(card.rates[modelRateKeys(anotherVersion, 'global-standard').input]).toBeUndefined()
  })

  it('preserves amounts but flags retained Retail rates throughout readiness and provenance', () => {
    const config = createPreset('poc')
    const card = structuredClone(fallbackRateCard)
    const original = computeCost(config, card)
    card.rates['model.primary.input']!.verification = {
      status: 'ambiguous', checkedAt: '2026-09-06T10:00:00Z', reason: 'Conflicting current meters',
    }
    const result = computeCost(config, card)
    const readiness = buildPricingReadiness(config, card, result)

    expect(result.knownGrandTotal).toBe(original.knownGrandTotal)
    expect(result.complete).toBe(true)
    expect(getLastKnownRateLines(result).length).toBeGreaterThan(0)
    expect(getPricingCoverageSummary(result)).toContain('last-known price')
    expect(readiness.modelStatus).toBe('last-known')
    expect(readiness.dimensions.find((entry) => entry.id === 'input')).toMatchObject({
      status: 'last-known', verificationReason: 'Conflicting current meters',
    })
    expect(readiness.decisionBlockers.some((blocker) => blocker.includes('verify last-known rate'))).toBe(true)
    expect(getLastKnownRateLines(result)[0]!.provenance.verification?.status).toBe('ambiguous')
  })

  it('recognizes retained rates in legacy snapshots without marking manual rates last-known', () => {
    const config = createPreset('poc')
    config.change.finOps.enabled = true
    const card = structuredClone(fallbackRateCard)
    card.unmatchedKeys.push('model.primary.input', 'change.finops.hour')
    const result = computeCost(config, card)

    expect(getLastKnownRateLines(result).every((line) => line.rateKey === 'model.primary.input')).toBe(true)
    expect(getLastKnownRateLines(result).length).toBeGreaterThan(0)
    card.unmatchedKeys = card.unmatchedKeys.filter((key) => key !== 'model.primary.input')
    card.rates['model.primary.input']!.asOf = '2026-01-01'
    expect(getLastKnownRateLines(computeCost(config, card)).length).toBeGreaterThan(0)
  })

  it('keeps missing prices distinct and clears last-known status after recovery', () => {
    const config = createPreset('poc')
    const card = structuredClone(fallbackRateCard)
    card.rates['model.primary.input']!.value = null
    card.rates['model.primary.input']!.verification = { status: 'ambiguous', checkedAt: '2026-09-06T10:00:00Z' }
    const missing = computeCost(config, card)
    expect(missing.complete).toBe(false)
    expect(getLastKnownRateLines(missing)).toEqual([])
    expect(getPricingCoverageSummary(missing)).toContain('unpriced')

    card.rates['model.primary.input']!.value = 3
    card.rates['model.primary.input']!.verification = { status: 'verified', checkedAt: '2026-09-07T10:00:00Z' }
    const recovered = computeCost(config, card)
    expect(getPricingCoverageSummary(recovered)).toBe('All active lines priced')
    expect(buildPricingReadiness(config, card, recovered).modelStatus).toBe('exact')
  })

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

  it('blocks readiness when any routed portfolio deployment is unpriced', () => {
    const config = buildGuidedConfig({
      ...DEFAULT_GUIDED_ANSWERS,
      modelStrategy: 'quality-focused',
    }, FOUNDRY_MODEL_CATALOG, '2026-08-01')
    const result = computeCost(config, fallbackRateCard, FOUNDRY_MODEL_CATALOG)
    const readiness = buildPricingReadiness(config, fallbackRateCard, result, FOUNDRY_MODEL_CATALOG)

    expect(readiness.modelStatus).toBe('unpriced')
    expect(readiness.modelLabel).toBe('2 routed model roles')
    expect(readiness.dimensions.some(
      (dimension) => dimension.label === 'Reasoning deployment · Input' && dimension.status === 'unpriced',
    )).toBe(true)
    expect(readiness.decisionBlockers).toEqual(expect.arrayContaining([
      'Reasoning deployment · Input rate',
      'Reasoning deployment · Output rate',
    ]))
  })
})