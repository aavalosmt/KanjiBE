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
