import { Router } from "express";
import { prisma } from "../db.js";
import { asString, parsePagination } from "../lib/pagination.js";
import { toLyric, toLyricSummary } from "../lib/serialize.js";

export const lyricsRouter = Router();

lyricsRouter.get("/", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const level = asString(req.query.level);
  const where = level ? { level } : {};

  const [rows, total] = await Promise.all([
    prisma.lyric.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        artist: true,
        level: true,
        translation: true,
        coverUrl: true,
        youtubeUrl: true
      }
    }),
    prisma.lyric.count({ where })
  ]);

  res.json({
    data: rows.map(toLyricSummary),
    pagination: { page, limit, total }
  });
});

lyricsRouter.get("/:id", async (req, res) => {
  const lyric = await prisma.lyric.findUnique({
    where: { id: req.params.id }
  });

  if (!lyric) {
    res.status(404).json({ error: "Lyric not found" });
    return;
  }

  res.json(toLyric(lyric));
});
