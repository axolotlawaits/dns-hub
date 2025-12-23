-- DropForeignKey
ALTER TABLE "CorrespondenceAttachment" DROP CONSTRAINT "CorrespondenceAttachment_record_id_fkey";

-- AddForeignKey
ALTER TABLE "CorrespondenceAttachment" ADD CONSTRAINT "CorrespondenceAttachment_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "Correspondence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

