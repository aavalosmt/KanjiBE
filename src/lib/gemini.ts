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
        "Japanese with word-level furigana. Keep jukugo together: [飛翔](furigana:ひ.しょう) not [飛](furigana:ひ)[翔](furigana:しょう)."
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

const SYSTEM_INSTRUCTION = `Eres un extractor y formateador de texto en japonés para KanjiBE.
Convierte letras o historias en bloques tokenizados con furigana.

REGLAS DE TOKENIZACIÓN Y PALABRAS COMPUESTAS (CRÍTICO):
1. NO dividas kanjis individuales si forman una sola palabra o compuesto (熟語 / jukugo).
   - INCORRECTO: [飛](furigana:ひ)[翔](furigana:しょう)
   - CORRECTO: [飛翔](furigana:ひ.しょう)
   - INCORRECTO: [飛](furigana:ひ)[行](furigana:こう)[機](furigana:き)
   - CORRECTO: [飛行機](furigana:ひ.こう.き)
   - INCORRECTO: [未](furigana:み)[知](furigana:ち)
   - CORRECTO: [未知](furigana:み.ち)
   - INCORRECTO: [世](furigana:せ)[界](furigana:かい)
   - CORRECTO: [世界](furigana:せ.かい)
2. Mantén sustantivos compuestos, verbos conjugados y adjetivos juntos como un solo token léxico.
   - INCORRECTO: [目指](furigana:め.ざ) したのは
   - CORRECTO: [目指](furigana:め.ざ)したのは
3. La lectura de un compuesto DEBE separar las lecturas de cada kanji con punto, en el mismo orden.
   - [世界](furigana:せ.かい) [感情](furigana:かん.じょう) [家族](furigana:か.ぞく)
4. Jukujikun (una lectura para todo el compuesto) va SIN puntos: [今日](furigana:きょう) [明日](furigana:あした)
5. Okurigana: la raíz en kanji, el kana de conjugación fuera del corchete.
   - [食](furigana:た)べる  [目指](furigana:め.ざ)した
6. No pongas furigana en kana suelto ni en puntuación.
7. Un bloque text por cada línea original. Usa header para estribillo/verso.
8. NUNCA insertes saltos de línea, \\n, <br> ni retornos de carro en content, translation, title, artist ni caption.
   - Si el original es una sola línea, el content es una sola línea.
   - Si el original tiene varias líneas, cada línea es un bloque distinto, no un \\n dentro del mismo content.
   - INCORRECTO: "[飛翔](furigana:ひ.しょう)\\nたいたら"
   - CORRECTO: un bloque "[飛翔](furigana:ひ.しょう)たいたら"  O  dos bloques, uno por verso
9. Traducciones al español, también en una sola línea por bloque.
10. Si kind=story, llena stories y deja lyrics []. Si kind=lyric, al revés. Si auto, decide.
11. No inventes ids, coverUrl (usa null) ni imágenes.`;

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
