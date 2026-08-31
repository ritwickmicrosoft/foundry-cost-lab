import { describe, expect, it } from 'vitest'
import { FOUNDRY_MODEL_CATALOG } from './foundryCatalog'
import { buildGuidedConfig, DEFAULT_GUIDED_ANSWERS } from './guidedEstimate'

describe('guided estimate mapping', () => {
  it('maps a pay-per-use pilot into transparent calculator inputs', () => {
    const config = buildGuidedConfig({
      ...DEFAULT_GUIDED_ANSWERS,
      scale: 'medium',
      requirements: ['knowledge', 'observability'],
    }, FOUNDRY_MODEL_CATALOG, '2026-08-01')

    expect(config.posture).toBe('poc')
    expect(config.workload.monthlyUsers).toBe(2_000)
    expect(config.commercialModel).toMatchObject({
      modelId: 'direct-azure/gpt-4o/2024-11-20',
      deploymentSku: 'global-standard',
      billingBasis: 'tokens',
      purchaseMode: 'payg',
    })
    expect(config.platform.knowledgeSearch.enabled).toBe(true)
    expect(config.observability.enabled).toBe(true)
    expect(config.platform.privateEndpoints.enabled).toBe(false)
  })

  it('adapts production dedicated hosting without inventing a VM rate', () => {
    const config = buildGuidedConfig({
      ...DEFAULT_GUIDED_ANSWERS,
      posture: 'production',
      hosting: 'dedicated',
      instances: 2,
      availability: 'business',
      requirements: ['private-networking', 'disaster-recovery'],
    }, FOUNDRY_MODEL_CATALOG, '2026-08-01')

    expect(config.commercialModel.modelId).toContain('qwen--qwen3.6-27b')
    expect(config.commercialModel).toMatchObject({
      deploymentOption: 'Managed Compute',
      deploymentSku: 'managed-compute',
      billingBasis: 'managed-compute',
      managedCompute: {
        instances: 2,
        hoursPerMonth: 176,
        instanceHourlyRateCad: null,
      },
    })
    expect(config.platform.privateEndpoints.enabled).toBe(true)
    expect(config.networking.privateLinkData.enabled).toBe(true)
    expect(config.disasterRecovery.enabled).toBe(true)
  })

  it('creates explicit shared and additive multi-model strategies', () => {
    const costOptimized = buildGuidedConfig({
      ...DEFAULT_GUIDED_ANSWERS,
      modelStrategy: 'cost-optimized',
    }, FOUNDRY_MODEL_CATALOG, '2026-08-01')
    expect(costOptimized.modelPortfolio.routes.map((route) => ({
      role: route.role,
      mode: route.mode,
      trafficPercent: route.trafficPercent,
    }))).toEqual([
      { role: 'primary', mode: 'traffic-share', trafficPercent: 30 },
      { role: 'fast', mode: 'traffic-share', trafficPercent: 70 },
    ])
    expect(costOptimized.modelPortfolio.deployments[0]?.model.modelId).toContain('gpt-5.4-nano')

    const quality = buildGuidedConfig({
      ...DEFAULT_GUIDED_ANSWERS,
      modelStrategy: 'quality-focused',
    }, FOUNDRY_MODEL_CATALOG, '2026-08-01')
    expect(quality.modelPortfolio.routes[1]).toMatchObject({
      role: 'reasoning',
      mode: 'additive',
      trafficPercent: 15,
    })

    const multimodal = buildGuidedConfig({
      ...DEFAULT_GUIDED_ANSWERS,
      modelStrategy: 'multimodal',
    }, FOUNDRY_MODEL_CATALOG, '2026-08-01')
    expect(multimodal.modelPortfolio.deployments[0]?.model.modelId).toContain('Phi-4-multimodal-instruct')
    expect(multimodal.modelPortfolio.routes[1]).toMatchObject({ role: 'multimodal', mode: 'additive' })
  })
})