import { createRequire } from "node:module";
import path from "node:path";
import type { IpadicFeatures, Tokenizer } from "kuromoji";

const require = createRequire(import.meta.url);
const kuromoji = require("kuromoji") as typeof import("kuromoji");

const dicPath = path.join(path.dirname(require.resolve("kuromoji/package.json")), "dict");

let tokenizerPromise: Promise<Tokenizer<IpadicFeatures>> | undefined;

export function getTokenizer(): Promise<Tokenizer<IpadicFeatures>> {
  tokenizerPromise ??= new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath }).build((error, tokenizer) => {
      if (error) {
        tokenizerPromise = undefined;
        reject(error);
        return;
      }
      resolve(tokenizer);
    });
  });
  return tokenizerPromise;
}

const SKIP_POS = new Set(["記号", "フィラー"]);
const FUNCTION_POS = new Set(["助詞", "助動詞"]);

export type LookupToken = {
  surface: string;
  lemma: string;
  reading: string | null;
  pronunciation: string | null;
  pos: string;
  posDetail: string;
  conjugatedType: string | null;
  conjugatedForm: string | null;
};

export type LookupResult = {
  query: string;
  lemma: string;
  lemmas: string[];
  reading: string | null;
  pos: string | null;
  conjugatedType: string | null;
  conjugatedForm: string | null;
  lookupKeys: string[];
  tokens: LookupToken[];
};

function isBlank(value: string | undefined): boolean {
  return !value || value === "*";
}

function lemmaOf(token: IpadicFeatures): string {
  return isBlank(token.basic_form) ? token.surface_form : token.basic_form;
}

function isContentToken(token: IpadicFeatures): boolean {
  if (SKIP_POS.has(token.pos)) return false;
  if (FUNCTION_POS.has(token.pos) && token.pos_detail_1 !== "非自立") return false;
  return true;
}

export function analyzeTokens(query: string, raw: IpadicFeatures[]): LookupResult {
  const tokens: LookupToken[] = raw.map((token) => ({
    surface: token.surface_form,
    lemma: lemmaOf(token),
    reading: token.reading && !isBlank(token.reading) ? token.reading : null,
    pronunciation:
      token.pronunciation && !isBlank(token.pronunciation) ? token.pronunciation : null,
    pos: token.pos,
    posDetail: [token.pos_detail_1, token.pos_detail_2, token.pos_detail_3]
      .filter((part) => part && part !== "*")
      .join("/"),
    conjugatedType: isBlank(token.conjugated_type) ? null : token.conjugated_type,
    conjugatedForm: isBlank(token.conjugated_form) ? null : token.conjugated_form
  }));

  const content = raw.filter(isContentToken);
  const primary = content[0] ?? raw[0];
  const lemmas = [
    ...new Set(content.map(lemmaOf).filter((lemma) => lemma && lemma !== "*"))
  ];

  const lookupKeys = [...new Set([query, ...lemmas].filter(Boolean))];

  return {
    query,
    lemma: primary ? lemmaOf(primary) : query,
    lemmas,
    reading: primary?.reading && !isBlank(primary.reading) ? primary.reading : null,
    pos: primary?.pos ?? null,
    conjugatedType:
      primary && !isBlank(primary.conjugated_type) ? primary.conjugated_type : null,
    conjugatedForm:
      primary && !isBlank(primary.conjugated_form) ? primary.conjugated_form : null,
    lookupKeys,
    tokens
  };
}

export async function lookupExpression(query: string): Promise<LookupResult> {
  const tokenizer = await getTokenizer();
  return analyzeTokens(query, tokenizer.tokenize(query));
}

export const POS_PALETTE = {
  noun: { colorType: "noun", color: "#3B82F6", label: "sustantivo" },
  verb: { colorType: "verb", color: "#10B981", label: "verbo" },
  adjective: { colorType: "adjective", color: "#F59E0B", label: "adjetivo" },
  particle: { colorType: "particle", color: "#6B7280", label: "partícula" },
  "aux-verb": { colorType: "aux-verb", color: "#34D399", label: "auxiliar" },
  adverb: { colorType: "adverb", color: "#8B5CF6", label: "adverbio" },
  other: { colorType: "other", color: "#9CA3AF", label: "otro" }
} as const;

export type ColorType = keyof typeof POS_PALETTE;

export type AnalyzedPart = {
  surface: string;
  lemma: string;
  reading: string | null;
  pos: string;
};

export type AnalyzedToken = {
  surface: string;
  reading: string | null;
  lemma: string;
  pos: string;
  posDetail: string;
  conjugatedType: string | null;
  conjugatedForm: string | null;
  colorType: ColorType;
  color: string;
  parts?: AnalyzedPart[];
};

export function stripFuriganaMarkup(text: string): string {
  return text.replace(/\[([^\]]+)\]\(furigana:[^)]+\)/g, "$1");
}

export function colorCategory(pos: string): (typeof POS_PALETTE)[ColorType] {
  switch (pos) {
    case "名詞":
      return POS_PALETTE.noun;
    case "動詞":
      return POS_PALETTE.verb;
    case "形容詞":
    case "形容動詞":
      return POS_PALETTE.adjective;
    case "助詞":
      return POS_PALETTE.particle;
    case "助動詞":
      return POS_PALETTE["aux-verb"];
    case "副詞":
      return POS_PALETTE.adverb;
    default:
      return POS_PALETTE.other;
  }
}

function toAnalyzed(token: IpadicFeatures): AnalyzedToken {
  const style = colorCategory(token.pos);
  return {
    surface: token.surface_form,
    reading: token.reading && !isBlank(token.reading) ? token.reading : null,
    lemma: lemmaOf(token),
    pos: token.pos,
    posDetail: [token.pos_detail_1, token.pos_detail_2, token.pos_detail_3]
      .filter((part) => part && part !== "*")
      .join("/"),
    conjugatedType: isBlank(token.conjugated_type) ? null : token.conjugated_type,
    conjugatedForm: isBlank(token.conjugated_form) ? null : token.conjugated_form,
    colorType: style.colorType,
    color: style.color
  };
}

export function groupVerbAuxiliaries(tokens: AnalyzedToken[]): AnalyzedToken[] {
  const grouped: AnalyzedToken[] = [];
  for (const token of tokens) {
    const prev = grouped.at(-1);
    const attach =
      prev &&
      (prev.pos === "動詞" || prev.pos === "形容詞" || prev.pos === "形容動詞") &&
      token.pos === "助動詞";
    if (attach && prev) {
      prev.parts ??= [
        {
          surface: prev.surface,
          lemma: prev.lemma,
          reading: prev.reading,
          pos: prev.pos
        }
      ];
      prev.parts.push({
        surface: token.surface,
        lemma: token.lemma,
        reading: token.reading,
        pos: token.pos
      });
      prev.surface += token.surface;
      prev.reading = [prev.reading, token.reading].filter(Boolean).join("");
      continue;
    }
    grouped.push({ ...token });
  }
  return grouped;
}

export async function analyzeBlock(rawText: string): Promise<{
  text: string;
  tokens: AnalyzedToken[];
}> {
  const text = stripFuriganaMarkup(rawText).trim();
  const tokenizer = await getTokenizer();
  const tokens = groupVerbAuxiliaries(tokenizer.tokenize(text).map(toAnalyzed));
  return { text, tokens };
}
