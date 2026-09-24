import { Router } from "express";
import { prisma } from "../db.js";
import {
  enrichExampleSentences,
  isProviderConfigured,
  providerEnvVar,
  resolveProvider
} from "../lib/ai.js";
import { listExampleSentences } from "../lib/exampleSentenceSerialize.js";
import { ADMIN_AUTH, infoHandler } from "../lib/endpointInfo.js";
import { unknownSubtopicMessage, unknownTopicMessage } from "../lib/taxonomy.js";
import {
  EXAMPLE_SENTENCE_BASE_LANG,
  normalizeLang,
  upsertTranslationOverlay
} from "../lib/translations.js";
import { requireAdmin } from "../middleware/adminAuth.js";
import {
  exampleSentenceGenerateSchema,
  exampleSentencesBulkSchema,
  localeParam,
  wordTranslationOverlaySchema
} from "../validators.js";

export const exampleSentencesAdminRouter = Router();

// Registered before requireAdmin below so /info stays public even though the
// endpoint it documents requires admin auth — it only describes usage.
exampleSentencesAdminRouter.get(
  "/:topic/:subtopic/info",
  infoHandler({
    method: "GET",
    path: "/api/admin/examples/:topic/:subtopic",
    description: "Lista las frases de ejemplo de un (topic, subtopic) (vista admin, idéntico a GET /api/examples/:topic/:subtopic).",
    auth: ADMIN_AUTH,
    params: { topic: "requerido", subtopic: "requerido" },
    query: { lang: "opcional — locale para la traducción overlay, default en" },
    response_example: {
      topic: "body",
      subtopic: "fingers",
      data: [{ sentence_index: 0, text: "指が痛い。", furigana: "...", translation: "My finger hurts.", translationLang: "en" }]
    }
  })
);

exampleSentencesAdminRouter.use(requireAdmin);

const INDEX_PARK_OFFSET = 1_000_000;

async function requireTaxonomy(
  topic: string,
  subtopic: string,
  res: import("express").Response
): Promise<boolean> {
  const topicError = await unknownTopicMessage(topic);
  if (topicError) {
    res.status(400).json({ error: topicError });
    return false;
  }
  const subtopicError = await unknownSubtopicMessage(topic, subtopic);
  if (subtopicError) {
    res.status(400).json({ error: subtopicError });
    return false;
  }
  return true;
}

exampleSentencesAdminRouter.get("/:topic/:subtopic", async (req, res) => {
  const { topic, subtopic } = req.params;
  if (!(await requireTaxonomy(topic, subtopic, res))) return;

  const lang = normalizeLang(req.query.lang);
  res.json({ topic, subtopic, data: await listExampleSentences(topic, subtopic, lang) });
});

exampleSentencesAdminRouter.put("/:topic/:subtopic", async (req, res) => {
  const { topic, subtopic } = req.params;
  if (!(await requireTaxonomy(topic, subtopic, res))) return;

  const payload = exampleSentencesBulkSchema.parse(req.body);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.exampleSentence.findMany({
      where: { topicSlug: topic, subtopicSlug: subtopic },
      select: { id: true }
    });
    const existingIds = new Set(existing.map((row) => row.id));
    const keepIds = new Set(
      payload.sentences
        .map((sentence) => sentence.id)
        .filter((id): id is string => Boolean(id) && existingIds.has(id!))
    );
    const removeIds = [...existingIds].filter((id) => !keepIds.has(id));

    if (removeIds.length) {
      await tx.translation.deleteMany({
        where: { entityType: "exampleSentence", entityId: { in: removeIds } }
      });
      await tx.exampleSentence.deleteMany({ where: { id: { in: removeIds } } });
    }

    // Move survivors out of the [0, n) range so the renumber below can't trip
    // the (topicSlug, subtopicSlug, sentenceIndex) unique constraint.
    if (keepIds.size) {
      await tx.exampleSentence.updateMany({
        where: { id: { in: [...keepIds] } },
        data: { sentenceIndex: { increment: INDEX_PARK_OFFSET } }
      });
    }

    for (let index = 0; index < payload.sentences.length; index += 1) {
      const sentence = payload.sentences[index];
      const data = {
        text: sentence.text,
        furigana: sentence.furigana,
        translation: sentence.translation,
        notes: sentence.notes ?? null
      };
      if (sentence.id && keepIds.has(sentence.id)) {
        await tx.exampleSentence.update({
          where: { id: sentence.id },
          data: { ...data, sentenceIndex: index }
        });
      } else {
        await tx.exampleSentence.create({
          data: { ...data, topicSlug: topic, subtopicSlug: subtopic, sentenceIndex: index }
        });
      }
    }
  });

  res.json({
    topic,
    subtopic,
    data: await listExampleSentences(topic, subtopic, EXAMPLE_SENTENCE_BASE_LANG)
  });
});

exampleSentencesAdminRouter.put(
  "/:topic/:subtopic/:index/translations/:lang",
  async (req, res) => {
    const { topic, subtopic } = req.params;
    if (!(await requireTaxonomy(topic, subtopic, res))) return;

    const lang = localeParam.parse(req.params.lang);
    if (lang === EXAMPLE_SENTENCE_BASE_LANG) {
      res.status(400).json({
        error: `Use PUT /:topic/:subtopic to edit the original (${EXAMPLE_SENTENCE_BASE_LANG}) translation`
      });
      return;
    }

    const sentenceIndex = Number(req.params.index);
    const payload = wordTranslationOverlaySchema.parse(req.body);

    const row = await prisma.exampleSentence.findFirst({
      where: { topicSlug: topic, subtopicSlug: subtopic, sentenceIndex }
    });
    if (!row) {
      res.status(404).json({ error: "Example sentence not found" });
      return;
    }

    await upsertTranslationOverlay({
      entityType: "exampleSentence",
      entityId: row.id,
      lang,
      translation: payload.translation
    });
    res.status(204).send();
  }
);

exampleSentencesAdminRouter.post("/:topic/:subtopic/generate", async (req, res) => {
  const { topic, subtopic } = req.params;
  if (!(await requireTaxonomy(topic, subtopic, res))) return;

  const payload = exampleSentenceGenerateSchema.parse(req.body);
  const provider = resolveProvider(payload.provider);
  if (!isProviderConfigured(provider)) {
    res.status(503).json({ error: `${providerEnvVar(provider)} is not configured` });
    return;
  }

  const lines = payload.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    res.status(400).json({ error: "text has no non-empty lines" });
    return;
  }

  try {
    const enriched = await enrichExampleSentences(provider, lines, payload.model);
    res.json({
      sentences: lines.map((line, index) => ({
        text: line,
        furigana: enriched.lines[index]?.content || line,
        translation: enriched.lines[index]?.translation ?? ""
      })),
      usedAi: enriched.used,
      aiError: enriched.error
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI request failed";
    res.status(502).json({ error: message });
  }
});
