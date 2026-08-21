import { Router } from "express";
import { prisma } from "../db.js";
import { toMangaVolume, toMangaVolumeSummary } from "../lib/mangaSerialize.js";
import { parsePagination } from "../lib/pagination.js";

export const mangaRouter = Router();

mangaRouter.get("/", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);

  const [rows, total] = await Promise.all([
    prisma.mangaVolume.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { pages: true } } }
    }),
    prisma.mangaVolume.count()
  ]);

  res.json({
    data: rows.map(toMangaVolumeSummary),
    pagination: { page, limit, total }
  });
});

mangaRouter.get("/:id", async (req, res) => {
  const volume = await prisma.mangaVolume.findUnique({
    where: { id: req.params.id },
    include: {
      pages: {
        orderBy: { pageIndex: "asc" },
        include: { dialogues: { orderBy: { dialogueIndex: "asc" } } }
      }
    }
  });

  if (!volume) {
    res.status(404).json({ error: "Manga volume not found" });
    return;
  }

  res.json(toMangaVolume(volume));
});
