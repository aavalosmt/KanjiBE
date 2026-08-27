-- Additional-language overlay for the existing (Spanish) translation
-- columns/JSON on Story/Lyric/Conversation/VocabularyWord. Nothing about
-- those existing columns changes or gets copied here; this table only ever
-- holds languages layered on top of them.

-- CreateTable
CREATE TABLE "Translation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL DEFAULT '',
    "locale" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Translation_entityType_entityId_blockId_locale_key" ON "Translation"("entityType", "entityId", "blockId", "locale");

-- CreateIndex
CREATE INDEX "Translation_entityType_entityId_idx" ON "Translation"("entityType", "entityId");
