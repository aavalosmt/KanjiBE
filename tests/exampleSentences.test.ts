import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";

const app = createApp();
const admin = { "x-admin-key": "test-admin-key" };

const base = "/api/admin/examples/body/fingers";

beforeEach(async () => {
  await prisma.translation.deleteMany();
  await prisma.exampleSentence.deleteMany();
  await prisma.subtopic.deleteMany();
  await prisma.topic.deleteMany();

  await request(app).post("/api/admin/topics").set(admin).send({ slug: "body", label: "Body" });
  await request(app)
    .post("/api/admin/subtopics")
    .set(admin)
    .send({ topicSlug: "body", slug: "fingers", label: "Fingers" });
});

afterAll(async () => {
  await prisma.$disconnect();
});

const sentence = (overrides: Record<string, unknown> = {}) => ({
  text: "指が痛い",
  furigana: "[指](furigana:ゆび)が [痛い](furigana:いた.い)",
  translation: "My finger hurts",
  ...overrides
});

describe("example sentences: bulk PUT + standalone GET", () => {
  it("404s the standalone endpoint for an unregistered subtopic", async () => {
    const res = await request(app).get("/api/examples/body/nope");
    expect(res.status).toBe(404);
  });

  it("returns an empty list for a registered subtopic with no sentences", async () => {
    const res = await request(app).get("/api/examples/body/fingers");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ topic: "body", subtopic: "fingers", data: [] });
  });

  it("creates, reindexes, and serves sentences with the English base", async () => {
    const put = await request(app)
      .put(base)
      .set(admin)
      .send({ sentences: [sentence(), sentence({ text: "指を切った", translation: "I cut my finger" })] });
    expect(put.status).toBe(200);
    expect(put.body.data).toHaveLength(2);
    expect(put.body.data[0]).toMatchObject({
      sentence_index: 0,
      translation: "My finger hurts",
      translationLang: "en"
    });

    const pub = await request(app).get("/api/examples/body/fingers");
    expect(pub.body.data.map((s: { sentence_index: number }) => s.sentence_index)).toEqual([0, 1]);
  });

  it("keeps ids (and overlays) for rows echoed back, drops the rest", async () => {
    const first = await request(app)
      .put(base)
      .set(admin)
      .send({ sentences: [sentence(), sentence({ text: "指輪", translation: "ring" })] });
    const [a, b] = await prisma.exampleSentence.findMany({ orderBy: { sentenceIndex: "asc" } });
    void a;

    await request(app)
      .put(`${base}/1/translations/es`)
      .set(admin)
      .send({ translation: "anillo" });
    expect(await prisma.translation.count()).toBe(1);

    // Re-send only the second row (by id) -> the first is deleted, the second survives at index 0.
    const second = await request(app)
      .put(base)
      .set(admin)
      .send({ sentences: [{ id: b.id, ...sentence({ text: "指輪", translation: "ring" }) }] });
    expect(second.body.data).toHaveLength(1);
    expect(second.body.data[0].sentence_index).toBe(0);

    const remaining = await prisma.exampleSentence.findMany();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(b.id);
    // Its Spanish overlay is still attached.
    expect(await prisma.translation.count()).toBe(1);
    void first;
  });

  it("prunes overlays when a sentence is dropped by a later PUT", async () => {
    await request(app).put(base).set(admin).send({ sentences: [sentence()] });
    await request(app).put(`${base}/0/translations/es`).set(admin).send({ translation: "me duele el dedo" });
    expect(await prisma.translation.count()).toBe(1);

    await request(app).put(base).set(admin).send({ sentences: [] });
    expect(await prisma.exampleSentence.count()).toBe(0);
    expect(await prisma.translation.count()).toBe(0);
  });
});

describe("example sentences: translation overlays", () => {
  beforeEach(async () => {
    await request(app).put(base).set(admin).send({ sentences: [sentence()] });
  });

  it("serves the Spanish overlay under ?lang=es and leaves the base untouched", async () => {
    const put = await request(app)
      .put(`${base}/0/translations/es`)
      .set(admin)
      .send({ translation: "Me duele el dedo" });
    expect(put.status).toBe(204);

    const es = await request(app).get("/api/examples/body/fingers?lang=es");
    expect(es.body.data[0]).toMatchObject({ translation: "Me duele el dedo", translationLang: "es" });

    const en = await request(app).get("/api/examples/body/fingers");
    expect(en.body.data[0]).toMatchObject({ translation: "My finger hurts", translationLang: "en" });
  });

  it("rejects writing an overlay for the base (en) language", async () => {
    const res = await request(app)
      .put(`${base}/0/translations/en`)
      .set(admin)
      .send({ translation: "nope" });
    expect(res.status).toBe(400);
  });
});

describe("example sentences: embedded in the vocabulary set", () => {
  it("appears next to words in GET /api/vocabulary/:topic/:subtopic", async () => {
    await request(app)
      .post("/api/admin/vocabulary/ingest")
      .set(admin)
      .send({
        schema_version: "1.0",
        topic: "body",
        subtopic: "fingers",
        title: "Fingers",
        content_type: "list",
        words: [{ term: "指", furigana: "[指](furigana:ゆび)", translation: "dedo" }]
      });
    await request(app).put(base).set(admin).send({ sentences: [sentence()] });

    const res = await request(app).get("/api/vocabulary/body/fingers");
    expect(res.body.example_sentences).toHaveLength(1);
    expect(res.body.example_sentences[0]).toMatchObject({ text: "指が痛い", translationLang: "en" });
  });
});

describe("example sentences: AI generate", () => {
  it("503s when no AI provider is configured", async () => {
    const res = await request(app)
      .post(`${base}/generate`)
      .set(admin)
      .send({ text: "指が痛い" });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/GEMINI_API_KEY/);
  });

  it("503s with the xAI hint when provider=xai", async () => {
    const res = await request(app)
      .post(`${base}/generate`)
      .set(admin)
      .send({ text: "指が痛い", provider: "xai" });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/XAI_API_KEY/);
  });
});
