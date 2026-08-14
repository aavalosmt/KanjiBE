import type { Lyric, LyricSummary, Story, StorySummary } from "../types.js";
import { parseBlocks } from "../validators.js";

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
  translation: string | null;
  coverUrl: string | null;
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
    translation: lyric.translation,
    coverUrl: lyric.coverUrl
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
