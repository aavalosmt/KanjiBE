import { Router } from "express";
import { prisma } from "../db.js";
import { infoHandler, PUBLIC_AUTH } from "../lib/endpointInfo.js";
import { asString, parsePagination } from "../lib/pagination.js";
import { toStory, toStorySummary } from "../lib/serialize.js";
import { fetchTranslationOverlay, normalizeLang } from "../lib/translations.js";

export const storiesRouter = Router();

storiesRouter.get(
  "/info",
  infoHandler({
    method: "GET",
    path: "/api/stories",
    description: "Lista resúmenes de historias, paginado y filtrable por nivel.",
    auth: PUBLIC_AUTH,
    query: {
      page: "opcional, default 1",
      limit: "opcional, default 20, máx 100",
      level: "opcional — filtra por nivel (ej. N5)",
      lang: "opcional — locale para la traducción overlay (ej. en, en-us), default es"
    },
    response_example: {
      data: [
        {
          id: "story_1",
          title: "...",
          level: "N5",
          translation: "...",
          translationLang: "es",
          coverUrl: null
        }
      ],
      pagination: { page: 1, limit: 20, total: 42 }
    }
  })
);

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

storiesRouter.get(
  "/:id/info",
  infoHandler({
    method: "GET",
    path: "/api/stories/:id",
    description: "Devuelve una historia completa (con blocks) por id.",
    auth: PUBLIC_AUTH,
    params: { id: "requerido — id de la historia" },
    query: { lang: "opcional — locale para la traducción overlay, default es" },
    response_example: {
      id: "story_1",
      title: "...",
      level: "N5",
      translation: "...",
      translationLang: "es",
      coverUrl: null,
      blocks: [{ id: "b1", type: "text", content: "...", translation: "..." }],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  })
);

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
