-- AlterTable
ALTER TABLE "Merch" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "MerchAttachment" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;
