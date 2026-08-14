import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./db.js";

function applyMigrations() {
  console.log(`Applying migrations (DATABASE_URL=${config.databaseUrl})`);
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: config.databaseUrl
    }
  });
}

async function main() {
  if (config.databaseUrl.startsWith("file:")) {
    const dbPath = config.databaseUrl.replace(/^file:/, "");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    console.log(`SQLite file ${path.resolve(dbPath)}`);
  }

  applyMigrations();
  const tables = await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name
  `;
  console.log(`Database ready (${tables.map((table) => table.name).join(", ")})`);

  const app = createApp();
  const server = app.listen(config.port, "0.0.0.0", () => {
    console.log(`KanjiBE listening on ${config.publicBaseUrl} (port ${config.port})`);
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
