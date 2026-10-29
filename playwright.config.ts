import { defineConfig, devices } from '@playwright/test'
import { loadEnv } from 'vite'

// Match the production preview's Vite configuration without overwriting CI values.
for (const [key, value] of Object.entries(loadEnv('production', process.cwd(), ''))) {
  process.env[key] ??= value
}

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4173'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 45_000,
  globalTimeout: 15 * 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', testDir: './tests/e2e', use: { ...devices['Desktop Chrome'] } },
    { name: 'backend', testDir: './tests/backend' },
  ],
  webServer: process.env.BASE_URL ? undefined : {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
