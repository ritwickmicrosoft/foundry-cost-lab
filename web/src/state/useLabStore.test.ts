import { describe, expect, it } from 'vitest'
import { createPreset } from '../domain/presets'
import type { CostConfig } from '../domain/types'
import { migrateLabState, type SavedScenario } from './useLabStore'

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