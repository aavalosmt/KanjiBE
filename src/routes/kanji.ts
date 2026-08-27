import { Router } from "express";
import { listKanjiByLevel } from "../lib/kanjiSerialize.js";
import { parsePagination } from "../lib/pagination.js";

export const kanjiRouter = Router();

const MIN_JLPT = 1;
const MAX_JLPT = 5;

kanjiRouter.get("/", async (req, res) => {
  const level = Number(req.query.level);
  if (!Number.isInteger(level) || level < MIN_JLPT || level > MAX_JLPT) {
    res.status(400).json({ error: `level must be an integer between ${MIN_JLPT} and ${MAX_JLPT}` });
    return;
  }

  const { page, limit, skip } = parsePagination(req.query);
  const kanji = listKanjiByLevel(level);

  res.json({
    data: kanji.slice(skip, skip + limit),
    pagination: { page, limit, total: kanji.length }
  });
});
