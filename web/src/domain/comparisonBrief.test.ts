import { describe, expect, it } from 'vitest'
import { comparisonBriefCacheKey, parseComparisonBriefResponse } from './comparisonBrief'

const facts = [{ id: 'fact:a', category: 'economics' as const, scenarioKeys: ['A' as const], text: 'Scenario A costs CAD 10.' }]

describe('comparison brief client contract', () => {
  it('rejects citations not present in the submitted fact set', () => {
    expect(() => parseComparisonBriefResponse({
      brief: {
        summary: { text: 'Summary', factIds: ['unknown'] },
        microsoftWinThemes: [], competitiveExposure: [], proofGaps: [], discoveryQuestions: [], model: 'test',
      },
      remainingToday: 10,
    }, facts)).toThrow('invalid')
  })

  it('uses lenses and facts in a stable cache key', () => {
    expect(comparisonBriefCacheKey('finance', 'aws', facts)).toBe(comparisonBriefCacheKey('finance', 'aws', facts))
    expect(comparisonBriefCacheKey('finance', 'aws', facts)).not.toBe(comparisonBriefCacheKey('security', 'aws', facts))
  })
})