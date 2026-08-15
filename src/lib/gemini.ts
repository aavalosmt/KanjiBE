import { GoogleGenAI, Type } from "@google/genai";
import { config } from "../config.js";
import { importSchema, normalizeImportPayload } from "../validators.js";
import type { z } from "zod";

type ImportPayload = z.infer<typeof importSchema>;

const blockSchema = {
  type: Type.OBJECT,
  properties: {
    type: { type: Type.STRING, enum: ["text", "header", "image"] },
    content: {
      type: Type.STRING,
      description:
        "One verse/line. Each [...](furigana:) span is a FULL word including okurigana: [掴め](furigana:つか.め) [飛行機](furigana:ひ.こう.き) [知らない](furigana:し.ら.な.い). Never isolate a kanji from its conjugation."
    },
    translation: { type: Type.STRING, description: "Spanish translation of this block" },
    url: { type: Type.STRING, description: "Image URL when type is image" },
    caption: { type: Type.STRING, description: "Image caption" }
  },
  required: ["type"]
};

const storySchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    level: { type: Type.STRING, enum: ["N5", "N4", "N3", "N2", "N1"] },
    translation: { type: Type.STRING },
    coverUrl: { type: Type.STRING, nullable: true },
    blocks: { type: Type.ARRAY, items: blockSchema }
  },
  required: ["title", "level", "blocks"]
};

const lyricSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    artist: { type: Type.STRING },
    translation: { type: Type.STRING },
    coverUrl: { type: Type.STRING, nullable: true },
    youtubeUrl: {
      type: Type.STRING,
      nullable: true,
      description: "YouTube URL only if the user provided one. Otherwise null."
    },
    blocks: { type: Type.ARRAY, items: blockSchema }
  },
  required: ["title", "artist", "blocks"]
};

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    stories: { type: Type.ARRAY, items: storySchema },
    lyrics: { type: Type.ARRAY, items: lyricSchema }
  },
  required: ["stories", "lyrics"]
};

const SYSTEM_INSTRUCTION = `Eres el motor de tokenización lingüística para KanjiBE.
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
8. kind=story → solo stories. kind=lyric → solo lyrics. auto → decide.
9. No inventes ids, coverUrl, youtubeUrl ni imágenes. youtubeUrl solo si el texto trae un link de YouTube; si no, null.`;

export const PREFERRED_GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-2.0-pro-exp-02-05",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-1.5-pro",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash-8b",
  "gemini-3.1-lite"
];

function normalizeModelId(name: string): string {
  return name.replace(/^models\//, "").trim();
}

function isGenerativeGemini(id: string, actions?: string[]): boolean {
  if (!id.startsWith("gemini-")) return false;
  if (/(embed|embedding|image|imagen|tts|live|robotics)/i.test(id)) return false;
  if (actions && actions.length > 0) {
    return actions.some((action) =>
      /generateContent|generateContentStream|generateText/i.test(action)
    );
  }
  return true;
}

export async function listGeminiModels(): Promise<{
  models: string[];
  default: string;
}> {
  const discovered = new Set<string>(PREFERRED_GEMINI_MODELS);

  if (config.geminiApiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
      const pager = await ai.models.list();
      for await (const model of pager) {
        const id = normalizeModelId(model.name ?? "");
        if (isGenerativeGemini(id, model.supportedActions)) {
          discovered.add(id);
        }
      }
    } catch (error) {
      console.error("Failed to list Gemini models", error);
    }
  }

  const preferred = PREFERRED_GEMINI_MODELS.filter((id) => discovered.has(id));
  const extras = [...discovered]
    .filter((id) => !PREFERRED_GEMINI_MODELS.includes(id))
    .sort();
  const models = [...preferred, ...extras];
  const fallback = models.includes("gemini-2.0-flash")
    ? "gemini-2.0-flash"
    : (models[0] ?? config.geminiModel);
  const selected = models.includes(config.geminiModel) ? config.geminiModel : fallback;

  return { models, default: selected };
}

const lyricLineSchema = {
  type: Type.OBJECT,
  properties: {
    index: { type: Type.INTEGER, description: "1-based line number from the input" },
    content: {
      type: Type.STRING,
      description: "Same Japanese line with KanjiBE furigana markdown"
    },
    translation: {
      type: Type.STRING,
      description: "Spanish translation of this exact line. Required, never empty."
    }
  },
  required: ["index", "content", "translation"]
};

const lyricLinesResponseSchema = {
  type: Type.OBJECT,
  properties: {
    lines: { type: Type.ARRAY, items: lyricLineSchema }
  },
  required: ["lines"]
};

const LINE_ENRICH_INSTRUCTION = `${SYSTEM_INSTRUCTION}

Además: cada objeto en lines es UNA línea de la letra.
- index es el número de esa línea.
- content es esa línea con furigana.
- translation es la traducción al español de ESA línea. Obligatoria.
- No omitas líneas. No fusiones dos líneas.`;

export type EnrichedLyricLine = {
  content: string;
  translation?: string;
};

export async function enrichLyricLines(
  lines: string[],
  model = config.geminiModel
): Promise<{ lines: EnrichedLyricLine[]; usedGemini: boolean; error?: string }> {
  const fallback: EnrichedLyricLine[] = lines.map((text) => ({ content: text }));
  if (!config.geminiApiKey) {
    return { lines: fallback, usedGemini: false, error: "GEMINI_API_KEY is not configured" };
  }
  if (lines.length === 0) {
    return { lines: [], usedGemini: false };
  }

  const selected = normalizeModelId(model) || config.geminiModel;
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const batchSize = 12;
  const enriched = [...fallback];
  let used = false;
  const errors: string[] = [];

  for (let start = 0; start < lines.length; start += batchSize) {
    const batch = lines.slice(start, start + batchSize);
    const numbered = batch
      .map((text, offset) => `${start + offset + 1}. ${text}`)
      .join("\n");
    try {
      const response = await ai.models.generateContent({
        model: selected,
        contents: `Translate and add furigana to each numbered line. Return ${batch.length} items.\n\n${numbered}`,
        config: {
          systemInstruction: LINE_ENRICH_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: lyricLinesResponseSchema,
          temperature: 0
        }
      });
      const raw = response.text;
      if (!raw) throw new Error("empty Gemini response");
      const parsed = JSON.parse(raw) as {
        lines?: Array<{ index?: number; content?: string; translation?: string }>;
      };
      for (const item of parsed.lines ?? []) {
        const index =
          typeof item.index === "number" && item.index >= 1
            ? item.index - 1
            : NaN;
        if (!Number.isInteger(index) || index < 0 || index >= lines.length) continue;
        const translation = item.translation ? stripLineBreaks(item.translation) : "";
        const content = item.content ? stripLineBreaks(item.content) : lines[index];
        if (content) enriched[index] = { content, translation: translation || undefined };
        if (translation) used = true;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Gemini line batch ${start} failed`, error);
      errors.push(message);
    }
  }

  const translated = enriched.filter((line) => line.translation).length;
  return {
    lines: enriched,
    usedGemini: used,
    error:
      translated === 0
        ? errors[0] ?? "Gemini returned no translations"
        : translated < lines.length
          ? `Gemini translated ${translated}/${lines.length} lines`
          : undefined
  };
}

export async function parseJapaneseToKanjiBE(
  rawText: string,
  kind: "story" | "lyric" | "auto" = "auto",
  model = config.geminiModel
) {
  if (!config.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const selected = normalizeModelId(model) || config.geminiModel;
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const response = await ai.models.generateContent({
    model: selected,
    contents: `kind=${kind}\n\n${rawText}`,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema,
      temperature: 0
    }
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned invalid JSON");
  }

  return stripImportedNewlines(importSchema.parse(normalizeImportPayload(parsed)));
}

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
    caption: block.caption ? stripLineBreaks(block.caption) : block.caption
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
    }))
  };
}
