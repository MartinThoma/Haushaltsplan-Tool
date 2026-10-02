import { defineConfig } from '@playwright/test';

const PORT = 4180;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    // Google Chrome is preinstalled on the GitHub runners, so no browser download is needed.
    channel: 'chrome',
    locale: 'de-DE',
    // Only the offline test needs the service worker; elsewhere it would cache across reloads.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  webServer: {
    // The production build, as it is deployed, including the service worker.
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
