-- AlterTable
ALTER TABLE "MerchTgUser" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "MerchTgUser_isActive_idx" ON "MerchTgUser"("isActive");
