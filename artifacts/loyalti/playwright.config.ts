import { defineConfig } from "@playwright/test";

const chromiumPath = process.env.CHROMIUM_PATH;
if (!chromiumPath) {
  throw new Error(
    "CHROMIUM_PATH is required for release browser checks; install/use the Nix Chromium binary.",
  );
}

const reportDirectory = process.env.RELEASE_REPORT_DIR;
const smokePort = process.env.SMOKE_PORT ?? "23657";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: reportDirectory
    ? [
        ["list"],
        ["junit", { outputFile: `${reportDirectory}/web-smoke.junit.xml` }],
      ]
    : "list",
  use: {
    baseURL: process.env.SMOKE_BASE_URL ?? `http://127.0.0.1:${smokePort}`,
    launchOptions: { executablePath: chromiumPath },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm run dev",
    url: `http://127.0.0.1:${smokePort}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { PORT: smokePort, BASE_PATH: "/" },
  },
});