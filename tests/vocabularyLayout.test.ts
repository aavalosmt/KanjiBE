import { createHash } from "node:crypto";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";

const app = createApp();
const admin = { "x-admin-key": "test-admin-key" };

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const PNG_CHECKSUM = createHash("sha256").update(PNG).digest("hex");

async function setUp() {
  await request(app).post("/api/admin/topics").set(admin).send({ slug: "body", label: "Body" });
  await request(app)
    .post("/api/admin/subtopics")
    .set(admin)
    .send({ topicSlug: "body", slug: "fingers", label: "Fingers" });
}

function wordsPayload(count: number, overrides: Record<string, unknown> = {}) {
  return {
    schema_version: "1.0",
    topic: "body",
    subtopic: "fingers",
    title: "Fingers",
    content_type: "list",
    words: Array.from({ length: count }, (_, i) => ({
      term: `語${i}`,
      furigana: `[語](furigana:ご)${i}`,
      translation: `word ${i}`
    })),
    ...overrides
  };
}

function imagePayload(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: "1.0",
    topic: "body",
    subtopic: "fingers",
    title: "Fingers",
    content_type: "image",
    pages: [
      {
        page_index: 0,
        image_url: "http://localhost:3000/uploads/p0.png",
        image_checksum: `sha256:${PNG_CHECKSUM}`,
        width: 800,
        height: 1200,
        entries: []
      }
    ],
    ...overrides
  };
}

beforeEach(async () => {
  await prisma.translation.deleteMany();
  await prisma.exampleSentence.deleteMany();
  await prisma.vocabularyWord.deleteMany();
  await prisma.vocabularyEntry.deleteMany();
  await prisma.vocabularyPage.deleteMany();
  await prisma.vocabularySet.deleteMany();
  await prisma.subtopic.deleteMany();
  await prisma.topic.deleteMany();
  await setUp();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("vocabulary layout: heuristic default", () => {
  it("uses a 2-column grid for a short list set", async () => {
    await request(app).post("/api/admin/vocabulary/ingest").set(admin).send(wordsPayload(5));
    const res = await request(app).get("/api/vocabulary/body/fingers");
    expect(res.body.layout).toMatchObject({
      id: "root",
      type: "stack",
      children: [{ id: "content", type: "grid", columns: 2, data: "words" }]
    });
  });

  it("uses a table for a long list set", async () => {
    await request(app).post("/api/admin/vocabulary/ingest").set(admin).send(wordsPayload(13));
    const res = await request(app).get("/api/vocabulary/body/fingers");
    expect(res.body.layout.children[0]).toMatchObject({ id: "content", type: "table", data: "words" });
  });

  it("uses a carousel for an image set", async () => {
    await request(app).post("/api/admin/vocabulary/ingest").set(admin).send(imagePayload());
    const res = await request(app).get("/api/vocabulary/body/fingers");
    expect(res.body.layout.children[0]).toMatchObject({ id: "content", type: "carousel", data: "pages" });
  });

  it("uses a comparison table when any word has a variant, even under the grid threshold", async () => {
    await request(app)
      .post("/api/admin/vocabulary/ingest")
      .set(admin)
      .send(
        wordsPayload(3, {
          words: [
            { term: "見る", furigana: "[見る](furigana:み.る)", translation: "to see" },
            {
              term: "食べる",
              furigana: "[食べる](furigana:た.べる)",
              translation: "to eat",
              variant: { term: "食べさせる", furigana: "[食べさせる](furigana:た.べ.さ.せる)", label: "Causative" }
            }
          ]
        })
      );

    const res = await request(app).get("/api/vocabulary/body/fingers");
    expect(res.body.layout.children[0]).toMatchObject({
      id: "content",
      type: "table",
      data: "words",
      tableColumns: [
        { key: "term", label: "Term" },
        { key: "variant.term", label: "Causative" },
        { key: "translation", label: "Translation" }
      ]
    });
  });

  it("appends a collapsible examples node only when there are example sentences", async () => {
    await request(app).post("/api/admin/vocabulary/ingest").set(admin).send(wordsPayload(3));

    const before = await request(app).get("/api/vocabulary/body/fingers");
    expect(before.body.layout.children).toHaveLength(1);

    await request(app)
      .put("/api/admin/examples/body/fingers")
      .set(admin)
      .send({ sentences: [{ text: "指が痛い", furigana: "[指](furigana:ゆび)", translation: "My finger hurts" }] });

    const after = await request(app).get("/api/vocabulary/body/fingers");
    expect(after.body.layout.children).toHaveLength(2);
    expect(after.body.layout.children[1]).toMatchObject({
      id: "examples",
      type: "collapsible",
      collapsed: true,
      children: [{ id: "examples-list", type: "grid", columns: 1, data: "example_sentences" }]
    });
  });

  it("also appears on the admin GET", async () => {
    await request(app).post("/api/admin/vocabulary/ingest").set(admin).send(wordsPayload(3));
    const res = await request(app).get("/api/admin/vocabulary/body/fingers").set(admin);
    expect(res.body.layout.type).toBe("stack");
  });
});

describe("vocabulary layout: admin override", () => {
  beforeEach(async () => {
    await request(app).post("/api/admin/vocabulary/ingest").set(admin).send(wordsPayload(3));
  });

  it("persists a valid override and returns it on subsequent GETs", async () => {
    const override = {
      id: "root",
      type: "stack",
      children: [{ id: "content", type: "table", data: "words" }]
    };
    const patch = await request(app)
      .patch("/api/admin/vocabulary/body/fingers")
      .set(admin)
      .send({ layout: override });
    expect(patch.status).toBe(200);
    expect(patch.body.layout.children[0]).toMatchObject({ id: "content", type: "table", data: "words" });

    const get = await request(app).get("/api/vocabulary/body/fingers");
    expect(get.body.layout.children[0]).toMatchObject({ id: "content", type: "table", data: "words" });
  });

  it("rejects an invalid node", async () => {
    const res = await request(app)
      .patch("/api/admin/vocabulary/body/fingers")
      .set(admin)
      .send({ layout: { id: "root", type: "not-a-real-type" } });
    expect(res.status).toBe(400);
  });

  it("rejects a grid node missing its data binding", async () => {
    const res = await request(app)
      .patch("/api/admin/vocabulary/body/fingers")
      .set(admin)
      .send({ layout: { id: "root", type: "grid", columns: 2 } });
    expect(res.status).toBe(400);
  });

  it("clears the override with layout: null, reverting to the heuristic", async () => {
    await request(app)
      .patch("/api/admin/vocabulary/body/fingers")
      .set(admin)
      .send({ layout: { id: "root", type: "stack", children: [{ id: "c", type: "table", data: "words" }] } });

    const cleared = await request(app)
      .patch("/api/admin/vocabulary/body/fingers")
      .set(admin)
      .send({ layout: null });
    expect(cleared.status).toBe(200);
    // 3 words <= 12 -> heuristic grid, not the table override.
    expect(cleared.body.layout.children[0]).toMatchObject({ type: "grid", columns: 2 });
  });

  it("falls back to the heuristic instead of 500ing on corrupt stored JSON", async () => {
    const set = await prisma.vocabularySet.findUniqueOrThrow({
      where: { topic_subtopic: { topic: "body", subtopic: "fingers" } }
    });
    await prisma.vocabularySet.update({ where: { id: set.id }, data: { layout: "{not json" } });

    const res = await request(app).get("/api/vocabulary/body/fingers");
    expect(res.status).toBe(200);
    expect(res.body.layout.children[0]).toMatchObject({ type: "grid", columns: 2 });
  });
});
