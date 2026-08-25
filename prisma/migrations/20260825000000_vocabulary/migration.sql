-- CreateTable
CREATE TABLE "VocabularySet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "setNumber" TEXT,
    "totalPages" INTEGER,
    "coverUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "VocabularyPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "setId" TEXT NOT NULL,
    "pageIndex" INTEGER NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imageChecksum" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VocabularyPage_setId_fkey" FOREIGN KEY ("setId") REFERENCES "VocabularySet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VocabularyEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pageId" TEXT NOT NULL,
    "entryIndex" INTEGER NOT NULL,
    "boxX" INTEGER NOT NULL,
    "boxY" INTEGER NOT NULL,
    "boxWidth" INTEGER NOT NULL,
    "boxHeight" INTEGER NOT NULL,
    "fullText" TEXT NOT NULL,
    "tokens" TEXT NOT NULL,
    "furigana" TEXT NOT NULL,
    "morphology" TEXT NOT NULL,
    CONSTRAINT "VocabularyEntry_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "VocabularyPage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VocabularyImageAsset" (
    "checksum" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyPage_setId_pageIndex_key" ON "VocabularyPage"("setId", "pageIndex");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyEntry_pageId_entryIndex_key" ON "VocabularyEntry"("pageId", "entryIndex");
