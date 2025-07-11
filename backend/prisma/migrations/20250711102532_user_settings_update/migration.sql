/*
  Warnings:

  - The values [SMS,WEBHOOK] on the enum `NotificationChannel` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[telegramChatId]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[telegramLinkToken]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "NotificationChannel_new" AS ENUM ('IN_APP', 'EMAIL', 'PUSH', 'TELEGRAM');
ALTER TABLE "Notifications" ALTER COLUMN "channel" TYPE "NotificationChannel_new"[] USING ("channel"::text::"NotificationChannel_new"[]);
ALTER TYPE "NotificationChannel" RENAME TO "NotificationChannel_old";
ALTER TYPE "NotificationChannel_new" RENAME TO "NotificationChannel";
DROP TYPE "NotificationChannel_old";
COMMIT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "telegramChatId" TEXT,
ADD COLUMN     "telegramLinkToken" TEXT;

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parameter" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_parameter_key" ON "UserSettings"("userId", "parameter");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramLinkToken_key" ON "User"("telegramLinkToken");

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
