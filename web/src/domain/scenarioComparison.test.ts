import { describe, expect, it } from 'vitest'
import { createPreset } from './presets'
import { fallbackRateCardFor } from './rates'
import { buildScenarioComparison, type ComparisonSource } from './scenarioComparison'
import { buildGuidedConfig, DEFAULT_GUIDED_ANSWERS } from './guidedEstimate'
import { FOUNDRY_MODEL_CATALOG } from './foundryCatalog'
import type { CostResult } from './types'

const result = (monthly: number, lineAmount: number | null, complete = lineAmount !== null): CostResult => ({
  lines: [{
    id: 'model', blockId: 'model', label: 'Commercial model', detail: '', tier: 'run', amount: lineAmount,
    quantity: 1, quantityUnit: 'unit', unitRate: lineAmount, rateUnit: 'CAD/unit', formula: '', assumption: '', scale: 1,
    provenance: { source: 'test', sourceUrl: 'https://example.test', asOf: '2026-08-25', maintenance: 'synced' },
  }],
  tiers: {
    run: { tier: 'run', knownSubtotal: monthly, unpricedLineCount: lineAmount === null ? 1 : 0 },
    guardrail: { tier: 'guardrail', knownSubtotal: 0, unpricedLineCount: 0 },
    platform: { tier: 'platform', knownSubtotal: 0, unpricedLineCount: 0 },
    change: { tier: 'change', knownSubtotal: 0, unpricedLineCount: 0 },
  },
  knownGrandTotal: monthly,
  complete,
  missingRateKeys: complete ? [] : ['model.rate'],
  dailyBurn: monthly / 30,
  projection: [],
  metrics: { monthlyTurns: 1000, primaryInputTokens: 0, primaryOutputTokens: 0, mcpSchemaTokens: 0, fixedEnvironmentScale: 1, resilienceScale: 1 },
  breakeven: { tokensPerMonth: null, capacityTokensPerMonth: null, feasibleWithinCapacity: null },
})

const source = (id: string, monthly: number, lineAmount: number | null): ComparisonSource => ({
  id,
  name: `Scenario ${id}`,
  savedRateCardAsOf: '2026-08-20',
  config: createPreset('poc'),
  result: result(monthly, lineAmount),
  rateCard: fallbackRateCardFor('canadacentral'),
})

describe('scenario comparison', () => {
  it('requires two or three scenarios', () => {
    expect(() => buildScenarioComparison([source('a', 10, 10)])).toThrow('two or three')
    expect(() => buildScenarioComparison([
      source('a', 10, 10), source('b', 20, 20), source('c', 30, 30), source('d', 40, 40),
    ])).toThrow('two or three')
  })

  it('builds baseline deltas, sales metrics, assumptions, and grounded facts', () => {
    const analysis = buildScenarioComparison([source('a', 100, 100), source('b', 70, 70)], 'a')
    expect(analysis.baselineIndex).toBe(0)
    expect(analysis.lowestKnownIndex).toBe(1)
    expect(analysis.summaries[0]).toMatchObject({ key: 'A', knownAnnualTotal: 1200, costPerThousandTurns: 100 })
    expect(analysis.drivers[0]).toMatchObject({ id: 'model', deltasFromBaseline: [0, -30], maxAbsoluteDelta: 30 })
    expect(analysis.facts.map((fact) => fact.id)).toContain('driver:model')
  })

  it('keeps unpriced values distinct from inactive zero-cost lines', () => {
    const analysis = buildScenarioComparison([source('a', 100, 100), source('b', 0, null)])
    expect(analysis.drivers[0].values[1]).toEqual({ state: 'unpriced', amount: null })
    expect(analysis.drivers[0].deltasFromBaseline[1]).toBeNull()
    expect(analysis.summaries[1]).toMatchObject({ complete: false, unpricedLineCount: 1 })
  })

  it('compares complete model portfolio routing assumptions', () => {
    const single = source('a', 100, 100)
    const quality = source('b', 120, 120)
    quality.config = buildGuidedConfig({
      ...DEFAULT_GUIDED_ANSWERS,
      modelStrategy: 'quality-focused',
    }, FOUNDRY_MODEL_CATALOG, '2026-08-01')

    const analysis = buildScenarioComparison([single, quality])
    const portfolio = analysis.assumptions.find((assumption) => assumption.id === 'model-portfolio')

    expect(portfolio?.differs).toBe(true)
    expect(portfolio?.values[1]).toContain('Reasoning assist')
    expect(portfolio?.values[1]).toContain('15% additional')
  })
})