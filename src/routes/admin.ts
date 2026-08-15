import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { listGeminiModels, parseJapaneseToKanjiBE } from "../lib/gemini.js";
import { persistBlocks, toLyric, toStory } from "../lib/serialize.js";
import { requireAdmin } from "../middleware/adminAuth.js";
import {
  importSchema,
  lyricCreateSchema,
  lyricUpdateSchema,
  normalizeImportPayload,
  storyCreateSchema,
  storyUpdateSchema
} from "../validators.js";

export const adminRouter = Router();

adminRouter.use(requireAdmin);

adminRouter.get("/session", (_req, res) => {
  res.json({ ok: true, gemini: Boolean(config.geminiApiKey) });
});

const tokenizeSchema = z.object({
  text: z.string().trim().min(1),
  kind: z.enum(["story", "lyric", "auto"]).default("auto"),
  model: z.string().trim().min(1).optional()
});

adminRouter.get("/gemini/models", async (_req, res) => {
  if (!config.geminiApiKey) {
    res.status(503).json({ error: "GEMINI_API_KEY is not configured" });
    return;
  }

  const catalog = await listGeminiModels();
  res.json(catalog);
});

adminRouter.post("/tokenize", async (req, res) => {
  const payload = tokenizeSchema.parse(req.body);
  if (!config.geminiApiKey) {
    res.status(503).json({ error: "GEMINI_API_KEY is not configured" });
    return;
  }

  try {
    const data = await parseJapaneseToKanjiBE(
      payload.text,
      payload.kind,
      payload.model
    );
    res.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gemini request failed";
    res.status(502).json({ error: message });
  }
});

adminRouter.post("/import", async (req, res) => {
  const payload = importSchema.parse(normalizeImportPayload(req.body));
  const created = { stories: [] as ReturnType<typeof toStory>[], lyrics: [] as ReturnType<typeof toLyric>[] };
  const updated = { stories: [] as ReturnType<typeof toStory>[], lyrics: [] as ReturnType<typeof toLyric>[] };
  const errors: Array<{ type: "story" | "lyric"; index: number; id?: string; error: string }> = [];

  for (const [index, item] of payload.stories.entries()) {
    try {
      const data = {
        title: item.title,
        level: item.level,
        translation: item.translation ?? null,
        coverUrl: item.coverUrl ?? null,
        blocks: await persistBlocks(item.blocks)
      };
      if (item.id) {
        const existing = await prisma.story.findUnique({ where: { id: item.id } });
        if (existing) {
          const story = await prisma.story.update({ where: { id: item.id }, data });
          updated.stories.push(toStory(story));
          continue;
        }
      }
      const story = await prisma.story.create({ data: { id: item.id, ...data } });
      created.stories.push(toStory(story));
    } catch (error) {
      errors.push({
        type: "story",
        index,
        id: item.id,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  for (const [index, item] of payload.lyrics.entries()) {
    try {
      const data = {
        title: item.title,
        artist: item.artist,
        translation: item.translation ?? null,
        coverUrl: item.coverUrl ?? null,
        blocks: await persistBlocks(item.blocks)
      };
      if (item.id) {
        const existing = await prisma.lyric.findUnique({ where: { id: item.id } });
        if (existing) {
          const lyric = await prisma.lyric.update({ where: { id: item.id }, data });
          updated.lyrics.push(toLyric(lyric));
          continue;
        }
      }
      const lyric = await prisma.lyric.create({ data: { id: item.id, ...data } });
      created.lyrics.push(toLyric(lyric));
    } catch (error) {
      errors.push({
        type: "lyric",
        index,
        id: item.id,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  res.status(errors.length && !created.stories.length && !created.lyrics.length && !updated.stories.length && !updated.lyrics.length ? 400 : 200).json({
    created,
    updated,
    errors
  });
});

adminRouter.post("/stories", async (req, res) => {
  const payload = storyCreateSchema.parse(req.body);

  try {
    const story = await prisma.story.create({
      data: {
        id: payload.id,
        title: payload.title,
        level: payload.level,
        translation: payload.translation ?? null,
        coverUrl: payload.coverUrl ?? null,
        blocks: await persistBlocks(payload.blocks)
      }
    });
    res.status(201).json(toStory(story));
  } catch (error) {
    if (isUniqueConstraint(error)) {
      res.status(409).json({ error: "Story id already exists" });
      return;
    }
    throw error;
  }
});

adminRouter.put("/stories/:id", async (req, res) => {
  const payload = storyUpdateSchema.parse(req.body);

  try {
    const story = await prisma.story.update({
      where: { id: req.params.id },
      data: {
        title: payload.title,
        level: payload.level,
        translation: payload.translation,
        coverUrl: payload.coverUrl,
        blocks: payload.blocks ? await persistBlocks(payload.blocks) : undefined
      }
    });
    res.json(toStory(story));
  } catch (error) {
    if (isNotFound(error)) {
      res.status(404).json({ error: "Story not found" });
      return;
    }
    throw error;
  }
});

adminRouter.delete("/stories/:id", async (req, res) => {
  try {
    await prisma.story.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    if (isNotFound(error)) {
      res.status(404).json({ error: "Story not found" });
      return;
    }
    throw error;
  }
});

adminRouter.post("/lyrics", async (req, res) => {
  const payload = lyricCreateSchema.parse(req.body);

  try {
    const lyric = await prisma.lyric.create({
      data: {
        id: payload.id,
        title: payload.title,
        artist: payload.artist,
        translation: payload.translation ?? null,
        coverUrl: payload.coverUrl ?? null,
        blocks: await persistBlocks(payload.blocks)
      }
    });
    res.status(201).json(toLyric(lyric));
  } catch (error) {
    if (isUniqueConstraint(error)) {
      res.status(409).json({ error: "Lyric id already exists" });
      return;
    }
    throw error;
  }
});

adminRouter.put("/lyrics/:id", async (req, res) => {
  const payload = lyricUpdateSchema.parse(req.body);

  try {
    const lyric = await prisma.lyric.update({
      where: { id: req.params.id },
      data: {
        title: payload.title,
        artist: payload.artist,
        translation: payload.translation,
        coverUrl: payload.coverUrl,
        blocks: payload.blocks ? await persistBlocks(payload.blocks) : undefined
      }
    });
    res.json(toLyric(lyric));
  } catch (error) {
    if (isNotFound(error)) {
      res.status(404).json({ error: "Lyric not found" });
      return;
    }
    throw error;
  }
});

adminRouter.delete("/lyrics/:id", async (req, res) => {
  try {
    await prisma.lyric.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    if (isNotFound(error)) {
      res.status(404).json({ error: "Lyric not found" });
      return;
    }
    throw error;
  }
});

function isNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
