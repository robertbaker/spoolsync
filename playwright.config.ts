import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:4324";

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["**/*.spec.ts"],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 1,
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["dot"]]
    : [["line"], ["html", { open: "never" }]],
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    baseURL,
    trace: process.env.CI ? "on-first-retry" : "off",
    screenshot: process.env.CI ? "only-on-failure" : "off",
    navigationTimeout: 30000,
    actionTimeout: 10000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--no-sandbox",
            "--disable-setuid-sandbox",
          ],
        },
      },
    },
  ],
  webServer: {
    command: process.env.CI ? "bun run preview" : "bun run build && bun run preview",
    url: baseURL,
    reuseExistingServer: !process.env.CI || !!process.env.PLAYWRIGHT_REUSE_SERVER,
    timeout: process.env.CI ? 120_000 : 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      DISABLE_ASTRO_TOOLBAR: "true",
      NODE_ENV: "production",
      ASTRO_TELEMETRY_DISABLED: "1",
      PUBLIC_ACCOUNT_URL: baseURL,
    },
  },
});
