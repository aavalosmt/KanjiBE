import { Router } from "express";
import { prisma } from "../db.js";
import { toVocabularySet, toVocabularySetSummary } from "../lib/vocabularySerialize.js";
import { parsePagination } from "../lib/pagination.js";

export const vocabularyRouter = Router();

vocabularyRouter.get("/", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);

  const [rows, total] = await Promise.all([
    prisma.vocabularySet.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { pages: true } } }
    }),
    prisma.vocabularySet.count()
  ]);

  res.json({
    data: rows.map(toVocabularySetSummary),
    pagination: { page, limit, total }
  });
});

vocabularyRouter.get("/:id", async (req, res) => {
  const set = await prisma.vocabularySet.findUnique({
    where: { id: req.params.id },
    include: {
      pages: {
        orderBy: { pageIndex: "asc" },
        include: { entries: { orderBy: { entryIndex: "asc" } } }
      }
    }
  });

  if (!set) {
    res.status(404).json({ error: "Vocabulary set not found" });
    return;
  }

  res.json(toVocabularySet(set));
});
