import { Router } from "express";
import { lookupExpression } from "../lib/kuromoji.js";
import { asString } from "../lib/pagination.js";

export const lookupRouter = Router();

lookupRouter.get("/", async (req, res) => {
  const query = asString(req.query.q) ?? asString(req.query.text);
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
});
