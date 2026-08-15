import { Router } from "express";
import { lookupExpression } from "../lib/kuromoji.js";
import { asString } from "../lib/pagination.js";

export const lookupRouter = Router();

async function handleLookup(raw: string | undefined, res: import("express").Response) {
  const query = raw?.trim();
  if (!query) {
    res.status(400).json({ error: "q is required" });
    return;
  }
  if (query.length > 80) {
    res.status(400).json({ error: "q is too long" });
    return;
  }

  const result = await lookupExpression(query);
  res.json(result);
}

lookupRouter.get("/", async (req, res) => {
  await handleLookup(
    asString(req.query.q) ?? asString(req.query.text) ?? asString(req.query.word),
    res
  );
});

lookupRouter.get("/:q", async (req, res) => {
  await handleLookup(req.params.q, res);
});
