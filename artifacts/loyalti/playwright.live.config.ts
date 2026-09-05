import { defineConfig } from "@playwright/test";

/**
 * Live contract check configuration.
 *
 * By default this config boots BOTH the API server and the web dev server on
 * dedicated local ports (so it never clashes with the regular dev workflows),
 * then runs e2e/live-contract.spec.ts against them.
 *
 * To target an already-running environment instead, set:
 *   LIVE_API_URL — origin of the API server (e.g. http://127.0.0.1:8080)
 *   LIVE_WEB_URL — origin of the web app  (e.g. http://127.0.0.1:23657)
 */
const chromiumPath = process.env.CHROMIUM_PATH;
if (!chromiumPath) {
  throw new Error(
    "CHROMIUM_PATH is required for release browser checks; install/use the Nix Chromium binary.",
  );
}

const reportDirectory = process.env.RELEASE_REPORT_DIR;

export const LIVE_API_PORT = 24501;
export const LIVE_WEB_PORT = 24502;

const apiUrl = process.env.LIVE_API_URL;
const webUrl = process.env.LIVE_WEB_URL;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /live-contract\.spec\.ts/,
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: reportDirectory
    ? [
        ["list"],
        ["junit", { outputFile: `${reportDirectory}/web-contract.junit.xml` }],
      ]
    : "list",
  use: {
    baseURL: webUrl ?? `http://127.0.0.1:${LIVE_WEB_PORT}`,
    launchOptions: { executablePath: chromiumPath },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    ...(apiUrl
      ? []
      : [
          {
            command: "pnpm --filter @workspace/api-server run dev",
            url: `http://127.0.0.1:${LIVE_API_PORT}/api/healthz`,
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            env: {
              PORT: String(LIVE_API_PORT),
              NODE_ENV: "test",
              SESSION_SECRET: "live-contract-test-secret",
            },
          },
        ]),
    ...(webUrl
      ? []
      : [
          {
            command: "pnpm run dev",
            url: `http://127.0.0.1:${LIVE_WEB_PORT}/`,
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            env: { PORT: String(LIVE_WEB_PORT), BASE_PATH: "/" },
          },
        ]),
  ],
});
