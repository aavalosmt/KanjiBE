import { Router } from "express";
import { prisma } from "../db.js";
import { toVocabularySet, toVocabularySetSummary } from "../lib/vocabularySerialize.js";
import { asString, parsePagination } from "../lib/pagination.js";

export const vocabularyRouter = Router();

vocabularyRouter.get("/", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const topic = asString(req.query.topic);
  const where = topic ? { topic } : {};

  const [rows, total] = await Promise.all([
    prisma.vocabularySet.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { pages: true, words: true } } }
    }),
    prisma.vocabularySet.count({ where })
  ]);

  res.json({
    data: rows.map(toVocabularySetSummary),
    pagination: { page, limit, total }
  });
});

vocabularyRouter.get("/:topic/:subtopic", async (req, res) => {
  const set = await prisma.vocabularySet.findUnique({
    where: { topic_subtopic: { topic: req.params.topic, subtopic: req.params.subtopic } },
    include: {
      pages: {
        orderBy: { pageIndex: "asc" },
        include: { entries: { orderBy: { entryIndex: "asc" } } }
      },
      words: { orderBy: { wordIndex: "asc" } }
    }
  });

  if (!set) {
    res.status(404).json({ error: "Vocabulary set not found" });
    return;
  }

  res.json(toVocabularySet(set));
});
