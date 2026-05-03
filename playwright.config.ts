import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.E2E_PORT ? Number(process.env.E2E_PORT) : 5000;
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./playwright/specs",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 8_000,
    navigationTimeout: 15_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: "npm run dev",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 60_000,
        stdout: "ignore",
        stderr: "pipe",
      },
});
