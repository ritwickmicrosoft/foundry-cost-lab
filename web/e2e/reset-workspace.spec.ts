import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const workspaceKey = 'foundry-cost-lab'
const guideKey = 'foundry-cost-lab-guided-estimate-v1'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ guideKey }) => {
    if (!sessionStorage.getItem('reset-test-initialized')) {
      localStorage.setItem(guideKey, 'complete')
      sessionStorage.setItem('reset-test-initialized', 'true')
    }
  }, { guideKey })
  await page.route('**/api/rates*', async (route) => {
    await route.fulfill({ status: 503, json: { error: 'Offline test' } })
  })
  await page.route('**/api/catalog*', async (route) => {
    await route.fulfill({ status: 503, json: { error: 'Offline test' } })
  })
})

async function saveScenario(page: Page, name: string) {
  await page.getByRole('button', { name: /^Scenarios/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Scenarios', exact: true })
  await dialog.getByLabel('Scenario name', { exact: true }).fill(name)
  await dialog.getByRole('button', { name: 'Save current', exact: true }).click()
  await dialog.getByRole('button', { name: 'Close scenarios', exact: true }).click()
}

test('preserves work on refresh and leaves everything unchanged on Cancel or Escape', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Monthly users', { exact: true }).fill('789')
  await saveScenario(page, 'Keep my work')
  await page.reload()
  await expect(page.getByLabel('Monthly users', { exact: true })).toHaveValue('789')
  const saved = await page.evaluate((key) => localStorage.getItem(key), workspaceKey)
  const trigger = page.getByRole('button', { name: 'Reset workspace', exact: true })
  await trigger.hover()
  await expect(page.getByRole('tooltip')).toHaveText('Reset workspace')
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Reset workspace?', exact: true })
  await expect(dialog).toContainText('1 saved scenario')
  await expect(dialog).toContainText('This cannot be undone')
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  expect(await page.evaluate((key) => localStorage.getItem(key), workspaceKey)).toBe(saved)
  await trigger.click()
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await expect(page.getByRole('tooltip')).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  expect(await page.evaluate((key) => localStorage.getItem(key), workspaceKey)).toBe(saved)
})

for (const profile of [
  { width: 1440, scheme: 'light' },
  { width: 320, scheme: 'light' },
  { width: 390, scheme: 'dark' },
] as const) {
  test(`confirms reset and retains it after reload at ${profile.width}px ${profile.scheme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: profile.width, height: profile.width > 860 ? 1000 : 844 })
    await page.emulateMedia({ colorScheme: profile.scheme })
    await page.goto('/')
    await page.getByLabel('Monthly users', { exact: true }).fill('9000')
    await saveScenario(page, 'Remove this scenario')
    await page.evaluate(() => {
      localStorage.setItem('comparison-brief:test-first', 'old summary')
      localStorage.setItem('comparison-brief:test-second', 'another summary')
      localStorage.setItem('unrelated-preference', 'keep')
      sessionStorage.setItem('unrelated-session', 'keep')
    })
    await page.getByRole('button', { name: 'Reset workspace', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Reset workspace?', exact: true })
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    expect((await new AxeBuilder({ page }).include('.reset-dialog').analyze()).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
    await page.screenshot({ path: testInfo.outputPath('reset-confirmation.png'), fullPage: false })
    await dialog.getByRole('button', { name: 'Delete and start over', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('heading', { name: 'Build a cost scenario', exact: true })).toBeFocused()
    await expect(page.getByText('What are you planning?', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Draft estimate', { exact: true })).toHaveCount(0)
    await expect(page.locator('.guide-choice[aria-pressed="true"]')).toHaveCount(0)
    expect((await new AxeBuilder({ page }).include('.guided-estimate').analyze()).violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
    await page.screenshot({ path: testInfo.outputPath('fresh-guide.png'), fullPage: false })
    const storage = await page.evaluate(({ workspaceKey, guideKey }) => ({
      workspace: JSON.parse(localStorage.getItem(workspaceKey)!),
      guide: localStorage.getItem(guideKey),
      briefKeys: Object.keys(localStorage).filter((key) => key.startsWith('comparison-brief:')),
      preference: localStorage.getItem('unrelated-preference'),
      session: sessionStorage.getItem('unrelated-session'),
    }), { workspaceKey, guideKey })
    expect(storage.workspace.state.scenarios).toEqual([])
    expect(storage.workspace.state.comparisonIds).toEqual([])
    expect(storage.workspace.state.config.workload.monthlyUsers).toBe(250)
    expect(storage.workspace.state.config.region).toBe('canadacentral')
    expect(storage.workspace.state.config.commercialModel.priceProfiles).toEqual([])
    expect(storage.guide).toBeNull()
    expect(storage.briefKeys).toEqual([])
    expect(storage.preference).toBe('keep')
    expect(storage.session).toBe('keep')
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Build a cost scenario', exact: true })).toBeVisible()
    await expect(page.getByLabel('Draft estimate', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Skip to calculator', exact: true }).click()
    await expect(page.getByLabel('Monthly users', { exact: true })).toHaveValue('250')
    await expect(page.getByRole('button', { name: 'Undo last edit', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Redo edit', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: /^Scenarios/ }).click()
    await expect(page.getByRole('dialog', { name: 'Scenarios', exact: true })).toContainText('No saved scenarios in this browser.')
  })
}

test('shows no preset estimate before the first choice or after resetting the guide', async ({ page }) => {
  await page.goto('/?guide=1')
  await expect(page.getByRole('complementary', { name: 'Draft estimate', exact: true })).toHaveCount(0)
  await expect(page.locator('.guide-preview__total')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Employee assistant Internal/ })).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: /Customer agent External/ }).click()
  await expect(page.getByText('Is this a pilot or a production design?', { exact: true })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Draft estimate', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reset workspace', exact: true }).click()
  await page.getByRole('button', { name: 'Delete and start over', exact: true }).click()
  await expect(page.getByText('What are you planning?', { exact: true })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Draft estimate', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Employee assistant Internal/ })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('button', { name: /Customer agent External/ })).toHaveAttribute('aria-pressed', 'false')
})

test('does not show saved scenario warnings in an unstarted guide or change the saved estimate', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Production', exact: true }).click()
  await page.getByRole('tab', { name: 'Guardrail', exact: true }).click()
  await page.getByRole('switch', { name: 'Toggle Microsoft Purview', exact: true }).click()
  await expect(page.getByText(/Current estimate excludes/)).toBeVisible()
  const saved = await page.evaluate((key) => localStorage.getItem(key), workspaceKey)
  const total = await page.locator('.headline__value').innerText()
  await page.getByRole('button', { name: 'Guided setup', exact: true }).click()
  await expect(page.getByLabel('Draft estimate', { exact: true })).toHaveCount(0)
  await expect(page.getByText(/Current estimate excludes/)).toHaveCount(0)
  await expect(page.getByText(/This estimate uses last-known/)).toHaveCount(0)
  await page.getByRole('button', { name: 'Skip to calculator', exact: true }).click()
  await expect(page.locator('.headline__value')).toHaveText(total)
  await expect(page.getByText(/Current estimate excludes/)).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), workspaceKey)).toBe(saved)
})

test('clears comparison selections and does not cache a summary arriving after reset', async ({ page }) => {
  let release = () => {}
  const gate = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/api/comparison/explain', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { enabled: true, model: 'test-model', dailyLimit: 20 } })
      return
    }
    const { facts } = route.request().postDataJSON() as { facts: Array<{ id: string }> }
    await gate
    await route.fulfill({ json: {
      brief: {
        summary: { text: 'Old comparison summary', factIds: [facts[0]!.id] },
        microsoftWinThemes: [], competitiveExposure: [], proofGaps: [], discoveryQuestions: [], model: 'test-model',
      },
      remainingToday: 19, promptTokens: 10, completionTokens: 10,
    } })
  })
  try {
    await page.goto('/')
    await saveScenario(page, 'First comparison')
    await page.getByLabel('Monthly users', { exact: true }).fill('500')
    await saveScenario(page, 'Second comparison')
    await page.getByRole('button', { name: /^Scenarios/ }).click()
    const scenarios = page.getByRole('dialog', { name: 'Scenarios', exact: true })
    await scenarios.getByRole('checkbox', { name: /First comparison/ }).check()
    await scenarios.getByRole('checkbox', { name: /Second comparison/ }).check()
    await scenarios.getByRole('button', { name: 'Compare 2', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Compare scenarios', exact: true })).toBeVisible()
    const requestStarted = page.waitForRequest((request) => request.url().includes('/api/comparison/explain') && request.method() === 'POST')
    await page.getByRole('button', { name: 'Generate summary', exact: true }).click()
    await requestStarted
    await page.getByRole('button', { name: 'Reset workspace', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Reset workspace?', exact: true })).toContainText('2 saved scenarios')
    await page.getByRole('button', { name: 'Delete and start over', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Build a cost scenario', exact: true })).toBeFocused()
    const responseReady = page.waitForResponse((response) => response.url().includes('/api/comparison/explain') && response.request().method() === 'POST')
    release()
    await (await responseReady).finished()
    await page.getByRole('button', { name: 'Skip to calculator', exact: true }).click()
    const stored = await page.evaluate((key) => ({
      briefKeys: Object.keys(localStorage).filter((entry) => entry.startsWith('comparison-brief:')),
      state: JSON.parse(localStorage.getItem(key)!).state,
    }), workspaceKey)
    expect(stored.briefKeys).toEqual([])
    expect(stored.state.scenarios).toEqual([])
    expect(stored.state.comparisonIds).toEqual([])
  } finally {
    release()
  }
})

test('can reset an in-memory session and reports that browser deletion was unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('Storage blocked') } })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Skip to calculator', exact: true }).click()
  await page.getByLabel('Monthly users', { exact: true }).fill('987')
  await page.getByRole('button', { name: 'Reset workspace', exact: true }).click()
  await page.getByRole('button', { name: 'Delete and start over', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Build a cost scenario', exact: true })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Browser storage could not be cleared')
  await page.getByRole('button', { name: 'Skip to calculator', exact: true }).click()
  await expect(page.getByLabel('Monthly users', { exact: true })).toHaveValue('250')
})