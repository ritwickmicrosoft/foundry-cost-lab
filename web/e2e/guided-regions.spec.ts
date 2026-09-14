import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { fallbackRateCard } from '../src/domain/rates'
import { isRegionId, REGION_IDS, REGION_LABELS, type RegionId } from '../src/domain/types'

function requestRegion(url: string): RegionId {
  const region = new URL(url).searchParams.get('region') ?? ''
  if (!isRegionId(region)) throw new Error(`Unexpected region: ${region}`)
  return region
}

function regionalRates(region: RegionId) {
  const card = structuredClone(fallbackRateCard)
  card.region = region
  for (const rate of Object.values(card.rates)) {
    if (rate.value !== null) rate.value *= REGION_IDS.indexOf(region) + 1
  }
  return card
}

function regionalCatalog(region: RegionId) {
  return {
    schemaVersion: 1,
    asOf: '2026-09-06',
    region,
    sourceUrl: 'https://example.test/models',
    models: [{
      id: 'direct-azure/gpt-4o/2024-11-20',
      name: 'gpt-4o',
      version: '2024-11-20',
      publisher: `OpenAI ${region}`,
      source: 'direct-azure',
      inferenceTasks: ['chat-completion'],
      deploymentOptions: ['AOAI'],
      assetId: '',
      regionalAvailability: [region],
    }],
  }
}

function responseGate() {
  let release = () => {}
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release: () => release() }
}

async function finishDraft(page: Page) {
  await page.getByRole('button', { name: 'Small 250 monthly users', exact: true }).click()
  await page.getByRole('button', { name: 'Pay per use Usage-based model billing', exact: true }).click()
  await page.getByRole('button', { name: 'Single model One model handles every request', exact: true }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Review estimate', exact: true }).click()
}

async function reviewDraft(page: Page, region: RegionId) {
  await page.getByRole('button', { name: /Employee assistant/ }).click()
  await page.getByRole('button', { name: 'Pilot Lean environment and lower volume', exact: true }).click()
  await page.getByRole('button', { name: `${REGION_LABELS[region]} Azure pricing region`, exact: true }).click()
  await finishDraft(page)
}

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/rates\?/, async (route) => {
    await route.fulfill({ json: regionalRates(requestRegion(route.request().url())) })
  })
  await page.route(/\/api\/catalog\?/, async (route) => {
    await route.fulfill({ json: regionalCatalog(requestRegion(route.request().url())) })
  })
  await page.route('**/api/rates/diff*', async (route) => {
    await route.fulfill({ status: 503, json: { error: 'No test history' } })
  })
})

for (const width of [1440, 390]) {
  test(`opens the plain homepage in guided setup on every visit at ${width}px without losing saved work`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Build a cost scenario', exact: true })).toBeVisible()
    await expect(page.getByLabel('Draft estimate')).toHaveCount(0)
    await page.getByRole('button', { name: 'Skip to calculator', exact: true }).click()
    await page.getByLabel('Monthly users', { exact: true }).fill('777')
    await page.getByRole('button', { name: 'Scenarios', exact: true }).click()
    await page.getByLabel('Scenario name', { exact: true }).fill('Returning workspace')
    await page.getByRole('button', { name: 'Save current', exact: true }).click()
    await page.getByRole('button', { name: 'Close scenarios', exact: true }).click()
    const saved = await page.evaluate(() => localStorage.getItem('foundry-cost-lab'))
    expect(await page.evaluate(() => localStorage.getItem('foundry-cost-lab-guided-estimate-v1'))).toBe('complete')

    for (const visit of ['refresh', 'homepage', 'guide-link']) {
      if (visit === 'refresh') await page.reload()
      else await page.goto(visit === 'homepage' ? '/' : '/?guide=1')
      await expect(page.getByRole('heading', { name: 'Build a cost scenario', exact: true })).toBeVisible()
      await expect(page.getByLabel('Draft estimate')).toHaveCount(0)
      await expect(page.locator('.guide-choice[aria-pressed="true"]')).toHaveCount(0)
      expect(await page.evaluate(() => localStorage.getItem('foundry-cost-lab'))).toBe(saved)
      if (visit === 'refresh') {
        expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
        await page.screenshot({ path: testInfo.outputPath(`homepage-guide-${width}.png`) })
      }
      await page.getByRole('button', { name: 'Skip to calculator', exact: true }).click()
      await expect(page.getByLabel('Monthly users', { exact: true })).toHaveValue('777')
      expect(await page.evaluate(() => localStorage.getItem('foundry-cost-lab'))).toBe(saved)
    }
  })
}

for (const region of REGION_IDS) {
  test(`preserves the reviewed regional datasets when applying ${region}`, async ({ page }) => {
    const requests: string[] = []
    page.on('request', (request) => {
      if (/\/api\/(rates|catalog)\?/.test(request.url())) requests.push(request.url())
    })
    await page.goto('/?guide=1')
    await reviewDraft(page, region)
    await expect(page.getByLabel('Draft estimate')).toHaveAttribute('aria-busy', 'false')
    await expect(page.getByRole('button', { name: 'Apply estimate', exact: true })).toBeEnabled()
    expect(requests.some((url) => url.includes(`/rates?region=${region}`))).toBe(true)
    expect(requests.some((url) => url.includes(`/catalog?region=${region}`))).toBe(true)
    const preview = await page.locator('.guide-preview__total').innerText()
    expect(preview).toMatch(/^\$/)
    const requestsBeforeApply = [...requests]
    await expect(page.getByRole('button', { name: 'Export PDF', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Apply estimate', exact: true }).click()

    await expect(page.locator('.headline__stamp')).toContainText(REGION_LABELS[region])
    await expect(page.locator('.headline__value')).toHaveText(preview)
    await expect(page.getByLabel('Azure region')).toHaveValue(region)
    await expect(page.locator('.config-panel')).toContainText(`OpenAI ${region}`)
    await expect(page.getByRole('button', { name: 'Export PDF', exact: true })).toBeVisible()
    expect(requests).toEqual(requestsBeforeApply)
  })
}

test('retains the draft when editing an earlier answer and clears it on Start over', async ({ page }) => {
  await page.goto('/?guide=1')
  await reviewDraft(page, 'eastus2')
  await expect(page.getByLabel('Draft estimate')).toHaveAttribute('aria-busy', 'false')
  await page.getByLabel('Monthly users', { exact: true }).fill('999')
  const total = await page.locator('.guide-preview__total').innerText()
  await page.getByText('Setup selections', { exact: true }).click()
  await page.getByRole('button', { name: 'Edit What are you planning?', exact: true }).click()
  await expect(page.locator('.guide-preview__total')).toHaveText(total)
  await expect(page.getByRole('button', { name: /Employee assistant Internal/ })).toHaveAttribute('aria-pressed', 'true')
  await reviewDraft(page, 'eastus2')
  await page.getByRole('button', { name: 'Start over', exact: true }).click()
  await expect(page.getByLabel('Draft estimate')).toHaveCount(0)
  await expect(page.locator('.guide-choice[aria-pressed="true"]')).toHaveCount(0)
  await expect(page.getByText('Pricing complete', { exact: true })).toHaveCount(0)
  await reviewDraft(page, 'eastus2')
  await expect(page.getByLabel('Monthly users', { exact: true })).toHaveValue('250')
  await expect(page.getByLabel('Draft estimate')).toHaveAttribute('aria-busy', 'false')
})

test('waits for both datasets when a note overrides the region', async ({ page }, testInfo) => {
  const rates = responseGate()
  const catalog = responseGate()
  await page.route(/\/api\/rates\?region=eastus2$/, async (route) => {
    await rates.promise
    await route.fulfill({ json: regionalRates('eastus2') })
  })
  await page.route(/\/api\/catalog\?region=eastus2$/, async (route) => {
    await catalog.promise
    await route.fulfill({ json: regionalCatalog('eastus2') })
  })
  try {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/?guide=1')
    await reviewDraft(page, 'canadacentral')
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await page.getByLabel('Additional considerations').fill('5,000 users in East US 2')
    await page.getByRole('button', { name: 'Review estimate', exact: true }).click()
    const preview = page.getByLabel('Draft estimate')
    const apply = page.getByRole('button', { name: 'Apply estimate', exact: true })
    await expect(preview).toHaveAttribute('aria-busy', 'true')
    await expect(preview).toContainText('Loading East US 2 rates and catalog')
    await expect(page.locator('.guide-preview__total')).toHaveText('Pending')
    await expect(apply).toBeDisabled()
    await page.screenshot({ path: testInfo.outputPath('guided-loading-desktop.png'), fullPage: true })

    const rateResponse = page.waitForResponse(/\/api\/rates\?region=eastus2$/)
    rates.release()
    await rateResponse
    await expect(apply).toBeDisabled()
    await expect(page.locator('.guide-preview__total')).toHaveText('Pending')
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.screenshot({ path: testInfo.outputPath('guided-loading-mobile.png'), fullPage: true })

    catalog.release()
    await expect(preview).toHaveAttribute('aria-busy', 'false')
    await expect(apply).toBeEnabled()
    const reviewedTotal = await page.locator('.guide-preview__total').innerText()
    await apply.click()
    await expect(page.getByLabel('Monthly users')).toHaveValue('5000')
    await expect(page.getByLabel('Azure region')).toHaveValue('eastus2')
    await expect(page.locator('.headline__value')).toHaveText(reviewedTotal)
  } finally {
    rates.release()
    catalog.release()
  }
})

test('ignores abandoned regional requests and leaves the saved scenario unchanged on skip', async ({ page }) => {
  const abandoned = responseGate()
  const released = responseGate()
  let completed = 0
  let aborted = 0
  page.on('requestfailed', (request) => {
    if (/\/api\/(rates|catalog)\?region=eastus$/.test(request.url())) aborted += 1
  })
  await page.route(/\/api\/(rates|catalog)\?region=eastus$/, async (route) => {
    await abandoned.promise
    await route.fulfill({ json: route.request().url().includes('/rates?') ? regionalRates('eastus') : regionalCatalog('eastus') })
    completed += 1
    if (completed === 2) released.release()
  })
  try {
    await page.goto('/?guide=1')
    await reviewDraft(page, 'eastus')
    await expect(page.locator('.guide-preview__total')).toHaveText('Pending')
    await page.getByText('Setup selections', { exact: true }).click()
    await page.getByRole('button', { name: 'Edit Where should the workload run?', exact: true }).click()
    await page.getByRole('button', { name: 'East US 2 Azure pricing region', exact: true }).click()
    await finishDraft(page)
    await expect(page.getByLabel('Draft estimate')).toHaveAttribute('aria-busy', 'false')
    await expect.poll(() => aborted).toBe(2)
    const currentPreview = await page.locator('.guide-preview__total').innerText()
    abandoned.release()
    await released.promise
    await expect(page.getByLabel('Draft estimate')).toHaveAttribute('aria-busy', 'false')
    await expect(page.locator('.guide-preview__total')).toHaveText(currentPreview)
    await expect(page.getByLabel('Draft estimate')).toContainText('East US 2')

    await page.getByRole('button', { name: 'Skip to calculator', exact: true }).click()
    await expect(page.getByLabel('Azure region')).toHaveValue('canadacentral')
    await expect(page.getByLabel('Monthly users')).toHaveValue('250')
    await expect(page.locator('.headline__stamp')).toContainText('Canada Central')
  } finally {
    abandoned.release()
  }
})