import { describe, expect, it } from 'vitest'
import { computeCost } from './computeCost'
import { buildScenarioExport, parseScenarioExport } from './export'
import { createPreset } from './presets'
import { buildGuidedConfig, DEFAULT_GUIDED_ANSWERS } from './guidedEstimate'
import { FOUNDRY_MODEL_CATALOG } from './foundryCatalog'
import { fallbackRateCard } from './rates'

describe('scenario export', () => {
  it('includes the exact rate-card date and line provenance', () => {
    const config = createPreset('poc')
    const result = computeCost(config, fallbackRateCard)
    const exported = buildScenarioExport(
      config,
      result,
      fallbackRateCard,
      '2026-08-20T12:00:00.000Z',
    )

    expect(exported.rateCard.asOf).toBe(fallbackRateCard.asOf)
    expect(exported.rateCard.currency).toBe('CAD')
    expect(exported.result.lines.every((line) => line.provenance.source && line.provenance.asOf)).toBe(true)
    expect(exported.config).toEqual(config)
  })

  it('imports only the configuration and sanitizes malformed values', () => {
    const config = createPreset('production')
    config.workload.monthlyUsers = 4_321
    const exported = buildScenarioExport(config, computeCost(config, fallbackRateCard), fallbackRateCard, '2026-08-20T12:00:00Z')
    const untrusted = structuredClone(exported) as unknown as {
      config: { workload: { monthlyUsers: unknown; activeDaysPerMonth: unknown } }
      result: { knownGrandTotal: number }
    }
    untrusted.config.workload.activeDaysPerMonth = 'not-a-number'
    untrusted.result.knownGrandTotal = 1

    const imported = parseScenarioExport(untrusted)
    expect(imported.config.workload.monthlyUsers).toBe(4_321)
    expect(imported.config.workload.activeDaysPerMonth).toBe(22)
    expect(imported).not.toHaveProperty('result')
  })

  it('rejects non-CAD or unrelated files', () => {
    expect(() => parseScenarioExport({ schemaVersion: 1 })).toThrow('not a Foundry Cost Lab')
    const config = createPreset('poc')
    const exported = buildScenarioExport(config, computeCost(config, fallbackRateCard), fallbackRateCard, '2026-08-20T12:00:00Z')
    expect(() => parseScenarioExport({ ...exported, rateCard: { ...exported.rateCard, currency: 'USD' } })).toThrow('CAD')
  })

  it('preserves East US 2 in imported configuration and rate metadata', () => {
    const config = createPreset('poc')
    config.region = 'eastus2'
    const card = structuredClone(fallbackRateCard)
    card.region = 'eastus2'
    const exported = buildScenarioExport(config, computeCost(config, card), card, '2026-08-23T00:00:00Z')

    const imported = parseScenarioExport(exported)
    expect(imported.config.region).toBe('eastus2')
    expect(imported.rateCard.region).toBe('eastus2')
  })

  it('round-trips portfolio deployments and routing without exported totals', () => {
    const config = buildGuidedConfig({
      ...DEFAULT_GUIDED_ANSWERS,
      modelStrategy: 'quality-focused',
    }, FOUNDRY_MODEL_CATALOG, '2026-08-01')
    const exported = buildScenarioExport(
      config,
      computeCost(config, fallbackRateCard, FOUNDRY_MODEL_CATALOG),
      fallbackRateCard,
      '2026-08-27T00:00:00Z',
    )

    const imported = parseScenarioExport(exported)
    expect(imported.config.modelPortfolio).toEqual(config.modelPortfolio)
    expect(imported.config.modelPortfolio.routes[1]).toMatchObject({
      role: 'reasoning',
      mode: 'additive',
      trafficPercent: 15,
    })
    expect(computeCost(imported.config, fallbackRateCard, FOUNDRY_MODEL_CATALOG).knownGrandTotal)
      .toBeCloseTo(computeCost(config, fallbackRateCard, FOUNDRY_MODEL_CATALOG).knownGrandTotal)
  })

  it('rejects oversized portfolios instead of silently dropping routes', () => {
    const config = createPreset('poc')
    config.modelPortfolio.routes = Array.from({ length: 13 }, (_, index) => ({
      id: `route-${index}`,
      label: `Route ${index}`,
      role: index === 0 ? 'primary' as const : 'fast' as const,
      deploymentId: 'primary',
      mode: index === 0 ? 'traffic-share' as const : 'additive' as const,
      trafficPercent: index === 0 ? 100 : 1,
    }))
    const exported = buildScenarioExport(
      config,
      computeCost(config, fallbackRateCard),
      fallbackRateCard,
      '2026-08-27T00:00:00Z',
    )

    expect(() => parseScenarioExport(exported)).toThrow('at most 12 model routes')
  })
})