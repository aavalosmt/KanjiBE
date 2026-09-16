-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_VocabularySet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topic" TEXT NOT NULL,
    "subtopic" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "coverUrl" TEXT,
    "layout" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_VocabularySet" ("contentType", "coverUrl", "createdAt", "id", "subtopic", "title", "topic", "updatedAt") SELECT "contentType", "coverUrl", "createdAt", "id", "subtopic", "title", "topic", "updatedAt" FROM "VocabularySet";
DROP TABLE "VocabularySet";
ALTER TABLE "new_VocabularySet" RENAME TO "VocabularySet";
CREATE UNIQUE INDEX "VocabularySet_topic_subtopic_key" ON "VocabularySet"("topic", "subtopic");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
