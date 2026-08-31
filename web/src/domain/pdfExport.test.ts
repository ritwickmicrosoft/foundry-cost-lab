import { describe, expect, it } from 'vitest'
import { computeCost } from './computeCost'
import { createCostEstimatePdf } from './pdfExport'
import { createPreset } from './presets'
import { fallbackRateCard } from './rates'

describe('PDF estimate export', () => {
  it('creates a multipage CAD report with document metadata', async () => {
    const config = createPreset('production')
    const result = computeCost(config, fallbackRateCard)
    const document = await createCostEstimatePdf({
      config,
      result,
      rateCard: fallbackRateCard,
      exportedAt: '2026-08-23T12:00:00Z',
      scenarioName: 'Production baseline',
    })

    const bytes = new Uint8Array(document.output('arraybuffer'))
    const source = new TextDecoder('latin1').decode(bytes)
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    expect(bytes.byteLength).toBeGreaterThan(20_000)
    expect(document.getNumberOfPages()).toBeGreaterThan(1)
    expect(source).toContain('/Title (Foundry Cost Lab - Production baseline)')
    expect(source).toContain('native CAD rate card')
    expect(source).toContain('(Scenario basis)')
    expect(source).toContain('(Model portfolio)')
    expect(source).toContain('(Monthly cost by tier)')
    expect(source).toContain('(Detailed monthly cost lines)')
    expect(source).toContain('(Unpriced decisions)')
    expect(source).toContain('(Rate provenance and assumptions)')
    expect(source).toContain('(Planning estimate only.)')
  })
})