import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp();

describe("GET /api/lookup", () => {
  it("requires q", async () => {
    const res = await request(app).get("/api/lookup");
    expect(res.status).toBe(400);
  });

  it("accepts the word in the path", async () => {
    const res = await request(app).get("/api/lookup/食べて");
    expect(res.status).toBe(200);
    expect(res.body.lemma).toBe("食べる");
  }, 20_000);
});

describe("POST /api/analyze", () => {
  it("tags a block and groups verb auxiliaries", async () => {
    const res = await request(app)
      .post("/api/analyze")
      .send({ text: "美味しいご飯を食べました" });
    expect(res.status).toBe(200);
    const types = res.body.tokens.map((token: { colorType: string }) => token.colorType);
    expect(types).toContain("adjective");
    expect(types).toContain("noun");
    expect(types).toContain("particle");
    expect(types).toContain("verb");
    const eaten = res.body.tokens.find((token: { surface: string }) =>
      token.surface.includes("食べ")
    );
    expect(eaten.surface).toBe("食べました");
    expect(eaten.lemma).toBe("食べる");
    expect(eaten.colorType).toBe("verb");
    expect(eaten.color).toBe("#10B981");
  }, 20_000);

  it("strips story furigana markup before analyzing", async () => {
    const res = await request(app)
      .post("/api/analyze")
      .send({ content: "[家族](furigana:か.ぞく)で[正月](furigana:しょう.がつ)を[すごす](furigana:すごす)。" });
    expect(res.status).toBe(200);
    expect(res.body.text).toBe("家族で正月をすごす。");
    expect(res.body.tokens.some((token: { surface: string }) => token.surface === "家族")).toBe(
      true
    );
  }, 20_000);
});

describe("GET /api/lookup lemmatize", () => {
  it("lemmatizes conjugated verbs for EDICT lookup", async () => {
    const unknown = await request(app).get("/api/lookup").query({ q: "知らない" });
    expect(unknown.status).toBe(200);
    expect(unknown.body.lemma).toBe("知る");
    expect(unknown.body.lookupKeys).toContain("知る");
    expect(unknown.body.posEn).toBe("verb");
    expect(unknown.body.verbClassEn).toMatch(/godan/i);
    expect(unknown.body.inflectionEn).toMatch(/negative/i);
    expect(unknown.body.grammarEn).toMatch(/知る/);

    const te = await request(app).get("/api/lookup").query({ q: "食べて" });
    expect(te.status).toBe(200);
    expect(te.body.lemma).toBe("食べる");
    expect(te.body.verbClassEn).toMatch(/ichidan/i);
    expect(te.body.inflectionEn).toMatch(/te-form/i);

    const masu = await request(app).get("/api/lookup").query({ q: "行きます" });
    expect(masu.status).toBe(200);
    expect(masu.body.lemma).toBe("行く");
    expect(masu.body.inflectionEn).toMatch(/polite|masu/i);
  }, 20_000);
});
