import { describe, expect, it } from "vitest";
import { detectLyricLanguage } from "../src/lib/importSynced.js";
import { parseLrc } from "../src/lib/lrclib.js";

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
