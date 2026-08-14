import { spawnSync } from "node:child_process";

process.env.DATABASE_URL ??= "file:./data/kanji.db";

const result = spawnSync("npx", ["prisma", "generate"], {
  stdio: "inherit",
  env: process.env,
  shell: true
});

process.exit(result.status ?? 1);
