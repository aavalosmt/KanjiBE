import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../db.js";
import { serializeBlocks, toLyric, toStory } from "../lib/serialize.js";
import { requireAdmin } from "../middleware/adminAuth.js";
import {
  lyricCreateSchema,
  lyricUpdateSchema,
  normalizeBlocks,
  storyCreateSchema,
  storyUpdateSchema
} from "../validators.js";

export const adminRouter = Router();

adminRouter.use(requireAdmin);

adminRouter.get("/session", (_req, res) => {
  res.json({ ok: true });
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
        blocks: serializeBlocks(normalizeBlocks(payload.blocks))
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
        blocks: payload.blocks ? serializeBlocks(normalizeBlocks(payload.blocks)) : undefined
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
        blocks: serializeBlocks(normalizeBlocks(payload.blocks))
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
        blocks: payload.blocks ? serializeBlocks(normalizeBlocks(payload.blocks)) : undefined
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
