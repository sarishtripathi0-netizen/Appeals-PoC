// Creates a separate SQLite database for integration tests, so the demo database is never touched.
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

export const TEST_DB_URL = "file:./test-integration.db";

export default function setup() {
  const root = path.resolve(__dirname, "../..");
  for (const f of ["test-integration.db", "test-integration.db-journal"]) rmSync(path.join(root, "prisma", f), { force: true });
  execSync("npx prisma migrate deploy", { cwd: root, env: { ...process.env, DATABASE_URL: TEST_DB_URL }, stdio: "ignore" });
}
