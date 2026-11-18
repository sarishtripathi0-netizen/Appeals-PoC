import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/setup/global.ts"],
    env: { DATABASE_URL: "file:./test-integration.db" },
    fileParallelism: false,
    testTimeout: 30000,
  },
});
