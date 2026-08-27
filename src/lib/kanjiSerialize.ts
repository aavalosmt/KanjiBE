import { kanjiDb } from "../kanjiDb.js";

export interface KanjiSummary {
  character: string;
  strokeCount: number | null;
  freq: number | null;
  jlpt: number;
  onyomi: string[];
  kunyomi: string[];
  meanings: string[];
}

interface CharacterRow {
  id: string;
  stroke_count: number | null;
  freq: number | null;
  jlpt: number;
}

interface ReadingRow {
  id_character: string;
  reading: string;
}

interface MeaningRow {
  id_character: string;
  content: string;
}

const onYomiStmt = kanjiDb.prepare(
  `SELECT id_character, reading FROM on_yomi WHERE id_character IN (SELECT value FROM json_each(?)) ORDER BY id`
);
const kunYomiStmt = kanjiDb.prepare(
  `SELECT id_character, reading FROM kun_yomi WHERE id_character IN (SELECT value FROM json_each(?)) ORDER BY id`
);
const meaningStmt = kanjiDb.prepare(
  `SELECT id_character, content FROM meaning WHERE id_character IN (SELECT value FROM json_each(?)) ORDER BY id`
);

function groupBy<T extends { id_character: string }, V>(
  rows: T[],
  pick: (row: T) => V
): Map<string, V[]> {
  const map = new Map<string, V[]>();
  for (const row of rows) {
    const list = map.get(row.id_character) ?? [];
    list.push(pick(row));
    map.set(row.id_character, list);
  }
  return map;
}

export function toKanjiSummaries(rows: CharacterRow[]): KanjiSummary[] {
  if (rows.length === 0) {
    return [];
  }

  const ids = JSON.stringify(rows.map((row) => row.id));
  const onyomiByChar = groupBy(onYomiStmt.all(ids) as ReadingRow[], (row) => row.reading);
  const kunyomiByChar = groupBy(kunYomiStmt.all(ids) as ReadingRow[], (row) => row.reading);
  const meaningsByChar = groupBy(meaningStmt.all(ids) as MeaningRow[], (row) => row.content);

  return rows.map((row) => ({
    character: row.id,
    strokeCount: row.stroke_count,
    freq: row.freq,
    jlpt: row.jlpt,
    onyomi: onyomiByChar.get(row.id) ?? [],
    kunyomi: kunyomiByChar.get(row.id) ?? [],
    meanings: meaningsByChar.get(row.id) ?? []
  }));
}
