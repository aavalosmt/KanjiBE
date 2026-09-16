import type {
  VocabularyEntry as VocabularyEntryRow,
  VocabularyPage as VocabularyPageRow,
  VocabularySet as VocabularySetRow,
  VocabularyWord as VocabularyWordRow
} from "@prisma/client";
import type {
  ExampleSentence,
  VocabularyContentType,
  VocabularyEntry,
  VocabularyPage,
  VocabularySet,
  VocabularySetSummary,
  VocabularyWordEntry
} from "../types.js";
import { prisma } from "../db.js";
import { parsePagination } from "./pagination.js";
import { resolveLayout } from "./sdui.js";
import {
  fetchTranslationOverlay,
  LEGACY_LANG,
  normalizeLang,
  resolveText,
  type EntityOverlay,
  type TranslationOverlay
} from "./translations.js";

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

export function toVocabularyWord(
  row: VocabularyWordRow,
  lang: string = LEGACY_LANG,
  overlay?: EntityOverlay
): VocabularyWordEntry {
  const resolved = resolveText(row.translation, overlay?.get(""), lang);
  const variant =
    row.variantTerm && row.variantFurigana && row.variantLabel
      ? { term: row.variantTerm, furigana: row.variantFurigana, label: row.variantLabel }
      : undefined;
  return {
    word_index: row.wordIndex,
    term: row.term,
    furigana: row.furigana,
    translation: resolved.text ?? "",
    translationLang: resolved.lang,
    ...(variant ? { variant } : {})
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
  },
  lang: string = LEGACY_LANG,
  wordOverlay?: TranslationOverlay,
  exampleSentences: ExampleSentence[] = []
): VocabularySet {
  const contentType = row.contentType as VocabularyContentType;
  const pages = row.pages.map(toVocabularyPage);
  const words = row.words.map((word) => toVocabularyWord(word, lang, wordOverlay?.get(word.id)));

  return {
    id: row.id,
    topic: row.topic,
    subtopic: row.subtopic,
    content_type: contentType,
    title: row.title,
    cover_url: row.coverUrl,
    item_count: contentType === "list" ? words.length : pages.length,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    pages,
    words,
    example_sentences: exampleSentences,
    layout: resolveLayout(row, { contentType, words, pages, exampleSentences })
  };
}

// Shared by the public and admin routes: a page of a list-type set's words,
// windowed with skip/take rather than loading the whole array. Returns null
// when the (topic, subtopic) pair has no set; an "image"-type set comes back
// with an empty page (0 total) rather than an error, matching how the full
// detail endpoint already treats the not-applicable array as always-empty.
export async function paginatedVocabularyWords(
  topic: string,
  subtopic: string,
  query: { page?: unknown; limit?: unknown; lang?: unknown }
): Promise<{
  data: VocabularyWordEntry[];
  pagination: { page: number; limit: number; total: number };
} | null> {
  const set = await prisma.vocabularySet.findUnique({ where: { topic_subtopic: { topic, subtopic } } });
  if (!set) return null;

  const { page, limit, skip } = parsePagination(query);
  if (set.contentType !== "list") {
    return { data: [], pagination: { page, limit, total: 0 } };
  }

  const lang = normalizeLang(query.lang);
  const [rows, total] = await Promise.all([
    prisma.vocabularyWord.findMany({
      where: { setId: set.id },
      orderBy: { wordIndex: "asc" },
      skip,
      take: limit
    }),
    prisma.vocabularyWord.count({ where: { setId: set.id } })
  ]);

  const overlay = await fetchTranslationOverlay(
    "vocabularyWord",
    rows.map((word) => word.id),
    lang
  );
  return {
    data: rows.map((word) => toVocabularyWord(word, lang, overlay.get(word.id))),
    pagination: { page, limit, total }
  };
}
