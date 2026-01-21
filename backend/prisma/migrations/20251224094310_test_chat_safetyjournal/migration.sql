-- CreateTable
CREATE TABLE "SafetyJournalChat" (
    "id" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "checkerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafetyJournalChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyJournalChatMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafetyJournalChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SafetyJournalChat_journalId_idx" ON "SafetyJournalChat"("journalId");

-- CreateIndex
CREATE INDEX "SafetyJournalChat_checkerId_idx" ON "SafetyJournalChat"("checkerId");

-- CreateIndex
CREATE INDEX "SafetyJournalChat_updatedAt_idx" ON "SafetyJournalChat"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SafetyJournalChat_journalId_checkerId_key" ON "SafetyJournalChat"("journalId", "checkerId");

-- CreateIndex
CREATE INDEX "SafetyJournalChatMessage_chatId_idx" ON "SafetyJournalChatMessage"("chatId");

-- CreateIndex
CREATE INDEX "SafetyJournalChatMessage_senderId_idx" ON "SafetyJournalChatMessage"("senderId");

-- CreateIndex
CREATE INDEX "SafetyJournalChatMessage_chatId_createdAt_idx" ON "SafetyJournalChatMessage"("chatId", "createdAt");

-- AddForeignKey
ALTER TABLE "SafetyJournalChat" ADD CONSTRAINT "SafetyJournalChat_checkerId_fkey" FOREIGN KEY ("checkerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyJournalChatMessage" ADD CONSTRAINT "SafetyJournalChatMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "SafetyJournalChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyJournalChatMessage" ADD CONSTRAINT "SafetyJournalChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
