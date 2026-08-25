import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/rates*', async (route) => {
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"offline test"}' })
  })
})

test('models live, exposes provenance, and renders the desktop workspace', async ({ page }, testInfo) => {
  const directPricingRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('prices.azure.com')) directPricingRequests.push(request.url())
  })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')

  const headline = page.locator('.headline__value')
  await expect(headline).toBeVisible()
  const pocTotal = await headline.textContent()
  const pocAmount = Number((pocTotal ?? '').replace(/[^0-9.]/g, ''))
  await page.getByRole('button', { name: 'Production' }).click()
  await expect(page.getByRole('button', { name: 'Production' })).toHaveAttribute('aria-pressed', 'true')
  await expect(headline).not.toHaveText(pocTotal ?? '')
  const productionAmount = Number((await headline.textContent() ?? '').replace(/[^0-9.]/g, ''))
  expect(productionAmount).toBeGreaterThan(pocAmount * 100)
  await expect(page.locator('.guardrail-callout strong')).toContainText(/5[0-9]\.[0-9]%/)
  const activeRateWarning = page.getByText(/Current estimate excludes 6 active unpriced lines/)
  await expect(activeRateWarning).toBeVisible()
  await expect(activeRateWarning).toContainText('PAYG overflow - capacity required')
  await expect(activeRateWarning).toContainText('Microsoft Purview capacity')

  const sourceButton = page.locator('.source-button').first()
  await sourceButton.hover()
  await expect(page.getByRole('tooltip')).toContainText('Source')
  await expect(page.getByRole('tooltip')).toContainText('As of')

  await page.getByRole('button', { name: /Scenarios/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('dialog')).toContainText('must not contain confidential customer identifiers')
  await page.getByRole('button', { name: 'Close scenarios' }).click()

  const chart = page.locator('.chart-wrap svg').first()
  await expect(chart).toBeVisible()
  const chartBox = await chart.boundingBox()
  expect(chartBox?.width).toBeGreaterThan(300)
  expect(chartBox?.height).toBeGreaterThan(150)
  await expect(page.locator('.chart-wrap .recharts-line-curve')).toHaveCount(1)

  const hasHorizontalOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(hasHorizontalOverflow).toBe(false)
  expect(directPricingRequests).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('desktop.png'), fullPage: true })
})

test('keeps controls and readout within a mobile viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.locator('.headline__value')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Run' })).toBeVisible()

  const hasHorizontalOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(hasHorizontalOverflow).toBe(false)
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true })
})

test('offers native installation when the browser exposes an install prompt', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.evaluate(() => {
    const promptEvent = new Event('beforeinstallprompt')
    Object.defineProperties(promptEvent, {
      prompt: {
        value: async () => {
          document.documentElement.dataset.pwaPrompted = 'true'
        },
      },
      userChoice: {
        value: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
      },
    })
    window.dispatchEvent(promptEvent)
  })

  await page.getByRole('button', { name: 'Install Foundry Cost Lab' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-pwa-prompted', 'true')
  await expect(page.getByRole('button', { name: 'Install Foundry Cost Lab' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
})

test('persists, compares, and restores a named scenario', async ({ page }) => {
  await page.goto('/')
  const monthlyUsers = page.getByLabel('Monthly users')
  await monthlyUsers.fill('777')

  await page.getByRole('button', { name: /Scenarios/ }).click()
  await page.getByLabel('Scenario name').fill('Recovery baseline')
  await page.getByRole('button', { name: 'Save current' }).click()
  await expect(page.getByRole('dialog').getByText('Recovery baseline')).toBeVisible()
  await page.getByRole('checkbox', { name: /Recovery baseline/ }).check()
  await page.getByRole('button', { name: 'Close scenarios' }).click()
  await expect(page.getByRole('heading', { name: 'Scenario comparison' })).toBeVisible()

  await monthlyUsers.fill('999')
  await page.getByRole('button', { name: /Scenarios/ }).click()
  const savedRow = page.locator('.scenario-row').filter({ hasText: 'Recovery baseline' })
  await savedRow.getByRole('button', { name: 'Load Recovery baseline' }).click()
  await expect(monthlyUsers).toHaveValue('777')

  await page.reload()
  await expect(page.getByLabel('Monthly users')).toHaveValue('777')
  await page.getByRole('button', { name: /Scenarios/ }).click()
  await expect(page.getByRole('dialog').getByText('Recovery baseline')).toBeVisible()
})

test('exports an auditable PDF and keeps JSON as an editable backup', async ({ page }, testInfo) => {
  await page.goto('/')

  const [pdfDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export PDF' }).click(),
  ])
  expect(pdfDownload.suggestedFilename()).toMatch(/^poc-estimate-\d{4}-\d{2}-\d{2}\.pdf$/)
  const pdfPath = await pdfDownload.path()
  expect(pdfPath).not.toBeNull()
  const pdfBytes = await readFile(pdfPath!)
  expect(pdfBytes.subarray(0, 5).toString()).toBe('%PDF-')
  expect(pdfBytes.byteLength).toBeGreaterThan(20_000)
  await pdfDownload.saveAs(testInfo.outputPath('cost-estimate.pdf'))

  await page.getByRole('button', { name: /Scenarios/ }).click()
  await page.getByLabel('Scenario name').fill('Editable baseline')
  const [jsonDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Backup JSON' }).click(),
  ])
  expect(jsonDownload.suggestedFilename()).toMatch(/^editable-baseline-\d{4}-\d{2}-\d{2}\.json$/)
  const jsonPath = await jsonDownload.path()
  expect(jsonPath).not.toBeNull()
  const backup = JSON.parse(await readFile(jsonPath!, 'utf8'))
  expect(backup.schemaVersion).toBe(1)
  expect(backup.rateCard.currency).toBe('CAD')
  expect(backup.config.posture).toBe('poc')
})

test('models hosted runtime and all Standard Agent Setup resources', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('switch', { name: 'Toggle Foundry hosted agent' }).click()
  await page.getByLabel('Sandbox size').selectOption('2vcpu-4gb')
  await page.getByLabel('Sessions / month').fill('120')
  await page.getByLabel('Billed minutes / session').fill('30')

  const hostedCpu = page.locator('.cost-line').filter({ hasText: 'Hosted agent vCPU' })
  const hostedMemory = page.locator('.cost-line').filter({ hasText: 'Hosted agent memory' })
  await expect(hostedCpu).toContainText('$18.49')
  await expect(hostedMemory).toContainText('$4.39')

  await page.getByRole('tab', { name: 'Platform' }).click()
  await expect(page.getByRole('switch', { name: 'Toggle BYO Cosmos DB thread storage' })).toBeChecked()
  await expect(page.getByRole('switch', { name: 'Toggle BYO Azure AI Search S1' })).toBeChecked()
  await expect(page.getByRole('switch', { name: 'Toggle BYO Hot ZRS Blob Storage' })).toBeChecked()
  await page.getByRole('button', { name: 'Serverless' }).click()
  await page.getByLabel('Request units / month').fill('10000000')

  const cosmosRequests = page.locator('.cost-line').filter({ hasText: 'Cosmos DB requests' })
  await expect(cosmosRequests).toContainText('$3.88')
  await expect(page.locator('.cost-line').filter({ hasText: 'Azure AI Search' })).toHaveCount(1)
  await expect(page.locator('.cost-line').filter({ hasText: 'Blob capacity' })).toHaveCount(1)
})

test('selects models across every Foundry source and adds Foundry services', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.catalog-snapshot').first()).toContainText('catalog models')
  const source = page.getByLabel('Deployment source')
  await expect(source.locator('option')).toHaveText([
    'Direct from Azure',
    'Foundry Labs',
    'Hugging Face',
    'Fireworks on Foundry',
  ])

  await source.selectOption('fireworks')
  await page.getByLabel('Find model').fill('FW-MiniMax-M2.5')
  await page.getByRole('radio', { name: /FW-MiniMax-M2.5/ }).check()
  await expect(page.getByLabel('Deployment option')).toHaveValue('Serverless API')
  await page.getByLabel('Input rate fallback').fill('2')
  await page.getByLabel('Output rate fallback').fill('8')
  await expect(page.locator('.cost-line').filter({ hasText: 'FW-MiniMax-M2.5' }).first()).toBeVisible()

  await source.selectOption('hugging-face')
  await page.getByLabel('Find model').fill('zai-org--glm-5.2-fp8')
  await page.getByRole('radio', { name: /zai-org--glm-5.2-fp8/ }).check()
  await expect(page.getByLabel('Deployment option')).toHaveValue('Managed Compute')
  await page.getByLabel('Instances').fill('2')
  await page.getByLabel('Hours / month').fill('100')
  await page.getByLabel('VM rate').fill('5')
  const managedCompute = page.locator('.cost-line').filter({ hasText: 'zai-org--glm-5.2-fp8' })
  await expect(managedCompute).toContainText('managed compute')
  await expect(managedCompute).toContainText('$1,000.00')

  await page.getByLabel('Service type').selectOption('Speech')
  await page.getByLabel('Find service').fill('Speech to Text')
  await page.getByRole('checkbox', { name: /Azure Speech - Speech to Text/ }).check()
  await page.getByLabel('Monthly audio hours').fill('40')
  await page.getByLabel('Rate fallback').fill('2.5')
  await expect(page.locator('.cost-line').filter({ hasText: 'Azure Speech - Speech to Text' })).toContainText('$56.36')
})

test('isolates model SKU profiles and prices every technical domain', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')

  await page.getByLabel('Find model').fill('claude-fable-5')
  await page.getByRole('radio', { name: /claude-fable-5/ }).first().check()
  const readiness = page.getByRole('region', { name: 'Pricing readiness' })
  await expect(readiness.getByText('Approval blocked')).toBeVisible()
  await expect(readiness.getByText(/Input rate.*Output rate/)).toBeVisible()

  await page.getByLabel('Input rate fallback').fill('4.25')
  await page.getByLabel('Output rate fallback').fill('21.5')
  await expect(readiness.getByText(/Model\/SKU fallback source.*Model\/SKU fallback as-of date/)).toBeVisible()
  const ragReadiness = page.locator('.technical-readiness__row').filter({ hasText: 'RAG and retrieval' })
  await expect(ragReadiness).toContainText('Not included in this scenario')
  await expect(ragReadiness.getByText('Excluded')).toBeVisible()
  await page.getByLabel('Fallback price source').fill('Enterprise Marketplace offer')
  await page.getByLabel('Fallback price as of').fill('2026-08-21')
  await expect(readiness.getByText('Approval blocked')).toHaveCount(0)
  await expect(readiness.getByText('Enterprise Marketplace offer').first()).toBeVisible()

  await page.getByLabel('Deployment SKU').selectOption('data-zone-standard')
  await expect(page.getByLabel('Input rate fallback')).toHaveValue('')
  await expect(readiness.getByText('Approval blocked')).toBeVisible()
  await page.getByLabel('Deployment SKU').selectOption('global-standard')
  await expect(page.getByLabel('Input rate fallback')).toHaveValue('4.25')
  await expect(page.getByLabel('Output rate fallback')).toHaveValue('21.5')

  await page.getByRole('switch', { name: 'Toggle Code Interpreter' }).click()
  await page.getByRole('tab', { name: 'Platform' }).click()
  await page.getByRole('switch', { name: 'Toggle Semantic ranker' }).click()
  await page.getByRole('switch', { name: 'Toggle Application Insights and Log Analytics' }).click()
  await page.getByRole('switch', { name: 'Toggle Private Link data' }).click()
  await page.getByRole('switch', { name: 'Toggle Service-specific secondary region' }).click()
  await page.getByLabel('Secondary APIM units').fill('1')

  for (const label of ['Agent tools', 'RAG and retrieval', 'Observability', 'Network processing', 'Disaster recovery']) {
    const row = page.locator('.technical-readiness__row').filter({ hasText: label })
    await expect(row.getByText('Retail')).toBeVisible()
    await expect(row).toContainText(/priced line/)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
  await page.screenshot({ path: testInfo.outputPath('pricing-readiness.png'), fullPage: true })
})

test('has no automatically detectable accessibility violations', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.headline__value')).toBeVisible()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('mounts with an in-memory scenario store when localStorage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Blocked by browser policy', 'SecurityError')
      },
    })
  })
  await page.goto('/')
  await expect(page.locator('.headline__value')).toBeVisible()
  await expect(page.getByText('Scenarios will last for this session only.')).toBeVisible()
})

test('lets an authenticated denied user submit an access request', async ({ page }) => {
  let requestSubmitted = false
  await page.route('**/.auth/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      clientPrincipal: {
        identityProvider: 'aad',
        userId: 'manager-user-id',
        userDetails: 'ahmed@example.com',
        userRoles: ['anonymous', 'authenticated'],
      },
    }),
  }))
  await page.route('**/api/access/request', async (route) => {
    if (route.request().method() === 'POST') {
      requestSubmitted = true
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'pending',
          reason: 'Manager review',
          requestedAt: '2026-08-24T10:00:00Z',
          updatedAt: '2026-08-24T10:00:00Z',
        }),
      })
      return
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"No request"}' })
  })

  await page.goto('/request-access.html')
  await expect(page.getByText('Signed in as ahmed@example.com')).toBeVisible()
  await page.getByLabel(/Business reason/).fill('Manager review')
  await page.getByRole('button', { name: 'Request access' }).click()

  expect(requestSubmitted).toBe(true)
  await expect(page.getByText(/pending owner approval/)).toBeVisible()
})

test('completes the approved invitation automatically and opens the app', async ({ page }) => {
  let principalReads = 0
  await page.route('**/.auth/me', (route) => {
    principalReads += 1
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        clientPrincipal: {
          identityProvider: 'aad',
          userId: 'manager-user-id',
          userDetails: 'ahmed@example.com',
          userRoles: principalReads > 1
            ? ['anonymous', 'authenticated', 'costlab-user']
            : ['anonymous', 'authenticated'],
        },
      }),
    })
  })
  await page.route('**/api/access/request', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      status: 'approved',
      reason: 'Manager review',
      requestedAt: '2026-08-24T10:00:00Z',
      updatedAt: '2026-08-24T10:05:00Z',
      invitationUrl: 'http://127.0.0.1:5173/.auth/invitations/accept?token=safe-test-token',
      invitationExpiresOn: '2026-08-25T10:05:00Z',
    }),
  }))
  await page.goto('/request-access.html')
  await expect(page).toHaveURL(/\/\.auth\/invitations\/accept\?token=safe-test-token/)

  await page.goto('/request-access.html')
  await expect(page).toHaveURL('http://127.0.0.1:5173/', { timeout: 8_000 })
  expect(principalReads).toBeGreaterThanOrEqual(2)
})

test('shows the access queue only to admins and approves a pending request', async ({ page }) => {
  let status: 'pending' | 'approved' = 'pending'
  await page.route('**/.auth/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      clientPrincipal: {
        identityProvider: 'aad',
        userId: 'owner-user-id',
        userDetails: 'owner@example.com',
        userRoles: ['anonymous', 'authenticated', 'costlab-user', 'costlab-admin'],
      },
    }),
  }))
  await page.route(/\/api\/access\/requests(?:\/[^/?]+)?(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'POST') status = 'approved'
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: route.request().method() === 'GET'
        ? JSON.stringify({ requests: [{
            requestId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            userDetails: 'ahmed@example.com',
            reason: 'Manager review',
            status,
            requestedAt: '2026-08-24T10:00:00Z',
            updatedAt: '2026-08-24T10:00:00Z',
          }] })
        : JSON.stringify({
            requestId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
            userDetails: 'ahmed@example.com',
            reason: 'Manager review',
            status,
            requestedAt: '2026-08-24T10:00:00Z',
            updatedAt: '2026-08-24T10:00:00Z',
          }),
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Access requests, 1 pending' }).click()
  await expect(page.getByRole('dialog')).toContainText('ahmed@example.com')
  await page.getByRole('button', { name: 'Approve ahmed@example.com' }).click()
  await expect(page.locator('.access-request-status--approved')).toHaveText('approved')
})

test('supports four regions without borrowing Canada Central fallback prices', async ({ page }) => {
  const rateRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/rates?')) rateRequests.push(request.url())
  })
  await page.goto('/')
  await expect(page.getByLabel('Azure region').locator('option')).toHaveText([
    'Canada Central', 'Canada East', 'East US', 'East US 2',
  ])
  for (const [region, label] of [
    ['canadaeast', 'Canada East'],
    ['eastus', 'East US'],
    ['eastus2', 'East US 2'],
  ] as const) {
    await page.getByLabel('Azure region').selectOption(region)
    await expect(page.locator('.headline__stamp')).toContainText(label)
    await expect(page.locator('.headline__value')).toHaveText('$0')
    await expect.poll(() => rateRequests.some((url) => url.includes(`region=${region}`))).toBe(true)
  }
})

test('serves a synchronized or bundled CAD card locally without an API 404', async ({ page }) => {
  await page.unroute('**/api/rates*')
  await page.goto('/')

  await expect(page.getByText('CAD list-rate estimate')).toBeVisible()
  await expect(page.locator('.freshness')).toContainText(/Built-in rates|Synced rates/)
  await expect(page.getByText(/Rate synchronization is partial/)).toHaveCount(0)
  await expect(page.getByText(/Current estimate excludes/)).toHaveCount(0)
  await expect(page.getByText(/Rates API returned 404/)).toHaveCount(0)
  await expect(page.locator('.headline__value')).not.toContainText('US$')
})