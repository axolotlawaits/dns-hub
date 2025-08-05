/*
  Warnings:

  - You are about to drop the column `сlarification` on the `RKAttachment` table. All the data in the column will be lost.
  - Added the required column `clarification` to the `RKAttachment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RKAttachment" DROP COLUMN "сlarification",
ADD COLUMN     "clarification" TEXT NOT NULL;
