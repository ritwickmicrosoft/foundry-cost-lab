import { describe, expect, it } from 'vitest'
import { fallbackRateCard, fallbackRateCardFor } from './fallbackRateCard.js'

describe('regional fallback rate cards', () => {
  it('keeps Canada Central dated rates but leaves unsynchronized regional meters unpriced', () => {
    const east = fallbackRateCardFor('canadaeast')
    const eastUs = fallbackRateCardFor('eastus')

    expect(east.region).toBe('canadaeast')
    expect(east.rates['model.primary.input']?.value).toBeNull()
    expect(east.unmatchedKeys).toContain('model.primary.input')
    expect(east.rates['guardrail.contentSafety.text1k']?.value).toBe(0.5284)
    expect(eastUs.rates['guardrail.contentSafety.text1k']?.value).toBeNull()
    expect(eastUs.rates['model.primary.input']?.value).toBeNull()
    expect(fallbackRateCard.rates['model.primary.input']?.value).toBe(3.5)
    expect(fallbackRateCard.rates['model.primary.input']?.currency).toBe('CAD')
    expect(fallbackRateCard.rates['agent.hosted.vcpuHour']?.value).toBe(0.1541)
    expect(fallbackRateCard.rates['platform.cosmos.provisioned100RuHour']?.value).toBe(0.0124)
    expect(fallbackRateCard.rates['platform.agentStorage.hotZrsGbMonth']?.value).toBe(0.0352)
  })
})