import { defineConfig, devices } from "@playwright/test";

// End-to-end tests drive the real dashboard (Next.js production server) against
// an isolated, network-free SQLite database seeded by scripts/e2e-seed.ts.
const PORT = 3210;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DATABASE_URL = process.env.DATABASE_URL || "file:./e2e.db";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Fresh DB → migrate → deterministic seed → production server.
    command: "prisma migrate deploy && tsx scripts/e2e-seed.ts && next start -p " + PORT,
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: { DATABASE_URL, APPLY_MODE: "dry_run" },
  },
});
