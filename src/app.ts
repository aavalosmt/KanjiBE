import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { config } from "./config.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { adminRouter } from "./routes/admin.js";
import { analyzeRouter } from "./routes/analyze.js";
import { lookupRouter } from "./routes/lookup.js";
import { lyricsRouter } from "./routes/lyrics.js";
import { storiesRouter } from "./routes/stories.js";
import { uploadRouter } from "./routes/upload.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminDir = path.join(rootDir, "public", "admin");

export function createApp() {
  const app = express();

  fs.mkdirSync(config.uploadDir, { recursive: true });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:", "http:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          upgradeInsecureRequests: null
        }
      }
    })
  );
  app.use(
    cors({
      origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(",")
    })
  );
  app.use(express.json({ limit: "2mb" }));
  app.use((req, res, next) => {
    const started = Date.now();
    res.on("finish", () => {
      console.log(
        `${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`
      );
    });
    next();
  });
  app.use("/uploads", express.static(path.resolve(config.uploadDir)));
  app.use("/admin", express.static(adminDir));

  app.get("/", (_req, res) => {
    res.redirect("/admin/");
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/stories", storiesRouter);
  app.use("/api/lyrics", lyricsRouter);
  app.use("/api/lookup", lookupRouter);
  app.use("/api/analyze", analyzeRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/admin", uploadRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
