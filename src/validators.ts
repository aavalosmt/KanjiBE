import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ContentBlock } from "./types.js";

const optionalText = z.string().trim().min(1).optional();
const nullableText = z.string().trim().min(1).nullable().optional();

const youtubeUrl = z
  .string()
  .trim()
  .nullable()
  .optional()
  .refine(
    (value) =>
      !value || /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(value),
    { message: "Must be a YouTube URL" }
  );

export const blockTokenSchema = z.object({
  surface: z.string(),
  lemma: z.string(),
  reading: z.string().nullable().optional(),
  pos: z.string().optional(),
  posEn: z.string().nullable().optional(),
  colorType: z.string(),
  color: z.string(),
  inflectionEn: z.string().nullable().optional(),
  grammarEn: z.string().nullable().optional()
});

export const blockSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    type: z.enum(["text", "image", "header", "dialogue"]),
    content: optionalText,
    translation: optionalText,
    url: z.string().trim().min(1).optional(),
    caption: optionalText,
    speaker: optionalText,
    notes: optionalText,
    tokens: z.array(blockTokenSchema).optional(),
    startTime: z.preprocess((value) => {
      if (value === "" || value === undefined) return undefined;
      if (value === null) return null;
      return value;
    }, z.coerce.number().nonnegative().nullable().optional())
  })
  .superRefine((block, ctx) => {
    if ((block.type === "text" || block.type === "header") && !block.content) {
      ctx.addIssue({
        code: "custom",
        message: "content is required for text and header blocks",
        path: ["content"]
      });
    }

    if (block.type === "image" && !block.url) {
      ctx.addIssue({
        code: "custom",
        message: "url is required for image blocks",
        path: ["url"]
      });
    }

    if (block.type === "dialogue") {
      if (!block.content) {
        ctx.addIssue({
          code: "custom",
          message: "content is required for dialogue blocks",
          path: ["content"]
        });
      }
      if (!block.speaker) {
        ctx.addIssue({
          code: "custom",
          message: "speaker is required for dialogue blocks",
          path: ["speaker"]
        });
      }
    }
  });

export const storyCreateSchema = z.object({
  id: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1),
  level: z.string().trim().min(1),
  translation: nullableText,
  coverUrl: nullableText,
  blocks: z.array(blockSchema).default([])
});

export const storyUpdateSchema = z
  .object({
    title: optionalText,
    level: optionalText,
    translation: nullableText,
    coverUrl: nullableText,
    blocks: z.array(blockSchema).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required"
  });

export const lyricCreateSchema = z.object({
  id: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1),
  artist: z.string().trim().min(1),
  level: nullableText,
  translation: nullableText,
  coverUrl: nullableText,
  youtubeUrl,
  blocks: z.array(blockSchema).default([])
});

export const lyricUpdateSchema = z
  .object({
    title: optionalText,
    artist: optionalText,
    level: nullableText,
    translation: nullableText,
    coverUrl: nullableText,
    youtubeUrl,
    blocks: z.array(blockSchema).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required"
  });

export const conversationCreateSchema = z.object({
  id: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1),
  topic: z.string().trim().min(1),
  level: nullableText,
  translation: nullableText,
  coverUrl: nullableText,
  blocks: z.array(blockSchema).default([])
});

export const conversationUpdateSchema = z
  .object({
    title: optionalText,
    topic: optionalText,
    level: nullableText,
    translation: nullableText,
    coverUrl: nullableText,
    blocks: z.array(blockSchema).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required"
  });

export const topicSlug = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9]+(_[a-z0-9]+)*$/, "slug must be snake_case (lowercase letters, numbers, underscores)");

export const topicCreateSchema = z.object({
  slug: topicSlug,
  label: z.string().trim().min(1)
});

export function normalizeBlocks(
  blocks: z.infer<typeof blockSchema>[]
): ContentBlock[] {
  return blocks.map((block) => {
    const normalized: ContentBlock = {
      id: block.id ?? randomUUID(),
      type: block.type
    };

    if (block.content) normalized.content = block.content;
    if (block.translation) normalized.translation = block.translation;
    if (block.url) normalized.url = block.url;
    if (block.caption) normalized.caption = block.caption;
    if (block.speaker) normalized.speaker = block.speaker;
    if (block.notes) normalized.notes = block.notes;
    if (block.tokens?.length) normalized.tokens = block.tokens;
    if (block.startTime != null) normalized.startTime = block.startTime;

    return normalized;
  });
}

export const importSchema = z
  .object({
    stories: z.array(storyCreateSchema).default([]),
    lyrics: z.array(lyricCreateSchema).default([]),
    conversations: z.array(conversationCreateSchema).default([])
  })
  .refine(
    (value) => value.stories.length + value.lyrics.length + value.conversations.length > 0,
    { message: "Provide at least one story, lyric, or conversation" }
  );

export function normalizeImportPayload(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return body;
  }

  const record = body as Record<string, unknown>;
  if (
    Array.isArray(record.stories) ||
    Array.isArray(record.lyrics) ||
    Array.isArray(record.conversations)
  ) {
    return body;
  }

  if (typeof record.title === "string" && typeof record.artist === "string") {
    return { stories: [], lyrics: [record], conversations: [] };
  }

  if (typeof record.title === "string" && typeof record.topic === "string") {
    return { stories: [], lyrics: [], conversations: [record] };
  }

  if (typeof record.title === "string" && typeof record.level === "string") {
    return { stories: [record], lyrics: [], conversations: [] };
  }

  return body;
}

export function parseBlocks(value: unknown): ContentBlock[] {
  const parsed = z.array(blockSchema).safeParse(value);
  if (!parsed.success) {
    return [];
  }
  return normalizeBlocks(parsed.data);
}
