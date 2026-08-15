import "dotenv/config";
import { databaseUrl } from "./dbUrl.js";

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: numberEnv("PORT", 3000),
  databaseUrl,
  adminApiKey: process.env.ADMIN_API_KEY ?? "",
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    ""
  ),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  uploadDir: process.env.UPLOAD_DIR ?? "./uploads",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-3.5-flash"
};

if (!config.adminApiKey && config.nodeEnv === "production") {
  console.warn(
    "ADMIN_API_KEY is not set. The API will start, but /admin writes will return 401."
  );
}
