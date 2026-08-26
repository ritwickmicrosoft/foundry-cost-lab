import { useEffect, useState } from 'react'
import { computeCost } from '../domain/computeCost'
import {
  bundledFoundryCatalog,
  mergeFoundryCatalog,
  validateFoundryCatalogSnapshot,
  type ActiveFoundryCatalog,
} from '../domain/foundryCatalog'
import { fallbackRateCardFor, validateRateCard } from '../domain/rates'
import type { ComparisonSource } from '../domain/scenarioComparison'
import type { RateCard, RegionId } from '../domain/types'
import type { SavedScenario } from '../state/useLabStore'

interface RegionComparisonData {
  rateCard: RateCard
  catalog: ActiveFoundryCatalog
  notice: string | null
}

interface ScenarioComparisonDataState {
  sources: ComparisonSource[]
  loading: boolean
  notices: string[]
}

const fallbackRegionData = (region: RegionId): RegionComparisonData => ({
  rateCard: fallbackRateCardFor(region),
  catalog: bundledFoundryCatalog(region),
  notice: null,
})

export function buildComparisonSources(
  scenarios: readonly SavedScenario[],
  regions: ReadonlyMap<RegionId, RegionComparisonData>,
): ComparisonSource[] {
  return scenarios.map((scenario) => {
    const regionData = regions.get(scenario.config.region) ?? fallbackRegionData(scenario.config.region)
    return {
      id: scenario.id,
      name: scenario.name,
      savedRateCardAsOf: scenario.rateCardAsOf,
      config: scenario.config,
      rateCard: regionData.rateCard,
      result: computeCost(scenario.config, regionData.rateCard, regionData.catalog.models),
    }
  })
}

export function useScenarioComparisonData(
  scenarios: readonly SavedScenario[],
): ScenarioComparisonDataState {
  const initialRegions = new Map<RegionId, RegionComparisonData>()
  scenarios.forEach((scenario) => initialRegions.set(
    scenario.config.region,
    fallbackRegionData(scenario.config.region),
  ))
  const [state, setState] = useState<ScenarioComparisonDataState>({
    sources: buildComparisonSources(scenarios, initialRegions),
    loading: true,
    notices: [],
  })

  useEffect(() => {
    const controller = new AbortController()
    const selected = [...scenarios]
    const regionIds = [...new Set(selected.map((scenario) => scenario.config.region))]
    const fallbackRegions = new Map<RegionId, RegionComparisonData>()
    regionIds.forEach((region) => fallbackRegions.set(region, fallbackRegionData(region)))
    setState({ sources: buildComparisonSources(selected, fallbackRegions), loading: true, notices: [] })

    const loadRegion = async (region: RegionId): Promise<[RegionId, RegionComparisonData]> => {
      const fallback = fallbackRegionData(region)
      try {
        const [ratesResponse, catalogResponse] = await Promise.all([
          fetch(`/api/rates?region=${region}`, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          }),
          fetch(`/api/catalog?region=${region}`, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          }),
        ])
        if (!ratesResponse.ok) throw new Error(`Rates API returned ${ratesResponse.status}.`)
        if (!catalogResponse.ok) throw new Error(`Catalog API returned ${catalogResponse.status}.`)
        const rateCard = validateRateCard(await ratesResponse.json())
        const snapshot = validateFoundryCatalogSnapshot(await catalogResponse.json())
        if (rateCard.region !== region || snapshot.region !== region) {
          throw new Error('Comparison data returned the wrong region.')
        }
        const localFallback = ratesResponse.headers.get('X-Rate-Source') === 'vite-built-in' ||
          catalogResponse.headers.get('X-Catalog-Source') === 'vite-built-in'
        return [region, {
          rateCard,
          catalog: mergeFoundryCatalog(snapshot, region),
          notice: localFallback ? `${region} comparison uses bundled local data.` : null,
        }]
      } catch (error) {
        if (controller.signal.aborted) throw error
        const detail = error instanceof Error ? error.message : 'Unknown comparison data error.'
        return [region, { ...fallback, notice: `${region} comparison uses dated built-in data. ${detail}` }]
      }
    }

    const load = async () => {
      try {
        const regions = new Map(await Promise.all(regionIds.map(loadRegion)))
        if (controller.signal.aborted) return
        setState({
          sources: buildComparisonSources(selected, regions),
          loading: false,
          notices: [...regions.values()].flatMap((region) => region.notice ? [region.notice] : []),
        })
      } catch {
        if (controller.signal.aborted) return
        setState({
          sources: buildComparisonSources(selected, fallbackRegions),
          loading: false,
          notices: ['Comparison data could not be refreshed; dated built-in data is shown.'],
        })
      }
    }
    void load()
    return () => controller.abort()
  }, [scenarios])

  return state
}