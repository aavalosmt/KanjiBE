import { enrichLyricLines } from "./gemini.js";
import {
  getLrcLibTrack,
  linesFromTrack,
  searchLrcLib,
  type LrcLibTrack
} from "./lrclib.js";
import { deserializeBlocks, persistBlocks, serializeBlocks } from "./serialize.js";
import { applyLineTimes } from "./timestamps.js";
import { parseBlocks } from "../validators.js";
import type { z } from "zod";
import type { blockSchema } from "../validators.js";

export function detectLyricLanguage(text: string): {
  code: string;
  label: string;
  japanese: boolean;
} {
  if (/[\u3040-\u30ff\u4e00-\u9faf]/.test(text)) {
    return { code: "ja", label: "Japanese", japanese: true };
  }
  if (/[\uac00-\ud7af]/.test(text)) {
    return { code: "ko", label: "Korean", japanese: false };
  }
  if (/[\u4e00-\u9fff]/.test(text) && !/[\u3040-\u30ff]/.test(text)) {
    return { code: "zh", label: "Chinese", japanese: false };
  }
  return { code: "und", label: "Latin / other", japanese: false };
}

export async function previewSyncedLyric(input: {
  id?: number;
  artistName?: string;
  trackName?: string;
}) {
  const track = await getLrcLibTrack(input);
  if (!track) {
    throw new Error("Track not found on LRCLib");
  }
  const lines = linesFromTrack(track);
  const sample = lines.map((line) => line.text).join("\n");
  return {
    id: track.id,
    title: track.trackName,
    artist: track.artistName,
    album: track.albumName,
    duration: track.duration,
    instrumental: track.instrumental,
    synced: Boolean(track.syncedLyrics),
    language: detectLyricLanguage(sample),
    lineCount: lines.length,
    lines
  };
}

type BlockInput = z.infer<typeof blockSchema>;

export async function buildSyncedLyricBlocks(
  track: LrcLibTrack,
  model?: string
): Promise<{
  blocks: BlockInput[];
  usedGemini: boolean;
  geminiError?: string;
}> {
  const lines = linesFromTrack(track);
  if (lines.length === 0) {
    throw new Error("This track has no lyrics");
  }

  const enriched = await enrichLyricLines(lines.map((line) => line.text), model);

  return {
    usedGemini: enriched.usedGemini,
    geminiError: enriched.error,
    blocks: lines.map((line, index) => ({
      type: "text" as const,
      content: enriched.lines[index]?.content || line.text,
      translation: enriched.lines[index]?.translation,
      startTime: line.startTime
    }))
  };
}

export async function importSyncedLyric(input: {
  id?: number;
  artistName?: string;
  trackName?: string;
  youtubeUrl?: string | null;
  model?: string;
}) {
  const track = await getLrcLibTrack(input);
  if (!track) {
    throw new Error("Track not found on LRCLib");
  }
  if (track.instrumental) {
    throw new Error("Track is instrumental");
  }

  const built = await buildSyncedLyricBlocks(track, input.model);
  const blocks = await persistBlocks(built.blocks);
  return {
    title: track.trackName,
    artist: track.artistName,
    youtubeUrl: input.youtubeUrl ?? null,
    blocks,
    usedGemini: built.usedGemini,
    geminiError: built.geminiError,
    source: {
      lrclibId: track.id,
      albumName: track.albumName,
      duration: track.duration,
      synced: Boolean(track.syncedLyrics)
    }
  };
}

export async function findSyncedTrack(title: string, artist: string): Promise<LrcLibTrack | null> {
  const hits = await searchLrcLib(`${title} ${artist}`.trim());
  const synced = hits.filter((track) => Boolean(track.syncedLyrics));
  const exact = synced.find((track) => track.trackName === title && track.artistName === artist);
  if (exact) return exact;
  const titled = synced.find(
    (track) =>
      track.trackName === title ||
      track.trackName.includes(title) ||
      title.includes(track.trackName)
  );
  return titled ?? synced[0] ?? null;
}

export async function resyncLyricTimestamps(input: {
  title: string;
  artist: string;
  blocks: unknown;
  lrclibId?: number;
}) {
  const track = input.lrclibId
    ? await getLrcLibTrack({ id: input.lrclibId })
    : await findSyncedTrack(input.title, input.artist);
  if (!track) {
    throw new Error("No synced LRCLib track found for this title/artist");
  }
  const lines = linesFromTrack(track);
  if (!lines.some((line) => line.startTime > 0)) {
    throw new Error("This LRCLib track has no timestamps");
  }
  const { blocks, applied } = applyLineTimes(parseBlocks(deserializeBlocks(input.blocks)), lines);
  if (applied === 0) {
    throw new Error("Could not match any lyric lines to LRCLib timestamps");
  }
  return {
    blocks: serializeBlocks(blocks),
    applied,
    source: {
      lrclibId: track.id,
      title: track.trackName,
      artist: track.artistName,
      synced: Boolean(track.syncedLyrics)
    }
  };
}
