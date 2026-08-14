import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ContentBlock } from "./types.js";

const optionalText = z.string().trim().min(1).optional();
const nullableText = z.string().trim().min(1).nullable().optional();

export const blockSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    type: z.enum(["text", "image", "header"]),
    content: optionalText,
    translation: optionalText,
    url: z.string().trim().min(1).optional(),
    caption: optionalText
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
  translation: nullableText,
  coverUrl: nullableText,
  blocks: z.array(blockSchema).default([])
});

export const lyricUpdateSchema = z
  .object({
    title: optionalText,
    artist: optionalText,
    translation: nullableText,
    coverUrl: nullableText,
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

    return normalized;
  });
}

export function parseBlocks(value: unknown): ContentBlock[] {
  const parsed = z.array(blockSchema).safeParse(value);
  if (!parsed.success) {
    return [];
  }
  return normalizeBlocks(parsed.data);
}
