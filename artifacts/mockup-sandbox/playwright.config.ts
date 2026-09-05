import { defineConfig } from "@playwright/test";

const port = 24681;
const chromiumPath = process.env.CHROMIUM_PATH || "chromium";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}/__mockup/`,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    launchOptions: { executablePath: chromiumPath },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `PORT=${port} BASE_PATH=/__mockup pnpm exec vite dev --host 0.0.0.0`,
    url: `http://127.0.0.1:${port}/__mockup/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});