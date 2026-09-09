import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { fallbackRateCard } from '../src/domain/rates'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('foundry-cost-lab-guided-estimate-v1', 'complete')
  })
  const card = structuredClone(fallbackRateCard)
  card.rates['guardrail.sentinel.gb']!.value = 6.7071
  await page.route(/\/api\/rates\?/, async (route) => {
    await route.fulfill({ json: card })
  })
  await page.route('**/api/rates/diff*', async (route) => {
    await route.fulfill({ status: 503, json: { error: 'No test history' } })
  })
  await page.route('**/api/catalog*', async (route) => {
    await route.fulfill({ status: 503, json: { error: 'Offline test' } })
  })
})

for (const width of [1440, 390]) {
  test(`requires explicit Sentinel consumption and updates its cost at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 })
    await page.goto('/')
    await page.getByRole('button', { name: 'Production', exact: true }).click()
    await page.getByRole('tab', { name: 'Guardrail', exact: true }).click()
    const toggle = page.getByRole('switch', { name: 'Toggle Microsoft Sentinel', exact: true })
    const volume = page.getByLabel('Billable monthly ingestion', { exact: true })
    const line = page.locator('.cost-line').filter({ hasText: 'Microsoft Sentinel ingestion' })
    await expect(toggle).not.toBeChecked()
    await expect(line).toHaveCount(0)
    await toggle.click()
    await expect(volume).toHaveValue('')

    if (width < 860) await page.getByRole('tab', { name: 'Results', exact: true }).click()
    await expect(line).toContainText('Billable monthly ingestion required')
    await expect(line).toContainText('Unpriced')
    await page.getByRole('region', { name: 'Pricing readiness', exact: true })
      .getByRole('button', { name: 'Edit Microsoft Sentinel ingestion', exact: true }).click()
    await expect(volume).toBeVisible()
    await volume.fill('25')
    await expect(volume).toHaveValue('25')
    await page.getByRole('region', { name: 'Security operations', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath('sentinel-explicit-volume.png'), fullPage: false })

    if (width < 860) await page.getByRole('tab', { name: 'Results', exact: true }).click()
    await expect(line).toContainText('$167.68')
    await expect(line).not.toContainText('Unpriced')
    if (width < 860) await page.getByRole('tab', { name: 'Configure', exact: true }).click()
    await volume.fill('40')
    if (width < 860) await page.getByRole('tab', { name: 'Results', exact: true }).click()
    await expect(line).toContainText('$268.28')

    if (width < 860) await page.getByRole('tab', { name: 'Configure', exact: true }).click()
    await volume.fill('0')
    if (width < 860) await page.getByRole('tab', { name: 'Results', exact: true }).click()
    await expect(line).toContainText('$0.00')
    await expect(line).not.toContainText('Unpriced')
    if (width < 860) await page.getByRole('tab', { name: 'Configure', exact: true }).click()
    await volume.fill('')
    if (width < 860) await page.getByRole('tab', { name: 'Results', exact: true }).click()
    await expect(line).toContainText('Billable monthly ingestion required')
    if (width < 860) await page.getByRole('tab', { name: 'Configure', exact: true }).click()
    await toggle.click()
    await expect(line).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
    expect((await new AxeBuilder({ page }).include('.config-panel').analyze()).violations).toEqual([])
  })
}

test('retains explicit Sentinel usage through toggles, save and reload', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Guardrail', exact: true }).click()
  const toggle = page.getByRole('switch', { name: 'Toggle Microsoft Sentinel', exact: true })
  const volume = page.getByLabel('Billable monthly ingestion', { exact: true })
  await toggle.click()
  await volume.fill('25000')
  await toggle.click()
  await toggle.click()
  await expect(volume).toHaveValue('25000')
  await page.getByRole('button', { name: /^Scenarios/ }).click()
  await page.getByLabel('Scenario name', { exact: true }).fill('Explicit security allocation')
  await page.getByRole('button', { name: 'Save current', exact: true }).click()
  await page.getByRole('button', { name: 'Close scenarios', exact: true }).click()
  await volume.fill('12.5')
  await page.reload()
  await page.getByRole('tab', { name: 'Guardrail', exact: true }).click()
  await expect(toggle).toBeChecked()
  await expect(volume).toHaveValue('12.5')
  await page.getByRole('button', { name: /^Scenarios/ }).click()
  await page.getByRole('button', { name: 'Load Explicit security allocation', exact: true }).click()
  await expect(volume).toHaveValue('25000')
  await expect(page.locator('.cost-line').filter({ hasText: 'Microsoft Sentinel ingestion' })).toContainText('$167,677.50')
})