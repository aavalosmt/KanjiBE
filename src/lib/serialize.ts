import type { ContentBlock, Lyric, LyricSummary, Story, StorySummary } from "../types.js";
import { analyzeBlock } from "./kuromoji.js";
import { preserveStartTimes } from "./timestamps.js";
import { normalizeBlocks, parseBlocks, type blockSchema } from "../validators.js";
import type { z } from "zod";

export { preserveStartTimes };

export async function persistBlocks(
  blocks: z.infer<typeof blockSchema>[]
): Promise<string> {
  return serializeBlocks(await enrichBlocksWithTokens(normalizeBlocks(blocks)));
}

export async function enrichBlocksWithTokens(blocks: ContentBlock[]): Promise<ContentBlock[]> {
  return Promise.all(
    blocks.map(async (block) => {
      if ((block.type !== "text" && block.type !== "header") || !block.content) {
        return block;
      }
      try {
        const { tokens } = await analyzeBlock(block.content);
        return {
          ...block,
          tokens: tokens.map((token) => ({
            surface: token.surface,
            lemma: token.lemma,
            reading: token.reading,
            pos: token.pos,
            colorType: token.colorType,
            color: token.color
          }))
        };
      } catch (error) {
        console.error("Failed to analyze block", error);
        return block;
      }
    })
  );
}

export function serializeBlocks(blocks: unknown): string {
  return JSON.stringify(blocks ?? []);
}

export function deserializeBlocks(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value !== "string" || value.trim() === "") {
    return [];
  }
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

type StoryRecord = {
  id: string;
  title: string;
  level: string;
  translation: string | null;
  coverUrl: string | null;
  blocks?: unknown;
  createdAt?: Date;
  updatedAt?: Date;
};

type LyricRecord = {
  id: string;
  title: string;
  artist: string;
  level?: string | null;
  translation: string | null;
  coverUrl: string | null;
  youtubeUrl?: string | null;
  blocks?: unknown;
  createdAt?: Date;
  updatedAt?: Date;
};

export function toStorySummary(story: StoryRecord): StorySummary {
  return {
    id: story.id,
    title: story.title,
    level: story.level,
    translation: story.translation,
    coverUrl: story.coverUrl
  };
}

export function toStory(story: Required<Pick<StoryRecord, "blocks" | "createdAt" | "updatedAt">> & StoryRecord): Story {
  return {
    ...toStorySummary(story),
    blocks: parseBlocks(deserializeBlocks(story.blocks)),
    createdAt: story.createdAt.toISOString(),
    updatedAt: story.updatedAt.toISOString()
  };
}

export function toLyricSummary(lyric: LyricRecord): LyricSummary {
  return {
    id: lyric.id,
    title: lyric.title,
    artist: lyric.artist,
    level: lyric.level ?? null,
    translation: lyric.translation,
    coverUrl: lyric.coverUrl,
    youtubeUrl: lyric.youtubeUrl ?? null
  };
}

export function toLyric(lyric: Required<Pick<LyricRecord, "blocks" | "createdAt" | "updatedAt">> & LyricRecord): Lyric {
  return {
    ...toLyricSummary(lyric),
    blocks: parseBlocks(deserializeBlocks(lyric.blocks)),
    createdAt: lyric.createdAt.toISOString(),
    updatedAt: lyric.updatedAt.toISOString()
  };
}
