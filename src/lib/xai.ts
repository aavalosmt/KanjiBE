import { config } from "../config.js";
import {
  IMPORT_JSON_SCHEMA,
  LINE_ENRICH_INSTRUCTION,
  LYRIC_LINES_JSON_SCHEMA,
  SYSTEM_INSTRUCTION,
  finalizeImportPayload,
  stripLineBreaks,
  type EnrichedLyricLine
} from "./aiShared.js";

// xAI ships an OpenAI-compatible REST API, so we talk to it with plain fetch
// (Node >= 20 has a global fetch) instead of pulling in the openai SDK.
const XAI_BASE = "https://api.x.ai/v1";

export const PREFERRED_XAI_MODELS = [
  "grok-4-fast",
  "grok-4",
  "grok-3",
  "grok-3-mini"
];

function normalizeModelId(name: string): string {
  return name.trim();
}

type ChatMessage = { role: "system" | "user"; content: string };

async function chatJson(
  model: string,
  messages: ChatMessage[],
  schema: unknown,
  schemaName: string
): Promise<string> {
  const response = await fetch(`${XAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.xaiApiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: { name: schemaName, schema }
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`xAI request failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("xAI returned an empty response");
  }
  return content;
}

export async function listXaiModels(): Promise<{ models: string[]; default: string }> {
  const discovered = new Set<string>(PREFERRED_XAI_MODELS);

  if (config.xaiApiKey) {
    try {
      const response = await fetch(`${XAI_BASE}/language-models`, {
        headers: { authorization: `Bearer ${config.xaiApiKey}` }
      });
      if (response.ok) {
        const body = (await response.json()) as { models?: Array<{ id?: string }> };
        for (const model of body.models ?? []) {
          const id = normalizeModelId(model.id ?? "");
          if (id) discovered.add(id);
        }
      }
    } catch (error) {
      console.error("Failed to list xAI models", error);
    }
  }

  const preferred = PREFERRED_XAI_MODELS.filter((id) => discovered.has(id));
  const extras = [...discovered]
    .filter((id) => !PREFERRED_XAI_MODELS.includes(id))
    .sort();
  const models = [...preferred, ...extras];
  const fallback = models.includes(config.xaiModel)
    ? config.xaiModel
    : (models[0] ?? config.xaiModel);

  return { models, default: fallback };
}

export async function parseJapaneseToKanjiBEViaXai(
  rawText: string,
  kind: "story" | "lyric" | "conversation" | "auto" = "auto",
  model = config.xaiModel
) {
  if (!config.xaiApiKey) {
    throw new Error("XAI_API_KEY is not configured");
  }

  const selected = normalizeModelId(model) || config.xaiModel;
  const content = await chatJson(
    selected,
    [
      { role: "system", content: SYSTEM_INSTRUCTION },
      { role: "user", content: `kind=${kind}\n\n${rawText}` }
    ],
    IMPORT_JSON_SCHEMA,
    "kanjibe_import"
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("xAI returned invalid JSON");
  }

  return finalizeImportPayload(parsed);
}

export async function enrichLyricLinesViaXai(
  lines: string[],
  model = config.xaiModel,
  instruction: string = LINE_ENRICH_INSTRUCTION
): Promise<{ lines: EnrichedLyricLine[]; used: boolean; error?: string }> {
  const fallback: EnrichedLyricLine[] = lines.map((text) => ({ content: text }));
  if (!config.xaiApiKey) {
    return { lines: fallback, used: false, error: "XAI_API_KEY is not configured" };
  }
  if (lines.length === 0) {
    return { lines: [], used: false };
  }

  const selected = normalizeModelId(model) || config.xaiModel;
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
      const content = await chatJson(
        selected,
        [
          { role: "system", content: instruction },
          {
            role: "user",
            content: `Translate and add furigana to each numbered line. Return ${batch.length} items.\n\n${numbered}`
          }
        ],
        LYRIC_LINES_JSON_SCHEMA,
        "kanjibe_lyric_lines"
      );
      const parsed = JSON.parse(content) as {
        lines?: Array<{ index?: number; content?: string; translation?: string }>;
      };
      for (const item of parsed.lines ?? []) {
        const index =
          typeof item.index === "number" && item.index >= 1 ? item.index - 1 : NaN;
        if (!Number.isInteger(index) || index < 0 || index >= lines.length) continue;
        const translation = item.translation ? stripLineBreaks(item.translation) : "";
        const contentLine = item.content ? stripLineBreaks(item.content) : lines[index];
        if (contentLine) {
          enriched[index] = { content: contentLine, translation: translation || undefined };
        }
        if (translation) used = true;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`xAI line batch ${start} failed`, error);
      errors.push(message);
    }
  }

  const translated = enriched.filter((line) => line.translation).length;
  return {
    lines: enriched,
    used,
    error:
      translated === 0
        ? errors[0] ?? "xAI returned no translations"
        : translated < lines.length
          ? `xAI translated ${translated}/${lines.length} lines`
          : undefined
  };
}
