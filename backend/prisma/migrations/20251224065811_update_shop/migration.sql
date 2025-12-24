/*
  Warnings:

  - You are about to drop the column `contactEmail` on the `Shop` table. All the data in the column will be lost.
  - You are about to drop the column `contactName` on the `Shop` table. All the data in the column will be lost.
  - You are about to drop the column `contactPhone` on the `Shop` table. All the data in the column will be lost.
  - You are about to drop the `ShopImage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ShopItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ShopItemReserve` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ShopRequest` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ShopImage" DROP CONSTRAINT "ShopImage_shopId_fkey";

-- DropForeignKey
ALTER TABLE "ShopItem" DROP CONSTRAINT "ShopItem_shopId_fkey";

-- DropForeignKey
ALTER TABLE "ShopItemReserve" DROP CONSTRAINT "ShopItemReserve_itemId_fkey";

-- DropForeignKey
ALTER TABLE "ShopItemReserve" DROP CONSTRAINT "ShopItemReserve_requestId_fkey";

-- DropForeignKey
ALTER TABLE "ShopRequest" DROP CONSTRAINT "ShopRequest_requesterBranchId_fkey";

-- DropForeignKey
ALTER TABLE "ShopRequest" DROP CONSTRAINT "ShopRequest_requesterId_fkey";

-- DropForeignKey
ALTER TABLE "ShopRequest" DROP CONSTRAINT "ShopRequest_shopId_fkey";

-- AlterTable
ALTER TABLE "Shop" DROP COLUMN "contactEmail",
DROP COLUMN "contactName",
DROP COLUMN "contactPhone",
ADD COLUMN     "article" TEXT,
ADD COLUMN     "condition" "ItemCondition" NOT NULL DEFAULT 'GOOD',
ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1;

-- DropTable
DROP TABLE "ShopImage";

-- DropTable
DROP TABLE "ShopItem";

-- DropTable
DROP TABLE "ShopItemReserve";

-- DropTable
DROP TABLE "ShopRequest";

-- DropEnum
DROP TYPE "ShopRequestStatus";

-- CreateTable
CREATE TABLE "ShopAttachment" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopReserve" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "branchId" TEXT,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "shipmentDocNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ShopReserve_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "readAt" TIMESTAMP(3),
    "parentId" TEXT,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopAttachment_shopId_idx" ON "ShopAttachment"("shopId");

-- CreateIndex
CREATE INDEX "ShopAttachment_shopId_sortOrder_idx" ON "ShopAttachment"("shopId", "sortOrder");

-- CreateIndex
CREATE INDEX "ShopReserve_shopId_idx" ON "ShopReserve"("shopId");

-- CreateIndex
CREATE INDEX "ShopReserve_requesterId_idx" ON "ShopReserve"("requesterId");

-- CreateIndex
CREATE INDEX "ShopReserve_status_idx" ON "ShopReserve"("status");

-- CreateIndex
CREATE INDEX "Comment_entityType_entityId_idx" ON "Comment"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Comment_senderId_idx" ON "Comment"("senderId");

-- CreateIndex
CREATE INDEX "Comment_entityType_entityId_createdAt_idx" ON "Comment"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");

-- AddForeignKey
ALTER TABLE "ShopAttachment" ADD CONSTRAINT "ShopAttachment_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopReserve" ADD CONSTRAINT "ShopReserve_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopReserve" ADD CONSTRAINT "ShopReserve_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopReserve" ADD CONSTRAINT "ShopReserve_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
