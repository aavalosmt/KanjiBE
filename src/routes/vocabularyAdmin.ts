import { Router } from "express";
import multer from "multer";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import {
  toVocabularyEntry,
  toVocabularyPage,
  toVocabularySet,
  toVocabularySetSummary
} from "../lib/vocabularySerialize.js";
import { VOCABULARY_IMAGE_MIME_TYPES, storeVocabularyImage } from "../lib/vocabularyStorage.js";
import { parsePagination } from "../lib/pagination.js";
import { requireAdmin } from "../middleware/adminAuth.js";
import {
  vocabularyEntryPatchSchema,
  vocabularyIngestSchema,
  vocabularySetPatchSchema,
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

  const existingSet = await prisma.vocabularySet.findUnique({ where: { id: payload.set_id } });

  await prisma.$transaction(async (tx) => {
    await tx.vocabularySet.upsert({
      where: { id: payload.set_id },
      create: {
        id: payload.set_id,
        title: payload.title,
        setNumber: payload.set_number ?? null,
        totalPages: payload.total_pages ?? null,
        coverUrl: payload.cover_url ?? null
      },
      update: {
        title: payload.title,
        setNumber: payload.set_number ?? null,
        totalPages: payload.total_pages ?? null,
        coverUrl: payload.cover_url ?? null
      }
    });

    for (const page of payload.pages) {
      const imageChecksum = stripChecksumPrefix(page.image_checksum);
      const existingPage = await tx.vocabularyPage.findUnique({
        where: { setId_pageIndex: { setId: payload.set_id, pageIndex: page.page_index } }
      });

      const pageRow = await tx.vocabularyPage.upsert({
        where: { setId_pageIndex: { setId: payload.set_id, pageIndex: page.page_index } },
        create: {
          setId: payload.set_id,
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
  });

  res.json({
    set_id: payload.set_id,
    created: !existingSet,
    pages_upserted: payload.pages.length
  });
});

vocabularyAdminRouter.get("/", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);

  const [rows, total] = await Promise.all([
    prisma.vocabularySet.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { pages: true } } }
    }),
    prisma.vocabularySet.count()
  ]);

  res.json({
    data: rows.map(toVocabularySetSummary),
    pagination: { page, limit, total }
  });
});

vocabularyAdminRouter.get("/:id", async (req, res) => {
  const set = await prisma.vocabularySet.findUnique({
    where: { id: req.params.id },
    include: {
      pages: {
        orderBy: { pageIndex: "asc" },
        include: { entries: { orderBy: { entryIndex: "asc" } } }
      }
    }
  });

  if (!set) {
    res.status(404).json({ error: "Vocabulary set not found" });
    return;
  }

  res.json(toVocabularySet(set));
});

vocabularyAdminRouter.patch("/:id", async (req, res) => {
  const payload = vocabularySetPatchSchema.parse(req.body);

  try {
    const set = await prisma.vocabularySet.update({
      where: { id: req.params.id },
      data: {
        title: payload.title,
        setNumber: payload.set_number,
        coverUrl: payload.cover_url
      },
      include: {
        pages: {
          orderBy: { pageIndex: "asc" },
          include: { entries: { orderBy: { entryIndex: "asc" } } }
        }
      }
    });
    res.json(toVocabularySet(set));
  } catch (error) {
    if (isNotFound(error)) {
      res.status(404).json({ error: "Vocabulary set not found" });
      return;
    }
    throw error;
  }
});

async function findPage(setId: string, pageIndex: number) {
  return prisma.vocabularyPage.findUnique({
    where: { setId_pageIndex: { setId, pageIndex } },
    include: { entries: { orderBy: { entryIndex: "asc" } } }
  });
}

vocabularyAdminRouter.get("/:id/pages/:pageIndex", async (req, res) => {
  const pageIndex = Number(req.params.pageIndex);
  const page = await findPage(req.params.id, pageIndex);

  if (!page) {
    res.status(404).json({ error: "Page not found" });
    return;
  }

  res.json(toVocabularyPage(page));
});

vocabularyAdminRouter.patch("/:id/pages/:pageIndex/entries/:entryIndex", async (req, res) => {
  const pageIndex = Number(req.params.pageIndex);
  const entryIndex = Number(req.params.entryIndex);
  const payload = vocabularyEntryPatchSchema.parse(req.body);

  const page = await prisma.vocabularyPage.findUnique({
    where: { setId_pageIndex: { setId: req.params.id, pageIndex } }
  });
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
});

vocabularyAdminRouter.put("/:id/pages/:pageIndex/image", upload.single("image"), async (req, res) => {
  const pageIndex = Number(req.params.pageIndex);
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "image is required" });
    return;
  }

  const page = await prisma.vocabularyPage.findUnique({
    where: { setId_pageIndex: { setId: String(req.params.id), pageIndex } }
  });
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
});

vocabularyAdminRouter.delete("/:id/pages/:pageIndex", async (req, res) => {
  const pageIndex = Number(req.params.pageIndex);
  try {
    await prisma.vocabularyPage.delete({
      where: { setId_pageIndex: { setId: req.params.id, pageIndex } }
    });
    res.status(204).send();
  } catch (error) {
    if (isNotFound(error)) {
      res.status(404).json({ error: "Page not found" });
      return;
    }
    throw error;
  }
});

function isNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}
