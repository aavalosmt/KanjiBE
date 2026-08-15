import { enrichLyricLines } from "./gemini.js";
import { getLrcLibTrack, linesFromTrack, type LrcLibTrack } from "./lrclib.js";
import { persistBlocks } from "./serialize.js";
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
