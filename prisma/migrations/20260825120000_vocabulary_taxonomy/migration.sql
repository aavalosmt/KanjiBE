-- Redesign VocabularySet addressing from an opaque client-supplied id to a
-- registered (topic, subtopic) taxonomy, and add a second "list" content
-- shape alongside the existing image+box one. setNumber/totalPages are
-- dropped since topic/subtopic now carry the organizational structure that
-- volume numbering used to.

-- AlterTable
ALTER TABLE "VocabularySet" ADD COLUMN "topic" TEXT NOT NULL DEFAULT '';
ALTER TABLE "VocabularySet" ADD COLUMN "subtopic" TEXT NOT NULL DEFAULT '';
ALTER TABLE "VocabularySet" ADD COLUMN "contentType" TEXT NOT NULL DEFAULT 'image';
ALTER TABLE "VocabularySet" DROP COLUMN "setNumber";
ALTER TABLE "VocabularySet" DROP COLUMN "totalPages";

-- CreateIndex
CREATE UNIQUE INDEX "VocabularySet_topic_subtopic_key" ON "VocabularySet"("topic", "subtopic");

-- CreateTable
CREATE TABLE "Subtopic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicSlug" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Subtopic_topicSlug_slug_key" ON "Subtopic"("topicSlug", "slug");

-- CreateTable
CREATE TABLE "VocabularyWord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "setId" TEXT NOT NULL,
    "wordIndex" INTEGER NOT NULL,
    "term" TEXT NOT NULL,
    "furigana" TEXT NOT NULL,
    "translation" TEXT NOT NULL,
    CONSTRAINT "VocabularyWord_setId_fkey" FOREIGN KEY ("setId") REFERENCES "VocabularySet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyWord_setId_wordIndex_key" ON "VocabularyWord"("setId", "wordIndex");
