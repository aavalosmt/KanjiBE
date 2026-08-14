import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const headerKey = req.header("x-admin-key");
  const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "");

  if (headerKey === config.adminApiKey || bearer === config.adminApiKey) {
    next();
    return;
  }

  res.status(401).json({ error: "Unauthorized" });
}
