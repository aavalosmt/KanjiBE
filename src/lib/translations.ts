import { prisma } from "../db.js";
import { config } from "../config.js";
import { asString } from "./pagination.js";

export type EntityType =
  | "story"
  | "lyric"
  | "conversation"
  | "vocabularyWord"
  | "exampleSentence";

// The language the existing translation columns / embedded block JSON
// already represent. The Translation table never stores this locale — it
// only layers additional languages on top.
export const LEGACY_LANG = "es";

// Example sentences are newer content and store their base translation in
// English instead of Spanish; Spanish/others are overlays.
export const EXAMPLE_SENTENCE_BASE_LANG = "en";

// blockId used for an item's own title-level translation, as opposed to one
// of its blocks.
export const ITEM_BLOCK_ID = "";

export function normalizeLang(value: unknown): string {
  const raw = asString(value);
  return (raw ? raw.toLowerCase() : config.defaultLang).toLowerCase();
}

export type ResolvedTranslation = { text: string | null; lang: string };

export function resolveText(
  legacyText: string | null | undefined,
  overlayText: string | undefined,
  lang: string,
  baseLang: string = LEGACY_LANG
): ResolvedTranslation {
  if (lang !== baseLang && overlayText !== undefined) {
    return { text: overlayText, lang };
  }
  return { text: legacyText ?? null, lang: baseLang };
}

export type EntityOverlay = Map<string, string>;
export type TranslationOverlay = Map<string, EntityOverlay>;

export async function fetchTranslationOverlay(
  entityType: EntityType,
  entityIds: string[],
  lang: string,
  baseLang: string = LEGACY_LANG
): Promise<TranslationOverlay> {
  const overlay: TranslationOverlay = new Map();
  if (lang === baseLang || entityIds.length === 0) {
    return overlay;
  }

  const rows = await prisma.translation.findMany({
    where: { entityType, entityId: { in: entityIds }, locale: lang }
  });

  for (const row of rows) {
    let byBlock = overlay.get(row.entityId);
    if (!byBlock) {
      byBlock = new Map();
      overlay.set(row.entityId, byBlock);
    }
    byBlock.set(row.blockId, row.text);
  }

  return overlay;
}

export async function upsertTranslationOverlay(input: {
  entityType: EntityType;
  entityId: string;
  lang: string;
  translation?: string | null;
  blocks?: Array<{ id: string; translation: string | null }>;
}): Promise<void> {
  const toUpsert: Array<{ blockId: string; text: string }> = [];
  const toDelete: string[] = [];

  const note = (blockId: string, text: string | null | undefined) => {
    if (text === undefined) return;
    if (text === null) toDelete.push(blockId);
    else toUpsert.push({ blockId, text });
  };

  note(ITEM_BLOCK_ID, input.translation);
  for (const block of input.blocks ?? []) {
    note(block.id, block.translation);
  }

  await prisma.$transaction([
    ...toUpsert.map((row) =>
      prisma.translation.upsert({
        where: {
          entityType_entityId_blockId_locale: {
            entityType: input.entityType,
            entityId: input.entityId,
            blockId: row.blockId,
            locale: input.lang
          }
        },
        create: {
          entityType: input.entityType,
          entityId: input.entityId,
          blockId: row.blockId,
          locale: input.lang,
          text: row.text
        },
        update: { text: row.text }
      })
    ),
    ...(toDelete.length
      ? [
          prisma.translation.deleteMany({
            where: {
              entityType: input.entityType,
              entityId: input.entityId,
              blockId: { in: toDelete },
              locale: input.lang
            }
          })
        ]
      : [])
  ]);
}

// Returns the (unawaited) Prisma operation so callers can either `await` it
// standalone or include it in a `prisma.$transaction([...])` batch alongside
// the row delete/update it accompanies.
export function deleteEntityTranslations(entityType: EntityType, entityId: string) {
  return prisma.translation.deleteMany({ where: { entityType, entityId } });
}

export function pruneOrphanedBlockTranslations(
  entityType: EntityType,
  entityId: string,
  keepBlockIds: string[]
) {
  return prisma.translation.deleteMany({
    where: {
      entityType,
      entityId,
      blockId: { notIn: [ITEM_BLOCK_ID, ...keepBlockIds] }
    }
  });
}
