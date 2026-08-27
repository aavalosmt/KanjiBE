import fs from "node:fs";
import path from "node:path";

export interface KanjiSummary {
  character: string;
  strokeCount: number | null;
  freq: number | null;
  jlpt: number;
  onyomi: string[];
  kunyomi: string[];
  meanings: string[];
}

const kanjiFile = path.resolve(process.cwd(), "resources", "kanji.json");
const allKanji = JSON.parse(fs.readFileSync(kanjiFile, "utf8")) as KanjiSummary[];

const byLevel = new Map<number, KanjiSummary[]>();
for (const kanji of allKanji) {
  const list = byLevel.get(kanji.jlpt) ?? [];
  list.push(kanji);
  byLevel.set(kanji.jlpt, list);
}

export function listKanjiByLevel(level: number): KanjiSummary[] {
  return byLevel.get(level) ?? [];
}
