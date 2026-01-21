-- AlterTable
ALTER TABLE "SafetyJournalChatMessage" ADD COLUMN     "quotedMessageId" TEXT;

-- CreateIndex
CREATE INDEX "SafetyJournalChatMessage_quotedMessageId_idx" ON "SafetyJournalChatMessage"("quotedMessageId");

-- AddForeignKey
ALTER TABLE "SafetyJournalChatMessage" ADD CONSTRAINT "SafetyJournalChatMessage_quotedMessageId_fkey" FOREIGN KEY ("quotedMessageId") REFERENCES "SafetyJournalChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
