import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

process.env.NODE_ENV = "test";
const dbFile = path.resolve("data", "test.db");
process.env.DATABASE_URL = dbFile.startsWith("/")
  ? `file://${dbFile}`
  : `file:${dbFile}`;
process.env.ADMIN_API_KEY = "test-admin-key";
process.env.PUBLIC_BASE_URL = "http://localhost:3000";
process.env.UPLOAD_DIR = "./uploads-test";
process.env.CORS_ORIGIN = "*";
process.env.GEMINI_API_KEY = "";

fs.mkdirSync("data", { recursive: true });
fs.mkdirSync("uploads-test", { recursive: true });

execSync("npx prisma db push --skip-generate --accept-data-loss", {
  stdio: "inherit",
  env: process.env
});
