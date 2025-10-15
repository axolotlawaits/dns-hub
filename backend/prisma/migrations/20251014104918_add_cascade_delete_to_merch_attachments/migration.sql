-- DropForeignKey
ALTER TABLE "MerchAttachment" DROP CONSTRAINT "MerchAttachment_recordId_fkey";

-- AddForeignKey
ALTER TABLE "MerchAttachment" ADD CONSTRAINT "MerchAttachment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Merch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
