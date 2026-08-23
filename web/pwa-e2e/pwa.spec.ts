import { expect, test } from '@playwright/test'

test('installs securely without caching navigation, API, or authentication', async ({
  page,
  context,
  request,
}) => {
  await page.goto('/')

  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes')
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Foundry Cost Lab')
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png')
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(manifestHref).toBe('/manifest.webmanifest')
  const manifestResponse = await request.get(manifestHref!)
  expect(manifestResponse.ok()).toBe(true)
  const manifest = await manifestResponse.json()
  expect(manifest).toMatchObject({
    name: 'Foundry Cost Lab',
    short_name: 'Cost Lab',
    display: 'standalone',
    start_url: '/',
  })
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizes: '192x192', type: 'image/png' }),
    expect.objectContaining({ sizes: '512x512', type: 'image/png' }),
    expect.objectContaining({ purpose: 'maskable' }),
  ]))

  const workerUrl = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    return registration.active?.scriptURL ?? null
  })
  expect(workerUrl).toContain('/sw.js')
  await page.reload()
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null))
    .toContain('/sw.js')

  const cachedUrls = await page.evaluate(async () => {
    const urls: string[] = []
    for (const cacheName of await caches.keys()) {
      const cache = await caches.open(cacheName)
      urls.push(...(await cache.keys()).map((entry) => entry.url))
    }
    return urls
  })
  expect(cachedUrls.some((url) => new URL(url).pathname.startsWith('/assets/'))).toBe(true)
  expect(cachedUrls.some((url) => new URL(url).pathname === '/index.html')).toBe(false)
  expect(cachedUrls.some((url) => new URL(url).pathname.startsWith('/api/'))).toBe(false)
  expect(cachedUrls.some((url) => new URL(url).pathname.startsWith('/.auth/'))).toBe(false)
  expect(cachedUrls.some((url) => /jspdf|html2canvas|purify|pdfExport|index\.es-/.test(url))).toBe(false)

  const modulePath = await page.locator('script[type="module"]').getAttribute('src')
  await context.setOffline(true)
  const offline = await page.evaluate(async (assetPath) => {
    const available = async (path: string) => {
      try {
        return (await fetch(path, { cache: 'no-store' })).ok
      } catch {
        return false
      }
    }
    return {
      asset: await available(assetPath!),
      navigation: await available('/'),
      api: await available('/api/health'),
      auth: await available('/.auth/me'),
    }
  }, modulePath)
  await context.setOffline(false)

  expect(offline).toEqual({ asset: true, navigation: false, api: false, auth: false })
})