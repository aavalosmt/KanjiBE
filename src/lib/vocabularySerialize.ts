import type {
  VocabularyEntry as VocabularyEntryRow,
  VocabularyPage as VocabularyPageRow,
  VocabularySet as VocabularySetRow,
  VocabularyWord as VocabularyWordRow
} from "@prisma/client";
import type {
  VocabularyContentType,
  VocabularyEntry,
  VocabularyPage,
  VocabularySet,
  VocabularySetSummary,
  VocabularyWordEntry
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

export function toVocabularyWord(row: VocabularyWordRow): VocabularyWordEntry {
  return {
    word_index: row.wordIndex,
    term: row.term,
    furigana: row.furigana,
    translation: row.translation
  };
}

export function toVocabularySetSummary(
  row: VocabularySetRow & { _count: { pages: number; words: number } }
): VocabularySetSummary {
  return {
    id: row.id,
    topic: row.topic,
    subtopic: row.subtopic,
    content_type: row.contentType as VocabularyContentType,
    title: row.title,
    cover_url: row.coverUrl,
    item_count: row.contentType === "list" ? row._count.words : row._count.pages,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString()
  };
}

export function toVocabularySet(
  row: VocabularySetRow & {
    pages: (VocabularyPageRow & { entries: VocabularyEntryRow[] })[];
    words: VocabularyWordRow[];
  }
): VocabularySet {
  return {
    id: row.id,
    topic: row.topic,
    subtopic: row.subtopic,
    content_type: row.contentType as VocabularyContentType,
    title: row.title,
    cover_url: row.coverUrl,
    item_count: row.contentType === "list" ? row.words.length : row.pages.length,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    pages: row.pages.map(toVocabularyPage),
    words: row.words.map(toVocabularyWord)
  };
}
