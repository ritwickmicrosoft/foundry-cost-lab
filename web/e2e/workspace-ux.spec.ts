import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('foundry-cost-lab-guided-estimate-v1', 'complete')
  })
  await page.route('**/api/rates*', async (route) => {
    await route.fulfill({ status: 503, json: { error: 'Offline test' } })
  })
  await page.route('**/api/catalog*', async (route) => {
    await route.fulfill({ status: 503, json: { error: 'Offline test' } })
  })
})

test('keeps mobile estimates visible while switching between configuration and results', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Skip to calculator', exact: true }).click()
  const summary = page.getByRole('region', { name: 'Estimate summary', exact: true })
  await expect(summary).toBeInViewport()
  await expect(summary.locator('output')).toHaveText(/^\$/)
  await expect(page.getByRole('tab', { name: 'Configure', exact: true })).toHaveAttribute('aria-selected', 'true')
  const original = await summary.locator('output').innerText()
  await page.getByLabel('Monthly users', { exact: true }).fill('500')
  await expect(summary.locator('output')).not.toHaveText(original)
  const updated = await summary.locator('output').innerText()
  await page.evaluate(() => window.scrollTo(0, 2000))
  await expect(summary).toBeInViewport()

  await page.getByRole('tab', { name: 'Results', exact: true }).click()
  await expect(page.locator('.headline__value')).toHaveText(updated)
  await expect(page.getByLabel('Monthly users', { exact: true })).toBeHidden()
  await page.getByRole('tab', { name: 'Configure', exact: true }).click()
  await expect(page.getByLabel('Monthly users', { exact: true })).toHaveValue('500')
  await expect(summary).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
})

test('opens the owning settings from a pricing issue on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Skip to calculator', exact: true }).click()
  await page.getByRole('button', { name: 'Production', exact: true }).click()
  await page.getByRole('tab', { name: 'Guardrail', exact: true }).click()
  await page.getByRole('switch', { name: 'Toggle Microsoft Purview', exact: true }).click()
  await page.getByRole('region', { name: 'Estimate summary', exact: true }).getByRole('button', { name: /Review pricing/ }).click()
  const readiness = page.getByRole('region', { name: 'Pricing readiness', exact: true })
  await expect(readiness).toBeInViewport()
  await readiness.getByRole('button', { name: 'Edit Microsoft Purview capacity', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Configure', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: 'Guardrail', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('region', { name: 'Security operations', exact: true })).toBeFocused()
  await expect(page.getByLabel('Capacity units', { exact: true })).toBeVisible()
})

test('undoes a complete field edit and redoes it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Skip to calculator', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Undo last edit', exact: true })).toBeDisabled()
  const users = page.getByLabel('Monthly users', { exact: true })
  await users.fill('5')
  await users.press('0')
  await users.press('0')
  await expect(users).toHaveValue('500')
  await page.getByRole('button', { name: 'Undo last edit', exact: true }).click()
  await expect(users).toHaveValue('250')
  await page.getByRole('button', { name: 'Redo edit', exact: true }).click()
  await expect(users).toHaveValue('500')
})

test('reviews and edits workload assumptions before applying a guided estimate', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/?guide=1')
  await page.getByRole('button', { name: /Employee assistant/ }).click()
  await page.getByRole('button', { name: 'Pilot Lean environment and lower volume', exact: true }).click()
  await page.getByRole('button', { name: 'Canada Central Azure pricing region', exact: true }).click()
  await page.getByRole('button', { name: 'Small 250 monthly users', exact: true }).click()
  await page.getByRole('button', { name: 'Pay per use Usage-based model billing', exact: true }).click()
  await page.getByRole('button', { name: 'Single model One model handles every request', exact: true }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Review estimate', exact: true }).click()
  const assumptions = page.getByRole('region', { name: 'Workload assumptions', exact: true })
  await expect(assumptions).toBeVisible()
  await expect(assumptions).toContainText('Preset')
  await assumptions.getByLabel('Requests / user / day', { exact: true }).fill('12')
  await assumptions.getByLabel('Input / turn', { exact: true }).fill('2400')
  await expect(assumptions).toContainText('Edited')
  const preview = await page.locator('.guide-preview__total').innerText()
  await page.getByRole('button', { name: 'Apply estimate', exact: true }).click()
  await expect(page.getByLabel('Requests / user / day', { exact: true })).toHaveValue('12')
  await expect(page.getByLabel('Input / turn', { exact: true })).toHaveValue('2400')
  await expect(page.locator('.headline__value')).toHaveText(preview)
  await expect(page.getByRole('region', { name: 'Cost results', exact: true })).toBeFocused()
})

for (const { width, scheme } of [
  { width: 320, scheme: 'light' },
  { width: 390, scheme: 'light' },
  { width: 768, scheme: 'light' },
  { width: 1440, scheme: 'light' },
  { width: 390, scheme: 'dark' },
] as const) {
  test(`keeps the ${width}px ${scheme} workspace accessible`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width < 860 ? 844 : 1000 })
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/')
    await page.getByRole('button', { name: 'Skip to calculator', exact: true }).click()
    if (width < 860) {
      await page.getByRole('tab', { name: 'Configure', exact: true }).focus()
      await page.getByRole('tab', { name: 'Configure', exact: true }).press('ArrowRight')
      await expect(page.getByRole('tab', { name: 'Results', exact: true })).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByRole('region', { name: 'Estimate summary', exact: true })).toBeInViewport()
    } else {
      await expect(page.getByRole('region', { name: 'Estimate summary', exact: true })).toBeHidden()
      await expect(page.getByLabel('Cost configuration', { exact: true })).toBeVisible()
    }
    await expect(page.getByRole('heading', { name: 'Known cost drivers', exact: true })).toBeVisible()
    await expect(page.locator('.cost-drivers li')).toHaveCount(3)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.screenshot({ path: testInfo.outputPath(`workspace-${width}-${scheme}.png`), fullPage: false })

    await page.getByText('Model rate details', { exact: true }).click()
    await page.getByText('Projection, capacity and rate history', { exact: true }).click()
    await expect(page.getByText('Modeled spend to date')).toBeVisible()
    await expect(page.getByText(/Accrued since/)).toHaveCount(0)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    if (width < 860) {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const footer = await page.locator('.app-footer').boundingBox()
      const bar = await page.getByRole('region', { name: 'Estimate summary', exact: true }).boundingBox()
      expect(footer!.y + footer!.height).toBeLessThanOrEqual(bar!.y + 1)
    }
  })
}

test('keeps large totals and bottom controls usable on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Skip to calculator', exact: true }).click()
  await page.getByLabel('Monthly users', { exact: true }).fill('1000000')
  const summary = page.getByRole('region', { name: 'Estimate summary', exact: true })
  await expect(summary.locator('output')).toContainText('M')
  const amount = await summary.locator('output').boundingBox()
  const review = await summary.getByRole('button', { name: /Review pricing/ }).boundingBox()
  expect(amount!.x + amount!.width).toBeLessThanOrEqual(review!.x)
  await expect(summary).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
})