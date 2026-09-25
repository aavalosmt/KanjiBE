-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'ja';

-- CreateIndex
CREATE INDEX "Conversation_language_idx" ON "Conversation"("language");
