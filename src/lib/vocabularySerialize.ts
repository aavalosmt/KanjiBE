import type {
  VocabularyEntry as VocabularyEntryRow,
  VocabularyPage as VocabularyPageRow,
  VocabularySet as VocabularySetRow
} from "@prisma/client";
import type {
  VocabularyEntry,
  VocabularyPage,
  VocabularySet,
  VocabularySetSummary
} from "../types.js";

function parseJsonArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function toVocabularyEntry(row: VocabularyEntryRow): VocabularyEntry {
  return {
    entry_index: row.entryIndex,
    entry_box: { x: row.boxX, y: row.boxY, width: row.boxWidth, height: row.boxHeight },
    full_text: row.fullText,
    tokens: parseJsonArray(row.tokens),
    furigana: row.furigana,
    morphology: parseJsonArray(row.morphology)
  };
}

export function toVocabularyPage(
  row: VocabularyPageRow & { entries: VocabularyEntryRow[] }
): VocabularyPage {
  return {
    page_index: row.pageIndex,
    image_url: row.imageUrl,
    image_checksum: row.imageChecksum,
    width: row.width,
    height: row.height,
    entries: row.entries.map(toVocabularyEntry)
  };
}

export function toVocabularySetSummary(
  row: VocabularySetRow & { _count: { pages: number } }
): VocabularySetSummary {
  return {
    id: row.id,
    title: row.title,
    set_number: row.setNumber,
    total_pages: row.totalPages,
    cover_url: row.coverUrl,
    page_count: row._count.pages,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString()
  };
}

export function toVocabularySet(
  row: VocabularySetRow & { pages: (VocabularyPageRow & { entries: VocabularyEntryRow[] })[] }
): VocabularySet {
  return {
    id: row.id,
    title: row.title,
    set_number: row.setNumber,
    total_pages: row.totalPages,
    cover_url: row.coverUrl,
    page_count: row.pages.length,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    pages: row.pages.map(toVocabularyPage)
  };
}
