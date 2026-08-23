import { useEffect, useState } from 'react'
import {
  bundledFoundryCatalog,
  mergeFoundryCatalog,
  MODEL_SOURCE_IDS,
  MODEL_SOURCE_LABELS,
  validateFoundryCatalogSnapshot,
  type ActiveFoundryCatalog,
} from '../domain/foundryCatalog'
import { REGION_LABELS, type RegionId } from '../domain/types'

interface FoundryCatalogState {
  catalog: ActiveFoundryCatalog
  loading: boolean
  usingFallback: boolean
  notice: string | null
}

export function useFoundryCatalog(region: RegionId): FoundryCatalogState {
  const [state, setState] = useState<FoundryCatalogState>({
    catalog: bundledFoundryCatalog(region),
    loading: true,
    usingFallback: true,
    notice: null,
  })

  useEffect(() => {
    const controller = new AbortController()
    const fallback = bundledFoundryCatalog(region)
    setState({ catalog: fallback, loading: true, usingFallback: true, notice: null })
    const load = async () => {
      try {
        const response = await fetch(`/api/catalog?region=${region}`, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`Catalog API returned ${response.status}.`)
        const snapshot = validateFoundryCatalogSnapshot(await response.json())
        if (snapshot.region !== region) throw new Error('Catalog API returned the wrong region.')
        const catalog = mergeFoundryCatalog(snapshot, region)
        const localFallback = response.headers.get('X-Catalog-Source') === 'vite-built-in'
        const ageHours = (Date.now() - new Date(`${snapshot.asOf}T00:00:00Z`).getTime()) / 3_600_000
        const snapshotOnlyBreakdown = MODEL_SOURCE_IDS
          .filter((source) => catalog.bundledOnlyBySource[source] > 0)
          .map((source) => `${MODEL_SOURCE_LABELS[source]} ${catalog.bundledOnlyBySource[source]}`)
          .join(', ')
        const regionLabel = REGION_LABELS[region]
        const coverageNotice = catalog.bundledOnlyCount > 0
          ? `${catalog.regionConfirmedCount} models are confirmed by the ${regionLabel} ARM feed. ${catalog.bundledOnlyCount} additional entries are snapshot-only (${snapshotOnlyBreakdown}); they remain searchable but are not confirmed deployable in this region.`
          : null
        setState({
          catalog,
          loading: false,
          usingFallback: localFallback,
          notice: localFallback
            ? `Local development is using the bundled model catalog dated ${catalog.bundledAsOf}. Set LOCAL_FUNCTIONS_URL to test morning ARM synchronization.`
            : ageHours > 36
              ? `The regional model catalog is stale; its last successful synchronization was ${snapshot.asOf}.`
              : coverageNotice,
        })
      } catch (error) {
        if (controller.signal.aborted) return
        const detail = error instanceof Error ? error.message : 'Unknown catalog error.'
        setState({
          catalog: fallback,
          loading: false,
          usingFallback: true,
          notice: `Regional model catalog unavailable. Using the bundled ${fallback.bundledAsOf} snapshot. ${detail}`,
        })
      }
    }
    void load()
    return () => controller.abort()
  }, [region])

  return state.catalog.region === region
    ? state
    : { catalog: bundledFoundryCatalog(region), loading: true, usingFallback: true, notice: null }
}