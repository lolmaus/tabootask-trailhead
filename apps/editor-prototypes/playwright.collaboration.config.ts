import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './test',
  testMatch: /(?:collaboration|probe-matrix)\.spec\.ts/u,
  timeout: 45_000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3100' },
  webServer: { command: 'pnpm dev', url: 'http://127.0.0.1:3100', reuseExistingServer: true },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
