import type { HttpResponseInit } from '@azure/functions'
import type { RateCard } from '../contracts.js'
import { fallbackRateCard } from '../fallbackRateCard.js'
import { diffRateCards } from '../services/rateSync.js'
import type { RateRepository } from '../storage/rateRepository.js'

const headers = {
  'Cache-Control': 'public, max-age=300, stale-if-error=86400',
  'Content-Type': 'application/json',
}

export async function ratesResponse(
  repository: RateRepository,
  log: (message: string, error?: unknown) => void,
  lastGood: RateCard = fallbackRateCard,
): Promise<HttpResponseInit> {
  try {
    const rateCard = await repository.readCurrent()
    if (!rateCard) throw new Error('No current rate card exists.')
    return { status: 200, headers, jsonBody: rateCard }
  } catch (error) {
    log('Rates storage unavailable; serving the dated built-in card.', error)
    return {
      status: 200,
      headers: { ...headers, Warning: '110 - Response is stale', 'X-Rate-Source': 'built-in-last-good' },
      jsonBody: { ...structuredClone(lastGood), syncStatus: 'failed' },
    }
  }
}

export async function rateDiffResponse(
  repository: RateRepository,
  log: (message: string, error?: unknown) => void,
): Promise<HttpResponseInit> {
  try {
    const [current, previous] = await repository.readHistory(2)
    if (!current || !previous) {
      return { status: 200, headers, jsonBody: { currentAsOf: current?.asOf ?? null, previousAsOf: null, changes: [] } }
    }
    return {
      status: 200,
      headers,
      jsonBody: {
        currentAsOf: current.asOf,
        previousAsOf: previous.asOf,
        changes: diffRateCards(previous, current),
      },
    }
  } catch (error) {
    log('Rate history unavailable.', error)
    return { status: 503, headers: { 'Content-Type': 'application/json' }, jsonBody: { error: 'Rate history unavailable.' } }
  }
}