import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

const app = createApp();
const admin = { "x-admin-key": "test-admin-key" };

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

  const ALL_INFO_PATHS = [
    "/api/stories/info",
    "/api/stories/x/info",
    "/api/lyrics/info",
    "/api/lyrics/x/info",
    "/api/conversations/info",
    "/api/conversations/x/info",
    "/api/topics/info",
    "/api/subtopics/info",
    "/api/kanji/info",
    "/api/lookup/info",
    "/api/lookup/x/info",
    "/api/analyze/info",
    "/api/manga/info",
    "/api/manga/x/info",
    "/api/vocabulary/info",
    "/api/vocabulary/x/y/info",
    "/api/vocabulary/x/y/words/info",
    "/api/examples/x/y/info",
    "/api/admin/session/info",
    "/api/admin/gemini/models/info",
    "/api/admin/ai/models/info",
    "/api/admin/lrclib/search/info",
    "/api/admin/lrclib/preview/info",
    "/api/admin/manga/info",
    "/api/admin/manga/x/info",
    "/api/admin/manga/x/pages/0/info",
    "/api/admin/vocabulary/info",
    "/api/admin/vocabulary/x/y/info",
    "/api/admin/vocabulary/x/y/words/info",
    "/api/admin/vocabulary/x/y/pages/0/info",
    "/api/admin/examples/x/y/info"
  ];

  it.each(ALL_INFO_PATHS)("%s has a runnable example_request", async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(200);
    expect(typeof res.body.example_request).toBe("string");
    expect(res.body.example_request).toMatch(/^GET \//);
  });

  const TOKENIZATION_PATHS = [
    "/api/analyze/info",
    "/api/lookup/info",
    "/api/lookup/x/info",
    "/api/stories/x/info",
    "/api/lyrics/x/info",
    "/api/conversations/x/info",
    "/api/manga/x/info",
    "/api/vocabulary/x/y/info",
    "/api/admin/manga/x/info",
    "/api/admin/manga/x/pages/0/info",
    "/api/admin/vocabulary/x/y/info",
    "/api/admin/vocabulary/x/y/pages/0/info"
  ];

  it.each(TOKENIZATION_PATHS)("%s documents its tokenization rules", async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(200);
    expect(typeof res.body.tokenization).toBe("string");
    expect(res.body.tokenization.length).toBeGreaterThan(0);
  });

  it("omits tokenization on endpoints that don't tokenize anything", async () => {
    const list = await request(app).get("/api/stories/info");
    expect(list.body.tokenization).toBeUndefined();

    const words = await request(app).get("/api/vocabulary/x/y/words/info");
    expect(words.body.tokenization).toBeUndefined();

    const topics = await request(app).get("/api/topics/info");
    expect(topics.body.tokenization).toBeUndefined();
  });

  const CREATE_PATHS = [
    "/api/stories/info",
    "/api/lyrics/info",
    "/api/conversations/info",
    "/api/topics/info",
    "/api/subtopics/info",
    "/api/vocabulary/info",
    "/api/manga/info",
    "/api/admin/vocabulary/info",
    "/api/admin/manga/info"
  ];

  it.each(CREATE_PATHS)("%s points at the POST that creates the resource", async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(200);
    expect(res.body.create.method).toBe("POST");
    expect(typeof res.body.create.path).toBe("string");
    expect(res.body.create.path).toMatch(/^\/api\/admin\//);
    expect(res.body.create.body_example).toBeTruthy();
  });

  it("omits create on detail/PUT-only/words endpoints", async () => {
    const detail = await request(app).get("/api/stories/x/info");
    expect(detail.body.create).toBeUndefined();

    const words = await request(app).get("/api/vocabulary/x/y/words/info");
    expect(words.body.create).toBeUndefined();

    const examples = await request(app).get("/api/examples/x/y/info");
    expect(examples.body.create).toBeUndefined();
  });
});

describe("create.body_example actually satisfies its own endpoint's validator", () => {
  beforeAll(async () => {
    // Prerequisites the doc examples assume are already registered, tolerating
    // a prior run having created them (409).
    await request(app).post("/api/admin/topics").set(admin).send({ slug: "body", label: "Body" });
    await request(app)
      .post("/api/admin/subtopics")
      .set(admin)
      .send({ topicSlug: "body", slug: "fingers", label: "Fingers" });
    await request(app)
      .post("/api/admin/topics")
      .set(admin)
      .send({ slug: "convenience_store", label: "Convenience store" });
  });

  it("POST /api/admin/topics accepts the documented body", async () => {
    const info = await request(app).get("/api/topics/info");
    const body = { ...info.body.create.body_example, slug: "info_doc_topic" };
    const res = await request(app).post("/api/admin/topics").set(admin).send(body);
    expect(res.status).toBe(201);
  });

  it("POST /api/admin/subtopics accepts the documented body", async () => {
    const info = await request(app).get("/api/subtopics/info");
    const body = { ...info.body.create.body_example, slug: "info_doc_subtopic" };
    const res = await request(app).post("/api/admin/subtopics").set(admin).send(body);
    expect(res.status).toBe(201);
  });

  it("POST /api/admin/stories accepts the documented body", async () => {
    const info = await request(app).get("/api/stories/info");
    const body = { ...info.body.create.body_example, id: "info-doc-story" };
    const res = await request(app).post("/api/admin/stories").set(admin).send(body);
    expect(res.status).toBe(201);
  });

  it("POST /api/admin/lyrics accepts the documented body", async () => {
    const info = await request(app).get("/api/lyrics/info");
    const body = { ...info.body.create.body_example, id: "info-doc-lyric" };
    const res = await request(app).post("/api/admin/lyrics").set(admin).send(body);
    expect(res.status).toBe(201);
  });

  it("POST /api/admin/conversations accepts the documented body", async () => {
    const info = await request(app).get("/api/conversations/info");
    const body = { ...info.body.create.body_example, id: "info-doc-conversation" };
    const res = await request(app).post("/api/admin/conversations").set(admin).send(body);
    expect(res.status).toBe(201);
  });

  it("POST /api/admin/vocabulary/ingest accepts the documented body", async () => {
    const info = await request(app).get("/api/vocabulary/info");
    const res = await request(app)
      .post("/api/admin/vocabulary/ingest")
      .set(admin)
      .send(info.body.create.body_example);
    expect(res.status).toBe(200);
  });

  it("POST /api/admin/manga/ingest accepts the documented body", async () => {
    const info = await request(app).get("/api/manga/info");
    const res = await request(app)
      .post("/api/admin/manga/ingest")
      .set(admin)
      .send(info.body.create.body_example);
    expect(res.status).toBe(200);
  });
});
