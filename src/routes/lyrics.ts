import { Router } from "express";
import { prisma } from "../db.js";
import { infoHandler, PUBLIC_AUTH, TOKENIZATION_ANALYZE } from "../lib/endpointInfo.js";
import { asString, parsePagination } from "../lib/pagination.js";
import { toLyric, toLyricSummary } from "../lib/serialize.js";
import { fetchTranslationOverlay, normalizeLang } from "../lib/translations.js";

export const lyricsRouter = Router();

lyricsRouter.get(
  "/info",
  infoHandler({
    method: "GET",
    path: "/api/lyrics",
    description: "Lista resúmenes de letras de canciones, paginado y filtrable por nivel.",
    auth: PUBLIC_AUTH,
    query: {
      page: "opcional, default 1",
      limit: "opcional, default 20, máx 100",
      level: "opcional — filtra por nivel",
      lang: "opcional — locale para la traducción overlay, default es"
    },
    example_request: "GET /api/lyrics?page=1&limit=20&level=N4",
    response_example: {
      data: [
        {
          id: "lyric_1",
          title: "...",
          artist: "...",
          level: "N4",
          translation: "...",
          translationLang: "es",
          coverUrl: null,
          youtubeUrl: null
        }
      ],
      pagination: { page: 1, limit: 20, total: 10 }
    }
  })
);

lyricsRouter.get("/", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const level = asString(req.query.level);
  const lang = normalizeLang(req.query.lang);
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

  const overlay = await fetchTranslationOverlay(
    "lyric",
    rows.map((row) => row.id),
    lang
  );

  res.json({
    data: rows.map((row) => toLyricSummary(row, lang, overlay.get(row.id))),
    pagination: { page, limit, total }
  });
});

lyricsRouter.get(
  "/:id/info",
  infoHandler({
    method: "GET",
    path: "/api/lyrics/:id",
    description: "Devuelve una letra completa (con blocks sincronizados) por id.",
    auth: PUBLIC_AUTH,
    params: { id: "requerido — id de la letra" },
    query: { lang: "opcional — locale para la traducción overlay, default es" },
    example_request: "GET /api/lyrics/lyric_1?lang=en",
    response_example: {
      id: "lyric_1",
      title: "...",
      artist: "...",
      level: "N4",
      translation: "...",
      translationLang: "es",
      coverUrl: null,
      youtubeUrl: null,
      blocks: [
        {
          id: "b1",
          type: "text",
          content: "食べました",
          translation: "...",
          startTime: 0,
          tokens: [{ surface: "食べました", lemma: "食べる", reading: "タベマシタ", pos: "動詞", colorType: "verb", color: "#10B981" }]
        }
      ],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    tokenization: `Solo en bloques type: "text" | "header" | "dialogue" con content. ${TOKENIZATION_ANALYZE}`
  })
);

lyricsRouter.get("/:id", async (req, res) => {
  const lang = normalizeLang(req.query.lang);
  const lyric = await prisma.lyric.findUnique({
    where: { id: req.params.id }
  });

  if (!lyric) {
    res.status(404).json({ error: "Lyric not found" });
    return;
  }

  const overlay = await fetchTranslationOverlay("lyric", [lyric.id], lang);
  res.json(toLyric(lyric, lang, overlay.get(lyric.id)));
});
