import { useEffect, useState } from 'react'
import { fallbackRateCardFor, getRateCardFreshness, validateRateCard } from '../domain/rates'
import type { RateCard, RegionId } from '../domain/types'

interface RateCardState {
  rateCard: RateCard
  loading: boolean
  usingFallback: boolean
  notice: string | null
}

export function useRateCard(region: RegionId): RateCardState {
  const [state, setState] = useState<RateCardState>({
    rateCard: fallbackRateCardFor(region),
    loading: true,
    usingFallback: true,
    notice: null,
  })

  useEffect(() => {
    const controller = new AbortController()
    const fallback = fallbackRateCardFor(region)
    setState({ rateCard: fallback, loading: true, usingFallback: true, notice: null })
    const load = async () => {
      try {
        const response = await fetch(`/api/rates?region=${region}`, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`Rates API returned ${response.status}.`)
        const rateCard = validateRateCard(await response.json())
        if (rateCard.region !== region) throw new Error('Rates API returned the wrong region.')
        const localFallback = response.headers.get('X-Rate-Source') === 'vite-built-in'
        const usingFallback = rateCard.syncStatus === 'failed' || localFallback
        const freshness = getRateCardFreshness(rateCard, new Date())
        setState({
          rateCard,
          loading: false,
          usingFallback,
          notice: localFallback
            ? `Local development is using the built-in CAD rate card dated ${rateCard.asOf}. Set LOCAL_FUNCTIONS_URL to test live synchronization.`
            : rateCard.syncStatus === 'failed'
              ? 'Rate storage is unavailable. The API is serving its dated last-good CAD card.'
              : freshness === 'stale'
                ? `The CAD rate card is stale; its last successful synchronization was ${rateCard.generatedAt ?? rateCard.asOf}.`
                : freshness === 'aging'
                  ? `The CAD rate card is aging; its last successful synchronization was ${rateCard.generatedAt ?? rateCard.asOf}.`
                  : null,
        })
      } catch (error) {
        if (controller.signal.aborted) return
        const detail = error instanceof Error ? error.message : 'Unknown rate service error.'
        setState({
          rateCard: fallback,
          loading: false,
          usingFallback: true,
          notice: `Rate service unavailable. Using the dated built-in card. ${detail}`,
        })
      }
    }
    void load()
    return () => controller.abort()
  }, [region])

  return state.rateCard.region === region
    ? state
    : { rateCard: fallbackRateCardFor(region), loading: true, usingFallback: true, notice: null }
}