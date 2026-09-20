import { defineConfig, devices } from "@playwright/test"

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"
const API_URL = process.env.PLAYWRIGHT_API_URL ?? "http://127.0.0.1:3002"

/**
 * Browser E2E for GlucoGuide web (frontend → BACKEND_URL).
 * Requires Postgres reachable from the API (Supabase / local).
 *
 *   yarn test:e2e
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["json", { outputFile: "playwright-report/results.json" }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "yarn run dev",
      cwd: "../backend",
      url: `${API_URL}/health`,
      // Always start with QA_EXPOSE_OTP so patient OTP specs get Dev code.
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        PORT: "3002",
        QA_EXPOSE_OTP: "1",
        NODE_ENV: "development",
      },
    },
    {
      command: "yarn run dev",
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        BACKEND_URL: API_URL,
        NEXT_PUBLIC_API: "http://localhost:3000/api/v1",
      },
    },
  ],
})
