import { Router } from "express";
import { prisma } from "../db.js";
import { asString, parsePagination } from "../lib/pagination.js";
import { toStory, toStorySummary } from "../lib/serialize.js";
import { fetchTranslationOverlay, normalizeLang } from "../lib/translations.js";

export const storiesRouter = Router();

storiesRouter.get("/", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const level = asString(req.query.level);
  const lang = normalizeLang(req.query.lang);
  const where = level ? { level } : {};

  const [rows, total] = await Promise.all([
    prisma.story.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        level: true,
        translation: true,
        coverUrl: true
      }
    }),
    prisma.story.count({ where })
  ]);

  const overlay = await fetchTranslationOverlay(
    "story",
    rows.map((row) => row.id),
    lang
  );

  res.json({
    data: rows.map((row) => toStorySummary(row, lang, overlay.get(row.id))),
    pagination: { page, limit, total }
  });
});

storiesRouter.get("/:id", async (req, res) => {
  const lang = normalizeLang(req.query.lang);
  const story = await prisma.story.findUnique({
    where: { id: req.params.id }
  });

  if (!story) {
    res.status(404).json({ error: "Story not found" });
    return;
  }

  const overlay = await fetchTranslationOverlay("story", [story.id], lang);
  res.json(toStory(story, lang, overlay.get(story.id)));
});
