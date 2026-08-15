import { Router } from "express";
import { analyzeBlock } from "../lib/kuromoji.js";
import { asString } from "../lib/pagination.js";

export const analyzeRouter = Router();

async function handleAnalyze(raw: string | undefined, res: import("express").Response) {
  const text = raw?.trim();
  if (!text) {
    res.status(400).json({ error: "text is required" });
    return;
  }
  if (text.length > 4000) {
    res.status(400).json({ error: "text is too long" });
    return;
  }

  res.json(await analyzeBlock(text));
}

analyzeRouter.get("/", async (req, res) => {
  await handleAnalyze(asString(req.query.text) ?? asString(req.query.q), res);
});

analyzeRouter.post("/", async (req, res) => {
  const body = req.body as { text?: unknown; content?: unknown };
  const raw =
    typeof body.text === "string"
      ? body.text
      : typeof body.content === "string"
        ? body.content
        : undefined;
  await handleAnalyze(raw, res);
});
