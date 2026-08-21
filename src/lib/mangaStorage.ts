import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { prisma } from "../db.js";

const EXT_BY_MIME = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"]
]);

export type StoredMangaImage = {
  url: string;
  checksum: string;
  alreadyExisted: boolean;
};

/**
 * Local-disk backed for now. Swapping to an object store later only means
 * changing this function's body — callers only ever see { url, checksum }.
 */
export async function storeMangaImage(
  buffer: Buffer,
  mimetype: string
): Promise<StoredMangaImage> {
  const checksum = createHash("sha256").update(buffer).digest("hex");

  const existing = await prisma.mangaImageAsset.findUnique({ where: { checksum } });
  if (existing) {
    return { url: existing.url, checksum, alreadyExisted: true };
  }

  fs.mkdirSync(config.uploadDir, { recursive: true });
  const ext = EXT_BY_MIME.get(mimetype) ?? ".jpg";
  const filename = `${randomUUID()}${ext}`;
  fs.writeFileSync(path.join(config.uploadDir, filename), buffer);
  const url = `${config.publicBaseUrl}/uploads/${filename}`;

  try {
    await prisma.mangaImageAsset.create({ data: { checksum, url } });
  } catch {
    const raced = await prisma.mangaImageAsset.findUnique({ where: { checksum } });
    if (raced) {
      fs.rmSync(path.join(config.uploadDir, filename), { force: true });
      return { url: raced.url, checksum, alreadyExisted: true };
    }
    throw new Error("Failed to record uploaded manga image");
  }

  return { url, checksum, alreadyExisted: false };
}

export const MANGA_IMAGE_MIME_TYPES = new Set(EXT_BY_MIME.keys());
