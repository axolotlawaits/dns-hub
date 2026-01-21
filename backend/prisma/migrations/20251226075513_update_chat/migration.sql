/*
  Warnings:

  - You are about to drop the column `isSystemMessage` on the `SafetyJournalChatMessage` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "SafetyJournalChatMessage" DROP COLUMN "isSystemMessage";
