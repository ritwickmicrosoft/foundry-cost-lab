import { describe, expect, it } from 'vitest'
import { FOUNDRY_SERVICES, createFoundryServiceSelections } from './foundryServices'

describe('Foundry service catalog', () => {
  it('contains all service playground entries across four service types', () => {
    expect(FOUNDRY_SERVICES).toHaveLength(18)
    expect(new Set(FOUNDRY_SERVICES.map((service) => service.type))).toEqual(
      new Set(['Content Understanding', 'Speech', 'Translation', 'Language']),
    )
  })

  it('creates a disabled, independently configurable selection for every service', () => {
    const selections = createFoundryServiceSelections()
    expect(selections).toHaveLength(FOUNDRY_SERVICES.length)
    expect(selections.every((selection) => !selection.enabled)).toBe(true)
    expect(new Set(selections.map((selection) => selection.id)).size).toBe(selections.length)
  })
})