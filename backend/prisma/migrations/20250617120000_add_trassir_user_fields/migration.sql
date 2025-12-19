-- AlterTable
ALTER TABLE "User" ADD COLUMN "trassirChatId" TEXT;
ALTER TABLE "User" ADD COLUMN "trassirLinkToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_trassirChatId_key" ON "User"("trassirChatId");

-- CreateIndex
CREATE UNIQUE INDEX "User_trassirLinkToken_key" ON "User"("trassirLinkToken");

