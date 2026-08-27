import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const app = createApp();

describe("GET /api/kanji", () => {
  it("returns kanji for a valid JLPT level", async () => {
    const res = await request(app).get("/api/kanji").query({ level: 5, limit: 5 });

    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 5 });
    expect(res.body.data.length).toBe(5);
    for (const kanji of res.body.data) {
      expect(kanji.jlpt).toBe(5);
      expect(typeof kanji.character).toBe("string");
      expect(Array.isArray(kanji.onyomi)).toBe(true);
      expect(Array.isArray(kanji.kunyomi)).toBe(true);
      expect(Array.isArray(kanji.meanings)).toBe(true);
    }
  });

  it("paginates results", async () => {
    const first = await request(app).get("/api/kanji").query({ level: 5, limit: 2, page: 1 });
    const second = await request(app).get("/api/kanji").query({ level: 5, limit: 2, page: 2 });

    expect(first.body.data[0].character).not.toBe(second.body.data[0].character);
  });

  it.each([undefined, 0, 6, "n5", 1.5])("rejects an invalid level (%s)", async (level) => {
    const res = await request(app).get("/api/kanji").query(level === undefined ? {} : { level });

    expect(res.status).toBe(400);
  });
});
