-- DropForeignKey
ALTER TABLE "RKAttachment" DROP CONSTRAINT "RKAttachment_recordId_fkey";

-- AddForeignKey
ALTER TABLE "RKAttachment" ADD CONSTRAINT "RKAttachment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "RK"("id") ON DELETE CASCADE ON UPDATE CASCADE;
