import fs from "node:fs";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";

const app = createApp();
const admin = { "x-admin-key": "test-admin-key" };

const storyPayload = {
  id: "story-i18n",
  title: "本文",
  level: "N3",
  translation: "Texto Principal",
  blocks: [
    { id: "b1", type: "text", content: "[本](furigana:ほん)", translation: "Libro" },
    { id: "b2", type: "text", content: "[川](furigana:かわ)", translation: "Río" }
  ]
};

beforeEach(async () => {
  await prisma.translation.deleteMany();
  await prisma.story.deleteMany();
  await prisma.lyric.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.vocabularyWord.deleteMany();
  await prisma.vocabularySet.deleteMany();
  await prisma.subtopic.deleteMany();
  await prisma.topic.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
  fs.rmSync("uploads-test", { recursive: true, force: true });
});

describe("stories: lang param and translation overlays", () => {
  it("defaults to en, falling back to the original Spanish text when no overlay exists", async () => {
    await request(app).post("/api/admin/stories").set(admin).send(storyPayload);

    const noParam = await request(app).get("/api/stories/story-i18n");
    expect(noParam.body.translation).toBe("Texto Principal");
    expect(noParam.body.translationLang).toBe("es");
    expect(noParam.body.blocks[0]).toMatchObject({ translation: "Libro", translationLang: "es" });

    const explicitEn = await request(app).get("/api/stories/story-i18n?lang=en");
    expect(explicitEn.body.translation).toBe("Texto Principal");
    expect(explicitEn.body.translationLang).toBe("es");

    const explicitEs = await request(app).get("/api/stories/story-i18n?lang=es");
    expect(explicitEs.body.translation).toBe("Texto Principal");
    expect(explicitEs.body.translationLang).toBe("es");
  });

  it("serves an added English overlay for both the item and its blocks, in list and detail views", async () => {
    await request(app).post("/api/admin/stories").set(admin).send(storyPayload);

    const overlay = await request(app)
      .put("/api/admin/stories/story-i18n/translations/en")
      .set(admin)
      .send({
        translation: "Main Text",
        blocks: [{ id: "b1", translation: "Book" }]
      });
    expect(overlay.status).toBe(204);

    const detail = await request(app).get("/api/stories/story-i18n?lang=en");
    expect(detail.body.translation).toBe("Main Text");
    expect(detail.body.translationLang).toBe("en");
    expect(detail.body.blocks[0]).toMatchObject({ translation: "Book", translationLang: "en" });
    // b2 has no English overlay yet, so it still falls back to Spanish.
    expect(detail.body.blocks[1]).toMatchObject({ translation: "Río", translationLang: "es" });

    const list = await request(app).get("/api/stories?lang=en");
    expect(list.body.data[0]).toMatchObject({ translation: "Main Text", translationLang: "en" });

    // The original Spanish is untouched.
    const stillEs = await request(app).get("/api/stories/story-i18n?lang=es");
    expect(stillEs.body.translation).toBe("Texto Principal");
  });

  it("rejects writing an overlay for the legacy language", async () => {
    await request(app).post("/api/admin/stories").set(admin).send(storyPayload);

    const res = await request(app)
      .put("/api/admin/stories/story-i18n/translations/es")
      .set(admin)
      .send({ translation: "no" });
    expect(res.status).toBe(400);
  });

  it("rejects an overlay referencing a block id that doesn't belong to the story", async () => {
    await request(app).post("/api/admin/stories").set(admin).send(storyPayload);

    const res = await request(app)
      .put("/api/admin/stories/story-i18n/translations/en")
      .set(admin)
      .send({ blocks: [{ id: "not-a-real-block", translation: "x" }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown block id/);
  });

  it("404s writing an overlay for a story that doesn't exist", async () => {
    const res = await request(app)
      .put("/api/admin/stories/missing/translations/en")
      .set(admin)
      .send({ translation: "x" });
    expect(res.status).toBe(404);
  });

  it("deletes overlay rows when the story is deleted", async () => {
    await request(app).post("/api/admin/stories").set(admin).send(storyPayload);
    await request(app)
      .put("/api/admin/stories/story-i18n/translations/en")
      .set(admin)
      .send({ translation: "Main Text" });

    expect(await prisma.translation.count()).toBeGreaterThan(0);

    await request(app).delete("/api/admin/stories/story-i18n").set(admin);
    expect(await prisma.translation.count()).toBe(0);
  });

  it("prunes overlays for blocks removed by a later edit", async () => {
    await request(app).post("/api/admin/stories").set(admin).send(storyPayload);
    await request(app)
      .put("/api/admin/stories/story-i18n/translations/en")
      .set(admin)
      .send({ blocks: [{ id: "b1", translation: "Book" }, { id: "b2", translation: "River" }] });

    expect(await prisma.translation.count()).toBe(2);

    await request(app)
      .put("/api/admin/stories/story-i18n")
      .set(admin)
      .send({ blocks: [{ id: "b1", type: "text", content: "[本](furigana:ほん)" }] });

    const remaining = await prisma.translation.findMany();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].blockId).toBe("b1");
  });
});

describe("vocabulary words: lang param and translation overlays", () => {
  beforeEach(async () => {
    await request(app).post("/api/admin/topics").set(admin).send({ slug: "food", label: "Food" });
    await request(app)
      .post("/api/admin/subtopics")
      .set(admin)
      .send({ topicSlug: "food", slug: "fruit", label: "Fruit" });
    await request(app)
      .post("/api/admin/vocabulary/ingest")
      .set(admin)
      .send({
        schema_version: "1.0",
        topic: "food",
        subtopic: "fruit",
        title: "Fruit words",
        content_type: "list",
        words: [{ term: "りんご", furigana: "りんご", translation: "manzana" }]
      });
  });

  it("falls back to Spanish by default and serves an English overlay once added", async () => {
    const before = await request(app).get("/api/vocabulary/food/fruit");
    expect(before.body.words[0]).toMatchObject({ translation: "manzana", translationLang: "es" });

    const putOverlay = await request(app)
      .put("/api/admin/vocabulary/food/fruit/words/0/translations/en")
      .set(admin)
      .send({ translation: "apple" });
    expect(putOverlay.status).toBe(204);

    const after = await request(app).get("/api/vocabulary/food/fruit?lang=en");
    expect(after.body.words[0]).toMatchObject({ translation: "apple", translationLang: "en" });

    const stillEs = await request(app).get("/api/vocabulary/food/fruit?lang=es");
    expect(stillEs.body.words[0]).toMatchObject({ translation: "manzana", translationLang: "es" });
  });

  it("deletes overlay rows when the word is deleted", async () => {
    await request(app)
      .put("/api/admin/vocabulary/food/fruit/words/0/translations/en")
      .set(admin)
      .send({ translation: "apple" });
    expect(await prisma.translation.count()).toBe(1);

    await request(app).delete("/api/admin/vocabulary/food/fruit/words/0").set(admin);
    expect(await prisma.translation.count()).toBe(0);
  });
});
