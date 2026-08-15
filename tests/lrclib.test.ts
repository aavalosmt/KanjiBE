import { describe, expect, it } from "vitest";
import { detectLyricLanguage } from "../src/lib/importSynced.js";
import { parseLrc } from "../src/lib/lrclib.js";
import { applyLineTimes, normalizeLyricText, preserveStartTimes } from "../src/lib/timestamps.js";

describe("parseLrc", () => {
  it("extracts startTime in seconds per line", () => {
    const lines = parseLrc(
      "[00:19.45] 飛翔たいたら\n[00:21.80] 戻らないと言って\n[00:24.50] 目指したのは"
    );
    expect(lines).toEqual([
      { startTime: 19.45, text: "飛翔たいたら" },
      { startTime: 21.8, text: "戻らないと言って" },
      { startTime: 24.5, text: "目指したのは" }
    ]);
  });

  it("detects Japanese vs other languages", () => {
    expect(detectLyricLanguage("飛翔たいたら 戻らないと言って").japanese).toBe(true);
    expect(detectLyricLanguage("I believe I can fly").japanese).toBe(false);
  });

  it("skips empty timestamp lines", () => {
    const lines = parseLrc("[00:14.17] \n[00:25.66] 悲しみ");
    expect(lines).toEqual([{ startTime: 25.66, text: "悲しみ" }]);
  });
});

describe("applyLineTimes", () => {
  it("maps furigana blocks onto LRC lines and split verses", () => {
    const { blocks, applied } = applyLineTimes(
      [
        { type: "text", content: "[無敵](furigana:む.てき)の[笑顔](furigana:え.がお)で荒らすメディア" },
        { type: "text", content: "[何](furigana:なに)を[聞かれても](furigana:き.か.れ.て.も)" },
        { type: "text", content: "のらりくらり" },
        { type: "text", content: "(You're my savior, you're my saving grace)" },
        { type: "text", content: "その[瞳](furigana:ひとみ)がその[言葉](furigana:こと.ば)が" }
      ],
      parseLrc(
        [
          "[00:00.96] 無敵の笑顔で荒らすメディア",
          "[00:14.88] (Oh, my savior, oh, my saving grace)",
          "[00:26.40] 何を聞かれても のらりくらり",
          "[01:13.20] その瞳が",
          "[01:14.62] その言葉が"
        ].join("\n")
      )
    );

    expect(applied).toBe(5);
    expect(blocks.map((block) => block.startTime)).toEqual([0.96, 26.4, 26.4, 14.88, 73.2]);
  });

  it("strips furigana for matching", () => {
    expect(normalizeLyricText("[今日](furigana:きょう)何食べた？")).toBe("今日何食べた");
  });

  it("keeps existing startTime when the editor omits it", () => {
    const merged = preserveStartTimes(
      [{ type: "text", content: "あ", id: "b1" }],
      [{ id: "b1", type: "text", content: "あ", startTime: 12.5 }]
    );
    expect(merged[0].startTime).toBe(12.5);
  });
});
