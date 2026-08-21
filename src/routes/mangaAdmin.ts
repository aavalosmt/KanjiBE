import { Router } from "express";
import multer from "multer";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { toMangaDialogue, toMangaPage, toMangaVolume, toMangaVolumeSummary } from "../lib/mangaSerialize.js";
import { MANGA_IMAGE_MIME_TYPES, storeMangaImage } from "../lib/mangaStorage.js";
import { parsePagination } from "../lib/pagination.js";
import { requireAdmin } from "../middleware/adminAuth.js";
import {
  mangaDialoguePatchSchema,
  mangaIngestSchema,
  mangaVolumePatchSchema,
  stripChecksumPrefix
} from "../validators.js";

export const mangaAdminRouter = Router();

mangaAdminRouter.use(requireAdmin);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!MANGA_IMAGE_MIME_TYPES.has(file.mimetype)) {
      cb(new Error("Only image uploads are allowed"));
      return;
    }
    cb(null, true);
  }
});

mangaAdminRouter.post("/upload-image", upload.single("image"), async (req, res) => {
  const file = req.file;
  const declaredChecksum = typeof req.body?.image_checksum === "string" ? req.body.image_checksum : undefined;

  if (!file || !declaredChecksum) {
    res.status(400).json({ error: "image and image_checksum are required" });
    return;
  }

  const stored = await storeMangaImage(file.buffer, file.mimetype);
  if (stripChecksumPrefix(declaredChecksum) !== stored.checksum) {
    res.status(400).json({ error: "image_checksum does not match uploaded file" });
    return;
  }

  res.json({ image_url: stored.url, already_existed: stored.alreadyExisted });
});

mangaAdminRouter.post("/ingest", async (req, res) => {
  const payload = mangaIngestSchema.parse(req.body);

  const existingVolume = await prisma.mangaVolume.findUnique({ where: { id: payload.volume_id } });

  await prisma.$transaction(async (tx) => {
    await tx.mangaVolume.upsert({
      where: { id: payload.volume_id },
      create: {
        id: payload.volume_id,
        title: payload.title,
        volumeNumber: payload.volume_number ?? null,
        totalPages: payload.total_pages ?? null,
        coverUrl: payload.cover_url ?? null
      },
      update: {
        title: payload.title,
        volumeNumber: payload.volume_number ?? null,
        totalPages: payload.total_pages ?? null,
        coverUrl: payload.cover_url ?? null
      }
    });

    for (const page of payload.pages) {
      const imageChecksum = stripChecksumPrefix(page.image_checksum);
      const existingPage = await tx.mangaPage.findUnique({
        where: { volumeId_pageIndex: { volumeId: payload.volume_id, pageIndex: page.page_index } }
      });

      const pageRow = await tx.mangaPage.upsert({
        where: { volumeId_pageIndex: { volumeId: payload.volume_id, pageIndex: page.page_index } },
        create: {
          volumeId: payload.volume_id,
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
        await tx.mangaDialogue.deleteMany({ where: { pageId: pageRow.id } });
      }

      if (page.dialogues.length) {
        await tx.mangaDialogue.createMany({
          data: page.dialogues.map((dialogue, index) => ({
            pageId: pageRow.id,
            dialogueIndex: index,
            boxX: dialogue.dialogue_box.x,
            boxY: dialogue.dialogue_box.y,
            boxWidth: dialogue.dialogue_box.width,
            boxHeight: dialogue.dialogue_box.height,
            fullText: dialogue.full_text,
            tokens: JSON.stringify(dialogue.tokens),
            furigana: dialogue.furigana,
            morphology: JSON.stringify(dialogue.morphology)
          }))
        });
      }
    }
  });

  res.json({
    volume_id: payload.volume_id,
    created: !existingVolume,
    pages_upserted: payload.pages.length
  });
});

mangaAdminRouter.get("/", async (req, res) => {
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

mangaAdminRouter.get("/:id", async (req, res) => {
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

mangaAdminRouter.patch("/:id", async (req, res) => {
  const payload = mangaVolumePatchSchema.parse(req.body);

  try {
    const volume = await prisma.mangaVolume.update({
      where: { id: req.params.id },
      data: {
        title: payload.title,
        volumeNumber: payload.volume_number,
        coverUrl: payload.cover_url
      },
      include: {
        pages: {
          orderBy: { pageIndex: "asc" },
          include: { dialogues: { orderBy: { dialogueIndex: "asc" } } }
        }
      }
    });
    res.json(toMangaVolume(volume));
  } catch (error) {
    if (isNotFound(error)) {
      res.status(404).json({ error: "Manga volume not found" });
      return;
    }
    throw error;
  }
});

async function findPage(volumeId: string, pageIndex: number) {
  return prisma.mangaPage.findUnique({
    where: { volumeId_pageIndex: { volumeId, pageIndex } },
    include: { dialogues: { orderBy: { dialogueIndex: "asc" } } }
  });
}

mangaAdminRouter.get("/:id/pages/:pageIndex", async (req, res) => {
  const pageIndex = Number(req.params.pageIndex);
  const page = await findPage(req.params.id, pageIndex);

  if (!page) {
    res.status(404).json({ error: "Page not found" });
    return;
  }

  res.json(toMangaPage(page));
});

mangaAdminRouter.patch("/:id/pages/:pageIndex/dialogues/:dialogueIndex", async (req, res) => {
  const pageIndex = Number(req.params.pageIndex);
  const dialogueIndex = Number(req.params.dialogueIndex);
  const payload = mangaDialoguePatchSchema.parse(req.body);

  const page = await prisma.mangaPage.findUnique({
    where: { volumeId_pageIndex: { volumeId: req.params.id, pageIndex } }
  });
  if (!page) {
    res.status(404).json({ error: "Page not found" });
    return;
  }

  try {
    const dialogue = await prisma.mangaDialogue.update({
      where: { pageId_dialogueIndex: { pageId: page.id, dialogueIndex } },
      data: {
        boxX: payload.dialogue_box?.x,
        boxY: payload.dialogue_box?.y,
        boxWidth: payload.dialogue_box?.width,
        boxHeight: payload.dialogue_box?.height,
        fullText: payload.full_text,
        tokens: payload.tokens ? JSON.stringify(payload.tokens) : undefined,
        furigana: payload.furigana,
        morphology: payload.morphology ? JSON.stringify(payload.morphology) : undefined
      }
    });
    res.json(toMangaDialogue(dialogue));
  } catch (error) {
    if (isNotFound(error)) {
      res.status(404).json({ error: "Dialogue not found" });
      return;
    }
    throw error;
  }
});

mangaAdminRouter.put("/:id/pages/:pageIndex/image", upload.single("image"), async (req, res) => {
  const pageIndex = Number(req.params.pageIndex);
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "image is required" });
    return;
  }

  const page = await prisma.mangaPage.findUnique({
    where: { volumeId_pageIndex: { volumeId: String(req.params.id), pageIndex } }
  });
  if (!page) {
    res.status(404).json({ error: "Page not found" });
    return;
  }

  const width = req.body?.width ? Number(req.body.width) : undefined;
  const height = req.body?.height ? Number(req.body.height) : undefined;
  const stored = await storeMangaImage(file.buffer, file.mimetype);

  const updated = await prisma.mangaPage.update({
    where: { id: page.id },
    data: {
      imageUrl: stored.url,
      imageChecksum: stored.checksum,
      width: Number.isFinite(width) ? width : undefined,
      height: Number.isFinite(height) ? height : undefined
    },
    include: { dialogues: { orderBy: { dialogueIndex: "asc" } } }
  });

  res.json(toMangaPage(updated));
});

mangaAdminRouter.delete("/:id/pages/:pageIndex", async (req, res) => {
  const pageIndex = Number(req.params.pageIndex);
  try {
    await prisma.mangaPage.delete({
      where: { volumeId_pageIndex: { volumeId: req.params.id, pageIndex } }
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
