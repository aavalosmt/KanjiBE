import { Router } from "express";
import { kanjiDb } from "../kanjiDb.js";
import { toKanjiSummaries } from "../lib/kanjiSerialize.js";
import { parsePagination } from "../lib/pagination.js";

export const kanjiRouter = Router();

const MIN_JLPT = 1;
const MAX_JLPT = 5;

const listByLevelStmt = kanjiDb.prepare(
  `SELECT id, stroke_count, freq, jlpt FROM character
   WHERE jlpt = ?
   ORDER BY (freq IS NULL), freq ASC, id ASC
   LIMIT ? OFFSET ?`
);
const countByLevelStmt = kanjiDb.prepare(
  `SELECT COUNT(*) as total FROM character WHERE jlpt = ?`
);

kanjiRouter.get("/", async (req, res) => {
  const level = Number(req.query.level);
  if (!Number.isInteger(level) || level < MIN_JLPT || level > MAX_JLPT) {
    res.status(400).json({ error: `level must be an integer between ${MIN_JLPT} and ${MAX_JLPT}` });
    return;
  }

  const { page, limit, skip } = parsePagination(req.query);

  const rows = listByLevelStmt.all(level, limit, skip) as Array<{
    id: string;
    stroke_count: number | null;
    freq: number | null;
    jlpt: number;
  }>;
  const { total } = countByLevelStmt.get(level) as { total: number };

  res.json({
    data: toKanjiSummaries(rows),
    pagination: { page, limit, total }
  });
});
