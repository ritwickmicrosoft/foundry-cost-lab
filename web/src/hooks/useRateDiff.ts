import { useEffect, useState } from 'react'
import type { RateDiff } from '../domain/rates'
import type { RegionId } from '../domain/types'

export interface RateDiffPayload {
  currentAsOf: string | null
  previousAsOf: string | null
  changes: RateDiff[]
}

export interface RateDiffState {
  data: RateDiffPayload | null
  loading: boolean
  unavailable: boolean
}

interface RegionalRateDiffState extends RateDiffState {
  region: RegionId
}

export function useRateDiff(region: RegionId): RateDiffState {
  const [state, setState] = useState<RegionalRateDiffState>({
    region,
    data: null,
    loading: true,
    unavailable: false,
  })

  useEffect(() => {
    const controller = new AbortController()
    setState({ region, data: null, loading: true, unavailable: false })
    const load = async () => {
      try {
        const response = await fetch(`/api/rates/diff?region=${region}`, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`Rate diff API returned ${response.status}.`)
        const data = (await response.json()) as RateDiffPayload
        if (!Array.isArray(data.changes)) throw new Error('Rate diff response is invalid.')
        setState({ region, data, loading: false, unavailable: false })
      } catch {
        if (!controller.signal.aborted) {
          setState({ region, data: null, loading: false, unavailable: true })
        }
      }
    }
    void load()
    return () => controller.abort()
  }, [region])

  return state.region === region
    ? state
    : { data: null, loading: true, unavailable: false }
}