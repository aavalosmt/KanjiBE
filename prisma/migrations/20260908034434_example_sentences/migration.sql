-- Standalone example sentences attached to a registered (topic, subtopic) pair.
-- Independent of VocabularySet: a subtopic can have example sentences with no set.
-- The base translation is English; other locales live in the Translation table
-- with entityType "exampleSentence".

-- CreateTable
CREATE TABLE "ExampleSentence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicSlug" TEXT NOT NULL,
    "subtopicSlug" TEXT NOT NULL,
    "sentenceIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "furigana" TEXT NOT NULL,
    "translation" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "ExampleSentence_topicSlug_subtopicSlug_idx" ON "ExampleSentence"("topicSlug", "subtopicSlug");

-- CreateIndex
CREATE UNIQUE INDEX "ExampleSentence_topicSlug_subtopicSlug_sentenceIndex_key" ON "ExampleSentence"("topicSlug", "subtopicSlug", "sentenceIndex");
