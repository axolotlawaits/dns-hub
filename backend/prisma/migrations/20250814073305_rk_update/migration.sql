-- DropForeignKey
ALTER TABLE "RKAttachment" DROP CONSTRAINT "RKAttachment_approvalStatusId_fkey";

-- DropForeignKey
ALTER TABLE "RKAttachment" DROP CONSTRAINT "RKAttachment_typeStructureId_fkey";

-- AlterTable
ALTER TABLE "RKAttachment" ALTER COLUMN "approvalStatusId" DROP NOT NULL,
ALTER COLUMN "typeStructureId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "RKAttachment" ADD CONSTRAINT "RKAttachment_typeStructureId_fkey" FOREIGN KEY ("typeStructureId") REFERENCES "Type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RKAttachment" ADD CONSTRAINT "RKAttachment_approvalStatusId_fkey" FOREIGN KEY ("approvalStatusId") REFERENCES "Type"("id") ON DELETE SET NULL ON UPDATE CASCADE;
