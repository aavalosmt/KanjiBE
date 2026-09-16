import { config } from "../config.js";
import { EXAMPLE_SENTENCE_INSTRUCTION, type EnrichedLyricLine } from "./aiShared.js";
import {
  enrichLyricLines as enrichLyricLinesViaGemini,
  listGeminiModels,
  parseJapaneseToKanjiBE as parseJapaneseViaGemini
} from "./gemini.js";
import {
  enrichLyricLinesViaXai,
  listXaiModels,
  parseJapaneseToKanjiBEViaXai
} from "./xai.js";

export const AI_PROVIDERS = ["gemini", "xai"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export type TokenizeKind = "story" | "lyric" | "conversation" | "auto";

const PROVIDER_LABEL: Record<AiProvider, string> = {
  gemini: "Gemini",
  xai: "Grok"
};

export function resolveProvider(requested?: string | null): AiProvider {
  if (requested && (AI_PROVIDERS as readonly string[]).includes(requested)) {
    return requested as AiProvider;
  }
  return (AI_PROVIDERS as readonly string[]).includes(config.aiProvider)
    ? (config.aiProvider as AiProvider)
    : "gemini";
}

export function providerApiKey(provider: AiProvider): string {
  return provider === "xai" ? config.xaiApiKey : config.geminiApiKey;
}

export function isProviderConfigured(provider: AiProvider): boolean {
  return Boolean(providerApiKey(provider));
}

export function providerEnvVar(provider: AiProvider): string {
  return provider === "xai" ? "XAI_API_KEY" : "GEMINI_API_KEY";
}

export function providerLabel(provider: AiProvider): string {
  return PROVIDER_LABEL[provider];
}

export function defaultModelFor(provider: AiProvider): string {
  return provider === "xai" ? config.xaiModel : config.geminiModel;
}

export function parseJapanese(
  provider: AiProvider,
  text: string,
  kind: TokenizeKind,
  model?: string
) {
  const selected = model || defaultModelFor(provider);
  return provider === "xai"
    ? parseJapaneseToKanjiBEViaXai(text, kind, selected)
    : parseJapaneseViaGemini(text, kind, selected);
}

export function enrichLyrics(
  provider: AiProvider,
  lines: string[],
  model?: string
): Promise<{ lines: EnrichedLyricLine[]; used: boolean; error?: string }> {
  const selected = model || defaultModelFor(provider);
  return provider === "xai"
    ? enrichLyricLinesViaXai(lines, selected)
    : enrichLyricLinesViaGemini(lines, selected);
}

export function listModels(provider: AiProvider) {
  return provider === "xai" ? listXaiModels() : listGeminiModels();
}

// Same furigana enrichment as the lyric path, but the translation comes back in
// English — used to seed example sentences from raw Japanese.
export function enrichExampleSentences(
  provider: AiProvider,
  lines: string[],
  model?: string
): Promise<{ lines: EnrichedLyricLine[]; used: boolean; error?: string }> {
  const selected = model || defaultModelFor(provider);
  return provider === "xai"
    ? enrichLyricLinesViaXai(lines, selected, EXAMPLE_SENTENCE_INSTRUCTION)
    : enrichLyricLinesViaGemini(lines, selected, EXAMPLE_SENTENCE_INSTRUCTION);
}
