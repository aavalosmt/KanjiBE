import { describe, expect, it } from "vitest";
import { stripLineBreaks } from "../src/lib/gemini.js";

describe("stripLineBreaks", () => {
  it("removes real and escaped newlines from Japanese content", () => {
    expect(stripLineBreaks("[飛翔](furigana:ひ.しょう)\nたいたら")).toBe(
      "[飛翔](furigana:ひ.しょう)たいたら"
    );
    expect(stripLineBreaks("[飛翔](furigana:ひ.しょう)\\nたいたら")).toBe(
      "[飛翔](furigana:ひ.しょう)たいたら"
    );
  });
});
