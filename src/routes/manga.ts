import { Router } from "express";
import { prisma } from "../db.js";
import { infoHandler, PUBLIC_AUTH, TOKENIZATION_CLIENT_SUPPLIED } from "../lib/endpointInfo.js";
import { toMangaVolume, toMangaVolumeSummary } from "../lib/mangaSerialize.js";
import { parsePagination } from "../lib/pagination.js";

export const mangaRouter = Router();

mangaRouter.get(
  "/info",
  infoHandler({
    method: "GET",
    path: "/api/manga",
    description: "Lista resúmenes de volúmenes de manga, paginado.",
    auth: PUBLIC_AUTH,
    query: { page: "opcional, default 1", limit: "opcional, default 20, máx 100" },
    example_request: "GET /api/manga?page=1&limit=20",
    response_example: {
      data: [
        {
          id: "vol_1",
          title: "...",
          volume_number: 1,
          total_pages: 180,
          cover_url: null,
          page_count: 12,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z"
        }
      ],
      pagination: { page: 1, limit: 20, total: 3 }
    }
  })
);

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

mangaRouter.get(
  "/:id/info",
  infoHandler({
    method: "GET",
    path: "/api/manga/:id",
    description: "Devuelve un volumen de manga completo, con sus páginas y diálogos posicionados.",
    auth: PUBLIC_AUTH,
    params: { id: "requerido — id del volumen" },
    example_request: "GET /api/manga/vol_1",
    response_example: {
      id: "vol_1",
      title: "...",
      volume_number: 1,
      total_pages: 180,
      cover_url: null,
      page_count: 1,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      pages: [
        {
          page_index: 0,
          image_url: "https://.../p000.webp",
          image_checksum: "sha256:...",
          width: 1600,
          height: 2400,
          dialogues: [{ dialogue_index: 0, dialogue_box: { x: 0, y: 0, width: 0, height: 0 }, full_text: "頭", tokens: ["頭"], furigana: "[頭](furigana:あたま)", morphology: [{ surface: "頭", pos: "noun" }] }]
        }
      ]
    },
    tokenization: TOKENIZATION_CLIENT_SUPPLIED
  })
);

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
