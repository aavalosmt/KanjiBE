import type { ContentBlock } from "../types.js";
import type { LrcLine } from "./lrclib.js";

export function stripFurigana(text: string): string {
  return text.replace(/\[([^\]]+)\]\(furigana:[^)]+\)/g, "$1");
}

export function normalizeLyricText(text: string): string {
  return stripFurigana(text)
    .normalize("NFKC")
    .replace(/[（）()「」『』【】[\]"'""''・、。,.!?！？~\s　]/g, "")
    .replace(/あぁ+/g, "ああ")
    .toLowerCase();
}

function overlapScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.95;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  const window = Math.max(4, Math.floor(shorter.length * 0.4));
  if (shorter.length < window) return 0;
  for (let i = 0; i <= shorter.length - window; i += 1) {
    if (longer.includes(shorter.slice(i, i + window))) {
      return window / Math.min(a.length, b.length);
    }
  }
  return 0;
}

function findLine(lines: Array<{ text: string }>, from: number, needle: string): number {
  let best = -1;
  let bestScore = 0.49;
  const last = Math.min(lines.length, from + 5);
  for (let i = from; i < last; i += 1) {
    const score = overlapScore(needle, lines[i]?.text ?? "");
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}

export function applyLineTimes<T extends { type: string; content?: string; startTime?: number | null }>(
  blocks: T[],
  lines: LrcLine[]
): { blocks: T[]; applied: number } {
  const remaining = lines
    .map((line) => ({
      startTime: line.startTime,
      text: normalizeLyricText(line.text)
    }))
    .filter((line) => line.text.length > 0);

  const next = blocks.map((block) => ({ ...block }));
  let lineIndex = 0;
  let applied = 0;

  for (let i = 0; i < next.length; i += 1) {
    const block = next[i];
    if (block.type !== "text" && block.type !== "header") continue;
    const needle = normalizeLyricText(block.content ?? "");
    if (!needle) continue;

    const found = findLine(remaining, lineIndex, needle);
    if (found < 0) continue;

    next[i] = { ...block, startTime: remaining[found].startTime };
    applied += 1;

    const hay = remaining[found].text;
    if (hay.startsWith(needle) && hay.length > needle.length) {
      remaining[found] = { ...remaining[found], text: hay.slice(needle.length) };
      lineIndex = found;
      continue;
    }

    remaining[found] = { ...remaining[found], text: "" };
    lineIndex = found + 1;
    let leftover = needle.startsWith(hay) ? needle.slice(hay.length) : "";
    while (leftover && lineIndex < remaining.length) {
      const piece = remaining[lineIndex].text;
      if (!piece) {
        lineIndex += 1;
        continue;
      }
      if (leftover.startsWith(piece)) {
        leftover = leftover.slice(piece.length);
        remaining[lineIndex] = { ...remaining[lineIndex], text: "" };
        lineIndex += 1;
      } else if (piece.startsWith(leftover)) {
        remaining[lineIndex] = { ...remaining[lineIndex], text: piece.slice(leftover.length) };
        leftover = "";
      } else {
        break;
      }
    }
  }

  const unused = remaining.filter((line) => line.text);
  let unusedIndex = 0;
  for (let i = 0; i < next.length && unusedIndex < unused.length; i += 1) {
    const block = next[i];
    if (block.type !== "text" && block.type !== "header") continue;
    if (block.startTime != null) continue;
    if (!normalizeLyricText(block.content ?? "")) continue;
    next[i] = { ...block, startTime: unused[unusedIndex].startTime };
    unusedIndex += 1;
    applied += 1;
  }

  return { blocks: next, applied };
}

export function preserveStartTimes<T extends { id?: string; startTime?: number | null }>(
  incoming: T[],
  existing: ContentBlock[]
): T[] {
  return incoming.map((block, index) => {
    if (block.startTime != null) return block;
    const byId = block.id ? existing.find((item) => item.id === block.id) : undefined;
    const startTime = byId?.startTime ?? existing[index]?.startTime;
    if (startTime == null) return block;
    return { ...block, startTime };
  });
}
