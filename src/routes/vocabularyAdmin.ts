import { Router } from "express";
import multer from "multer";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import {
  toVocabularyEntry,
  toVocabularyPage,
  toVocabularySet,
  toVocabularySetSummary,
  toVocabularyWord
} from "../lib/vocabularySerialize.js";
import { VOCABULARY_IMAGE_MIME_TYPES, storeVocabularyImage } from "../lib/vocabularyStorage.js";
import { unknownSubtopicMessage, unknownTopicMessage } from "../lib/taxonomy.js";
import { parsePagination } from "../lib/pagination.js";
import { requireAdmin } from "../middleware/adminAuth.js";
import {
  vocabularyEntryPatchSchema,
  vocabularyIngestSchema,
  vocabularySetPatchSchema,
  vocabularyWordPatchSchema,
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
      // Switching an existing set from "list" to "image": drop the now-irrelevant words.
      await tx.vocabularyWord.deleteMany({ where: { setId: set.id } });

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

      await tx.vocabularyWord.deleteMany({ where: { setId: set.id } });
      await tx.vocabularyWord.createMany({
        data: payload.words.map((word, index) => ({
          setId: set.id,
          wordIndex: index,
          term: word.term,
          furigana: word.furigana,
          translation: word.translation
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
  const set = await findSet(req.params.topic, req.params.subtopic);

  if (!set) {
    res.status(404).json({ error: "Vocabulary set not found" });
    return;
  }

  res.json(toVocabularySet(set));
});

vocabularyAdminRouter.patch("/:topic/:subtopic", async (req, res) => {
  const payload = vocabularySetPatchSchema.parse(req.body);

  try {
    await prisma.vocabularySet.update({
      where: { topic_subtopic: { topic: req.params.topic, subtopic: req.params.subtopic } },
      data: {
        title: payload.title,
        coverUrl: payload.cover_url
      }
    });
    const set = await findSet(req.params.topic, req.params.subtopic);
    res.json(toVocabularySet(set!));
  } catch (error) {
    if (isNotFound(error)) {
      res.status(404).json({ error: "Vocabulary set not found" });
      return;
    }
    throw error;
  }
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

  const updated = await prisma.vocabularyWord.update({
    where: { id: word.id },
    data: {
      term: payload.term,
      furigana: payload.furigana,
      translation: payload.translation
    }
  });
  res.json(toVocabularyWord(updated));
});

vocabularyAdminRouter.delete("/:topic/:subtopic/words/:wordIndex", async (req, res) => {
  const wordIndex = Number(req.params.wordIndex);
  const word = await findWord(req.params.topic, req.params.subtopic, wordIndex);
  if (!word) {
    res.status(404).json({ error: "Word not found" });
    return;
  }

  await prisma.vocabularyWord.delete({ where: { id: word.id } });
  res.status(204).send();
});

function isNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}
