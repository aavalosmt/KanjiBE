import { afterEach, describe, expect, it, vi } from "vitest";
import { config } from "../src/config.js";
import { listXaiModels, parseJapaneseToKanjiBEViaXai } from "../src/lib/xai.js";

afterEach(() => {
  config.xaiApiKey = "";
  vi.unstubAllGlobals();
});

describe("listXaiModels", () => {
  it("returns the preferred list when no key is configured", async () => {
    const catalog = await listXaiModels();
    expect(catalog.models).toContain("grok-4-fast");
    expect(catalog.default).toBe(config.xaiModel);
  });
});

describe("parseJapaneseToKanjiBEViaXai", () => {
  it("throws when XAI_API_KEY is not configured", async () => {
    await expect(parseJapaneseToKanjiBEViaXai("家族", "story")).rejects.toThrow(/XAI_API_KEY/);
  });

  it("parses a valid chat/completions response into the KanjiBE import shape", async () => {
    config.xaiApiKey = "test-key";
    const payload = {
      stories: [
        {
          title: "家族",
          level: "N5",
          translation: "Familia",
          blocks: [{ type: "text", content: "[家族](furigana:か.ぞく)", translation: "Familia" }]
        }
      ],
      lyrics: [],
      conversations: []
    };
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("/chat/completions");
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await parseJapaneseToKanjiBEViaXai("家族", "story", "grok-4-fast");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.stories[0]).toMatchObject({ title: "家族", level: "N5", translation: "Familia" });
    expect(result.stories[0].blocks[0].content).toBe("[家族](furigana:か.ぞく)");
  });

  it("surfaces an xAI HTTP error", async () => {
    config.xaiApiKey = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 429 }))
    );
    await expect(
      parseJapaneseToKanjiBEViaXai("家族", "story", "grok-4-fast")
    ).rejects.toThrow(/xAI request failed \(429\)/);
  });
});
