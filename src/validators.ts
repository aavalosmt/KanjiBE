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
    type: z.enum(["text", "image", "header"]),
    content: optionalText,
    translation: optionalText,
    url: z.string().trim().min(1).optional(),
    caption: optionalText,
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
    if (block.tokens?.length) normalized.tokens = block.tokens;
    if (block.startTime != null) normalized.startTime = block.startTime;

    return normalized;
  });
}

export const importSchema = z
  .object({
    stories: z.array(storyCreateSchema).default([]),
    lyrics: z.array(lyricCreateSchema).default([])
  })
  .refine((value) => value.stories.length + value.lyrics.length > 0, {
    message: "Provide at least one story or lyric"
  });

export function normalizeImportPayload(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return body;
  }

  const record = body as Record<string, unknown>;
  if (Array.isArray(record.stories) || Array.isArray(record.lyrics)) {
    return body;
  }

  if (typeof record.title === "string" && typeof record.artist === "string") {
    return { stories: [], lyrics: [record] };
  }

  if (typeof record.title === "string" && typeof record.level === "string") {
    return { stories: [record], lyrics: [] };
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
