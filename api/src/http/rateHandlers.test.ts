import { describe, expect, it, vi } from 'vitest'
import type { RateCard } from '../contracts.js'
import { fallbackRateCard } from '../fallbackRateCard.js'
import type { RateRepository } from '../storage/rateRepository.js'
import { rateDiffResponse, ratesResponse } from './rateHandlers.js'

const repository = (overrides: Partial<RateRepository> = {}): RateRepository => ({
  readCurrent: async () => structuredClone(fallbackRateCard),
  writeSnapshot: async () => undefined,
  promote: async () => undefined,
  readHistory: async () => [],
  ...overrides,
})

describe('rate HTTP handlers', () => {
  it('serves a failed-status last-good card when storage is unavailable', async () => {
    const log = vi.fn()
    const response = await ratesResponse(
      repository({ readCurrent: async () => { throw new DOMException('blocked', 'SecurityError') } }),
      log,
    )

    expect(response.status).toBe(200)
    expect((response.jsonBody as RateCard).syncStatus).toBe('failed')
    expect((response.jsonBody as RateCard).asOf).toBe(fallbackRateCard.asOf)
    expect(log).toHaveBeenCalledOnce()
  })

  it('returns exactly the day-over-day changes from the latest two snapshots', async () => {
    const previous = structuredClone(fallbackRateCard)
    previous.asOf = '2026-08-19'
    const current = structuredClone(fallbackRateCard)
    current.rates['model.primary.input']!.value = 3
    const response = await rateDiffResponse(repository({ readHistory: async () => [current, previous] }), vi.fn())

    expect(response.jsonBody).toMatchObject({
      currentAsOf: '2026-08-20',
      previousAsOf: '2026-08-19',
      changes: [{ key: 'model.primary.input', previousValue: 3.5, currentValue: 3 }],
    })
  })
})