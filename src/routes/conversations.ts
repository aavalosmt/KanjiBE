import { Router } from "express";
import { prisma } from "../db.js";
import { infoHandler, PUBLIC_AUTH, TOKENIZATION_ANALYZE } from "../lib/endpointInfo.js";
import { asString, parsePagination } from "../lib/pagination.js";
import { toConversation, toConversationSummary } from "../lib/serialize.js";
import { fetchTranslationOverlay, normalizeLang } from "../lib/translations.js";

export const conversationsRouter = Router();

conversationsRouter.get(
  "/info",
  infoHandler({
    method: "GET",
    path: "/api/conversations",
    description: "Lista resúmenes de conversaciones, paginado y filtrable por topic y nivel.",
    auth: PUBLIC_AUTH,
    query: {
      page: "opcional, default 1",
      limit: "opcional, default 20, máx 100",
      topic: "opcional — slug de topic registrado",
      level: "opcional — filtra por nivel",
      lang: "opcional — locale para la traducción overlay, default es"
    },
    example_request: "GET /api/conversations?page=1&limit=20&topic=body&level=N5",
    response_example: {
      data: [
        {
          id: "conv_1",
          title: "...",
          topic: "body",
          level: "N5",
          translation: "...",
          translationLang: "es",
          coverUrl: null
        }
      ],
      pagination: { page: 1, limit: 20, total: 5 }
    }
  })
);

conversationsRouter.get("/", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const topic = asString(req.query.topic);
  const level = asString(req.query.level);
  const lang = normalizeLang(req.query.lang);
  const where = {
    ...(topic ? { topic } : {}),
    ...(level ? { level } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        topic: true,
        level: true,
        translation: true,
        coverUrl: true
      }
    }),
    prisma.conversation.count({ where })
  ]);

  const overlay = await fetchTranslationOverlay(
    "conversation",
    rows.map((row) => row.id),
    lang
  );

  res.json({
    data: rows.map((row) => toConversationSummary(row, lang, overlay.get(row.id))),
    pagination: { page, limit, total }
  });
});

conversationsRouter.get(
  "/:id/info",
  infoHandler({
    method: "GET",
    path: "/api/conversations/:id",
    description: "Devuelve una conversación completa (con blocks) por id.",
    auth: PUBLIC_AUTH,
    params: { id: "requerido — id de la conversación" },
    query: { lang: "opcional — locale para la traducción overlay, default es" },
    example_request: "GET /api/conversations/conv_1?lang=en",
    response_example: {
      id: "conv_1",
      title: "...",
      topic: "body",
      level: "N5",
      translation: "...",
      translationLang: "es",
      coverUrl: null,
      blocks: [
        {
          id: "b1",
          type: "dialogue",
          speaker: "A",
          content: "食べました",
          translation: "...",
          tokens: [{ surface: "食べました", lemma: "食べる", reading: "タベマシタ", pos: "動詞", colorType: "verb", color: "#10B981" }]
        }
      ],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    tokenization: `Solo en bloques type: "text" | "header" | "dialogue" con content. ${TOKENIZATION_ANALYZE}`
  })
);

conversationsRouter.get("/:id", async (req, res) => {
  const lang = normalizeLang(req.query.lang);
  const conversation = await prisma.conversation.findUnique({
    where: { id: req.params.id }
  });

  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const overlay = await fetchTranslationOverlay("conversation", [conversation.id], lang);
  res.json(toConversation(conversation, lang, overlay.get(conversation.id)));
});
