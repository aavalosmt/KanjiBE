import { Router } from "express";
import { infoHandler, PUBLIC_AUTH } from "../lib/endpointInfo.js";
import { listKanjiByLevel } from "../lib/kanjiSerialize.js";
import { parsePagination } from "../lib/pagination.js";

export const kanjiRouter = Router();

const MIN_JLPT = 1;
const MAX_JLPT = 5;

kanjiRouter.get(
  "/info",
  infoHandler({
    method: "GET",
    path: "/api/kanji",
    description: "Lista kanji de un nivel JLPT dado (1 a 5), paginado.",
    auth: PUBLIC_AUTH,
    query: {
      level: "requerido — entero entre 1 y 5",
      page: "opcional, default 1",
      limit: "opcional, default 20, máx 100"
    },
    response_example: {
      data: [
        {
          character: "水",
          strokeCount: 4,
          freq: 200,
          jlpt: 5,
          onyomi: ["スイ"],
          kunyomi: ["みず"],
          meanings: ["water"]
        }
      ],
      pagination: { page: 1, limit: 20, total: 103 }
    }
  })
);

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
