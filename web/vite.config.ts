import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
import { fallbackRateCardFor } from './src/domain/rates.ts'
import { isRegionId, type RegionId } from './src/domain/types.ts'

interface LocalCatalogSnapshot {
  asOf: string
  models: unknown[]
}

interface LocalRateCard {
  asOf: string
  region: RegionId
  rates: Record<string, unknown>
}

const workspaceDirectory = new URL('../', import.meta.url)

function readLocalJson<T>(relativePath: string): T | null {
  try {
    return JSON.parse(
      readFileSync(new URL(relativePath, workspaceDirectory), 'utf8').replace(/^\uFEFF/, ''),
    ) as T
  } catch {
    return null
  }
}

const localCatalog = JSON.parse(
  readFileSync(new URL('./src/domain/foundryModelCatalog.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''),
) as LocalCatalogSnapshot

const localRatesApi = (): Plugin => ({
  name: 'foundry-cost-local-rates-api',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (!['/api/rates', '/api/rates/diff', '/api/catalog'].includes(url.pathname)) {
        next()
        return
      }

      const requested = url.searchParams.get('region') ?? 'canadacentral'
      if (!isRegionId(requested)) {
        response.statusCode = 400
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({ error: 'Unsupported rate-card region.' }))
        return
      }

      response.statusCode = 200
      response.setHeader('Content-Type', 'application/json')
      response.setHeader('Cache-Control', 'no-store')
      if (url.pathname === '/api/catalog') {
        const synchronized = readLocalJson<LocalCatalogSnapshot>(
          `api/data/catalog/${requested}/current.json`,
        )
        response.setHeader('X-Catalog-Source', synchronized ? 'vite-synced' : 'vite-built-in')
        response.end(JSON.stringify(synchronized ?? {
          schemaVersion: 1,
          asOf: localCatalog.asOf,
          generatedAt: `${localCatalog.asOf}T00:00:00Z`,
          region: requested,
          sourceUrl: 'Bundled Microsoft Foundry model catalog snapshot',
          models: localCatalog.models.map((model) => ({ ...model as object, regionalAvailability: [] })),
        }))
        return
      }

      const synchronized = readLocalJson<LocalRateCard>(`api/data/${requested}/current.json`)
      const rateCard = synchronized ?? fallbackRateCardFor(requested)
      response.setHeader('X-Rate-Source', synchronized ? 'vite-synced' : 'vite-built-in')
      response.end(
        JSON.stringify(
          url.pathname.endsWith('/diff')
            ? { currentAsOf: rateCard.asOf, previousAsOf: null, changes: [] }
            : rateCard,
        ),
      )
    })
  },
})

const localFunctionsUrl = process.env.LOCAL_FUNCTIONS_URL

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      useCredentials: true,
      manifest: {
        id: '/',
        name: 'Foundry Cost Lab',
        short_name: 'Cost Lab',
        description: 'Provenance-aware Azure AI cost modelling in native CAD.',
        theme_color: '#ffffff',
        background_color: '#f5f5f5',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        categories: ['business', 'finance', 'productivity'],
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: [
          'assets/**/*.{js,css}',
          'theme.js',
          'favicon.svg',
          'pwa-*.png',
          'apple-touch-icon.png',
        ],
        globIgnores: [
          'assets/pdfExport-*.js',
          'assets/jspdf*.js',
          'assets/html2canvas-*.js',
          'assets/purify*.js',
          'assets/index.es-*.js',
        ],
        navigateFallback: null,
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        inlineWorkboxRuntime: true,
      },
    }),
    ...(localFunctionsUrl ? [] : [localRatesApi()]),
  ],
  server: localFunctionsUrl
    ? {
        proxy: {
          '/api': {
            target: localFunctionsUrl,
            changeOrigin: true,
          },
        },
      }
    : undefined,
})
