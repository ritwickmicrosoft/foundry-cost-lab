import { describe, expect, it } from 'vitest'
import { meterSpecs } from './meterSpecs.js'
import type { RetailPriceItem } from './retailPricesClient.js'

const prefix = 'model.catalog.direct-azure-gpt-5-4-mini-2026-03-17.global-standard'
const inputSpec = meterSpecs.find((spec) => spec.key === `${prefix}.input`)!
const miniInput: RetailPriceItem = {
  currencyCode: 'CAD',
  retailPrice: 1.0395,
  unitPrice: 1.0395,
  armRegionName: 'eastus',
  effectiveStartDate: '2026-03-01T00:00:00Z',
  meterName: '5.4 mini Inp Gl 1M Tokens',
  skuName: '5.4 mini Inp Gl',
  productName: 'Azure OpenAI GPT5',
  serviceName: 'Foundry Models',
  unitOfMeasure: '1M',
  isPrimaryMeterRegion: true,
  tierMinimumUnits: 0,
  type: 'Consumption',
}

describe('GPT-5.4-mini meter identity', () => {
  it.each(['canadaeast', 'eastus', 'eastus2'] as const)('matches only the requested %s region', (region) => {
    expect(inputSpec.filter(region)).toContain(`armRegionName eq '${region}'`)
    expect(inputSpec.filter(region)).toContain("productName eq 'Azure OpenAI GPT5'")
    expect(inputSpec.filter(region)).toContain("priceType eq 'Consumption'")
    expect(inputSpec.matches({ ...miniInput, armRegionName: region }, region)).toBe(true)
    expect(inputSpec.matches({ ...miniInput, armRegionName: region }, 'canadacentral')).toBe(false)
  })

  it.each([
    { currencyCode: 'USD' },
    { productName: 'Azure OpenAI' },
    { armRegionName: 'eastus2' },
    { type: 'Reservation' },
    { type: 'DevTestConsumption' },
    { type: undefined },
    { unitOfMeasure: '1K' },
    { unitOfMeasure: '1 Hour' },
    { tierMinimumUnits: 1000 },
    { tierMinimumUnits: undefined },
    { skuName: '5.4 mini Batch Inp Gl', meterName: '5.4 mini Batch Inp Gl 1M Tokens' },
    { skuName: '5.4 mini Inp Dz', meterName: '5.4 mini Inp Dz 1M Tokens' },
    { skuName: '5.4 mini pp Inp Gl', meterName: '5.4 mini pp Inp Gl 1M Tokens' },
    { skuName: '5.4 nano Inp Gl', meterName: '5.4 nano Inp Gl 1M Tokens' },
    { skuName: '5.4 Inp Gl', meterName: '5.4 Inp Gl 1M Tokens' },
    { skuName: '5.4 mini cd Inp Gl' },
  ])('rejects mismatched billing identity %j', (difference) => {
    expect(inputSpec.matches({ ...miniInput, ...difference }, 'eastus')).toBe(false)
  })

  it('only registers the reviewed version and Global Standard dimensions', () => {
    expect(meterSpecs.filter((spec) => spec.key.includes('gpt-5-4-mini')).map((spec) => spec.key)).toEqual([
      `${prefix}.input`, `${prefix}.cachedInput`, `${prefix}.output`,
    ])
  })

  it('normalizes 1K and 1M token units without inventing other unit conversions', () => {
    expect(inputSpec.normalize(miniInput)).toEqual({ value: 1.0395, unit: 'CAD/million tokens' })
    expect(inputSpec.normalize({ ...miniInput, unitOfMeasure: '1K', retailPrice: 0.003 })).toEqual({ value: 3, unit: 'CAD/million tokens' })
    expect(inputSpec.normalize({ ...miniInput, unitOfMeasure: '1 Hour' })).toBeNull()
    expect(inputSpec.normalize({ ...miniInput, retailPrice: -1 })).toBeNull()
    expect(inputSpec.normalize({ ...miniInput, retailPrice: NaN })).toBeNull()
    expect(inputSpec.normalize({ ...miniInput, retailPrice: 0 })?.value).toBe(0)
  })
})