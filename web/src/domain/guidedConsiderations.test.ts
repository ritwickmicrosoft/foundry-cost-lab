import { describe, expect, it } from 'vitest'
import {
  applyGuidedConsiderations,
  DEFAULT_GUIDED_ANSWERS,
  interpretGuidedConsiderations,
} from './guidedEstimate'

describe('guided open considerations', () => {
  it('extracts only supported planning assumptions from free text', () => {
    const suggestions = interpretGuidedConsiderations(
      'Production in East US 2 for 5k users. Use dedicated managed compute, business hours, 3 GPU instances at CAD 6.50/hr. We need RAG, private endpoints, monitoring, DR, content safety, an API gateway, and reasoning for complex queries.',
    )

    expect(Object.fromEntries(suggestions.map((suggestion) => [suggestion.field, suggestion.value]))).toMatchObject({
      posture: 'production',
      region: 'eastus2',
      'monthly-users': 5_000,
      hosting: 'dedicated',
      availability: 'business',
      instances: 3,
      'vm-rate': 6.5,
      'model-strategy': 'quality-focused',
      knowledge: true,
      'private-networking': true,
      observability: true,
      'disaster-recovery': true,
      'content-safety': true,
      'api-management': true,
    })
  })

  it('supports explicit exclusions and ignores unsupported prose', () => {
    const suggestions = interpretGuidedConsiderations(
      'No private networking and without disaster recovery. The customer prefers a blue interface and weekly steering meetings.',
    )
    expect(Object.fromEntries(suggestions.map((suggestion) => [suggestion.field, suggestion.value]))).toEqual({
      'private-networking': false,
      'disaster-recovery': false,
    })
  })

  it('applies accepted suggestions without mutating the explicit answers', () => {
    const suggestions = interpretGuidedConsiderations('10,000 users, Canada East, multimodal, no company knowledge')
    const next = applyGuidedConsiderations(DEFAULT_GUIDED_ANSWERS, suggestions)

    expect(next).toMatchObject({
      region: 'canadaeast',
      monthlyUsersOverride: 10_000,
      modelStrategy: 'multimodal',
    })
    expect(next.requirements).not.toContain('knowledge')
    expect(DEFAULT_GUIDED_ANSWERS.requirements).toContain('knowledge')
  })
})