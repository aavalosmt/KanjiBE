import fs from "node:fs";
import path from "node:path";

const dbFile = path.resolve(
  process.cwd(),
  "data",
  process.env.NODE_ENV === "test" ? "test.db" : "kanji.db"
);

fs.mkdirSync(path.dirname(dbFile), { recursive: true });

export const databaseUrl = dbFile.startsWith("/")
  ? `file://${dbFile}`
  : `file:${dbFile}`;

process.env.DATABASE_URL = databaseUrl;
