import path from "node:path";
import { spawnSync } from "node:child_process";

const dbFile = path.resolve("data", "kanji.db");
process.env.DATABASE_URL ??= dbFile.startsWith("/")
  ? `file://${dbFile}`
  : `file:${dbFile}`;

const result = spawnSync("npx", ["prisma", "generate"], {
  stdio: "inherit",
  env: process.env,
  shell: true
});

process.exit(result.status ?? 1);
