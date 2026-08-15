import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp();

describe("GET /api/lookup", () => {
  it("requires q", async () => {
    const res = await request(app).get("/api/lookup");
    expect(res.status).toBe(400);
  });

  it("lemmatizes conjugated verbs for EDICT lookup", async () => {
    const unknown = await request(app).get("/api/lookup").query({ q: "知らない" });
    expect(unknown.status).toBe(200);
    expect(unknown.body.lemma).toBe("知る");
    expect(unknown.body.lookupKeys).toContain("知る");

    const te = await request(app).get("/api/lookup").query({ q: "食べて" });
    expect(te.status).toBe(200);
    expect(te.body.lemma).toBe("食べる");

    const masu = await request(app).get("/api/lookup").query({ q: "行きます" });
    expect(masu.status).toBe(200);
    expect(masu.body.lemma).toBe("行く");
  }, 20_000);
});
