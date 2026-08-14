import { GoogleGenAI, Type } from "@google/genai";
import { config } from "../config.js";
import { importSchema, normalizeImportPayload } from "../validators.js";

const blockSchema = {
  type: Type.OBJECT,
  properties: {
    type: { type: Type.STRING, enum: ["text", "header", "image"] },
    content: {
      type: Type.STRING,
      description:
        "Japanese text with KanjiBE furigana: [漢字](furigana:かん.じ). Compound: [家族](furigana:か.ぞく). Okurigana: [食べる](furigana:た.べる)."
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

const SYSTEM_INSTRUCTION = `Eres un extractor para KanjiBE. Convierte japonés (cuento o letra) en JSON con bloques y furigana.

Reglas de content:
1. Sintaxis exacta: [Surface](furigana:lecturas)
2. Varios kanji: [家族](furigana:か.ぞく)
3. Okurigana: [食べる](furigana:た.べる) — el kana de superficie va DENTRO de los corchetes, lecturas separadas por punto
4. Jukujikun sin punto: [今日](furigana:きょう)
5. No pongas furigana en kana suelto ni en puntuación
6. Un bloque text por párrafo o verso. Usa header para estribillo/verso.
7. Traducciones al español.
8. Si kind=story, llena stories y deja lyrics []. Si kind=lyric, al revés. Si auto, decide.
9. No inventes ids ni coverUrl (usa null).
10. No inventes imágenes.`;

export const PREFERRED_GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-2.0-pro-exp-02-05",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-1.5-pro",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash-8b"
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
      temperature: 0.1
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

  return importSchema.parse(normalizeImportPayload(parsed));
}
