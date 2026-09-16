import { GoogleGenAI, Type } from "@google/genai";
import { config } from "../config.js";
import {
  LINE_ENRICH_INSTRUCTION,
  SYSTEM_INSTRUCTION,
  finalizeImportPayload,
  stripLineBreaks,
  type EnrichedLyricLine
} from "./aiShared.js";

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

const conversationBlockSchema = {
  type: Type.OBJECT,
  properties: {
    type: { type: Type.STRING, enum: ["dialogue", "text", "header", "image"] },
    speaker: {
      type: Type.STRING,
      description:
        "Who says this line, e.g. \"Empleado\", \"Cliente\". Required when type is dialogue, omit otherwise."
    },
    content: {
      type: Type.STRING,
      description:
        "One line of dialogue (or narration/header). Each [...](furigana:) span is a FULL word including okurigana: [掴め](furigana:つか.め) [飛行機](furigana:ひ.こう.き) [知らない](furigana:し.ら.な.い). Never isolate a kanji from its conjugation."
    },
    translation: { type: Type.STRING, description: "Spanish translation of this block" },
    url: { type: Type.STRING, description: "Image URL when type is image" },
    caption: { type: Type.STRING, description: "Image caption" }
  },
  required: ["type", "content"]
};

const conversationSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    topic: {
      type: Type.STRING,
      description: "Short snake_case scenario slug, e.g. convenience_store, immigration_interview"
    },
    level: { type: Type.STRING, enum: ["N5", "N4", "N3", "N2", "N1"], nullable: true },
    translation: { type: Type.STRING },
    coverUrl: { type: Type.STRING, nullable: true },
    blocks: { type: Type.ARRAY, items: conversationBlockSchema }
  },
  required: ["title", "topic", "blocks"]
};

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    stories: { type: Type.ARRAY, items: storySchema },
    lyrics: { type: Type.ARRAY, items: lyricSchema },
    conversations: { type: Type.ARRAY, items: conversationSchema }
  },
  required: ["stories", "lyrics", "conversations"]
};

export const PREFERRED_GEMINI_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3.1-lite",
  "gemini-1.5-flash",
  "gemini-1.5-pro"
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
  const fallback = models.includes("gemini-3.5-flash")
    ? "gemini-3.5-flash"
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
      description:
        "Translation of this exact line into the target language named in the system prompt. Required, never empty."
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

export async function enrichLyricLines(
  lines: string[],
  model = config.geminiModel,
  instruction: string = LINE_ENRICH_INSTRUCTION
): Promise<{ lines: EnrichedLyricLine[]; used: boolean; error?: string }> {
  const fallback: EnrichedLyricLine[] = lines.map((text) => ({ content: text }));
  if (!config.geminiApiKey) {
    return { lines: fallback, used: false, error: "GEMINI_API_KEY is not configured" };
  }
  if (lines.length === 0) {
    return { lines: [], used: false };
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
          systemInstruction: instruction,
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
    used,
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
  kind: "story" | "lyric" | "conversation" | "auto" = "auto",
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

  return finalizeImportPayload(parsed);
}

export { stripLineBreaks } from "./aiShared.js";
