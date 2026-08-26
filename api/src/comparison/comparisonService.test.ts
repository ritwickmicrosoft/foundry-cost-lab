import { describe, expect, it, vi } from 'vitest'
import { ComparisonService } from './comparisonService.js'

const request = {
  buyerLens: 'finance',
  competitorLens: 'none',
  facts: Array.from({ length: 6 }, (_, index) => ({
    id: `fact:${index}`,
    category: 'economics',
    scenarioKeys: ['A'],
    text: `Fact ${index} is grounded.`,
  })),
} as const

describe('comparison service', () => {
  it('validates before consuming usage and invoking the model', async () => {
    const consume = vi.fn(async () => 19)
    const explain = vi.fn(async () => ({
      brief: {
        summary: { text: 'Summary', factIds: ['fact:0'] },
        microsoftWinThemes: [], competitiveExposure: [], proofGaps: [], discoveryQuestions: [], model: 'test',
      },
      promptTokens: 100,
      completionTokens: 50,
    }))
    const service = new ComparisonService({ explain }, { consume })

    await expect(service.explain('aad:user', request)).resolves.toMatchObject({
      remainingToday: 19,
      promptTokens: 100,
    })
    expect(consume).toHaveBeenCalledWith('aad:user')
    expect(explain).toHaveBeenCalledOnce()
  })

  it('does not consume usage for an invalid request', async () => {
    const consume = vi.fn(async () => 19)
    const explain = vi.fn()
    const service = new ComparisonService({ explain }, { consume })

    await expect(service.explain('aad:user', {})).rejects.toThrow('invalid')
    expect(consume).not.toHaveBeenCalled()
    expect(explain).not.toHaveBeenCalled()
  })
})