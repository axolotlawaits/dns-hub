/*
  Warnings:

  - You are about to drop the column `activity` on the `Devices` table. All the data in the column will be lost.
  - You are about to drop the column `lastSeen` on the `Devices` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Devices" DROP COLUMN "activity",
DROP COLUMN "lastSeen";

-- AlterTable
ALTER TABLE "RKAttachment" ADD COLUMN     "parentAttachmentId" TEXT;

-- AddForeignKey
ALTER TABLE "RKAttachment" ADD CONSTRAINT "RKAttachment_parentAttachmentId_fkey" FOREIGN KEY ("parentAttachmentId") REFERENCES "RKAttachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
