import type { IpadicFeatures } from "kuromoji";

const POS_EN: Record<string, string> = {
  名詞: "noun",
  動詞: "verb",
  形容詞: "i-adjective",
  形容動詞: "na-adjective",
  副詞: "adverb",
  助詞: "particle",
  助動詞: "auxiliary",
  連体詞: "pre-noun adjectival",
  接続詞: "conjunction",
  感動詞: "interjection",
  記号: "symbol",
  フィラー: "filler",
  接頭詞: "prefix",
  その他: "other"
};

function blank(value: string | undefined): boolean {
  return !value || value === "*";
}

export function posEnglish(pos: string | null | undefined): string | null {
  if (!pos || blank(pos)) return null;
  return POS_EN[pos] ?? pos;
}

export function verbClassEnglish(conjugatedType: string | null | undefined): string | null {
  if (!conjugatedType || blank(conjugatedType)) return null;
  if (conjugatedType.includes("一段")) return "ichidan verb";
  if (conjugatedType.includes("カ変") || conjugatedType.includes("来")) return "irregular verb (kuru)";
  if (conjugatedType.includes("サ変") || conjugatedType.includes("スル")) return "irregular verb (suru)";
  if (conjugatedType.includes("五段")) {
    const column = conjugatedType.match(/([カガサザタダナバマヤラワ])行/)?.[1];
    const map: Record<string, string> = {
      カ: "ka",
      ガ: "ga",
      サ: "sa",
      ザ: "za",
      タ: "ta",
      ダ: "da",
      ナ: "na",
      バ: "ba",
      マ: "ma",
      ヤ: "ya",
      ラ: "ra",
      ワ: "wa"
    };
    const col = column ? map[column] : null;
    return col ? `godan verb (${col}-column)` : "godan verb";
  }
  if (conjugatedType.includes("形容詞")) return "i-adjective";
  if (conjugatedType.includes("特殊・マス")) return "polite auxiliary (-masu)";
  if (conjugatedType.includes("特殊・タ")) return "past auxiliary (-ta)";
  if (conjugatedType.includes("特殊・ナイ")) return "negative auxiliary (-nai)";
  return conjugatedType;
}

export function formEnglish(conjugatedForm: string | null | undefined): string | null {
  if (!conjugatedForm || blank(conjugatedForm)) return null;
  const table: Record<string, string> = {
    基本形: "dictionary form",
    未然形: "irrealis (nai-stem)",
    未然ウ接続: "volitional stem",
    未然ヌ接続: "nu-negative stem",
    連用形: "continuative (masu-stem)",
    連用タ接続: "ta/te connective stem",
    連用テ接続: "te-form stem",
    連用ゴザイ接続: "gozai connective stem",
    終止形: "conclusive form",
    連体形: "attributive form",
    仮定形: "hypothetical (eba) form",
    命令形: "imperative form",
    体言接続: "noun-connecting form",
    ガル接続: "garu-connecting form",
    音便基本形: "euphonic dictionary form"
  };
  return table[conjugatedForm] ?? conjugatedForm;
}

function auxInflection(surface: string, lemma: string): string | null {
  const key = lemma || surface;
  if (key === "ない" || key === "ぬ" || key === "ん" || surface === "なかっ") return "negative";
  if (key === "ます") return "polite (masu)";
  if (key === "た" || key === "だ") return "past";
  if (surface === "て" || surface === "で" || key === "て") return "te-form";
  if (key === "たい") return "desiderative (want to)";
  if (key === "れる" || key === "られる") return "passive / potential";
  if (key === "せる" || key === "させる") return "causative";
  if (key === "ば") return "conditional (ba)";
  if (key === "う" || key === "よう") return "volitional";
  if (key === "そう") return "evidential (seems)";
  if (key === "いる" || key === "おる") return "progressive / resultative";
  if (key === "しまう") return "completive (te-shimau)";
  if (key === "くれる" || key === "あげる" || key === "もらう") return "benefactive";
  return null;
}

export type GrammarInfo = {
  posEn: string | null;
  verbClassEn: string | null;
  formEn: string | null;
  inflectionEn: string | null;
  grammarEn: string | null;
};

export function describeGrammar(raw: IpadicFeatures[]): GrammarInfo {
  const primary =
    raw.find((token) => token.pos === "動詞" || token.pos === "形容詞" || token.pos === "形容動詞") ??
    raw[0];
  if (!primary) {
    return { posEn: null, verbClassEn: null, formEn: null, inflectionEn: null, grammarEn: null };
  }

  const posEn = posEnglish(primary.pos);
  const verbClassEn = verbClassEnglish(primary.conjugated_type);
  const formEn = formEnglish(primary.conjugated_form);

  const after = raw.slice(raw.indexOf(primary) + 1);
  const labels = after
    .filter(
      (token) =>
        token.pos === "助動詞" || token.surface_form === "て" || token.surface_form === "で"
    )
    .map((token) => auxInflection(token.surface_form, token.basic_form))
    .filter((label): label is string => Boolean(label));

  let inflectionEn: string | null = labels.length ? [...new Set(labels)].join(" + ") : null;
  if (!inflectionEn && formEn === "dictionary form") inflectionEn = "dictionary form";
  if (!inflectionEn && formEn === "imperative form") inflectionEn = "imperative";
  if (!inflectionEn && formEn === "hypothetical (eba) form") inflectionEn = "conditional";

  const lemma = blank(primary.basic_form) ? primary.surface_form : primary.basic_form;
  const kind = verbClassEn ?? posEn ?? "word";
  const grammarEn = inflectionEn
    ? `${kind} ${lemma} in the ${inflectionEn} form`
    : formEn
      ? `${kind} ${lemma}, ${formEn}`
      : kind
        ? `${kind} ${lemma}`
        : null;

  return { posEn, verbClassEn, formEn, inflectionEn, grammarEn };
}
