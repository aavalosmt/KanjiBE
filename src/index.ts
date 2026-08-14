import fs from "node:fs";
import path from "node:path";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./db.js";

if (config.databaseUrl.startsWith("file:")) {
  const dbPath = config.databaseUrl.replace(/^file:/, "");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`KanjiBE listening on ${config.publicBaseUrl}`);
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
