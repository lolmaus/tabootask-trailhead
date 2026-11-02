import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './test',
  testMatch: '**/*.spec.ts',
  workers: 1,
  use: { baseURL: 'http://localhost:3200', trace: 'off', screenshot: 'off', video: 'off' },
  webServer: { command: 'pnpm preview', url: 'http://localhost:3200', reuseExistingServer: false },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
