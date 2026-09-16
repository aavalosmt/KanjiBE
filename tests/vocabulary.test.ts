import { createHash } from "node:crypto";
import fs from "node:fs";
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

function imageIngestPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    schema_version: "1.0",
    topic: "body",
    subtopic: "general",
    title: "Body parts — general",
    content_type: "image",
    cover_url: "http://localhost:3000/uploads/cover.png",
    pages: [
      {
        page_index: 0,
        image_url: "http://localhost:3000/uploads/body_p000.png",
        image_checksum: `sha256:${PNG_CHECKSUM}`,
        width: 1600,
        height: 2400,
        entries: [
          {
            entry_box: { x: 120, y: 340, width: 220, height: 90 },
            full_text: "頭",
            tokens: ["頭"],
            furigana: "[頭](furigana:あたま)",
            morphology: [{ surface: "頭", pos: "noun" }]
          }
        ]
      }
    ],
    ...overrides
  };
}

function listIngestPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    schema_version: "1.0",
    topic: "body",
    subtopic: "fingers",
    title: "Fingers",
    content_type: "list",
    words: [
      { term: "指", furigana: "[指](furigana:ゆび)", translation: "finger" },
      { term: "親指", furigana: "[親指](furigana:おや.ゆび)", translation: "thumb" }
    ],
    ...overrides
  };
}

async function registerTaxonomy() {
  await request(app).post("/api/admin/topics").set(admin).send({ slug: "body", label: "Body" });
  await request(app)
    .post("/api/admin/subtopics")
    .set(admin)
    .send({ topicSlug: "body", slug: "general", label: "General" });
  await request(app)
    .post("/api/admin/subtopics")
    .set(admin)
    .send({ topicSlug: "body", slug: "fingers", label: "Fingers" });
}

beforeEach(async () => {
  await prisma.vocabularyEntry.deleteMany();
  await prisma.vocabularyPage.deleteMany();
  await prisma.vocabularyWord.deleteMany();
  await prisma.vocabularySet.deleteMany();
  await prisma.vocabularyImageAsset.deleteMany();
  await prisma.subtopic.deleteMany();
  await prisma.topic.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
  fs.rmSync("uploads-test", { recursive: true, force: true });
});

describe("admin subtopics", () => {
  it("rejects a subtopic under an unregistered topic", async () => {
    const res = await request(app)
      .post("/api/admin/subtopics")
      .set(admin)
      .send({ topicSlug: "does_not_exist", slug: "general", label: "General" });
    expect(res.status).toBe(400);
  });

  it("creates a subtopic once its topic is registered", async () => {
    await request(app).post("/api/admin/topics").set(admin).send({ slug: "body", label: "Body" });
    const res = await request(app)
      .post("/api/admin/subtopics")
      .set(admin)
      .send({ topicSlug: "body", slug: "general", label: "General" });
    expect(res.status).toBe(201);
  });

  it("409s on a duplicate slug within the same topic", async () => {
    await request(app).post("/api/admin/topics").set(admin).send({ slug: "body", label: "Body" });
    await request(app)
      .post("/api/admin/subtopics")
      .set(admin)
      .send({ topicSlug: "body", slug: "general", label: "General" });
    const res = await request(app)
      .post("/api/admin/subtopics")
      .set(admin)
      .send({ topicSlug: "body", slug: "general", label: "General again" });
    expect(res.status).toBe(409);
  });
});

describe("admin vocabulary ingest", () => {
  it("rejects without admin key", async () => {
    const res = await request(app).post("/api/admin/vocabulary/ingest").send(imageIngestPayload());
    expect(res.status).toBe(401);
  });

  it("rejects an unsupported schema_version", async () => {
    await registerTaxonomy();
    const res = await request(app)
      .post("/api/admin/vocabulary/ingest")
      .set(admin)
      .send(imageIngestPayload({ schema_version: "9.9" }));
    expect(res.status).toBe(400);
  });

  it("rejects an unregistered topic", async () => {
    const res = await request(app)
      .post("/api/admin/vocabulary/ingest")
      .set(admin)
      .send(imageIngestPayload());
    expect(res.status).toBe(400);
  });

  it("rejects an unregistered subtopic", async () => {
    await request(app).post("/api/admin/topics").set(admin).send({ slug: "body", label: "Body" });
    const res = await request(app)
      .post("/api/admin/vocabulary/ingest")
      .set(admin)
      .send(imageIngestPayload());
    expect(res.status).toBe(400);
  });

  it("creates an image-type set with pages and entries", async () => {
    await registerTaxonomy();
    const res = await request(app)
      .post("/api/admin/vocabulary/ingest")
      .set(admin)
      .send(imageIngestPayload());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ topic: "body", subtopic: "general", created: true, item_count: 1 });

    const set = await prisma.vocabularySet.findUnique({
      where: { topic_subtopic: { topic: "body", subtopic: "general" } },
      include: { pages: { include: { entries: true } }, words: true }
    });
    expect(set?.contentType).toBe("image");
    expect(set?.pages).toHaveLength(1);
    expect(set?.pages[0].entries).toHaveLength(1);
    expect(set?.words).toHaveLength(0);
  });

  it("creates a list-type set with words", async () => {
    await registerTaxonomy();
    const res = await request(app)
      .post("/api/admin/vocabulary/ingest")
      .set(admin)
      .send(listIngestPayload());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ topic: "body", subtopic: "fingers", created: true, item_count: 2 });

    const set = await prisma.vocabularySet.findUnique({
      where: { topic_subtopic: { topic: "body", subtopic: "fingers" } },
      include: { words: true, pages: true }
    });
    expect(set?.contentType).toBe("list");
    expect(set?.words).toHaveLength(2);
    expect(set?.pages).toHaveLength(0);
  });

  it("is idempotent: re-ingesting the same payload does not duplicate rows", async () => {
    await registerTaxonomy();
    await request(app).post("/api/admin/vocabulary/ingest").set(admin).send(listIngestPayload());
    const second = await request(app)
      .post("/api/admin/vocabulary/ingest")
      .set(admin)
      .send(listIngestPayload());

    expect(second.body.created).toBe(false);
    const set = await prisma.vocabularySet.findUnique({
      where: { topic_subtopic: { topic: "body", subtopic: "fingers" } },
      include: { words: true }
    });
    expect(set?.words).toHaveLength(2);
  });

  it("converts a set from image to list on re-ingest with a different content_type", async () => {
    await registerTaxonomy();
    await request(app).post("/api/admin/vocabulary/ingest").set(admin).send(imageIngestPayload());
    await request(app)
      .post("/api/admin/vocabulary/ingest")
      .set(admin)
      .send(listIngestPayload({ subtopic: "general", title: "Body parts — general" }));

    const set = await prisma.vocabularySet.findUnique({
      where: { topic_subtopic: { topic: "body", subtopic: "general" } },
      include: { pages: true, words: true }
    });
    expect(set?.contentType).toBe("list");
    expect(set?.pages).toHaveLength(0);
    expect(set?.words).toHaveLength(2);
  });
});

describe("admin vocabulary upload-image", () => {
  it("dedupes a second upload of the same bytes", async () => {
    const first = await request(app)
      .post("/api/admin/vocabulary/upload-image")
      .set(admin)
      .field("image_checksum", PNG_CHECKSUM)
      .attach("image", PNG, { filename: "p000.png", contentType: "image/png" });

    const second = await request(app)
      .post("/api/admin/vocabulary/upload-image")
      .set(admin)
      .field("image_checksum", PNG_CHECKSUM)
      .attach("image", PNG, { filename: "retry.png", contentType: "image/png" });

    expect(second.status).toBe(200);
    expect(second.body.already_existed).toBe(true);
    expect(second.body.image_url).toBe(first.body.image_url);
  });
});

describe("public vocabulary read API", () => {
  beforeEach(async () => {
    await registerTaxonomy();
    await request(app).post("/api/admin/vocabulary/ingest").set(admin).send(imageIngestPayload());
    await request(app).post("/api/admin/vocabulary/ingest").set(admin).send(listIngestPayload());
  });

  it("lists set summaries without page/word detail", async () => {
    const res = await request(app).get("/api/vocabulary");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].pages).toBeUndefined();
    expect(res.body.data[0].words).toBeUndefined();
  });

  it("filters the list by topic", async () => {
    const res = await request(app).get("/api/vocabulary?topic=body");
    expect(res.body.data).toHaveLength(2);
    const res2 = await request(app).get("/api/vocabulary?topic=does_not_exist");
    expect(res2.body.data).toHaveLength(0);
  });

  it("returns full image-set detail at /api/vocabulary/:topic/:subtopic", async () => {
    const res = await request(app).get("/api/vocabulary/body/general");
    expect(res.status).toBe(200);
    expect(res.body.content_type).toBe("image");
    expect(res.body.pages[0].entries[0]).toMatchObject({
      entry_index: 0,
      full_text: "頭",
      furigana: "[頭](furigana:あたま)"
    });
    expect(res.body.words).toEqual([]);
  });

  it("returns full list-set detail at /api/vocabulary/:topic/:subtopic", async () => {
    const res = await request(app).get("/api/vocabulary/body/fingers");
    expect(res.status).toBe(200);
    expect(res.body.content_type).toBe("list");
    expect(res.body.words).toHaveLength(2);
    expect(res.body.words[0]).toMatchObject({ word_index: 0, term: "指", translation: "finger" });
    expect(res.body.pages).toEqual([]);
  });

  it("404s for an unknown topic/subtopic pair", async () => {
    const res = await request(app).get("/api/vocabulary/body/does-not-exist");
    expect(res.status).toBe(404);
  });
});

describe("admin vocabulary word editing (list type)", () => {
  beforeEach(async () => {
    await registerTaxonomy();
    await request(app).post("/api/admin/vocabulary/ingest").set(admin).send(listIngestPayload());
  });

  it("patches a single word", async () => {
    const res = await request(app)
      .patch("/api/admin/vocabulary/body/fingers/words/0")
      .set(admin)
      .send({ translation: "index finger" });

    expect(res.status).toBe(200);
    expect(res.body.translation).toBe("index finger");
  });

  it("deletes a single word", async () => {
    const res = await request(app).delete("/api/admin/vocabulary/body/fingers/words/0").set(admin);
    expect(res.status).toBe(204);
    const set = await prisma.vocabularySet.findUnique({
      where: { topic_subtopic: { topic: "body", subtopic: "fingers" } },
      include: { words: true }
    });
    expect(set?.words).toHaveLength(1);
  });

  it("404s patching a word on an unknown set", async () => {
    const res = await request(app)
      .patch("/api/admin/vocabulary/body/does-not-exist/words/0")
      .set(admin)
      .send({ translation: "x" });
    expect(res.status).toBe(404);
  });
});

describe("admin vocabulary word variants (list type)", () => {
  beforeEach(async () => {
    await registerTaxonomy();
  });

  it("ingests a word with a variant and omits variant for words without one", async () => {
    await request(app)
      .post("/api/admin/vocabulary/ingest")
      .set(admin)
      .send(
        listIngestPayload({
          words: [
            {
              term: "食べる",
              furigana: "[食べる](furigana:た.べる)",
              translation: "to eat",
              variant: { term: "食べさせる", furigana: "[食べさせる](furigana:た.べ.さ.せる)", label: "Causative" }
            },
            { term: "飲む", furigana: "[飲む](furigana:の.む)", translation: "to drink" }
          ]
        })
      );

    const res = await request(app).get("/api/vocabulary/body/fingers");
    expect(res.body.words[0].variant).toEqual({
      term: "食べさせる",
      furigana: "[食べさせる](furigana:た.べ.さ.せる)",
      label: "Causative"
    });
    expect(res.body.words[1].variant).toBeUndefined();
  });

  it("sets a variant via PATCH and reflects it on GET", async () => {
    await request(app).post("/api/admin/vocabulary/ingest").set(admin).send(listIngestPayload());

    const patch = await request(app)
      .patch("/api/admin/vocabulary/body/fingers/words/0")
      .set(admin)
      .send({ variant: { term: "x", furigana: "[x](furigana:x)", label: "Test" } });
    expect(patch.status).toBe(200);
    expect(patch.body.variant).toEqual({ term: "x", furigana: "[x](furigana:x)", label: "Test" });
  });

  it("clears a variant with variant: null", async () => {
    await request(app)
      .post("/api/admin/vocabulary/ingest")
      .set(admin)
      .send(
        listIngestPayload({
          words: [
            {
              term: "食べる",
              furigana: "[食べる](furigana:た.べる)",
              translation: "to eat",
              variant: { term: "食べさせる", furigana: "[食べさせる](furigana:た.べ.さ.せる)", label: "Causative" }
            }
          ]
        })
      );

    const patch = await request(app)
      .patch("/api/admin/vocabulary/body/fingers/words/0")
      .set(admin)
      .send({ variant: null });
    expect(patch.status).toBe(200);
    expect(patch.body.variant).toBeUndefined();
  });

  it("rejects a variant object missing a sub-field", async () => {
    await request(app).post("/api/admin/vocabulary/ingest").set(admin).send(listIngestPayload());

    const res = await request(app)
      .patch("/api/admin/vocabulary/body/fingers/words/0")
      .set(admin)
      .send({ variant: { term: "x", furigana: "[x](furigana:x)" } });
    expect(res.status).toBe(400);
  });
});

describe("admin vocabulary page/entry editing (image type)", () => {
  beforeEach(async () => {
    await registerTaxonomy();
    await request(app).post("/api/admin/vocabulary/ingest").set(admin).send(imageIngestPayload());
  });

  it("patches a single entry", async () => {
    const res = await request(app)
      .patch("/api/admin/vocabulary/body/general/pages/0/entries/0")
      .set(admin)
      .send({ full_text: "頭部" });

    expect(res.status).toBe(200);
    expect(res.body.full_text).toBe("頭部");
  });

  it("deletes a page and cascades its entries", async () => {
    const res = await request(app).delete("/api/admin/vocabulary/body/general/pages/0").set(admin);
    expect(res.status).toBe(204);
    expect(await prisma.vocabularyPage.count()).toBe(0);
    expect(await prisma.vocabularyEntry.count()).toBe(0);
  });
});

describe("admin vocabulary set metadata", () => {
  beforeEach(async () => {
    await registerTaxonomy();
    await request(app).post("/api/admin/vocabulary/ingest").set(admin).send(imageIngestPayload());
  });

  it("patches cover_url without touching pages", async () => {
    const res = await request(app)
      .patch("/api/admin/vocabulary/body/general")
      .set(admin)
      .send({ cover_url: "http://localhost:3000/uploads/new-cover.png" });

    expect(res.status).toBe(200);
    expect(res.body.cover_url).toBe("http://localhost:3000/uploads/new-cover.png");
    expect(res.body.pages).toHaveLength(1);
  });

  it("rejects an empty patch body", async () => {
    const res = await request(app).patch("/api/admin/vocabulary/body/general").set(admin).send({});
    expect(res.status).toBe(400);
  });

  it("404s patching an unknown set", async () => {
    const res = await request(app)
      .patch("/api/admin/vocabulary/body/does-not-exist")
      .set(admin)
      .send({ cover_url: "http://localhost:3000/uploads/x.png" });
    expect(res.status).toBe(404);
  });
});
