import { describe, expect, it } from 'vitest'
import { diffRateCards, fallbackRateCard, fallbackRateCardFor, getRateCardFreshness, validateRateCard } from './rates'

describe('rate-card safeguards', () => {
  it('requires source and asOf for every rate at runtime', () => {
    const invalid = structuredClone(fallbackRateCard) as unknown as {
      rates: Record<string, { source?: string }>
    }
    delete invalid.rates['model.primary.input'].source

    expect(() => validateRateCard(invalid)).toThrow('source is required')
    expect(validateRateCard(fallbackRateCard)).toEqual(fallbackRateCard)
  })

  it('rejects a mixed or legacy USD rate card', () => {
    const invalid = structuredClone(fallbackRateCard) as unknown as {
      rates: Record<string, { currency: string }>
    }
    invalid.rates['model.primary.input'].currency = 'USD'
    expect(() => validateRateCard(invalid)).toThrow('currency must be CAD')
  })

  it('escalates freshness at 24 hours, seven days, or immediately after failure', () => {
    const card = structuredClone(fallbackRateCard)
    card.asOf = '2026-08-20'
    expect(getRateCardFreshness(card, new Date('2026-08-21T00:00:00Z'))).toBe('fresh')
    expect(getRateCardFreshness(card, new Date('2026-08-22T00:00:00Z'))).toBe('aging')
    expect(getRateCardFreshness(card, new Date('2026-08-28T00:00:01Z'))).toBe('stale')
    card.syncStatus = 'failed'
    expect(getRateCardFreshness(card, new Date('2026-08-20T01:00:00Z'))).toBe('stale')
  })

  it('returns exactly the rates changed between consecutive snapshots', () => {
    const previous = structuredClone(fallbackRateCard)
    const current = structuredClone(fallbackRateCard)
    current.rates['model.primary.input'].value = 3

    expect(diffRateCards(previous, current)).toEqual([
      {
        key: 'model.primary.input',
        previousValue: 3.5,
        currentValue: 3,
        unit: 'CAD/million tokens',
      },
    ])
  })

  it('does not reuse Canada Central built-in prices for another region', () => {
    for (const region of ['canadaeast', 'eastus', 'eastus2'] as const) {
      const card = fallbackRateCardFor(region)
      expect(card.region).toBe(region)
      expect(card.rates['model.primary.input']?.value).toBeNull()
      expect(card.rates['agent.hosted.vcpuHour']?.value).toBeNull()
      expect(card.rates['platform.cosmos.provisioned100RuHour']?.value).toBeNull()
      expect(card.unmatchedKeys).toContain('model.primary.input')
    }
    expect(fallbackRateCardFor('canadaeast').rates['guardrail.contentSafety.text1k']?.value).toBe(0.5284)
    expect(fallbackRateCardFor('eastus').rates['guardrail.contentSafety.text1k']?.value).toBeNull()
  })
})