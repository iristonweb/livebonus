import { defineConfig } from "@playwright/test";

const chromiumPath = process.env.CHROMIUM_PATH;
if (!chromiumPath) {
  throw new Error(
    "CHROMIUM_PATH is required for release browser checks; install/use the Nix Chromium binary.",
  );
}

const reportDirectory = process.env.RELEASE_REPORT_DIR;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  timeout: 45_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: reportDirectory
    ? [
        ["list"],
        ["junit", { outputFile: `${reportDirectory}/mobile-preview.junit.xml` }],
      ]
    : "list",
  use: {
    baseURL: process.env.MOBILE_PREVIEW_BASE_URL ?? "http://127.0.0.1:23906/",
    viewport: { width: 400, height: 720 },
    launchOptions: { executablePath: chromiumPath },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  expect: { timeout: 15_000 },
});
