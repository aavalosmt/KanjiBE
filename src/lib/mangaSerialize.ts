import type {
  MangaDialogue as MangaDialogueRow,
  MangaPage as MangaPageRow,
  MangaVolume as MangaVolumeRow
} from "@prisma/client";
import type { MangaDialogue, MangaPage, MangaVolume, MangaVolumeSummary } from "../types.js";

function parseJsonArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function toMangaDialogue(row: MangaDialogueRow): MangaDialogue {
  return {
    dialogue_index: row.dialogueIndex,
    dialogue_box: { x: row.boxX, y: row.boxY, width: row.boxWidth, height: row.boxHeight },
    full_text: row.fullText,
    tokens: parseJsonArray(row.tokens),
    furigana: row.furigana,
    morphology: parseJsonArray(row.morphology)
  };
}

export function toMangaPage(row: MangaPageRow & { dialogues: MangaDialogueRow[] }): MangaPage {
  return {
    page_index: row.pageIndex,
    image_url: row.imageUrl,
    image_checksum: row.imageChecksum,
    width: row.width,
    height: row.height,
    dialogues: row.dialogues.map(toMangaDialogue)
  };
}

export function toMangaVolumeSummary(
  row: MangaVolumeRow & { _count: { pages: number } }
): MangaVolumeSummary {
  return {
    id: row.id,
    title: row.title,
    volume_number: row.volumeNumber,
    total_pages: row.totalPages,
    cover_url: row.coverUrl,
    page_count: row._count.pages,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString()
  };
}

export function toMangaVolume(
  row: MangaVolumeRow & { pages: (MangaPageRow & { dialogues: MangaDialogueRow[] })[] }
): MangaVolume {
  return {
    id: row.id,
    title: row.title,
    volume_number: row.volumeNumber,
    total_pages: row.totalPages,
    cover_url: row.coverUrl,
    page_count: row.pages.length,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    pages: row.pages.map(toMangaPage)
  };
}
