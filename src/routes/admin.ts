import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../db.js";
import {
  AI_PROVIDERS,
  isProviderConfigured,
  listModels,
  parseJapanese,
  providerEnvVar,
  resolveProvider
} from "../lib/ai.js";
import { importSyncedLyric, previewSyncedLyric, resyncLyricTimestamps } from "../lib/importSynced.js";
import { searchLrcLib } from "../lib/lrclib.js";
import {
  deserializeBlocks,
  persistBlocks,
  preserveStartTimes,
  toConversation,
  toLyric,
  toStory
} from "../lib/serialize.js";
import { unknownTopicMessage } from "../lib/taxonomy.js";
import {
  deleteEntityTranslations,
  LEGACY_LANG,
  pruneOrphanedBlockTranslations,
  upsertTranslationOverlay
} from "../lib/translations.js";
import { ADMIN_AUTH, infoHandler } from "../lib/endpointInfo.js";
import { requireAdmin } from "../middleware/adminAuth.js";
import {
  conversationCreateSchema,
  conversationUpdateSchema,
  importSchema,
  localeParam,
  lyricCreateSchema,
  lyricUpdateSchema,
  normalizeImportPayload,
  parseBlocks,
  storyCreateSchema,
  storyUpdateSchema,
  subtopicCreateSchema,
  topicCreateSchema,
  translationOverlaySchema
} from "../validators.js";

export const adminRouter = Router();

// Registered before requireAdmin below so /info stays public even though the
// endpoints it documents require admin auth — it only describes usage.
adminRouter.get(
  "/session/info",
  infoHandler({
    method: "GET",
    path: "/api/admin/session",
    description: "Verifica la admin key y reporta qué providers de IA están configurados.",
    auth: ADMIN_AUTH,
    example_request: "GET /api/admin/session",
    response_example: { ok: true, gemini: true, xai: false, defaultProvider: "gemini" }
  })
);

adminRouter.get(
  "/gemini/models/info",
  infoHandler({
    method: "GET",
    path: "/api/admin/gemini/models",
    description: "Lista modelos Gemini disponibles. 503 si GEMINI_API_KEY no está configurada.",
    auth: ADMIN_AUTH,
    example_request: "GET /api/admin/gemini/models",
    response_example: { models: [{ name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash" }] }
  })
);

adminRouter.get(
  "/ai/models/info",
  infoHandler({
    method: "GET",
    path: "/api/admin/ai/models",
    description: "Lista modelos disponibles del provider de IA indicado (gemini o xai). 503 si su API key no está configurada.",
    auth: ADMIN_AUTH,
    query: { provider: "opcional — gemini | xai, default resuelto por config" },
    example_request: "GET /api/admin/ai/models?provider=gemini",
    response_example: { provider: "gemini", models: [{ name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash" }] }
  })
);

adminRouter.get(
  "/lrclib/search/info",
  infoHandler({
    method: "GET",
    path: "/api/admin/lrclib/search",
    description: "Busca canciones en lrclib.net por texto libre, hasta 20 resultados.",
    auth: ADMIN_AUTH,
    query: { q: "requerido — texto de búsqueda (título/artista)" },
    example_request: "GET /api/admin/lrclib/search?q=Ayumi%20Miyazaki%20Brave%20Heart",
    response_example: {
      data: [
        {
          id: 12345,
          title: "...",
          artist: "...",
          album: "...",
          duration: 240,
          instrumental: false,
          synced: true,
          hasLyrics: true
        }
      ]
    }
  })
);

adminRouter.get(
  "/lrclib/preview/info",
  infoHandler({
    method: "GET",
    path: "/api/admin/lrclib/preview",
    description: "Previsualiza una letra sincronizada de lrclib.net por id, sin importarla todavía.",
    auth: ADMIN_AUTH,
    query: { id: "requerido — id de track en lrclib" },
    example_request: "GET /api/admin/lrclib/preview?id=12345",
    response_example: { title: "...", artist: "...", blocks: [] }
  })
);

adminRouter.use(requireAdmin);

adminRouter.get("/session", (_req, res) => {
  res.json({
    ok: true,
    gemini: Boolean(config.geminiApiKey),
    xai: Boolean(config.xaiApiKey),
    defaultProvider: resolveProvider()
  });
});

const providerSchema = z.enum(AI_PROVIDERS).optional();

const tokenizeSchema = z.object({
  text: z.string().trim().min(1),
  kind: z.enum(["story", "lyric", "conversation", "auto"]).default("auto"),
  model: z.string().trim().min(1).optional(),
  provider: providerSchema
});

adminRouter.get("/gemini/models", async (_req, res) => {
  if (!config.geminiApiKey) {
    res.status(503).json({ error: "GEMINI_API_KEY is not configured" });
    return;
  }

  const catalog = await listModels("gemini");
  res.json(catalog);
});

adminRouter.get("/ai/models", async (req, res) => {
  const provider = resolveProvider(
    typeof req.query.provider === "string" ? req.query.provider : undefined
  );
  if (!isProviderConfigured(provider)) {
    res.status(503).json({ error: `${providerEnvVar(provider)} is not configured` });
    return;
  }

  const catalog = await listModels(provider);
  res.json({ provider, ...catalog });
});

adminRouter.post("/tokenize", async (req, res) => {
  const payload = tokenizeSchema.parse(req.body);
  const provider = resolveProvider(payload.provider);
  if (!isProviderConfigured(provider)) {
    res.status(503).json({ error: `${providerEnvVar(provider)} is not configured` });
    return;
  }

  try {
    const data = await parseJapanese(provider, payload.text, payload.kind, payload.model);
    res.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI request failed";
    res.status(502).json({ error: message });
  }
});

adminRouter.get("/lrclib/search", async (req, res) => {
  const query = String(req.query.q ?? "").trim();
  if (!query) {
    res.status(400).json({ error: "q is required" });
    return;
  }
  const tracks = await searchLrcLib(query);
  res.json({
    data: tracks.slice(0, 20).map((track) => ({
      id: track.id,
      title: track.trackName,
      artist: track.artistName,
      album: track.albumName,
      duration: track.duration,
      instrumental: track.instrumental,
      synced: Boolean(track.syncedLyrics),
      hasLyrics: Boolean(track.syncedLyrics || track.plainLyrics)
    }))
  });
});

const lrclibImportSchema = z.object({
  id: z.number().int().positive().optional(),
  artistName: z.string().trim().min(1).optional(),
  trackName: z.string().trim().min(1).optional(),
  youtubeUrl: z.string().trim().nullable().optional(),
  model: z.string().trim().min(1).optional(),
  provider: providerSchema
});

adminRouter.get("/lrclib/preview", async (req, res) => {
  const id = Number(req.query.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "id is required" });
    return;
  }
  try {
    res.json(await previewSyncedLyric({ id }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Preview failed";
    res.status(502).json({ error: message });
  }
});

adminRouter.post("/lrclib/import", async (req, res) => {
  const payload = lrclibImportSchema.parse(req.body);
  if (!payload.id && !(payload.artistName && payload.trackName)) {
    res.status(400).json({ error: "id or artistName+trackName is required" });
    return;
  }

  try {
    const built = await importSyncedLyric(payload);
    const lyric = await prisma.lyric.create({
      data: {
        title: built.title,
        artist: built.artist,
        youtubeUrl: built.youtubeUrl,
        blocks: built.blocks
      }
    });
    res.status(201).json({
      ...toLyric(lyric),
      source: built.source,
      usedAi: built.usedAi,
      aiError: built.aiError
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    res.status(502).json({ error: message });
  }
});

adminRouter.post("/import", async (req, res) => {
  const payload = importSchema.parse(normalizeImportPayload(req.body));
  const created = {
    stories: [] as ReturnType<typeof toStory>[],
    lyrics: [] as ReturnType<typeof toLyric>[],
    conversations: [] as ReturnType<typeof toConversation>[]
  };
  const updated = {
    stories: [] as ReturnType<typeof toStory>[],
    lyrics: [] as ReturnType<typeof toLyric>[],
    conversations: [] as ReturnType<typeof toConversation>[]
  };
  const errors: Array<{
    type: "story" | "lyric" | "conversation";
    index: number;
    id?: string;
    error: string;
  }> = [];

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
        level: item.level ?? null,
        translation: item.translation ?? null,
        coverUrl: item.coverUrl ?? null,
        youtubeUrl: item.youtubeUrl ?? null,
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

  for (const [index, item] of payload.conversations.entries()) {
    try {
      const topicError = await unknownTopicMessage(item.topic);
      if (topicError) {
        throw new Error(topicError);
      }
      const data = {
        title: item.title,
        topic: item.topic,
        language: item.language,
        level: item.level ?? null,
        translation: item.translation ?? null,
        coverUrl: item.coverUrl ?? null,
        blocks: await persistBlocks(item.blocks, item.language)
      };
      if (item.id) {
        const existing = await prisma.conversation.findUnique({ where: { id: item.id } });
        if (existing) {
          const conversation = await prisma.conversation.update({ where: { id: item.id }, data });
          updated.conversations.push(toConversation(conversation));
          continue;
        }
      }
      const conversation = await prisma.conversation.create({ data: { id: item.id, ...data } });
      created.conversations.push(toConversation(conversation));
    } catch (error) {
      errors.push({
        type: "conversation",
        index,
        id: item.id,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  const nothingSaved =
    !created.stories.length &&
    !created.lyrics.length &&
    !created.conversations.length &&
    !updated.stories.length &&
    !updated.lyrics.length &&
    !updated.conversations.length;

  res.status(errors.length && nothingSaved ? 400 : 200).json({
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
  const serializedBlocks = payload.blocks ? await persistBlocks(payload.blocks) : undefined;

  try {
    const story = await prisma.story.update({
      where: { id: req.params.id },
      data: {
        title: payload.title,
        level: payload.level,
        translation: payload.translation,
        coverUrl: payload.coverUrl,
        blocks: serializedBlocks
      }
    });
    if (serializedBlocks) {
      const blockIds = parseBlocks(deserializeBlocks(serializedBlocks)).map((block) => block.id);
      await pruneOrphanedBlockTranslations("story", story.id, blockIds);
    }
    res.json(toStory(story));
  } catch (error) {
    if (isNotFound(error)) {
      res.status(404).json({ error: "Story not found" });
      return;
    }
    throw error;
  }
});

adminRouter.put("/stories/:id/translations/:lang", async (req, res) => {
  const lang = localeParam.parse(req.params.lang);
  if (lang === LEGACY_LANG) {
    res.status(400).json({
      error: `Use PUT /stories/:id to edit the original (${LEGACY_LANG}) translation`
    });
    return;
  }

  const payload = translationOverlaySchema.parse(req.body);
  const story = await prisma.story.findUnique({ where: { id: req.params.id } });
  if (!story) {
    res.status(404).json({ error: "Story not found" });
    return;
  }

  const blockError = unknownBlockIdsMessage(story.blocks, payload.blocks);
  if (blockError) {
    res.status(400).json({ error: blockError });
    return;
  }

  await upsertTranslationOverlay({
    entityType: "story",
    entityId: story.id,
    lang,
    translation: payload.translation,
    blocks: payload.blocks
  });
  res.status(204).send();
});

adminRouter.delete("/stories/:id", async (req, res) => {
  try {
    await prisma.$transaction([
      deleteEntityTranslations("story", req.params.id),
      prisma.story.delete({ where: { id: req.params.id } })
    ]);
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
        level: payload.level ?? null,
        translation: payload.translation ?? null,
        coverUrl: payload.coverUrl ?? null,
        youtubeUrl: payload.youtubeUrl ?? null,
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
    const existing = await prisma.lyric.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Lyric not found" });
      return;
    }

    const serializedBlocks = payload.blocks
      ? await persistBlocks(
          preserveStartTimes(payload.blocks, parseBlocks(deserializeBlocks(existing.blocks)))
        )
      : undefined;

    const lyric = await prisma.lyric.update({
      where: { id: req.params.id },
      data: {
        title: payload.title,
        artist: payload.artist,
        level: payload.level,
        translation: payload.translation,
        coverUrl: payload.coverUrl,
        youtubeUrl: payload.youtubeUrl,
        blocks: serializedBlocks
      }
    });
    if (serializedBlocks) {
      const blockIds = parseBlocks(deserializeBlocks(serializedBlocks)).map((block) => block.id);
      await pruneOrphanedBlockTranslations("lyric", lyric.id, blockIds);
    }
    res.json(toLyric(lyric));
  } catch (error) {
    if (isNotFound(error)) {
      res.status(404).json({ error: "Lyric not found" });
      return;
    }
    throw error;
  }
});

adminRouter.put("/lyrics/:id/translations/:lang", async (req, res) => {
  const lang = localeParam.parse(req.params.lang);
  if (lang === LEGACY_LANG) {
    res.status(400).json({
      error: `Use PUT /lyrics/:id to edit the original (${LEGACY_LANG}) translation`
    });
    return;
  }

  const payload = translationOverlaySchema.parse(req.body);
  const lyric = await prisma.lyric.findUnique({ where: { id: req.params.id } });
  if (!lyric) {
    res.status(404).json({ error: "Lyric not found" });
    return;
  }

  const blockError = unknownBlockIdsMessage(lyric.blocks, payload.blocks);
  if (blockError) {
    res.status(400).json({ error: blockError });
    return;
  }

  await upsertTranslationOverlay({
    entityType: "lyric",
    entityId: lyric.id,
    lang,
    translation: payload.translation,
    blocks: payload.blocks
  });
  res.status(204).send();
});

const resyncSchema = z.object({
  id: z.number().int().positive().optional()
});

adminRouter.post("/lyrics/:id/resync-timestamps", async (req, res) => {
  const payload = resyncSchema.parse(req.body ?? {});

  try {
    const existing = await prisma.lyric.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Lyric not found" });
      return;
    }

    const restored = await resyncLyricTimestamps({
      title: existing.title,
      artist: existing.artist,
      blocks: existing.blocks,
      lrclibId: payload.id
    });
    const lyric = await prisma.lyric.update({
      where: { id: req.params.id },
      data: { blocks: restored.blocks }
    });
    res.json({ ...toLyric(lyric), applied: restored.applied, source: restored.source });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Resync failed";
    res.status(502).json({ error: message });
  }
});

adminRouter.delete("/lyrics/:id", async (req, res) => {
  try {
    await prisma.$transaction([
      deleteEntityTranslations("lyric", req.params.id),
      prisma.lyric.delete({ where: { id: req.params.id } })
    ]);
    res.status(204).send();
  } catch (error) {
    if (isNotFound(error)) {
      res.status(404).json({ error: "Lyric not found" });
      return;
    }
    throw error;
  }
});

adminRouter.post("/conversations", async (req, res) => {
  const payload = conversationCreateSchema.parse(req.body);

  const topicError = await unknownTopicMessage(payload.topic);
  if (topicError) {
    res.status(400).json({ error: topicError });
    return;
  }

  try {
    const conversation = await prisma.conversation.create({
      data: {
        id: payload.id,
        title: payload.title,
        topic: payload.topic,
        language: payload.language,
        level: payload.level ?? null,
        translation: payload.translation ?? null,
        coverUrl: payload.coverUrl ?? null,
        blocks: await persistBlocks(payload.blocks, payload.language)
      }
    });
    res.status(201).json(toConversation(conversation));
  } catch (error) {
    if (isUniqueConstraint(error)) {
      res.status(409).json({ error: "Conversation id already exists" });
      return;
    }
    throw error;
  }
});

adminRouter.put("/conversations/:id", async (req, res) => {
  const payload = conversationUpdateSchema.parse(req.body);

  if (payload.topic) {
    const topicError = await unknownTopicMessage(payload.topic);
    if (topicError) {
      res.status(400).json({ error: topicError });
      return;
    }
  }

  let serializedBlocks: string | undefined;
  if (payload.blocks) {
    // Blocks are tokenized per language, so resolve it even when only blocks change.
    let language = payload.language;
    if (!language) {
      const existing = await prisma.conversation.findUnique({
        where: { id: req.params.id },
        select: { language: true }
      });
      if (!existing) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
      language = existing.language;
    }
    serializedBlocks = await persistBlocks(payload.blocks, language);
  }

  try {
    const conversation = await prisma.conversation.update({
      where: { id: req.params.id },
      data: {
        title: payload.title,
        topic: payload.topic,
        language: payload.language,
        level: payload.level,
        translation: payload.translation,
        coverUrl: payload.coverUrl,
        blocks: serializedBlocks
      }
    });
    if (serializedBlocks) {
      const blockIds = parseBlocks(deserializeBlocks(serializedBlocks)).map((block) => block.id);
      await pruneOrphanedBlockTranslations("conversation", conversation.id, blockIds);
    }
    res.json(toConversation(conversation));
  } catch (error) {
    if (isNotFound(error)) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    throw error;
  }
});

adminRouter.put("/conversations/:id/translations/:lang", async (req, res) => {
  const lang = localeParam.parse(req.params.lang);
  if (lang === LEGACY_LANG) {
    res.status(400).json({
      error: `Use PUT /conversations/:id to edit the original (${LEGACY_LANG}) translation`
    });
    return;
  }

  const payload = translationOverlaySchema.parse(req.body);
  const conversation = await prisma.conversation.findUnique({ where: { id: req.params.id } });
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const blockError = unknownBlockIdsMessage(conversation.blocks, payload.blocks);
  if (blockError) {
    res.status(400).json({ error: blockError });
    return;
  }

  await upsertTranslationOverlay({
    entityType: "conversation",
    entityId: conversation.id,
    lang,
    translation: payload.translation,
    blocks: payload.blocks
  });
  res.status(204).send();
});

adminRouter.delete("/conversations/:id", async (req, res) => {
  try {
    await prisma.$transaction([
      deleteEntityTranslations("conversation", req.params.id),
      prisma.conversation.delete({ where: { id: req.params.id } })
    ]);
    res.status(204).send();
  } catch (error) {
    if (isNotFound(error)) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    throw error;
  }
});

adminRouter.post("/topics", async (req, res) => {
  const payload = topicCreateSchema.parse(req.body);

  try {
    const topic = await prisma.topic.create({ data: payload });
    res.status(201).json(topic);
  } catch (error) {
    if (isUniqueConstraint(error)) {
      res.status(409).json({ error: "Topic slug already exists" });
      return;
    }
    throw error;
  }
});

adminRouter.post("/subtopics", async (req, res) => {
  const payload = subtopicCreateSchema.parse(req.body);

  const topicError = await unknownTopicMessage(payload.topicSlug);
  if (topicError) {
    res.status(400).json({ error: topicError });
    return;
  }

  try {
    const subtopic = await prisma.subtopic.create({ data: payload });
    res.status(201).json(subtopic);
  } catch (error) {
    if (isUniqueConstraint(error)) {
      res.status(409).json({ error: "Subtopic slug already exists under this topic" });
      return;
    }
    throw error;
  }
});

function unknownBlockIdsMessage(
  existingBlocksJson: unknown,
  blocks: Array<{ id: string }> | undefined
): string | null {
  if (!blocks || blocks.length === 0) {
    return null;
  }
  const knownIds = new Set(parseBlocks(deserializeBlocks(existingBlocksJson)).map((block) => block.id));
  const unknownIds = blocks.map((block) => block.id).filter((id) => !knownIds.has(id));
  return unknownIds.length ? `Unknown block id(s): ${unknownIds.join(", ")}` : null;
}

function isNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
