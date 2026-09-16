import { Router } from "express";
import multer from "multer";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import {
  paginatedVocabularyWords,
  toVocabularyEntry,
  toVocabularyPage,
  toVocabularySet,
  toVocabularySetSummary,
  toVocabularyWord
} from "../lib/vocabularySerialize.js";
import { listExampleSentences } from "../lib/exampleSentenceSerialize.js";
import { VOCABULARY_IMAGE_MIME_TYPES, storeVocabularyImage } from "../lib/vocabularyStorage.js";
import { unknownSubtopicMessage, unknownTopicMessage } from "../lib/taxonomy.js";
import { parsePagination } from "../lib/pagination.js";
import {
  deleteEntityTranslations,
  fetchTranslationOverlay,
  LEGACY_LANG,
  normalizeLang,
  upsertTranslationOverlay
} from "../lib/translations.js";
import { requireAdmin } from "../middleware/adminAuth.js";
import {
  localeParam,
  vocabularyEntryPatchSchema,
  vocabularyIngestSchema,
  vocabularySetPatchSchema,
  vocabularyWordPatchSchema,
  vocabularyWordsAppendSchema,
  wordTranslationOverlaySchema,
  stripChecksumPrefix
} from "../validators.js";

export const vocabularyAdminRouter = Router();

vocabularyAdminRouter.use(requireAdmin);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!VOCABULARY_IMAGE_MIME_TYPES.has(file.mimetype)) {
      cb(new Error("Only image uploads are allowed"));
      return;
    }
    cb(null, true);
  }
});

vocabularyAdminRouter.post("/upload-image", upload.single("image"), async (req, res) => {
  const file = req.file;
  const declaredChecksum = typeof req.body?.image_checksum === "string" ? req.body.image_checksum : undefined;

  if (!file || !declaredChecksum) {
    res.status(400).json({ error: "image and image_checksum are required" });
    return;
  }

  const stored = await storeVocabularyImage(file.buffer, file.mimetype);
  if (stripChecksumPrefix(declaredChecksum) !== stored.checksum) {
    res.status(400).json({ error: "image_checksum does not match uploaded file" });
    return;
  }

  res.json({ image_url: stored.url, already_existed: stored.alreadyExisted });
});

vocabularyAdminRouter.post("/ingest", async (req, res) => {
  const payload = vocabularyIngestSchema.parse(req.body);

  const topicError = await unknownTopicMessage(payload.topic);
  if (topicError) {
    res.status(400).json({ error: topicError });
    return;
  }
  const subtopicError = await unknownSubtopicMessage(payload.topic, payload.subtopic);
  if (subtopicError) {
    res.status(400).json({ error: subtopicError });
    return;
  }

  const existingSet = await prisma.vocabularySet.findUnique({
    where: { topic_subtopic: { topic: payload.topic, subtopic: payload.subtopic } }
  });

  await prisma.$transaction(async (tx) => {
    const set = await tx.vocabularySet.upsert({
      where: { topic_subtopic: { topic: payload.topic, subtopic: payload.subtopic } },
      create: {
        topic: payload.topic,
        subtopic: payload.subtopic,
        contentType: payload.content_type,
        title: payload.title,
        coverUrl: payload.cover_url ?? null
      },
      update: {
        contentType: payload.content_type,
        title: payload.title,
        coverUrl: payload.cover_url ?? null
      }
    });

    if (payload.content_type === "image") {
      // Switching an existing set from "list" to "image": drop the now-irrelevant words
      // (and any English/etc. overlays layered on top of them).
      const droppedWords = await tx.vocabularyWord.findMany({
        where: { setId: set.id },
        select: { id: true }
      });
      await tx.vocabularyWord.deleteMany({ where: { setId: set.id } });
      if (droppedWords.length) {
        await tx.translation.deleteMany({
          where: { entityType: "vocabularyWord", entityId: { in: droppedWords.map((w) => w.id) } }
        });
      }

      for (const page of payload.pages) {
        const imageChecksum = stripChecksumPrefix(page.image_checksum);
        const existingPage = await tx.vocabularyPage.findUnique({
          where: { setId_pageIndex: { setId: set.id, pageIndex: page.page_index } }
        });

        const pageRow = await tx.vocabularyPage.upsert({
          where: { setId_pageIndex: { setId: set.id, pageIndex: page.page_index } },
          create: {
            setId: set.id,
            pageIndex: page.page_index,
            imageUrl: page.image_url,
            imageChecksum,
            width: page.width,
            height: page.height
          },
          update: {
            imageUrl: page.image_url,
            imageChecksum,
            width: page.width,
            height: page.height
          }
        });

        if (existingPage) {
          await tx.vocabularyEntry.deleteMany({ where: { pageId: pageRow.id } });
        }

        if (page.entries.length) {
          await tx.vocabularyEntry.createMany({
            data: page.entries.map((entry, index) => ({
              pageId: pageRow.id,
              entryIndex: index,
              boxX: entry.entry_box.x,
              boxY: entry.entry_box.y,
              boxWidth: entry.entry_box.width,
              boxHeight: entry.entry_box.height,
              fullText: entry.full_text,
              tokens: JSON.stringify(entry.tokens),
              furigana: entry.furigana,
              morphology: JSON.stringify(entry.morphology)
            }))
          });
        }
      }
    } else {
      // Switching an existing set from "image" to "list": drop the now-irrelevant pages
      // (cascades to their entries).
      await tx.vocabularyPage.deleteMany({ where: { setId: set.id } });

      // Words are fully replaced (new ids) on every ingest, so any overlays on the old
      // ids would otherwise be orphaned.
      const droppedWords = await tx.vocabularyWord.findMany({
        where: { setId: set.id },
        select: { id: true }
      });
      await tx.vocabularyWord.deleteMany({ where: { setId: set.id } });
      if (droppedWords.length) {
        await tx.translation.deleteMany({
          where: { entityType: "vocabularyWord", entityId: { in: droppedWords.map((w) => w.id) } }
        });
      }
      await tx.vocabularyWord.createMany({
        data: payload.words.map((word, index) => ({
          setId: set.id,
          wordIndex: index,
          term: word.term,
          furigana: word.furigana,
          translation: word.translation,
          variantTerm: word.variant?.term ?? null,
          variantFurigana: word.variant?.furigana ?? null,
          variantLabel: word.variant?.label ?? null
        }))
      });
    }
  });

  res.json({
    topic: payload.topic,
    subtopic: payload.subtopic,
    created: !existingSet,
    item_count: payload.content_type === "image" ? payload.pages.length : payload.words.length
  });
});

vocabularyAdminRouter.get("/", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);

  const [rows, total] = await Promise.all([
    prisma.vocabularySet.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { pages: true, words: true } } }
    }),
    prisma.vocabularySet.count()
  ]);

  res.json({
    data: rows.map(toVocabularySetSummary),
    pagination: { page, limit, total }
  });
});

async function findSet(topic: string, subtopic: string) {
  return prisma.vocabularySet.findUnique({
    where: { topic_subtopic: { topic, subtopic } },
    include: {
      pages: {
        orderBy: { pageIndex: "asc" },
        include: { entries: { orderBy: { entryIndex: "asc" } } }
      },
      words: { orderBy: { wordIndex: "asc" } }
    }
  });
}

vocabularyAdminRouter.get("/:topic/:subtopic", async (req, res) => {
  const lang = normalizeLang(req.query.lang);
  const set = await findSet(req.params.topic, req.params.subtopic);

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

vocabularyAdminRouter.patch("/:topic/:subtopic", async (req, res) => {
  const payload = vocabularySetPatchSchema.parse(req.body);

  try {
    // undefined = field omitted, leave untouched; null = clear the override
    // (revert to the computed heuristic); an object = store the override.
    const layout =
      payload.layout === undefined
        ? undefined
        : payload.layout === null
          ? null
          : JSON.stringify(payload.layout);

    await prisma.vocabularySet.update({
      where: { topic_subtopic: { topic: req.params.topic, subtopic: req.params.subtopic } },
      data: {
        title: payload.title,
        coverUrl: payload.cover_url,
        layout
      }
    });
    const set = await findSet(req.params.topic, req.params.subtopic);
    const exampleSentences = await listExampleSentences(
      req.params.topic,
      req.params.subtopic,
      LEGACY_LANG
    );
    res.json(toVocabularySet(set!, LEGACY_LANG, undefined, exampleSentences));
  } catch (error) {
    if (isNotFound(error)) {
      res.status(404).json({ error: "Vocabulary set not found" });
      return;
    }
    throw error;
  }
});

// Append-only: adds to the end of an existing list-type set's words, leaving
// existing ones (and their translation overlays) untouched. Unlike /ingest,
// which always fully replaces the words array.
vocabularyAdminRouter.post("/:topic/:subtopic/words", async (req, res) => {
  const { topic, subtopic } = req.params;
  const payload = vocabularyWordsAppendSchema.parse(req.body);

  const set = await prisma.vocabularySet.findUnique({ where: { topic_subtopic: { topic, subtopic } } });
  if (!set) {
    res.status(404).json({ error: "Vocabulary set not found" });
    return;
  }
  if (set.contentType !== "list") {
    res.status(400).json({
      error: `This set is content_type: "${set.contentType}" and has no words to append to`
    });
    return;
  }

  // Use the current max index, not the word count: deletes can leave gaps,
  // and colliding with the (setId, wordIndex) unique constraint must be avoided.
  const { _max } = await prisma.vocabularyWord.aggregate({
    where: { setId: set.id },
    _max: { wordIndex: true }
  });
  const startIndex = (_max.wordIndex ?? -1) + 1;

  const created = await prisma.$transaction(
    payload.words.map((word, offset) =>
      prisma.vocabularyWord.create({
        data: {
          setId: set.id,
          wordIndex: startIndex + offset,
          term: word.term,
          furigana: word.furigana,
          translation: word.translation,
          variantTerm: word.variant?.term ?? null,
          variantFurigana: word.variant?.furigana ?? null,
          variantLabel: word.variant?.label ?? null
        }
      })
    )
  );

  const total = await prisma.vocabularyWord.count({ where: { setId: set.id } });
  res.status(201).json({ data: created.map((word) => toVocabularyWord(word)), item_count: total });
});

vocabularyAdminRouter.get("/:topic/:subtopic/words", async (req, res) => {
  const result = await paginatedVocabularyWords(req.params.topic, req.params.subtopic, req.query);
  if (!result) {
    res.status(404).json({ error: "Vocabulary set not found" });
    return;
  }
  res.json(result);
});

async function findPage(topic: string, subtopic: string, pageIndex: number) {
  const set = await prisma.vocabularySet.findUnique({
    where: { topic_subtopic: { topic, subtopic } }
  });
  if (!set) return null;
  return prisma.vocabularyPage.findUnique({
    where: { setId_pageIndex: { setId: set.id, pageIndex } },
    include: { entries: { orderBy: { entryIndex: "asc" } } }
  });
}

vocabularyAdminRouter.get("/:topic/:subtopic/pages/:pageIndex", async (req, res) => {
  const pageIndex = Number(req.params.pageIndex);
  const page = await findPage(req.params.topic, req.params.subtopic, pageIndex);

  if (!page) {
    res.status(404).json({ error: "Page not found" });
    return;
  }

  res.json(toVocabularyPage(page));
});

vocabularyAdminRouter.patch(
  "/:topic/:subtopic/pages/:pageIndex/entries/:entryIndex",
  async (req, res) => {
    const pageIndex = Number(req.params.pageIndex);
    const entryIndex = Number(req.params.entryIndex);
    const payload = vocabularyEntryPatchSchema.parse(req.body);

    const page = await findPage(req.params.topic, req.params.subtopic, pageIndex);
    if (!page) {
      res.status(404).json({ error: "Page not found" });
      return;
    }

    try {
      const entry = await prisma.vocabularyEntry.update({
        where: { pageId_entryIndex: { pageId: page.id, entryIndex } },
        data: {
          boxX: payload.entry_box?.x,
          boxY: payload.entry_box?.y,
          boxWidth: payload.entry_box?.width,
          boxHeight: payload.entry_box?.height,
          fullText: payload.full_text,
          tokens: payload.tokens ? JSON.stringify(payload.tokens) : undefined,
          furigana: payload.furigana,
          morphology: payload.morphology ? JSON.stringify(payload.morphology) : undefined
        }
      });
      res.json(toVocabularyEntry(entry));
    } catch (error) {
      if (isNotFound(error)) {
        res.status(404).json({ error: "Entry not found" });
        return;
      }
      throw error;
    }
  }
);

vocabularyAdminRouter.put(
  "/:topic/:subtopic/pages/:pageIndex/image",
  upload.single("image"),
  async (req, res) => {
    const pageIndex = Number(req.params.pageIndex);
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "image is required" });
      return;
    }

    const page = await findPage(String(req.params.topic), String(req.params.subtopic), pageIndex);
    if (!page) {
      res.status(404).json({ error: "Page not found" });
      return;
    }

    const width = req.body?.width ? Number(req.body.width) : undefined;
    const height = req.body?.height ? Number(req.body.height) : undefined;
    const stored = await storeVocabularyImage(file.buffer, file.mimetype);

    const updated = await prisma.vocabularyPage.update({
      where: { id: page.id },
      data: {
        imageUrl: stored.url,
        imageChecksum: stored.checksum,
        width: Number.isFinite(width) ? width : undefined,
        height: Number.isFinite(height) ? height : undefined
      },
      include: { entries: { orderBy: { entryIndex: "asc" } } }
    });

    res.json(toVocabularyPage(updated));
  }
);

vocabularyAdminRouter.delete("/:topic/:subtopic/pages/:pageIndex", async (req, res) => {
  const pageIndex = Number(req.params.pageIndex);
  const page = await findPage(req.params.topic, req.params.subtopic, pageIndex);
  if (!page) {
    res.status(404).json({ error: "Page not found" });
    return;
  }

  await prisma.vocabularyPage.delete({ where: { id: page.id } });
  res.status(204).send();
});

async function findWord(topic: string, subtopic: string, wordIndex: number) {
  const set = await prisma.vocabularySet.findUnique({
    where: { topic_subtopic: { topic, subtopic } }
  });
  if (!set) return null;
  return prisma.vocabularyWord.findUnique({
    where: { setId_wordIndex: { setId: set.id, wordIndex } }
  });
}

vocabularyAdminRouter.patch("/:topic/:subtopic/words/:wordIndex", async (req, res) => {
  const wordIndex = Number(req.params.wordIndex);
  const payload = vocabularyWordPatchSchema.parse(req.body);

  const word = await findWord(req.params.topic, req.params.subtopic, wordIndex);
  if (!word) {
    res.status(404).json({ error: "Word not found" });
    return;
  }

  // undefined = field omitted, leave untouched; null = clear the variant;
  // an object = set/replace it (same three-way convention as the SDUI layout override).
  const variantFields =
    payload.variant === undefined
      ? {}
      : payload.variant === null
        ? { variantTerm: null, variantFurigana: null, variantLabel: null }
        : {
            variantTerm: payload.variant.term,
            variantFurigana: payload.variant.furigana,
            variantLabel: payload.variant.label
          };

  const updated = await prisma.vocabularyWord.update({
    where: { id: word.id },
    data: {
      term: payload.term,
      furigana: payload.furigana,
      translation: payload.translation,
      ...variantFields
    }
  });
  res.json(toVocabularyWord(updated));
});

vocabularyAdminRouter.put(
  "/:topic/:subtopic/words/:wordIndex/translations/:lang",
  async (req, res) => {
    const lang = localeParam.parse(req.params.lang);
    if (lang === LEGACY_LANG) {
      res.status(400).json({
        error: `Use PATCH /:topic/:subtopic/words/:wordIndex to edit the original (${LEGACY_LANG}) translation`
      });
      return;
    }

    const wordIndex = Number(req.params.wordIndex);
    const payload = wordTranslationOverlaySchema.parse(req.body);

    const word = await findWord(req.params.topic, req.params.subtopic, wordIndex);
    if (!word) {
      res.status(404).json({ error: "Word not found" });
      return;
    }

    await upsertTranslationOverlay({
      entityType: "vocabularyWord",
      entityId: word.id,
      lang,
      translation: payload.translation
    });
    res.status(204).send();
  }
);

vocabularyAdminRouter.delete("/:topic/:subtopic/words/:wordIndex", async (req, res) => {
  const wordIndex = Number(req.params.wordIndex);
  const word = await findWord(req.params.topic, req.params.subtopic, wordIndex);
  if (!word) {
    res.status(404).json({ error: "Word not found" });
    return;
  }

  await prisma.$transaction([
    deleteEntityTranslations("vocabularyWord", word.id),
    prisma.vocabularyWord.delete({ where: { id: word.id } })
  ]);
  res.status(204).send();
});

function isNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}
