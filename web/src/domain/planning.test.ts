import { describe, expect, it } from 'vitest'
import { createEmptyConfig, createPreset } from './presets'
import { fallbackRateCard } from './rates'
import { analyzePlanning, hasObservationPeriod, workloadEvidenceStatus, workloadSignature } from './planning'

describe('planning evidence and uncertainty', () => {
  it('varies traffic without scaling fixed platform costs or mutating inputs', () => {
    const config = createPreset('poc')
    const original = structuredClone(config)
    const analysis = analyzePlanning(config, fallbackRateCard)
    expect(analysis.low.metrics.monthlyTurns).toBeCloseTo(analysis.base.metrics.monthlyTurns * 0.8)
    expect(analysis.high.metrics.monthlyTurns).toBeCloseTo(analysis.base.metrics.monthlyTurns * 1.2)
    expect(analysis.low.tiers.platform).toEqual(analysis.base.tiers.platform)
    expect(analysis.high.tiers.platform).toEqual(analysis.base.tiers.platform)
    expect(analysis.sensitivity).toHaveLength(3)
    expect(analysis.sensitivity[0].impact).toBeGreaterThanOrEqual(analysis.sensitivity[2].impact)
    expect(config).toEqual(original)
  })

  it('keeps missing and retained prices visible throughout the range', () => {
    const config = createPreset('poc')
    const card = structuredClone(fallbackRateCard)
    card.rates[config.commercialModel.inputRateKey].value = null
    const analysis = analyzePlanning(config, card)
    for (const result of [analysis.low, analysis.base, analysis.high]) {
      expect(result.complete).toBe(false)
      expect(result.missingRateKeys).toContain(config.commercialModel.inputRateKey)
    }
    expect(analyzePlanning(createEmptyConfig(), card).high.knownGrandTotal).toBe(0)
  })

  it('requires dated evidence and invalidates attestation when measured assumptions change', () => {
    const config = createPreset('poc')
    expect(workloadEvidenceStatus(config)).toBe('Not supplied')
    config.planning.workloadEvidence = { source: 'Pilot aggregate metrics', periodStart: '2026-01-01', periodEnd: '2026-01-31', signature: workloadSignature(config) }
    expect(workloadEvidenceStatus(config)).toBe('Measured (user-attested)')
    config.workload.agentTurnMultiplier += 1
    expect(workloadEvidenceStatus(config)).toBe('Needs review')
    expect(hasObservationPeriod({ ...config.planning.workloadEvidence, periodEnd: '2026-02-30' })).toBe(false)
    expect(hasObservationPeriod({ ...config.planning.workloadEvidence, periodStart: '2027-01-01' })).toBe(false)
  })
})