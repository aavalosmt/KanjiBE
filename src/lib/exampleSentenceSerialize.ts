import type { ExampleSentence as ExampleSentenceRow } from "@prisma/client";
import type { ExampleSentence } from "../types.js";
import { prisma } from "../db.js";
import {
  EXAMPLE_SENTENCE_BASE_LANG,
  fetchTranslationOverlay,
  resolveText,
  type EntityOverlay
} from "./translations.js";

export function toExampleSentence(
  row: ExampleSentenceRow,
  lang: string = EXAMPLE_SENTENCE_BASE_LANG,
  overlay?: EntityOverlay
): ExampleSentence {
  const resolved = resolveText(
    row.translation,
    overlay?.get(""),
    lang,
    EXAMPLE_SENTENCE_BASE_LANG
  );
  return {
    sentence_index: row.sentenceIndex,
    text: row.text,
    furigana: row.furigana,
    translation: resolved.text ?? "",
    translationLang: resolved.lang,
    notes: row.notes ?? undefined
  };
}

// Loads every example sentence for a (topic, subtopic) pair with the requested
// locale layered on top. Shared by the standalone /api/examples route and the
// vocabulary set responses that embed the list.
export async function listExampleSentences(
  topic: string,
  subtopic: string,
  lang: string
): Promise<ExampleSentence[]> {
  const rows = await prisma.exampleSentence.findMany({
    where: { topicSlug: topic, subtopicSlug: subtopic },
    orderBy: { sentenceIndex: "asc" }
  });
  if (rows.length === 0) {
    return [];
  }

  const overlay = await fetchTranslationOverlay(
    "exampleSentence",
    rows.map((row) => row.id),
    lang,
    EXAMPLE_SENTENCE_BASE_LANG
  );

  return rows.map((row) => toExampleSentence(row, lang, overlay.get(row.id)));
}
