import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const app = createApp();

describe("GET /info sidecars", () => {
  it("documents a root list endpoint without admin auth", async () => {
    const res = await request(app).get("/api/stories/info");
    expect(res.status).toBe(200);
    expect(res.body.method).toBe("GET");
    expect(res.body.path).toBe("/api/stories");
  });

  it("does not let /:id swallow the literal /info route", async () => {
    const res = await request(app).get("/api/stories/info");
    expect(res.status).toBe(200);
    expect(res.body.path).toBe("/api/stories");
  });

  it("documents the :id endpoint separately via /:id/info", async () => {
    const res = await request(app).get("/api/stories/some-story/info");
    expect(res.status).toBe(200);
    expect(res.body.path).toBe("/api/stories/:id");
  });

  it("documents deeply nested vocabulary endpoints", async () => {
    const set = await request(app).get("/api/vocabulary/x/y/info");
    expect(set.status).toBe(200);
    expect(set.body.path).toBe("/api/vocabulary/:topic/:subtopic");

    const words = await request(app).get("/api/vocabulary/x/y/words/info");
    expect(words.status).toBe(200);
    expect(words.body.path).toBe("/api/vocabulary/:topic/:subtopic/words");

    const page = await request(app).get("/api/admin/vocabulary/x/y/pages/0/info");
    expect(page.status).toBe(200);
    expect(page.body.path).toBe("/api/admin/vocabulary/:topic/:subtopic/pages/:pageIndex");
  });

  it("stays public on admin routers even without X-Admin-Key", async () => {
    const res = await request(app).get("/api/admin/vocabulary/info");
    expect(res.status).toBe(200);
    expect(res.body.auth).toMatch(/Admin required/);

    const real = await request(app).get("/api/admin/vocabulary");
    expect(real.status).toBe(401);
  });

  it("does not require q for lookup's own info route", async () => {
    const res = await request(app).get("/api/lookup/info");
    expect(res.status).toBe(200);
    expect(res.body.path).toBe("/api/lookup");

    const byPath = await request(app).get("/api/lookup/some-word/info");
    expect(byPath.status).toBe(200);
    expect(byPath.body.path).toBe("/api/lookup/:q");
  });
});
