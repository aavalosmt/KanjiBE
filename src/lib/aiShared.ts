import { importSchema, normalizeImportPayload } from "../validators.js";
import type { z } from "zod";

type ImportPayload = z.infer<typeof importSchema>;

// Shared, provider-agnostic pieces used by every AI engine (Gemini, xAI, ...).
// The engine-specific clients live in gemini.ts / xai.ts and reuse the prompt
// text, the JSON schemas, and the post-parse normalization from here.

export const SYSTEM_INSTRUCTION = `Eres el motor de tokenización lingüística para KanjiBE.
Segmenta el japonés en unidades léxicas y gramaticales COMPLETAS (palabra + conjugación), no en kanjis sueltos.

Cada token visual es UN enlace markdown: [superficieCompleta](furigana:lecturas.con.puntos)
La superficie DENTRO de [] incluye kanji + okurigana + conjugación de ESA palabra.
Las partículas (は が を に で と の も へ) y el kana que no es parte de esa palabra quedan FUERA, como texto plano.

REGLAS (CRÍTICO):

1. JUKUGO — un compuesto = un token. Nunca un kanji por enlace.
   INCORRECTO: [飛](furigana:ひ)[翔](furigana:しょう)
   CORRECTO:   [飛翔](furigana:ひ.しょう)
   INCORRECTO: [飛](furigana:ひ)[行](furigana:こう)[機](furigana:き)
   CORRECTO:   [飛行機](furigana:ひ.こう.き)
   INCORRECTO: [未](furigana:み)[知](furigana:ち)
   CORRECTO:   [未知](furigana:み.ち)
   INCORRECTO: [世](furigana:せ)[界](furigana:かい)
   CORRECTO:   [世界](furigana:せ.かい)

2. CONJUGACIÓN / OKURIGANA — van DENTRO del mismo token, no sueltas después.
   INCORRECTO: [掴](furigana:つか)め
   CORRECTO:   [掴め](furigana:つか.め)
   INCORRECTO: [知](furigana:し)らない
   CORRECTO:   [知らない](furigana:し.ら.な.い)
   INCORRECTO: [出](furigana:で)来ない
   CORRECTO:   [出来ない](furigana:で.き.な.い)
   INCORRECTO: [目指](furigana:め.ざ)した
   CORRECTO:   [目指した](furigana:め.ざ.し.た)
   INCORRECTO: [食](furigana:た)べる
   CORRECTO:   [食べる](furigana:た.べる)

3. FRASES FUNCIONALES — no las fusiones en un solo token, pero cada pieza es una PALABRA completa:
   "できないことがある" → [出来ない](furigana:で.き.な.い)ことが ある
   (verbo potencial negativo + こと + が + ある). Nunca [出](furigana:で)だけ.

4. Lecturas: un segmento por kanji, separados por punto, en orden. Jukujikun sin puntos: [今日](furigana:きょう).

5. No anotes kana suelto ni puntuación. Un bloque text = una línea original. Header = estribillo/verso.

6. CERO saltos de línea, \\n o <br> en content/title/translation/caption. Varias líneas del original = varios bloques.

7. Traducción al español de la línea (no de cada kanji).
8. kind=story → solo stories. kind=lyric → solo lyrics. kind=conversation → solo conversations. auto → decide.
9. No inventes ids, coverUrl, youtubeUrl ni imágenes. youtubeUrl solo si el texto trae un link de YouTube; si no, null.
10. kind=conversation: cada línea de diálogo es un bloque type=dialogue con "speaker" (quién habla, ej. "Empleado", "Cliente") y "content" con esa línea en japonés con furigana. topic es un slug corto en snake_case que describe el escenario (ej. convenience_store, immigration_interview). Usa type=text/header solo para narración o acotaciones de escena, nunca para diálogo.`;

export const LINE_ENRICH_INSTRUCTION = `${SYSTEM_INSTRUCTION}

Además: cada objeto en lines es UNA línea de la letra.
- index es el número de esa línea.
- content es esa línea con furigana.
- translation es la traducción al español de ESA línea. Obligatoria.
- No omitas líneas. No fusiones dos líneas.`;

// Self-contained (NOT derived from SYSTEM_INSTRUCTION, which mandates Spanish
// translations): same furigana tokenization rules, but each line is an isolated
// example sentence and the translation MUST be English — example sentences store
// their base text in English.
export const EXAMPLE_SENTENCE_INSTRUCTION = `You are the Japanese furigana tokenizer for KanjiBE.
Segment Japanese into COMPLETE lexical/grammatical units (word + conjugation), never isolated kanji.

Each visual token is ONE markdown link: [fullSurface](furigana:readings.with.dots)
The surface inside [] includes the kanji + okurigana + conjugation of THAT word.
Particles (は が を に で と の も へ) and kana that is not part of that word stay OUTSIDE as plain text.

RULES (CRITICAL):
1. JUKUGO — one compound = one token, never one kanji per link.
   WRONG: [飛](furigana:ひ)[行](furigana:こう)[機](furigana:き)   RIGHT: [飛行機](furigana:ひ.こう.き)
2. CONJUGATION / OKURIGANA go INSIDE the same token, not loose afterwards.
   WRONG: [知](furigana:し)らない   RIGHT: [知らない](furigana:し.ら.な.い)
   WRONG: [食](furigana:た)べる     RIGHT: [食べる](furigana:た.べる)
3. Readings: one segment per kanji, dot-separated, in order. Jukujikun with no dots: [今日](furigana:きょう).
4. Do not annotate loose kana or punctuation. No line breaks, \\n or <br> anywhere.

Each object in "lines" is ONE standalone example sentence:
- index is that sentence's number (1-based, from the input).
- content is that sentence in Japanese with the furigana markup above.
- translation is the ENGLISH translation of that sentence. REQUIRED, never empty. English only — never Spanish.
- Do not skip or merge sentences.`;

export type EnrichedLyricLine = {
  content: string;
  translation?: string;
};

export function stripLineBreaks(value: string): string {
  return value
    .replace(/\\r\\n|\\n|\\r/g, "")
    .replace(/\r\n|\r|\n/g, "")
    .replace(/[\u2028\u2029]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function cleanBlocks(blocks: ImportPayload["stories"][number]["blocks"]) {
  return blocks.map((block) => ({
    ...block,
    content: block.content ? stripLineBreaks(block.content) : block.content,
    translation: block.translation ? stripLineBreaks(block.translation) : block.translation,
    caption: block.caption ? stripLineBreaks(block.caption) : block.caption,
    speaker: block.speaker ? stripLineBreaks(block.speaker) : block.speaker
  }));
}

function stripImportedNewlines(payload: ImportPayload): ImportPayload {
  return {
    stories: payload.stories.map((item) => ({
      ...item,
      title: stripLineBreaks(item.title),
      translation: item.translation ? stripLineBreaks(item.translation) : item.translation,
      blocks: cleanBlocks(item.blocks)
    })),
    lyrics: payload.lyrics.map((item) => ({
      ...item,
      title: stripLineBreaks(item.title),
      artist: stripLineBreaks(item.artist),
      translation: item.translation ? stripLineBreaks(item.translation) : item.translation,
      blocks: cleanBlocks(item.blocks)
    })),
    conversations: payload.conversations.map((item) => ({
      ...item,
      title: stripLineBreaks(item.title),
      topic: stripLineBreaks(item.topic),
      translation: item.translation ? stripLineBreaks(item.translation) : item.translation,
      blocks: cleanBlocks(item.blocks)
    }))
  };
}

// Validate a raw model response (already JSON.parse'd) into the KanjiBE import
// shape and strip stray newlines. Throws a ZodError on a malformed payload.
export function finalizeImportPayload(raw: unknown): ImportPayload {
  return stripImportedNewlines(importSchema.parse(normalizeImportPayload(raw)));
}

// Plain JSON Schema mirrors of the Gemini `Type.*` schemas, for OpenAI-style
// `response_format: { type: "json_schema", ... }` (xAI). Kept non-strict so the
// optional fields (speaker/url/caption/coverUrl) behave like Gemini's, where
// only a small `required` set is enforced and the rest is prompt-driven.

const blockJsonSchema = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["text", "header", "image"] },
    content: {
      type: "string",
      description:
        "One verse/line. Each [...](furigana:) span is a FULL word including okurigana: [掴め](furigana:つか.め) [飛行機](furigana:ひ.こう.き) [知らない](furigana:し.ら.な.い). Never isolate a kanji from its conjugation."
    },
    translation: { type: "string", description: "Spanish translation of this block" },
    url: { type: "string", description: "Image URL when type is image" },
    caption: { type: "string", description: "Image caption" }
  },
  required: ["type"]
} as const;

const conversationBlockJsonSchema = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["dialogue", "text", "header", "image"] },
    speaker: {
      type: "string",
      description:
        'Who says this line, e.g. "Empleado", "Cliente". Required when type is dialogue, omit otherwise.'
    },
    content: {
      type: "string",
      description:
        "One line of dialogue (or narration/header). Each [...](furigana:) span is a FULL word including okurigana. Never isolate a kanji from its conjugation."
    },
    translation: { type: "string", description: "Spanish translation of this block" },
    url: { type: "string", description: "Image URL when type is image" },
    caption: { type: "string", description: "Image caption" }
  },
  required: ["type", "content"]
} as const;

const storyJsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    level: { type: "string", enum: ["N5", "N4", "N3", "N2", "N1"] },
    translation: { type: "string" },
    coverUrl: { type: ["string", "null"] },
    blocks: { type: "array", items: blockJsonSchema }
  },
  required: ["title", "level", "blocks"]
} as const;

const lyricJsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    artist: { type: "string" },
    translation: { type: "string" },
    coverUrl: { type: ["string", "null"] },
    youtubeUrl: {
      type: ["string", "null"],
      description: "YouTube URL only if the user provided one. Otherwise null."
    },
    blocks: { type: "array", items: blockJsonSchema }
  },
  required: ["title", "artist", "blocks"]
} as const;

const conversationJsonSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    topic: {
      type: "string",
      description: "Short snake_case scenario slug, e.g. convenience_store, immigration_interview"
    },
    level: { type: ["string", "null"], enum: ["N5", "N4", "N3", "N2", "N1", null] },
    translation: { type: "string" },
    coverUrl: { type: ["string", "null"] },
    blocks: { type: "array", items: conversationBlockJsonSchema }
  },
  required: ["title", "topic", "blocks"]
} as const;

export const IMPORT_JSON_SCHEMA = {
  type: "object",
  properties: {
    stories: { type: "array", items: storyJsonSchema },
    lyrics: { type: "array", items: lyricJsonSchema },
    conversations: { type: "array", items: conversationJsonSchema }
  },
  required: ["stories", "lyrics", "conversations"]
} as const;

export const LYRIC_LINES_JSON_SCHEMA = {
  type: "object",
  properties: {
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer", description: "1-based line number from the input" },
          content: {
            type: "string",
            description: "Same Japanese line with KanjiBE furigana markdown"
          },
          translation: {
            type: "string",
            description:
              "Translation of this exact line into the target language named in the system prompt. Required, never empty."
          }
        },
        required: ["index", "content", "translation"]
      }
    }
  },
  required: ["lines"]
} as const;
