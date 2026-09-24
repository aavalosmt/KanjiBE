import { Router } from "express";
import { prisma } from "../db.js";
import {
  paginatedVocabularyWords,
  toVocabularySet,
  toVocabularySetSummary
} from "../lib/vocabularySerialize.js";
import { listExampleSentences } from "../lib/exampleSentenceSerialize.js";
import { infoHandler, PUBLIC_AUTH } from "../lib/endpointInfo.js";
import { asString, parsePagination } from "../lib/pagination.js";
import { fetchTranslationOverlay, normalizeLang } from "../lib/translations.js";

export const vocabularyRouter = Router();

vocabularyRouter.get(
  "/info",
  infoHandler({
    method: "GET",
    path: "/api/vocabulary",
    description: "Lista resúmenes de sets de vocabulario (sin pages/words), paginado y filtrable por topic.",
    auth: PUBLIC_AUTH,
    query: {
      page: "opcional, default 1",
      limit: "opcional, default 20, máx 100",
      topic: "opcional — slug de topic registrado"
    },
    response_example: {
      data: [
        {
          id: "set_1",
          topic: "body",
          subtopic: "fingers",
          content_type: "list",
          title: "Fingers",
          cover_url: null,
          item_count: 12,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z"
        }
      ],
      pagination: { page: 1, limit: 20, total: 7 }
    }
  })
);

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

vocabularyRouter.get(
  "/:topic/:subtopic/info",
  infoHandler({
    method: "GET",
    path: "/api/vocabulary/:topic/:subtopic",
    description:
      'Devuelve un set de vocabulario completo. pages[].entries[] si content_type es "image", words[] si es "list" (el array no aplicable siempre vuelve vacío). Incluye example_sentences y layout (SDUI) resueltos.',
    auth: PUBLIC_AUTH,
    params: { topic: "requerido", subtopic: "requerido" },
    query: { lang: "opcional — locale para la traducción overlay de words, default es" },
    response_example: {
      id: "set_1",
      topic: "body",
      subtopic: "fingers",
      content_type: "list",
      title: "Fingers",
      cover_url: null,
      item_count: 2,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      pages: [],
      words: [{ word_index: 0, term: "指", furigana: "[指](furigana:ゆび)", translation: "finger", translationLang: "es" }],
      example_sentences: [],
      layout: { type: "grid" }
    }
  })
);

vocabularyRouter.get("/:topic/:subtopic", async (req, res) => {
  const lang = normalizeLang(req.query.lang);
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

  const [overlay, exampleSentences] = await Promise.all([
    fetchTranslationOverlay(
      "vocabularyWord",
      set.words.map((word) => word.id),
      lang
    ),
    listExampleSentences(req.params.topic, req.params.subtopic, lang)
  ]);

  res.json(toVocabularySet(set, lang, overlay, exampleSentences));
});

vocabularyRouter.get(
  "/:topic/:subtopic/words/info",
  infoHandler({
    method: "GET",
    path: "/api/vocabulary/:topic/:subtopic/words",
    description:
      "Palabras paginadas de un set de vocabulario tipo list, como alternativa al array words[] completo (sin paginar) de GET /:topic/:subtopic. Para un set content_type: image devuelve una página vacía (total 0), no error.",
    auth: PUBLIC_AUTH,
    params: { topic: "requerido", subtopic: "requerido" },
    query: {
      page: "opcional, default 1",
      limit: "opcional, default 20, máx 100",
      lang: "opcional — locale para la traducción overlay, default es"
    },
    response_example: {
      data: [{ word_index: 0, term: "指", furigana: "[指](furigana:ゆび)", translation: "finger", translationLang: "es" }],
      pagination: { page: 1, limit: 20, total: 12 }
    }
  })
);

// Paginated words for a large list-type set, as an alternative to the full
// (unpaginated) words[] on GET /:topic/:subtopic above.
vocabularyRouter.get("/:topic/:subtopic/words", async (req, res) => {
  const result = await paginatedVocabularyWords(req.params.topic, req.params.subtopic, req.query);
  if (!result) {
    res.status(404).json({ error: "Vocabulary set not found" });
    return;
  }
  res.json(result);
});
