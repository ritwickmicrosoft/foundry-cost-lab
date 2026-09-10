import { beforeEach, describe, expect, it } from 'vitest'
import { computeCost } from '../domain/computeCost'
import { createEmptyConfig, createPreset } from '../domain/presets'
import { fallbackRateCard } from '../domain/rates'
import { MAX_COMPARISON_SCENARIOS } from '../domain/scenarioComparison'
import type { CostConfig } from '../domain/types'
import { migrateLabState, useLabStore, type SavedScenario } from './useLabStore'

describe('calculator edit history', () => {
  beforeEach(() => {
    useLabStore.setState({ config: createPreset('poc'), undoStack: [], redoStack: [], editGroupActive: false, editGroupRecorded: false, scenarios: [] })
  })

  it('groups a field edit and restores its final value with redo', () => {
    const original = structuredClone(useLabStore.getState().config)
    useLabStore.getState().beginConfigEdit()
    for (const users of [5, 50, 500]) {
      useLabStore.getState().updateConfig((config) => { config.workload.monthlyUsers = users })
    }
    useLabStore.getState().endConfigEdit()
    expect(useLabStore.getState().undoStack).toHaveLength(1)
    useLabStore.getState().undoConfig()
    expect(useLabStore.getState().config).toEqual(original)
    useLabStore.getState().redoConfig()
    expect(useLabStore.getState().config.workload.monthlyUsers).toBe(500)
  })

  it('changes delivery stage without replacing workload, model, or infrastructure choices', () => {
    useLabStore.getState().updateConfig((config) => {
      config.workload.monthlyUsers = 321
      config.workload.requestsPerUserPerDay = 6
      config.workload.agentTurnMultiplier = 3
      config.region = 'eastus2'
      config.environments = 2
      config.guardrail.sentinel.enabled = true
      config.guardrail.sentinel.ingestedGbPerMonth = 12.5
    })
    const original = structuredClone(useLabStore.getState().config)
    useLabStore.getState().applyPreset('production')
    expect(useLabStore.getState().config).toEqual({ ...original, posture: 'production' })
    useLabStore.getState().applyPreset('poc')
    expect(useLabStore.getState().config).toEqual(original)
  })

  it('preserves explicitly provisioned primary and DR capacity through stage changes and undo', () => {
    const explicit = createPreset('production')
    explicit.commercialModel.ptuUnits = 30
    explicit.disasterRecovery.secondaryPtuUnits = 15
    explicit.environments = 4
    explicit.commercialOffsetPercent = 5
    useLabStore.setState({ config: explicit, undoStack: [], redoStack: [] })
    useLabStore.getState().applyPreset('poc')
    expect(useLabStore.getState().config).toEqual({ ...explicit, posture: 'poc' })
    expect(useLabStore.getState().undoStack).toHaveLength(1)
    useLabStore.getState().undoConfig()
    expect(useLabStore.getState().config).toEqual(explicit)
    useLabStore.getState().redoConfig()
    expect(useLabStore.getState().config).toEqual({ ...explicit, posture: 'poc' })
  })

  it('does not create history or reset settings when the current stage is selected again', () => {
    const original = structuredClone(useLabStore.getState().config)
    useLabStore.getState().applyPreset('poc')
    expect(useLabStore.getState().config).toEqual(original)
    expect(useLabStore.getState().undoStack).toHaveLength(0)
  })

  it('undoes presets and scenario loads without changing saved scenarios', () => {
    useLabStore.getState().saveScenario('Pilot', '2026-09-06')
    const saved = structuredClone(useLabStore.getState().scenarios)
    useLabStore.getState().applyPreset('production')
    useLabStore.getState().loadScenario(saved[0]!.id)
    expect(useLabStore.getState().config.posture).toBe('poc')
    useLabStore.getState().undoConfig()
    expect(useLabStore.getState().config.posture).toBe('production')
    useLabStore.getState().undoConfig()
    expect(useLabStore.getState().config.posture).toBe('poc')
    expect(useLabStore.getState().scenarios).toEqual(saved)
  })

  it('bounds history, skips unchanged inputs, and clears redo after a new edit', () => {
    useLabStore.getState().updateConfig(() => {})
    expect(useLabStore.getState().undoStack).toHaveLength(0)
    for (let users = 1; users <= 60; users += 1) {
      useLabStore.getState().updateConfig((config) => { config.workload.monthlyUsers = users })
    }
    expect(useLabStore.getState().undoStack).toHaveLength(50)
    useLabStore.getState().undoConfig()
    useLabStore.getState().updateConfig((config) => { config.workload.monthlyUsers = 999 })
    expect(useLabStore.getState().redoStack).toHaveLength(0)
    const persisted = useLabStore.persist.getOptions().partialize?.(useLabStore.getState())
    expect(persisted).not.toHaveProperty('undoStack')
    expect(persisted).not.toHaveProperty('redoStack')
  })

  it('starts the calculator with no workload after a workspace reset', () => {
    useLabStore.getState().resetWorkspace()

    const config = useLabStore.getState().config
    const expectClearedInputs = (value: unknown) => {
      if (typeof value === 'number') expect(value).toBe(0)
      if (typeof value === 'boolean') expect(value).toBe(false)
      if (value !== null && typeof value === 'object') {
        Object.values(value).forEach(expectClearedInputs)
      }
    }
    expectClearedInputs({ ...config, environments: 0, modelPortfolio: {} })
    expect(config.environments).toBe(1)
    expect(config.modelPortfolio).toEqual(createPreset('poc').modelPortfolio)
    expect(config.periodStart).toBe(`${new Date().toISOString().slice(0, 7)}-01`)
    expect(computeCost(config, fallbackRateCard)).toMatchObject({
      lines: [], knownGrandTotal: 0, dailyBurn: 0,
      metrics: { monthlyTurns: 0, primaryInputTokens: 0, primaryOutputTokens: 0, mcpSchemaTokens: 0 },
    })
    expect(createPreset('poc').workload.monthlyUsers).toBe(250)
  })

  it('resets all scenario data and history without allowing undo to recover it', () => {
    useLabStore.getState().applyPreset('production')
    useLabStore.getState().updateConfig((config) => {
      config.region = 'eastus2'
      config.workload.monthlyUsers = 9000
      config.commercialModel.priceProfiles.push({
        modelId: config.commercialModel.modelId, deploymentSku: 'global-standard',
        source: 'Private offer', asOf: '2026-09-07', inputRateCadPerMillion: 1,
        cachedInputRateCadPerMillion: null, outputRateCadPerMillion: 2,
        batchInputRateCadPerMillion: null, batchOutputRateCadPerMillion: null,
        ptuHourlyRateCad: null, managedComputeHourlyRateCad: null, usageUnitRateCad: null,
      })
    })
    useLabStore.getState().saveScenario('First', '2026-09-07')
    useLabStore.getState().saveScenario('Second', '2026-09-07')
    for (const scenario of useLabStore.getState().scenarios) useLabStore.getState().toggleComparison(scenario.id)
    useLabStore.getState().openComparison()
    useLabStore.getState().undoConfig()
    useLabStore.getState().beginConfigEdit()

    useLabStore.getState().resetWorkspace()

    const expected = createEmptyConfig()
    expect(useLabStore.getState()).toMatchObject({
      config: expected, scenarios: [], comparisonIds: [], comparisonOpen: false,
      undoStack: [], redoStack: [], editGroupActive: false, editGroupRecorded: false,
    })
    useLabStore.getState().undoConfig()
    useLabStore.getState().redoConfig()
    expect(useLabStore.getState().config).toEqual(expected)
    expect(useLabStore.persist.getOptions().partialize?.(useLabStore.getState())).toEqual({
      config: expected, scenarios: [], comparisonIds: [],
    })
  })
})

function versionOneConfig(): CostConfig {
  const config = createPreset('production')
  delete (config as Partial<CostConfig>).hostedAgent
  delete (config as Partial<CostConfig>).foundryServices
  delete (config.platform as Partial<CostConfig['platform']>).standardAgentSetup
  const commercialModel = config.commercialModel as Partial<CostConfig['commercialModel']>
  delete commercialModel.modelId
  delete commercialModel.deploymentOption
  delete commercialModel.billingBasis
  delete commercialModel.customInputRateCadPerMillion
  delete commercialModel.customOutputRateCadPerMillion
  delete commercialModel.customPtuHourlyRateCad
  delete commercialModel.managedCompute
  delete commercialModel.usage
  return config
}

describe('lab-state migrations', () => {
  it('preserves existing Sentinel allocations in current and saved state', () => {
    const config = createPreset('production')
    config.guardrail.sentinel = { enabled: true, rateKey: 'guardrail.sentinel.gb', ingestedGbPerMonth: 25_000 }
    const scenario = {
      id: 'existing-sentinel', name: 'Existing Sentinel allocation', config: structuredClone(config),
      rateCardAsOf: '2026-08-23', createdAt: '2026-08-23T00:00:00Z', updatedAt: '2026-08-23T00:00:00Z',
    }
    const migrated = migrateLabState({ config, scenarios: [scenario], comparisonIds: [] }, 7)
    expect(migrated.config.guardrail.sentinel).toEqual(config.guardrail.sentinel)
    expect(migrated.scenarios[0]?.config.guardrail.sentinel).toEqual(config.guardrail.sentinel)
    useLabStore.setState({ config, scenarios: [scenario] })
    useLabStore.getState().applyPreset('production')
    expect(useLabStore.getState().config.guardrail.sentinel).toEqual(config.guardrail.sentinel)
    useLabStore.getState().loadScenario('existing-sentinel')
    expect(useLabStore.getState().config.guardrail.sentinel).toEqual(config.guardrail.sentinel)
    expect(useLabStore.getState().scenarios[0]?.config.guardrail.sentinel).toEqual(config.guardrail.sentinel)
  })

  it('migrates version-7 single-model state to a 100% primary route', () => {
    const config = createPreset('poc')
    delete (config as Partial<CostConfig>).modelPortfolio
    const scenarioConfig = structuredClone(config)
    const scenario = {
      id: 'legacy-v7',
      name: 'Legacy v7',
      config: scenarioConfig,
      rateCardAsOf: '2026-08-26',
      createdAt: '2026-08-26T00:00:00Z',
      updatedAt: '2026-08-26T00:00:00Z',
    }

    const migrated = migrateLabState({ config, scenarios: [scenario], comparisonIds: [] }, 7)

    expect(migrated.config.modelPortfolio).toEqual({
      strategy: 'single',
      deployments: [],
      routes: [{
        id: 'primary-route',
        label: 'Primary model',
        role: 'primary',
        deploymentId: 'primary',
        mode: 'traffic-share',
        trafficPercent: 100,
      }],
    })
    expect(migrated.scenarios[0]?.config.modelPortfolio.routes[0]?.trafficPercent).toBe(100)
    expect(migrated.config.commercialModel.modelId).toBe('direct-azure/gpt-4o/2024-11-20')
  })

  it('caps comparison selections and removes stale scenario IDs', () => {
    const scenarios: SavedScenario[] = ['a', 'b', 'c', 'd'].map((id) => ({
      id,
      name: id,
      config: createPreset('poc'),
      rateCardAsOf: '2026-08-25',
      createdAt: '2026-08-25T00:00:00Z',
      updatedAt: '2026-08-25T00:00:00Z',
    }))
    const migrated = migrateLabState({
      config: createPreset('poc'),
      scenarios,
      comparisonIds: ['a', 'missing', 'b', 'a', 'c', 'd'],
    }, 6)

    expect(migrated.comparisonIds).toEqual(['a', 'b', 'c'])
    expect(migrated.comparisonIds).toHaveLength(MAX_COMPARISON_SCENARIOS)
  })

  it('hydrates current and saved version-1 configurations without losing inputs', () => {
    const legacyConfig = versionOneConfig()
    legacyConfig.workload.monthlyUsers = 777
    const scenario: SavedScenario = {
      id: 'legacy',
      name: 'Legacy scenario',
      config: versionOneConfig(),
      rateCardAsOf: '2026-08-20',
      createdAt: '2026-08-20T00:00:00Z',
      updatedAt: '2026-08-20T00:00:00Z',
    }

    const migrated = migrateLabState(
      { config: legacyConfig, scenarios: [scenario], comparisonIds: ['legacy'] },
      1,
    )

    expect(migrated.config.workload.monthlyUsers).toBe(777)
    expect(migrated.config.commercialModel.modelId).toBe('direct-azure/gpt-4o/2024-11-20')
    expect(migrated.config.commercialModel.billingBasis).toBe('tokens')
    expect(migrated.config.hostedAgent.sandboxSize).toBe('1vcpu-2gb')
    expect(migrated.config.foundryServices.selections).toHaveLength(18)
    expect(migrated.config.platform.standardAgentSetup.cosmos.provisionedRuPerSecond).toBe(3_000)
    expect(migrated.scenarios[0]?.config.commercialModel.modelId).toBe('direct-azure/gpt-4o/2024-11-20')
    expect(migrated.scenarios[0]?.config.hostedAgent).toBeDefined()
    expect(migrated.scenarios[0]?.config.foundryServices.selections).toHaveLength(18)
    expect(migrated.scenarios[0]?.config.platform.standardAgentSetup).toBeDefined()
    expect(migrated.comparisonIds).toEqual(['legacy'])
  })

  it('migrates version-2 state into the catalog and services schema', () => {
    const legacyConfig = versionOneConfig()
    legacyConfig.workload.monthlyUsers = 2_222

    const migrated = migrateLabState(
      { config: legacyConfig, scenarios: [], comparisonIds: [] },
      2,
    )

    expect(migrated.config.workload.monthlyUsers).toBe(2_222)
    expect(migrated.config.commercialModel.deploymentOption).toBe('AOAI')
    expect(migrated.config.foundryServices.selections).toHaveLength(18)
  })

  it('migrates version-3 guardrails and network pricing without inventing charges', () => {
    const legacyConfig = createPreset('poc')
    legacyConfig.guardrail.contentSafety.enabled = true
    legacyConfig.guardrail.contentSafety.rateKey = 'guardrail.contentSafety.transaction1k'
    delete (legacyConfig.guardrail.contentSafety as Partial<CostConfig['guardrail']['contentSafety']>).monthlyTextRecords
    legacyConfig.guardrail.entra.enabled = true
    legacyConfig.platform.networkEgress.rateKey = 'platform.network.gb'

    const migrated = migrateLabState(
      { config: legacyConfig, scenarios: [], comparisonIds: [] },
      3,
    )

    expect(migrated.config.guardrail.contentSafety.enabled).toBe(false)
    expect(migrated.config.guardrail.contentSafety.rateKey).toBe('guardrail.contentSafety.text1k')
    expect(migrated.config.guardrail.contentSafety.monthlyTextRecords).toBe(88_000)
    expect(migrated.config.guardrail.entra.enabled).toBe(false)
    expect(migrated.config.platform.networkEgress.rateKey).toBe('platform.network.mgn.out')
  })

  it('migrates version-5 Content Safety rates to the regional key', () => {
    const legacyConfig = createPreset('poc')
    legacyConfig.guardrail.contentSafety.rateKey = 'guardrail.contentSafety.canadaEast.text1k'

    const migrated = migrateLabState(
      { config: legacyConfig, scenarios: [], comparisonIds: [] },
      5,
    )

    expect(migrated.config.guardrail.contentSafety.rateKey).toBe('guardrail.contentSafety.text1k')
  })

  it('migrates version-4 Content Safety rates to the regional key', () => {
    const legacyConfig = createPreset('poc')
    legacyConfig.guardrail.contentSafety.rateKey = 'guardrail.contentSafety.canadaEast.text1k'

    const migrated = migrateLabState(
      { config: legacyConfig, scenarios: [], comparisonIds: [] },
      4,
    )

    expect(migrated.config.guardrail.contentSafety.rateKey).toBe('guardrail.contentSafety.text1k')
  })
})