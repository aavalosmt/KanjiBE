import fs from "node:fs";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";

const app = createApp();
const admin = { "x-admin-key": "test-admin-key" };

const storyPayload = {
  id: "story-123",
  title: "本文",
  level: "N3",
  translation: "Texto Principal",
  coverUrl: "https://cdn.tuapp.com/covers/story1.jpg",
  blocks: [
    {
      id: "b1",
      type: "text",
      content:
        "[最近](furigana:さいきん)、[ホテル](furigana:ほてる)で[正月](furigana:しょう.がつ)を[すごす](furigana:すごす)[人](furigana:ひと)が[ふえた](furigana:ふえた)そうである。",
      translation:
        "Dicen que últimamente ha aumentado la gente que pasa el Año Nuevo en un hotel."
    },
    {
      id: "b2",
      type: "image",
      url: "https://cdn.tuapp.com/images/hotel-shogatsu.jpg",
      caption: "Hotel en Año Nuevo"
    }
  ]
};

const lyricPayload = {
  id: "song-456",
  title: "Brave Heart",
  artist: "Ayumi Miyazaki",
  translation: "Corazón Valiente",
  coverUrl: "https://cdn.tuapp.com/covers/song456.jpg",
  blocks: [
    {
      id: "b1",
      type: "header",
      content: "Verso 1",
      translation: "Verse 1"
    },
    {
      id: "b2",
      type: "text",
      content: "[逃げ出さ](furigana:に.げ.だ.さ)ないことは [解](furigana:わか)っている",
      translation: "Sé que no voy a huir"
    }
  ]
};

beforeEach(async () => {
  await prisma.lyric.deleteMany();
  await prisma.story.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
  fs.rmSync("uploads-test", { recursive: true, force: true });
});

describe("health", () => {
  it("returns ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe("admin ui", () => {
  it("redirects the root to the admin panel", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/admin/");
  });

  it("serves the admin html and assets", async () => {
    const page = await request(app).get("/admin/");
    expect(page.status).toBe(200);
    expect(page.text).toContain("KanjiBE Admin");

    const js = await request(app).get("/admin/app.js");
    expect(js.status).toBe(200);
    expect(js.text).toContain("ADMIN_API_KEY");
  });

  it("checks the admin session", async () => {
    const denied = await request(app).get("/api/admin/session");
    expect(denied.status).toBe(401);

    const ok = await request(app).get("/api/admin/session").set(admin);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true });
  });
});

describe("public stories", () => {
  it("lists summaries with pagination and level filter", async () => {
    await request(app).post("/api/admin/stories").set(admin).send(storyPayload);
    await request(app).post("/api/admin/stories").set(admin).send({
      ...storyPayload,
      id: "story-n5",
      level: "N5",
      title: "Easy"
    });

    const all = await request(app).get("/api/stories?page=1&limit=20");
    expect(all.status).toBe(200);
    expect(all.body.pagination).toEqual({ page: 1, limit: 20, total: 2 });
    expect(all.body.data).toHaveLength(2);
    expect(all.body.data[0]).not.toHaveProperty("blocks");

    const filtered = await request(app).get("/api/stories?level=N3");
    expect(filtered.body.pagination.total).toBe(1);
    expect(filtered.body.data[0]).toMatchObject({
      id: "story-123",
      title: "本文",
      level: "N3",
      translation: "Texto Principal"
    });
  });

  it("returns a full story by id", async () => {
    await request(app).post("/api/admin/stories").set(admin).send(storyPayload);

    const res = await request(app).get("/api/stories/story-123");
    expect(res.status).toBe(200);
    expect(res.body.blocks).toHaveLength(2);
    expect(res.body.blocks[0].content).toContain("furigana:さいきん");
    expect(res.body.createdAt).toBeTruthy();
    expect(res.body.updatedAt).toBeTruthy();
  });

  it("returns 404 for a missing story", async () => {
    const res = await request(app).get("/api/stories/missing");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Story not found" });
  });
});

describe("public lyrics", () => {
  it("lists summaries and returns the full lyric", async () => {
    await request(app).post("/api/admin/lyrics").set(admin).send(lyricPayload);

    const list = await request(app).get("/api/lyrics");
    expect(list.status).toBe(200);
    expect(list.body.data[0]).toMatchObject({
      id: "song-456",
      title: "Brave Heart",
      artist: "Ayumi Miyazaki"
    });
    expect(list.body.data[0]).not.toHaveProperty("blocks");

    const detail = await request(app).get("/api/lyrics/song-456");
    expect(detail.status).toBe(200);
    expect(detail.body.blocks[1].content).toContain("furigana:に.げ.だ.さ");
  });
});

describe("admin stories", () => {
  it("rejects requests without an admin key", async () => {
    const res = await request(app).post("/api/admin/stories").send(storyPayload);
    expect(res.status).toBe(401);
  });

  it("creates, updates, and deletes a story", async () => {
    const created = await request(app)
      .post("/api/admin/stories")
      .set(admin)
      .send(storyPayload);
    expect(created.status).toBe(201);
    expect(created.body.blocks[1]).toMatchObject({
      type: "image",
      caption: "Hotel en Año Nuevo"
    });

    const updated = await request(app)
      .put("/api/admin/stories/story-123")
      .set(admin)
      .send({ title: "本文 updated" });
    expect(updated.status).toBe(200);
    expect(updated.body.title).toBe("本文 updated");
    expect(updated.body.blocks).toHaveLength(2);

    const deleted = await request(app)
      .delete("/api/admin/stories/story-123")
      .set(admin);
    expect(deleted.status).toBe(204);

    const missing = await request(app).get("/api/stories/story-123");
    expect(missing.status).toBe(404);
  });

  it("validates block payloads", async () => {
    const res = await request(app)
      .post("/api/admin/stories")
      .set(admin)
      .send({
        title: "Bad",
        level: "N3",
        blocks: [{ type: "image", caption: "no url" }]
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });
});

describe("admin lyrics", () => {
  it("creates and updates a lyric", async () => {
    const created = await request(app)
      .post("/api/admin/lyrics")
      .set(admin)
      .send(lyricPayload);
    expect(created.status).toBe(201);

    const updated = await request(app)
      .put("/api/admin/lyrics/song-456")
      .set("authorization", "Bearer test-admin-key")
      .send({
        blocks: [{ type: "header", content: "Coro" }]
      });
    expect(updated.status).toBe(200);
    expect(updated.body.blocks).toHaveLength(1);
    expect(updated.body.blocks[0].id).toBeTruthy();
  });
});

describe("admin upload", () => {
  it("stores an image and returns a public url", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );

    const res = await request(app)
      .post("/api/admin/upload")
      .set(admin)
      .attach("file", png, { filename: "cover.png", contentType: "image/png" });

    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^http:\/\/localhost:3000\/uploads\/.+\.png$/);

    const filename = res.body.url.split("/").pop() as string;
    const stored = await request(app).get(`/uploads/${filename}`);
    expect(stored.status).toBe(200);
    expect(stored.headers["content-type"]).toMatch(/image\/png/);
  });
});
