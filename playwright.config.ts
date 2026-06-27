import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3004}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-375',
      use: {
        ...devices['Pixel 5'],
        channel: 'chromium',
        viewport: { width: 375, height: 812 },
      },
    },
  ],

  webServer: {
    command: `PORT=${process.env.PORT ?? 3004} pnpm run dev`,
    url: `http://localhost:${process.env.PORT ?? 3004}`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
