import { Router } from "express";
import { prisma } from "../db.js";
import { asString, parsePagination } from "../lib/pagination.js";
import { toStory, toStorySummary } from "../lib/serialize.js";

export const storiesRouter = Router();

storiesRouter.get("/", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const level = asString(req.query.level);
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

  res.json({
    data: rows.map(toStorySummary),
    pagination: { page, limit, total }
  });
});

storiesRouter.get("/:id", async (req, res) => {
  const story = await prisma.story.findUnique({
    where: { id: req.params.id }
  });

  if (!story) {
    res.status(404).json({ error: "Story not found" });
    return;
  }

  res.json(toStory(story));
});
