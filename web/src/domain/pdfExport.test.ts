import { describe, expect, it } from 'vitest'
import { computeCost } from './computeCost'
import { buildScenarioExport } from './export'
import { createCostEstimatePdf } from './pdfExport'
import { createPreset } from './presets'
import { fallbackRateCard } from './rates'

describe('PDF estimate export', () => {
  it('preserves verification warnings in PDF reports and JSON backups', async () => {
    const config = createPreset('poc')
    const card = structuredClone(fallbackRateCard)
    const verification = {
      status: 'ambiguous' as const,
      checkedAt: '2026-09-06T10:00:00Z',
      reason: 'Conflicting current Retail meters require review.',
    }
    card.rates['model.primary.input']!.verification = verification
    const result = computeCost(config, card)
    const document = await createCostEstimatePdf({
      config, result, rateCard: card, exportedAt: '2026-09-06T12:00:00Z',
    })
    const source = new TextDecoder('latin1').decode(new Uint8Array(document.output('arraybuffer')))

    expect(source).toContain('last-known price')
    expect(source).toContain('Last-known Retail price')
    expect(source).toContain('2026-09-06T10:00:00Z')
    expect(source).not.toContain('Complete estimate - all active lines priced')
    const backup = buildScenarioExport(config, result, card, '2026-09-06T12:00:00Z')
    expect(backup.result.lines.find((line) => line.rateKey === 'model.primary.input')?.provenance.verification).toEqual(verification)
  })

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