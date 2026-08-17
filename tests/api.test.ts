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

const conversationPayload = {
  id: "conv-789",
  title: "コンビニで",
  topic: "convenience_store",
  level: "N4",
  translation: "At the convenience store",
  coverUrl: "https://cdn.tuapp.com/covers/conv1.jpg",
  blocks: [
    {
      id: "b1",
      type: "dialogue",
      speaker: "Clerk",
      content: "[いらっしゃいませ](furigana:いらっしゃいませ)",
      translation: "Welcome!",
      notes: "Set phrase said by any shop clerk when a customer enters."
    },
    {
      id: "b2",
      type: "dialogue",
      speaker: "Customer",
      content: "[袋](furigana:ふくろ)は[いりません](furigana:いりません)",
      translation: "I don't need a bag"
    }
  ]
};

beforeEach(async () => {
  await prisma.lyric.deleteMany();
  await prisma.story.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.topic.deleteMany();
  await prisma.topic.createMany({
    data: [
      { slug: "convenience_store", label: "Convenience Store" },
      { slug: "immigration", label: "Immigration" },
      { slug: "train_station", label: "Train Station" }
    ]
  });
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
    expect(ok.body.ok).toBe(true);
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
      artist: "Ayumi Miyazaki",
      youtubeUrl: null
    });
    expect(list.body.data[0]).not.toHaveProperty("blocks");

    const detail = await request(app).get("/api/lyrics/song-456");
    expect(detail.status).toBe(200);
    expect(detail.body.blocks[1].content).toContain("furigana:に.げ.だ.さ");
  });
});

describe("public conversations", () => {
  it("lists summaries with pagination and topic filter", async () => {
    await request(app).post("/api/admin/conversations").set(admin).send(conversationPayload);
    await request(app).post("/api/admin/conversations").set(admin).send({
      ...conversationPayload,
      id: "conv-immigration",
      topic: "immigration",
      title: "入国審査"
    });

    const all = await request(app).get("/api/conversations?page=1&limit=20");
    expect(all.status).toBe(200);
    expect(all.body.pagination).toEqual({ page: 1, limit: 20, total: 2 });
    expect(all.body.data).toHaveLength(2);
    expect(all.body.data[0]).not.toHaveProperty("blocks");

    const filtered = await request(app).get("/api/conversations?topic=convenience_store");
    expect(filtered.body.pagination.total).toBe(1);
    expect(filtered.body.data[0]).toMatchObject({
      id: "conv-789",
      title: "コンビニで",
      topic: "convenience_store",
      level: "N4"
    });
  });

  it("returns a full conversation by id", async () => {
    await request(app).post("/api/admin/conversations").set(admin).send(conversationPayload);

    const res = await request(app).get("/api/conversations/conv-789");
    expect(res.status).toBe(200);
    expect(res.body.blocks).toHaveLength(2);
    expect(res.body.blocks[0]).toMatchObject({ speaker: "Clerk", type: "dialogue" });
    expect(res.body.createdAt).toBeTruthy();
    expect(res.body.updatedAt).toBeTruthy();
  });

  it("returns 404 for a missing conversation", async () => {
    const res = await request(app).get("/api/conversations/missing");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Conversation not found" });
  });
});

describe("public topics", () => {
  it("lists topics sorted by label", async () => {
    const res = await request(app).get("/api/topics");
    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { slug: string }) => t.slug).sort()).toEqual(
      ["convenience_store", "immigration", "train_station"].sort()
    );
    expect(res.body.data[0]).toMatchObject({
      id: expect.any(String),
      slug: expect.any(String),
      label: expect.any(String)
    });
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
      .send({
        ...lyricPayload,
        youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
      });
    expect(created.status).toBe(201);
    expect(created.body.youtubeUrl).toContain("youtube.com");

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

  it("keeps startTime when the editor omits it", async () => {
    await request(app)
      .post("/api/admin/lyrics")
      .set(admin)
      .send({
        id: "song-times",
        title: "Idol",
        artist: "YOASOBI",
        blocks: [
          {
            id: "line-1",
            type: "text",
            content: "[無敵](furigana:む.てき)の笑顔",
            startTime: 0.96
          }
        ]
      });

    const updated = await request(app)
      .put("/api/admin/lyrics/song-times")
      .set(admin)
      .send({
        translation: "Idol - YOASOBI",
        blocks: [
          {
            id: "line-1",
            type: "text",
            content: "[無敵](furigana:む.てき)の笑顔"
          }
        ]
      });

    expect(updated.status).toBe(200);
    expect(updated.body.translation).toBe("Idol - YOASOBI");
    expect(updated.body.blocks[0].startTime).toBe(0.96);
  });
});

describe("admin conversations", () => {
  it("rejects requests without an admin key", async () => {
    const res = await request(app).post("/api/admin/conversations").send(conversationPayload);
    expect(res.status).toBe(401);
  });

  it("creates, updates, and deletes a conversation", async () => {
    const created = await request(app)
      .post("/api/admin/conversations")
      .set(admin)
      .send(conversationPayload);
    expect(created.status).toBe(201);
    expect(created.body.blocks[0]).toMatchObject({
      type: "dialogue",
      speaker: "Clerk",
      notes: "Set phrase said by any shop clerk when a customer enters."
    });

    const updated = await request(app)
      .put("/api/admin/conversations/conv-789")
      .set(admin)
      .send({ title: "コンビニで updated" });
    expect(updated.status).toBe(200);
    expect(updated.body.title).toBe("コンビニで updated");
    expect(updated.body.blocks).toHaveLength(2);

    const deleted = await request(app)
      .delete("/api/admin/conversations/conv-789")
      .set(admin);
    expect(deleted.status).toBe(204);

    const missing = await request(app).get("/api/conversations/conv-789");
    expect(missing.status).toBe(404);
  });

  it("validates dialogue blocks require a speaker", async () => {
    const res = await request(app)
      .post("/api/admin/conversations")
      .set(admin)
      .send({
        title: "Bad",
        topic: "convenience_store",
        blocks: [{ type: "dialogue", content: "no speaker" }]
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("rejects an unregistered topic on create", async () => {
    const res = await request(app)
      .post("/api/admin/conversations")
      .set(admin)
      .send({ ...conversationPayload, id: "conv-unknown-topic", topic: "not_a_real_topic" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown topic/);
  });

  it("rejects an unregistered topic on update", async () => {
    await request(app).post("/api/admin/conversations").set(admin).send(conversationPayload);

    const res = await request(app)
      .put("/api/admin/conversations/conv-789")
      .set(admin)
      .send({ topic: "not_a_real_topic" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown topic/);

    const unchanged = await request(app).get("/api/conversations/conv-789");
    expect(unchanged.body.topic).toBe("convenience_store");
  });
});

describe("admin topics", () => {
  it("rejects requests without an admin key", async () => {
    const res = await request(app)
      .post("/api/admin/topics")
      .send({ slug: "airport", label: "Airport" });
    expect(res.status).toBe(401);
  });

  it("creates a topic and rejects a duplicate slug", async () => {
    const created = await request(app)
      .post("/api/admin/topics")
      .set(admin)
      .send({ slug: "airport", label: "Airport" });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ slug: "airport", label: "Airport" });

    const listed = await request(app).get("/api/topics");
    expect(listed.body.data.some((t: { slug: string }) => t.slug === "airport")).toBe(true);

    const duplicate = await request(app)
      .post("/api/admin/topics")
      .set(admin)
      .send({ slug: "airport", label: "Airport (again)" });
    expect(duplicate.status).toBe(409);
  });

  it("rejects a slug that is not snake_case", async () => {
    const res = await request(app)
      .post("/api/admin/topics")
      .set(admin)
      .send({ slug: "Not Snake Case!", label: "Bad" });
    expect(res.status).toBe(400);
  });

  it("lets a newly created topic be used by a conversation", async () => {
    await request(app).post("/api/admin/topics").set(admin).send({ slug: "airport", label: "Airport" });

    const res = await request(app)
      .post("/api/admin/conversations")
      .set(admin)
      .send({ ...conversationPayload, id: "conv-airport", topic: "airport" });
    expect(res.status).toBe(201);
    expect(res.body.topic).toBe("airport");
  });
});

describe("admin tokenize", () => {
  it("returns 503 when Gemini is not configured", async () => {
    const res = await request(app)
      .post("/api/admin/tokenize")
      .set(admin)
      .send({ text: "家族", kind: "story" });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/GEMINI_API_KEY/);
  });

  it("rejects empty text", async () => {
    const res = await request(app)
      .post("/api/admin/tokenize")
      .set(admin)
      .send({ text: "  " });
    expect(res.status).toBe(400);
  });

  it("accepts kind=conversation", async () => {
    const res = await request(app)
      .post("/api/admin/tokenize")
      .set(admin)
      .send({ text: "いらっしゃいませ", kind: "conversation" });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/GEMINI_API_KEY/);
  });

  it("lists preferred models only when Gemini is not configured", async () => {
    const res = await request(app).get("/api/admin/gemini/models").set(admin);
    expect(res.status).toBe(503);
  });
});

describe("admin import", () => {
  it("imports stories, lyrics, and conversations from a batch json", async () => {
    const res = await request(app)
      .post("/api/admin/import")
      .set(admin)
      .send({
        stories: [{ title: "川", level: "N5", blocks: [{ type: "text", content: "[川](furigana:かわ)" }] }],
        lyrics: [{ title: "Umi", artist: "Test", blocks: [{ type: "header", content: "A" }] }],
        conversations: [
          {
            title: "コンビニで",
            topic: "convenience_store",
            blocks: [{ type: "dialogue", speaker: "Clerk", content: "[いらっしゃいませ](furigana:いらっしゃいませ)" }]
          }
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.created.stories).toHaveLength(1);
    expect(res.body.created.lyrics).toHaveLength(1);
    expect(res.body.created.conversations).toHaveLength(1);
    expect(res.body.created.stories[0].title).toBe("川");
    expect(res.body.created.conversations[0]).toMatchObject({
      title: "コンビニで",
      topic: "convenience_store"
    });

    const stories = await request(app).get("/api/stories");
    expect(stories.body.data.some((item: { title: string }) => item.title === "川")).toBe(true);

    const conversations = await request(app).get("/api/conversations");
    expect(
      conversations.body.data.some((item: { title: string }) => item.title === "コンビニで")
    ).toBe(true);
  });

  it("wraps a single story object and updates when id exists", async () => {
    const created = await request(app)
      .post("/api/admin/import")
      .set(admin)
      .send({ id: "import-1", title: "旧", level: "N4" });
    expect(created.status).toBe(200);
    expect(created.body.created.stories[0].id).toBe("import-1");

    const updated = await request(app)
      .post("/api/admin/import")
      .set(admin)
      .send({ id: "import-1", title: "新", level: "N3" });
    expect(updated.body.updated.stories[0].title).toBe("新");
    expect(updated.body.created.stories).toHaveLength(0);
  });

  it("wraps a single conversation object by its topic field", async () => {
    const res = await request(app)
      .post("/api/admin/import")
      .set(admin)
      .send({
        id: "import-conv-1",
        title: "駅で",
        topic: "train_station",
        blocks: [{ type: "dialogue", speaker: "Staff", content: "[切符](furigana:きっぷ)はありますか" }]
      });
    expect(res.status).toBe(200);
    expect(res.body.created.conversations[0]).toMatchObject({
      id: "import-conv-1",
      title: "駅で",
      topic: "train_station"
    });
  });

  it("reports a per-item error for an unregistered topic instead of failing the whole batch", async () => {
    const res = await request(app)
      .post("/api/admin/import")
      .set(admin)
      .send({
        stories: [{ title: "川", level: "N5", blocks: [{ type: "text", content: "[川](furigana:かわ)" }] }],
        conversations: [
          {
            title: "Bad topic",
            topic: "not_a_real_topic",
            blocks: [{ type: "dialogue", speaker: "A", content: "テスト" }]
          }
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.created.stories).toHaveLength(1);
    expect(res.body.created.conversations).toHaveLength(0);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0]).toMatchObject({ type: "conversation", index: 0 });
    expect(res.body.errors[0].error).toMatch(/Unknown topic/);
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
