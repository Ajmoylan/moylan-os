import { defineConfig, devices } from "@playwright/test";

// Dedicated port so tests never attach to a manually started preview (`npm run preview` uses 4173).
const PORT = 4174;

/**
 * End-to-end tests run against the production build served by scripts/serve-static.mjs, which
 * applies the real staticwebapp.config.json headers (CSP included). Run `npm run build` first.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "node scripts/serve-static.mjs",
    url: `http://127.0.0.1:${PORT}`,
    env: { PORT: String(PORT) },
    reuseExistingServer: false,
  },
});
