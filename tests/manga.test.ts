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

function ingestPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    schema_version: "1.0",
    volume_id: "b3a1e6f0-2c3d-4a9e-9f7a-1d2e3f4a5b6c",
    title: "My Dress-Up Darling",
    volume_number: "1",
    total_pages: 1,
    cover_url: "http://localhost:3000/uploads/cover.png",
    pages: [
      {
        page_index: 0,
        image_url: "http://localhost:3000/uploads/vol1_p000.png",
        image_checksum: `sha256:${PNG_CHECKSUM}`,
        width: 1600,
        height: 2400,
        dialogues: [
          {
            dialogue_box: { x: 120, y: 340, width: 220, height: 90 },
            full_text: "綺麗だろぉ",
            tokens: ["綺麗", "だろ", "ぉ"],
            furigana: "[綺麗](furigana:き.れい)だろぉ",
            morphology: [
              { surface: "綺麗", pos: "adjetivo-na" },
              { surface: "だろ", pos: "auxiliar" },
              { surface: "ぉ", pos: "partícula" }
            ]
          }
        ]
      }
    ],
    ...overrides
  };
}

beforeEach(async () => {
  await prisma.mangaDialogue.deleteMany();
  await prisma.mangaPage.deleteMany();
  await prisma.mangaVolume.deleteMany();
  await prisma.mangaImageAsset.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
  fs.rmSync("uploads-test", { recursive: true, force: true });
});

describe("admin manga ingest", () => {
  it("rejects without admin key", async () => {
    const res = await request(app).post("/api/admin/manga/ingest").send(ingestPayload());
    expect(res.status).toBe(401);
  });

  it("rejects an unsupported schema_version", async () => {
    const res = await request(app)
      .post("/api/admin/manga/ingest")
      .set(admin)
      .send(ingestPayload({ schema_version: "9.9" }));
    expect(res.status).toBe(400);
  });

  it("creates a volume with pages and dialogues", async () => {
    const res = await request(app).post("/api/admin/manga/ingest").set(admin).send(ingestPayload());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      volume_id: "b3a1e6f0-2c3d-4a9e-9f7a-1d2e3f4a5b6c",
      created: true,
      pages_upserted: 1
    });

    const volume = await prisma.mangaVolume.findUnique({
      where: { id: "b3a1e6f0-2c3d-4a9e-9f7a-1d2e3f4a5b6c" },
      include: { pages: { include: { dialogues: true } } }
    });
    expect(volume?.pages).toHaveLength(1);
    expect(volume?.pages[0].dialogues).toHaveLength(1);
    expect(volume?.pages[0].imageChecksum).toBe(PNG_CHECKSUM);
    expect(volume?.coverUrl).toBe("http://localhost:3000/uploads/cover.png");
  });

  it("clears cover_url when a later ingest omits it", async () => {
    await request(app).post("/api/admin/manga/ingest").set(admin).send(ingestPayload());
    await request(app)
      .post("/api/admin/manga/ingest")
      .set(admin)
      .send(ingestPayload({ cover_url: undefined }));

    const volume = await prisma.mangaVolume.findUnique({
      where: { id: "b3a1e6f0-2c3d-4a9e-9f7a-1d2e3f4a5b6c" }
    });
    expect(volume?.coverUrl).toBeNull();
  });

  it("is idempotent: re-ingesting the same payload does not duplicate pages or dialogues", async () => {
    await request(app).post("/api/admin/manga/ingest").set(admin).send(ingestPayload());
    const second = await request(app).post("/api/admin/manga/ingest").set(admin).send(ingestPayload());

    expect(second.status).toBe(200);
    expect(second.body.created).toBe(false);

    const volume = await prisma.mangaVolume.findUnique({
      where: { id: "b3a1e6f0-2c3d-4a9e-9f7a-1d2e3f4a5b6c" },
      include: { pages: { include: { dialogues: true } } }
    });
    expect(volume?.pages).toHaveLength(1);
    expect(volume?.pages[0].dialogues).toHaveLength(1);
  });
});

describe("admin manga upload-image", () => {
  it("stores a new image and returns already_existed: false", async () => {
    const res = await request(app)
      .post("/api/admin/manga/upload-image")
      .set(admin)
      .field("image_checksum", PNG_CHECKSUM)
      .attach("image", PNG, { filename: "p000.png", contentType: "image/png" });

    expect(res.status).toBe(200);
    expect(res.body.already_existed).toBe(false);
    expect(res.body.image_url).toMatch(/^http:\/\/localhost:3000\/uploads\/.+\.png$/);
  });

  it("dedupes a second upload of the same bytes", async () => {
    const first = await request(app)
      .post("/api/admin/manga/upload-image")
      .set(admin)
      .field("image_checksum", PNG_CHECKSUM)
      .attach("image", PNG, { filename: "p000.png", contentType: "image/png" });

    const second = await request(app)
      .post("/api/admin/manga/upload-image")
      .set(admin)
      .field("image_checksum", PNG_CHECKSUM)
      .attach("image", PNG, { filename: "retry.png", contentType: "image/png" });

    expect(second.status).toBe(200);
    expect(second.body.already_existed).toBe(true);
    expect(second.body.image_url).toBe(first.body.image_url);
  });

  it("rejects a checksum that doesn't match the uploaded bytes", async () => {
    const res = await request(app)
      .post("/api/admin/manga/upload-image")
      .set(admin)
      .field("image_checksum", "0".repeat(64))
      .attach("image", PNG, { filename: "p000.png", contentType: "image/png" });

    expect(res.status).toBe(400);
  });
});

describe("public manga read API", () => {
  beforeEach(async () => {
    await request(app).post("/api/admin/manga/ingest").set(admin).send(ingestPayload());
  });

  it("lists volume summaries without page detail", async () => {
    const res = await request(app).get("/api/manga");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      id: "b3a1e6f0-2c3d-4a9e-9f7a-1d2e3f4a5b6c",
      title: "My Dress-Up Darling",
      page_count: 1,
      cover_url: "http://localhost:3000/uploads/cover.png"
    });
    expect(res.body.data[0].pages).toBeUndefined();
  });

  it("returns full page and dialogue detail", async () => {
    const res = await request(app).get("/api/manga/b3a1e6f0-2c3d-4a9e-9f7a-1d2e3f4a5b6c");
    expect(res.status).toBe(200);
    expect(res.body.cover_url).toBe("http://localhost:3000/uploads/cover.png");
    expect(res.body.pages).toHaveLength(1);
    expect(res.body.pages[0].dialogues[0]).toMatchObject({
      dialogue_index: 0,
      dialogue_box: { x: 120, y: 340, width: 220, height: 90 },
      full_text: "綺麗だろぉ",
      tokens: ["綺麗", "だろ", "ぉ"]
    });
  });

  it("404s for an unknown volume", async () => {
    const res = await request(app).get("/api/manga/does-not-exist");
    expect(res.status).toBe(404);
  });
});

describe("admin manga page/dialogue editing", () => {
  beforeEach(async () => {
    await request(app).post("/api/admin/manga/ingest").set(admin).send(ingestPayload());
  });

  it("patches a single dialogue", async () => {
    const res = await request(app)
      .patch("/api/admin/manga/b3a1e6f0-2c3d-4a9e-9f7a-1d2e3f4a5b6c/pages/0/dialogues/0")
      .set(admin)
      .send({ full_text: "綺麗だろう" });

    expect(res.status).toBe(200);
    expect(res.body.full_text).toBe("綺麗だろう");
  });

  it("404s patching a dialogue on an unknown page", async () => {
    const res = await request(app)
      .patch("/api/admin/manga/b3a1e6f0-2c3d-4a9e-9f7a-1d2e3f4a5b6c/pages/9/dialogues/0")
      .set(admin)
      .send({ full_text: "x" });

    expect(res.status).toBe(404);
  });

  it("deletes a page and cascades its dialogues", async () => {
    const res = await request(app)
      .delete("/api/admin/manga/b3a1e6f0-2c3d-4a9e-9f7a-1d2e3f4a5b6c/pages/0")
      .set(admin);

    expect(res.status).toBe(204);
    expect(await prisma.mangaPage.count()).toBe(0);
    expect(await prisma.mangaDialogue.count()).toBe(0);
  });
});

describe("admin manga volume metadata", () => {
  beforeEach(async () => {
    await request(app).post("/api/admin/manga/ingest").set(admin).send(ingestPayload());
  });

  it("patches cover_url without touching pages", async () => {
    const res = await request(app)
      .patch("/api/admin/manga/b3a1e6f0-2c3d-4a9e-9f7a-1d2e3f4a5b6c")
      .set(admin)
      .send({ cover_url: "http://localhost:3000/uploads/new-cover.png" });

    expect(res.status).toBe(200);
    expect(res.body.cover_url).toBe("http://localhost:3000/uploads/new-cover.png");
    expect(res.body.pages).toHaveLength(1);
  });

  it("clears cover_url when explicitly set to null", async () => {
    const res = await request(app)
      .patch("/api/admin/manga/b3a1e6f0-2c3d-4a9e-9f7a-1d2e3f4a5b6c")
      .set(admin)
      .send({ cover_url: null });

    expect(res.status).toBe(200);
    expect(res.body.cover_url).toBeNull();
  });

  it("rejects an empty patch body", async () => {
    const res = await request(app)
      .patch("/api/admin/manga/b3a1e6f0-2c3d-4a9e-9f7a-1d2e3f4a5b6c")
      .set(admin)
      .send({});

    expect(res.status).toBe(400);
  });

  it("404s patching an unknown volume", async () => {
    const res = await request(app)
      .patch("/api/admin/manga/does-not-exist")
      .set(admin)
      .send({ cover_url: "http://localhost:3000/uploads/x.png" });

    expect(res.status).toBe(404);
  });
});
