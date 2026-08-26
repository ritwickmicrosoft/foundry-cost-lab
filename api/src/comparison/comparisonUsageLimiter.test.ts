import { afterEach, describe, expect, it, vi } from 'vitest'
import { getComparisonDailyLimit, MemoryComparisonUsageLimiter } from './comparisonUsageLimiter.js'

afterEach(() => vi.unstubAllEnvs())

describe('comparison usage limiter', () => {
  it('enforces the per-user daily limit', async () => {
    const limiter = new MemoryComparisonUsageLimiter(2, () => new Date('2026-08-25T12:00:00Z'))
    await expect(limiter.consume('aad:user-a')).resolves.toBe(1)
    await expect(limiter.consume('aad:user-a')).resolves.toBe(0)
    await expect(limiter.consume('aad:user-a')).rejects.toMatchObject({ code: 'daily-limit' })
    await expect(limiter.consume('aad:user-b')).resolves.toBe(1)
  })

  it('falls back safely when the configured limit is invalid', () => {
    vi.stubEnv('COMPARISON_AI_DAILY_LIMIT', 'not-a-number')
    expect(getComparisonDailyLimit()).toBe(20)
    vi.stubEnv('COMPARISON_AI_DAILY_LIMIT', '-5')
    expect(getComparisonDailyLimit()).toBe(20)
  })
})