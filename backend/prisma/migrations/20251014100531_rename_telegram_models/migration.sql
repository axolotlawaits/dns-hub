/*
  Warnings:

  - You are about to drop the `TelegramUser` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TelegramUserStats` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "TelegramUserStats" DROP CONSTRAINT "TelegramUserStats_userId_fkey";

-- DropTable
DROP TABLE "TelegramUser";

-- DropTable
DROP TABLE "TelegramUserStats";

-- CreateTable
CREATE TABLE "MerchTgUser" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchTgUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchTgUserStats" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchTgUserStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MerchTgUser_userId_key" ON "MerchTgUser"("userId");

-- AddForeignKey
ALTER TABLE "MerchTgUserStats" ADD CONSTRAINT "MerchTgUserStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "MerchTgUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
