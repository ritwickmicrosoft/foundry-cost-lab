import { expect, test } from '@playwright/test'
import { fallbackRateCard } from '../src/domain/rates'
import type { CostConfig } from '../src/domain/types'

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/rates\?/, async (route) => {
    await route.fulfill({ json: fallbackRateCard })
  })
  await page.route('**/api/rates/diff*', async (route) => {
    await route.fulfill({ status: 503, json: { error: 'No test history' } })
  })
  await page.route('**/api/catalog*', async (route) => {
    await route.fulfill({ status: 503, json: { error: 'Offline test' } })
  })
})

for (const width of [1440, 390]) {
  test(`keeps workload and prices unchanged after skipping setup and switching stage at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width > 860 ? 1000 : 844 })
    await page.goto('/')
    await page.getByRole('button', { name: 'Skip to calculator', exact: true }).click()
    await expect(page.getByLabel('Monthly users', { exact: true })).toHaveValue('250')
    await page.getByRole('button', { name: 'POC', exact: true }).click()
    await expect(page.locator('.headline__value')).toHaveText(/\$/)
    const total = await page.locator('.headline__value').innerText()
    const initial = await page.evaluate(() => JSON.parse(localStorage.getItem('foundry-cost-lab')!).state.config)
    await page.getByRole('group', { name: 'Delivery stage', exact: true }).getByRole('button', { name: 'Production', exact: true }).click()

    await expect(page.getByLabel('Monthly users', { exact: true })).toHaveValue('250')
    await expect(page.getByLabel('Requests / user / day', { exact: true })).toHaveValue('8')
    await expect(page.getByRole('slider', { name: 'Agent turns', exact: true })).toHaveAttribute('aria-valuenow', '2')
    await expect(page.getByLabel('Environments', { exact: true })).toHaveValue('1')
    await expect(page.getByRole('button', { name: 'Pay per use Usage-based billing', exact: true })).toHaveAttribute('aria-pressed', 'true')
    const production = await page.evaluate(() => JSON.parse(localStorage.getItem('foundry-cost-lab')!).state.config)
    expect(production).toEqual({ ...initial, posture: 'production' })
    await expect(page.locator('.headline__value')).toHaveText(total)
    await expect(page.locator('.cost-line').filter({ hasText: /PTU reservation|DR model provisioned capacity/ })).toHaveCount(0)
    if (width < 860) await page.getByRole('tab', { name: 'Results', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Pricing readiness', exact: true })).toContainText('Global Standard')
    if (width < 860) await page.getByRole('tab', { name: 'Configure', exact: true }).click()
    await page.screenshot({ path: testInfo.outputPath('production-without-hidden-capacity.png'), fullPage: false })

    await page.getByRole('button', { name: 'Undo last edit', exact: true }).click()
    await expect(page.getByRole('button', { name: 'POC', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Redo edit', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Production', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.reload()
    await page.getByRole('button', { name: 'Skip to calculator', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Production', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.headline__value')).toHaveText(total)
    await page.getByRole('button', { name: 'POC', exact: true }).click()
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('foundry-cost-lab')!).state.config)).toEqual(initial)

    await page.getByLabel('Monthly users', { exact: true }).fill('500')
    await expect(page.locator('.headline__value')).not.toHaveText(total)
    const editedTotal = await page.locator('.headline__value').innerText()
    await page.getByRole('button', { name: 'Production', exact: true }).click()
    await expect(page.getByLabel('Monthly users', { exact: true })).toHaveValue('500')
    await expect(page.locator('.headline__value')).toHaveText(editedTotal)
  })
}

test('preserves existing provisioned scenarios and labels their billing accurately', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Skip to calculator', exact: true }).click()
  await page.getByRole('button', { name: 'POC', exact: true }).click()
  const legacy: CostConfig = await page.evaluate(() => JSON.parse(localStorage.getItem('foundry-cost-lab')!).state.config)
  legacy.posture = 'production'
  legacy.workload.monthlyUsers = 4000
  legacy.commercialModel.purchaseMode = 'ptu'
  legacy.commercialModel.deploymentSku = 'global-provisioned'
  legacy.commercialModel.ptuUnits = 60
  legacy.disasterRecovery.enabled = true
  legacy.disasterRecovery.secondaryPtuUnits = 60
  const savedScenario = {
    id: 'provisioned-design', name: 'Explicit provisioned design', config: legacy,
    rateCardAsOf: '2026-08-23', createdAt: '2026-08-23T00:00:00Z', updatedAt: '2026-08-23T00:00:00Z',
  }
  await page.evaluate(({ legacy, savedScenario }) => {
    localStorage.setItem('foundry-cost-lab-guided-estimate-v1', 'complete')
    localStorage.setItem('foundry-cost-lab', JSON.stringify({ version: 8, state: { config: legacy, scenarios: [savedScenario], comparisonIds: [] } }))
  }, { legacy, savedScenario })
  await page.reload()
  await page.getByRole('button', { name: 'Skip to calculator', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Provisioned API PTU-hour billing', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Pay per use Usage-based billing', exact: true })).toHaveCount(0)
  const original = await page.locator('.headline__value').innerText()
  await page.getByRole('button', { name: 'POC', exact: true }).click()
  await expect(page.locator('.headline__value')).toHaveText(original)
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('foundry-cost-lab')!).state)
  expect(state.config).toEqual({ ...legacy, posture: 'poc' })
  expect(state.scenarios).toEqual([savedScenario])
  await page.getByRole('button', { name: 'Production', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Pricing readiness', exact: true })).toContainText('Global Provisioned')
})