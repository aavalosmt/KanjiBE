import { execFileSync } from "node:child_process";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { databaseUrl } from "./dbUrl.js";
import { getTokenizer } from "./lib/kuromoji.js";

function applyMigrations() {
  console.log(`Applying migrations (${databaseUrl})`);
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: process.env
  });
}

async function tableNames(): Promise<string[]> {
  const tables = await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name
  `;
  return tables.map((table) => table.name);
}

async function ensureTables() {
  const names = new Set(await tableNames());
  if (names.has("Story") && names.has("Lyric")) {
    return;
  }

  console.warn("Story/Lyric missing after migrate; creating tables on this connection");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Story" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "title" TEXT NOT NULL,
      "level" TEXT NOT NULL,
      "translation" TEXT,
      "coverUrl" TEXT,
      "blocks" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Lyric" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "title" TEXT NOT NULL,
      "artist" TEXT NOT NULL,
      "translation" TEXT,
      "coverUrl" TEXT,
      "blocks" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `);
}

async function main() {
  console.log(`SQLite ${databaseUrl}`);
  applyMigrations();
  await ensureTables();
  console.log(`Database ready (${(await tableNames()).join(", ")})`);

  const app = createApp();
  const server = app.listen(config.port, "0.0.0.0", () => {
    console.log(`KanjiBE listening on ${config.publicBaseUrl} (port ${config.port})`);
    void getTokenizer()
      .then(() => console.log("Kuromoji dictionary ready"))
      .catch((error) => console.error("Kuromoji failed to load", error));
  });

  async function shutdown() {
    server.close();
    await prisma.$disconnect();
  }

  process.on("SIGINT", () => {
    void shutdown();
  });

  process.on("SIGTERM", () => {
    void shutdown();
  });
}

main().catch((error) => {
  console.error("Failed to start KanjiBE", error);
  process.exit(1);
});
