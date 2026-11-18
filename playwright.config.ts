import { defineConfig, devices } from "@playwright/test";

// End-to-end tests for the penalty demo scenarios. They run against their own database (prisma/e2e.db)
// and their own Next.js server on port 3100, so the demo at port 3000 is not touched.
const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, ...devices["Desktop Edge"], channel: process.env.PW_CHANNEL ?? "msedge", navigationTimeout: 120_000, actionTimeout: 60_000 },
  webServer: {
    command: `npx prisma migrate deploy && npx tsx prisma/seed.ts && npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: "pipe",
    env: { DATABASE_URL: "file:./e2e.db", NEXT_DIST_DIR: ".next-e2e" },
  },
});
