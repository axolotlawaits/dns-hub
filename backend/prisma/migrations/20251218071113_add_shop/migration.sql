/*
  Warnings:

  - You are about to drop the `Ad` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AdFavorite` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AdImage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AdItem` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ShopStatus" AS ENUM ('ACTIVE', 'SOLD', 'ARCHIVED', 'MODERATION');

-- CreateEnum
CREATE TYPE "ShopRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED');

-- DropForeignKey
ALTER TABLE "Ad" DROP CONSTRAINT "Ad_branchId_fkey";

-- DropForeignKey
ALTER TABLE "Ad" DROP CONSTRAINT "Ad_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "Ad" DROP CONSTRAINT "Ad_userId_fkey";

-- DropForeignKey
ALTER TABLE "AdFavorite" DROP CONSTRAINT "AdFavorite_adId_fkey";

-- DropForeignKey
ALTER TABLE "AdFavorite" DROP CONSTRAINT "AdFavorite_userId_fkey";

-- DropForeignKey
ALTER TABLE "AdImage" DROP CONSTRAINT "AdImage_adId_fkey";

-- DropForeignKey
ALTER TABLE "AdItem" DROP CONSTRAINT "AdItem_adId_fkey";

-- DropTable
DROP TABLE "Ad";

-- DropTable
DROP TABLE "AdFavorite";

-- DropTable
DROP TABLE "AdImage";

-- DropTable
DROP TABLE "AdItem";

-- DropEnum
DROP TYPE "AdStatus";

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" "ShopStatus" NOT NULL DEFAULT 'ACTIVE',
    "userId" TEXT NOT NULL,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "isPromoted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopItem" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "article" TEXT,
    "description" TEXT,
    "condition" "ItemCondition" NOT NULL DEFAULT 'GOOD',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopImage" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopRequest" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "requesterBranchId" TEXT,
    "status" "ShopRequestStatus" NOT NULL DEFAULT 'PENDING',
    "shipmentDocNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ShopRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopItemReserve" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopItemReserve_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Shop_categoryId_idx" ON "Shop"("categoryId");

-- CreateIndex
CREATE INDEX "Shop_branchId_idx" ON "Shop"("branchId");

-- CreateIndex
CREATE INDEX "Shop_status_idx" ON "Shop"("status");

-- CreateIndex
CREATE INDEX "Shop_userId_idx" ON "Shop"("userId");

-- CreateIndex
CREATE INDEX "Shop_createdAt_idx" ON "Shop"("createdAt");

-- CreateIndex
CREATE INDEX "Shop_status_createdAt_idx" ON "Shop"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Shop_isPromoted_status_idx" ON "Shop"("isPromoted", "status");

-- CreateIndex
CREATE INDEX "ShopItem_shopId_idx" ON "ShopItem"("shopId");

-- CreateIndex
CREATE INDEX "ShopItem_shopId_sortOrder_idx" ON "ShopItem"("shopId", "sortOrder");

-- CreateIndex
CREATE INDEX "ShopImage_shopId_idx" ON "ShopImage"("shopId");

-- CreateIndex
CREATE INDEX "ShopImage_shopId_sortOrder_idx" ON "ShopImage"("shopId", "sortOrder");

-- CreateIndex
CREATE INDEX "ShopRequest_shopId_idx" ON "ShopRequest"("shopId");

-- CreateIndex
CREATE INDEX "ShopRequest_requesterId_idx" ON "ShopRequest"("requesterId");

-- CreateIndex
CREATE INDEX "ShopRequest_requesterBranchId_idx" ON "ShopRequest"("requesterBranchId");

-- CreateIndex
CREATE INDEX "ShopRequest_status_idx" ON "ShopRequest"("status");

-- CreateIndex
CREATE INDEX "ShopRequest_shopId_status_idx" ON "ShopRequest"("shopId", "status");

-- CreateIndex
CREATE INDEX "ShopItemReserve_requestId_idx" ON "ShopItemReserve"("requestId");

-- CreateIndex
CREATE INDEX "ShopItemReserve_itemId_idx" ON "ShopItemReserve"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopItemReserve_requestId_itemId_key" ON "ShopItemReserve"("requestId", "itemId");

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopItem" ADD CONSTRAINT "ShopItem_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopImage" ADD CONSTRAINT "ShopImage_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopRequest" ADD CONSTRAINT "ShopRequest_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopRequest" ADD CONSTRAINT "ShopRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopRequest" ADD CONSTRAINT "ShopRequest_requesterBranchId_fkey" FOREIGN KEY ("requesterBranchId") REFERENCES "Branch"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopItemReserve" ADD CONSTRAINT "ShopItemReserve_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ShopRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopItemReserve" ADD CONSTRAINT "ShopItemReserve_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ShopItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
