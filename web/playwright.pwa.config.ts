import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './pwa-e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: 'test-results/pwa',
  use: {
    baseURL: 'http://127.0.0.1:4173',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'android', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    { name: 'ios-metadata', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
})