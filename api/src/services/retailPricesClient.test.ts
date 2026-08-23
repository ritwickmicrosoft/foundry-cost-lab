import { describe, expect, it, vi } from 'vitest'
import { RetailPricesClient, type RetailPriceItem } from './retailPricesClient.js'

const item = (meterName: string): RetailPriceItem => ({
  currencyCode: 'CAD',
  retailPrice: 1,
  unitPrice: 1,
  armRegionName: 'canadacentral',
  effectiveStartDate: '2025-01-01T00:00:00Z',
  meterName,
  productName: 'Azure OpenAI',
  skuName: meterName,
  serviceName: 'Foundry Models',
  unitOfMeasure: '1K',
  isPrimaryMeterRegion: true,
})

describe('RetailPricesClient', () => {
  it('follows NextPageLink until pagination is exhausted', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ Items: [item('first')], NextPageLink: 'https://prices.azure.com/page-2' })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ Items: [item('second')], NextPageLink: null })),
      )
    const client = new RetailPricesClient(fetcher)

    await expect(client.query("armRegionName eq 'canadacentral'")).resolves.toEqual([
      item('first'),
      item('second'),
    ])
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('currencyCode=%27CAD%27')
  })

  it('fails closed on a non-success response', async () => {
    const client = new RetailPricesClient(
      vi.fn<typeof fetch>().mockResolvedValue(new Response('down', { status: 503, statusText: 'Unavailable' })),
      { maxRetries: 0 },
    )
    await expect(client.query('test')).rejects.toThrow('503 Unavailable')
  })

  it('honours Retry-After for throttling and then continues', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('slow down', {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '2' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ Items: [item('recovered')], NextPageLink: null })))
    const delay = vi.fn(async () => undefined)
    const client = new RetailPricesClient(fetcher, { delay })

    await expect(client.query('test')).resolves.toEqual([item('recovered')])
    expect(delay).toHaveBeenCalledWith(2_000)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})