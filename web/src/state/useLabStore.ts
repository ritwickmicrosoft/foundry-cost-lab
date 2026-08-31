import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createPreset } from '../domain/presets'
import { MAX_COMPARISON_SCENARIOS } from '../domain/scenarioComparison'
import type { CostConfig, Posture } from '../domain/types'
import { createResilientStorage } from './resilientStorage'

export interface SavedScenario {
  id: string
  name: string
  config: CostConfig
  rateCardAsOf: string
  createdAt: string
  updatedAt: string
}

interface LabState {
  config: CostConfig
  scenarios: SavedScenario[]
  comparisonIds: string[]
  comparisonOpen: boolean
  updateConfig: (update: (config: CostConfig) => void) => void
  replaceConfig: (config: CostConfig) => void
  applyPreset: (posture: Posture) => void
  saveScenario: (name: string, rateCardAsOf: string) => void
  loadScenario: (id: string) => void
  deleteScenario: (id: string) => void
  toggleComparison: (id: string) => void
  openComparison: () => void
  closeComparison: () => void
}

interface PersistedLabState {
  config: CostConfig
  scenarios: SavedScenario[]
  comparisonIds: string[]
}

function migrateCostConfig(config: CostConfig, sourceVersion: number): CostConfig {
  const posture: Posture = config.posture === 'production' ? 'production' : 'poc'
  const defaults = createPreset(posture)
  const commercialModel = config.commercialModel ?? defaults.commercialModel
  const modelPortfolio = config.modelPortfolio ?? defaults.modelPortfolio
  const guardrail = config.guardrail ?? defaults.guardrail
  const platform = config.platform ?? defaults.platform
  const serviceSelections = defaults.foundryServices.selections.map((defaultSelection) => ({
    ...defaultSelection,
    ...(config.foundryServices?.selections?.find(
      (selection) => selection.id === defaultSelection.id,
    ) ?? {}),
  }))
  return {
    ...defaults,
    ...config,
    commercialModel: {
      ...defaults.commercialModel,
      ...commercialModel,
      managedCompute: {
        ...defaults.commercialModel.managedCompute,
        ...commercialModel.managedCompute,
      },
      usage: {
        ...defaults.commercialModel.usage,
        ...commercialModel.usage,
      },
    },
    modelPortfolio: {
      ...defaults.modelPortfolio,
      ...modelPortfolio,
      deployments: Array.isArray(modelPortfolio.deployments)
        ? modelPortfolio.deployments.map((deployment) => ({
            ...deployment,
            model: {
              ...defaults.commercialModel,
              ...deployment.model,
              managedCompute: {
                ...defaults.commercialModel.managedCompute,
                ...deployment.model?.managedCompute,
              },
              usage: {
                ...defaults.commercialModel.usage,
                ...deployment.model?.usage,
              },
              priceProfiles: Array.isArray(deployment.model?.priceProfiles)
                ? deployment.model.priceProfiles
                : [],
            },
          }))
        : [],
      routes: Array.isArray(modelPortfolio.routes) && modelPortfolio.routes.length > 0
        ? modelPortfolio.routes
        : defaults.modelPortfolio.routes,
    },
    hostedAgent: config.hostedAgent ?? defaults.hostedAgent,
    foundryServices: { selections: serviceSelections },
    guardrail: {
      ...defaults.guardrail,
      ...guardrail,
      contentSafety: {
        ...defaults.guardrail.contentSafety,
        ...guardrail.contentSafety,
        enabled: sourceVersion >= 4 ? guardrail.contentSafety.enabled : false,
        rateKey: defaults.guardrail.contentSafety.rateKey,
      },
      entra: {
        ...defaults.guardrail.entra,
        ...guardrail.entra,
        enabled: sourceVersion >= 4 ? guardrail.entra.enabled : false,
      },
    },
    platform: {
      ...defaults.platform,
      ...platform,
      networkEgress: {
        ...defaults.platform.networkEgress,
        ...platform.networkEgress,
        rateKey: defaults.platform.networkEgress.rateKey,
      },
      standardAgentSetup:
        platform.standardAgentSetup ?? defaults.platform.standardAgentSetup,
    },
  }
}

export function migrateLabState(persistedState: unknown, version: number): PersistedLabState {
  if (!persistedState || typeof persistedState !== 'object') {
    return { config: createPreset('poc'), scenarios: [], comparisonIds: [] }
  }

  const state = persistedState as PersistedLabState
  if (version >= 6) {
    const scenarios = Array.isArray(state.scenarios) ? state.scenarios : []
    const scenarioIds = new Set(scenarios.map((scenario) => scenario.id))
    return {
      ...state,
      config: migrateCostConfig(state.config, version),
      scenarios: scenarios.map((scenario) => ({
        ...scenario,
        config: migrateCostConfig(scenario.config, version),
      })),
      comparisonIds: [...new Set(Array.isArray(state.comparisonIds) ? state.comparisonIds : [])]
        .filter((id) => scenarioIds.has(id))
        .slice(0, MAX_COMPARISON_SCENARIOS),
    }
  }
  const migrateContentSafetyKey = (config: CostConfig) => {
    const migrated = structuredClone(config)
    migrated.guardrail.contentSafety.rateKey = 'guardrail.contentSafety.text1k'
    return migrated
  }
  if (version === 5) {
    return {
      ...state,
      config: migrateCostConfig(migrateContentSafetyKey(state.config), version),
      scenarios: Array.isArray(state.scenarios)
        ? state.scenarios.map((scenario) => ({
            ...scenario,
        config: migrateCostConfig(migrateContentSafetyKey(scenario.config), version),
          }))
        : [],
      comparisonIds: Array.isArray(state.comparisonIds) ? state.comparisonIds : [],
    }
  }
  if (version === 4) {
    const migrateCurrent = (config: CostConfig) => {
      const defaults = createPreset(config.posture === 'production' ? 'production' : 'poc')
      return {
        ...defaults,
        ...config,
        commercialModel: { ...defaults.commercialModel, ...config.commercialModel },
      }
    }
    return {
      ...state,
      config: migrateCostConfig(migrateContentSafetyKey(migrateCurrent(state.config)), version),
      scenarios: Array.isArray(state.scenarios)
        ? state.scenarios.map((scenario) => ({
            ...scenario,
        config: migrateCostConfig(migrateContentSafetyKey(migrateCurrent(scenario.config)), version),
          }))
        : [],
      comparisonIds: Array.isArray(state.comparisonIds) ? state.comparisonIds : [],
    }
  }
  return {
    ...state,
    config: migrateCostConfig(state.config, version),
    scenarios: Array.isArray(state.scenarios)
      ? state.scenarios.map((scenario) => ({
          ...scenario,
          config: migrateCostConfig(scenario.config, version),
        }))
      : [],
    comparisonIds: Array.isArray(state.comparisonIds) ? state.comparisonIds : [],
  }
}

const initialConfig = createPreset('poc')
const currentMonth = new Date().toISOString().slice(0, 7)
initialConfig.periodStart = `${currentMonth}-01`

export const labStorage = createResilientStorage(() => window.localStorage)

const createScenarioId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `scenario-${Date.now()}`

export const useLabStore = create<LabState>()(
  persist(
    (set, get) => ({
      config: initialConfig,
      scenarios: [],
      comparisonIds: [],
      comparisonOpen: false,
      updateConfig: (update) =>
        set((state) => {
          const config = structuredClone(state.config)
          update(config)
          return { config }
        }),
      replaceConfig: (config) => set({ config: structuredClone(config) }),
      applyPreset: (posture) =>
        set((state) => {
          const config = createPreset(posture)
          config.periodStart = state.config.periodStart
          config.region = state.config.region
          return { config }
        }),
      saveScenario: (name, rateCardAsOf) => {
        const cleanName = name.trim()
        if (!cleanName) return
        const now = new Date().toISOString()
        set((state) => {
          const existing = state.scenarios.find(
            (scenario) => scenario.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase(),
          )
          if (existing) {
            return {
              scenarios: state.scenarios.map((scenario) =>
                scenario.id === existing.id
                  ? {
                      ...scenario,
                      name: cleanName,
                      config: structuredClone(state.config),
                      rateCardAsOf,
                      updatedAt: now,
                    }
                  : scenario,
              ),
            }
          }
          return {
            scenarios: [
              ...state.scenarios,
              {
                id: createScenarioId(),
                name: cleanName,
                config: structuredClone(state.config),
                rateCardAsOf,
                createdAt: now,
                updatedAt: now,
              },
            ],
          }
        })
      },
      loadScenario: (id) => {
        const scenario = get().scenarios.find((candidate) => candidate.id === id)
        if (scenario) set({ config: structuredClone(scenario.config) })
      },
      deleteScenario: (id) =>
        set((state) => ({
          scenarios: state.scenarios.filter((scenario) => scenario.id !== id),
          comparisonIds: state.comparisonIds.filter((candidate) => candidate !== id),
        })),
      toggleComparison: (id) =>
        set((state) => ({
          comparisonIds: state.comparisonIds.includes(id)
            ? state.comparisonIds.filter((candidate) => candidate !== id)
            : state.comparisonIds.length < MAX_COMPARISON_SCENARIOS
              ? [...state.comparisonIds, id]
              : state.comparisonIds,
        })),
      openComparison: () => set((state) => ({ comparisonOpen: state.comparisonIds.length >= 2 })),
      closeComparison: () => set({ comparisonOpen: false }),
    }),
    {
      name: 'foundry-cost-lab',
      version: 8,
      storage: createJSONStorage(() => labStorage.storage),
      migrate: migrateLabState,
      partialize: (state) => ({
        config: state.config,
        scenarios: state.scenarios,
        comparisonIds: state.comparisonIds,
      }),
    },
  ),
)