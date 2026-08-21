-- CreateTable
CREATE TABLE "MangaVolume" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "volumeNumber" TEXT,
    "totalPages" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MangaPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "volumeId" TEXT NOT NULL,
    "pageIndex" INTEGER NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imageChecksum" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MangaPage_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "MangaVolume" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MangaDialogue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pageId" TEXT NOT NULL,
    "dialogueIndex" INTEGER NOT NULL,
    "boxX" INTEGER NOT NULL,
    "boxY" INTEGER NOT NULL,
    "boxWidth" INTEGER NOT NULL,
    "boxHeight" INTEGER NOT NULL,
    "fullText" TEXT NOT NULL,
    "tokens" TEXT NOT NULL,
    "furigana" TEXT NOT NULL,
    "morphology" TEXT NOT NULL,
    CONSTRAINT "MangaDialogue_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "MangaPage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MangaImageAsset" (
    "checksum" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "MangaPage_volumeId_pageIndex_key" ON "MangaPage"("volumeId", "pageIndex");

-- CreateIndex
CREATE UNIQUE INDEX "MangaDialogue_pageId_dialogueIndex_key" ON "MangaDialogue"("pageId", "dialogueIndex");
