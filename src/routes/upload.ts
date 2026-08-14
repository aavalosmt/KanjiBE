import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { config } from "../config.js";
import { requireAdmin } from "../middleware/adminAuth.js";

const allowedTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"]
]);

function ensureUploadDir() {
  fs.mkdirSync(config.uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadDir();
    cb(null, config.uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = allowedTypes.get(file.mimetype) ?? path.extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!allowedTypes.has(file.mimetype)) {
      cb(new Error("Only image uploads are allowed"));
      return;
    }
    cb(null, true);
  }
});

export const uploadRouter = Router();

uploadRouter.post(
  "/upload",
  requireAdmin,
  (req, res, next) => {
    const handler = upload.any();
    handler(req, res, next);
  },
  (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const file =
      files.find((item) => item.fieldname === "file") ??
      files.find((item) => item.fieldname === "image") ??
      files[0];

    if (!file) {
      res.status(400).json({ error: "image file is required" });
      return;
    }

    const filename = path.basename(file.filename);
    res.status(201).json({
      url: `${config.publicBaseUrl}/uploads/${filename}`
    });
  }
);
