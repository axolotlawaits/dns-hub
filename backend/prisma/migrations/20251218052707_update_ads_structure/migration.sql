-- CreateEnum
CREATE TYPE "AdStatus" AS ENUM ('ACTIVE', 'SOLD', 'ARCHIVED', 'MODERATION');

-- CreateEnum
CREATE TYPE "ItemCondition" AS ENUM ('NEW', 'EXCELLENT', 'GOOD', 'SATISFACTORY', 'POOR');

-- CreateTable
CREATE TABLE "AdCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ad" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" "AdStatus" NOT NULL DEFAULT 'ACTIVE',
    "userId" TEXT NOT NULL,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "isPromoted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "Ad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdItem" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "article" TEXT,
    "description" TEXT,
    "condition" "ItemCondition" NOT NULL DEFAULT 'GOOD',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdImage" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdFavorite" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdCategory_parentId_idx" ON "AdCategory"("parentId");

-- CreateIndex
CREATE INDEX "AdCategory_isActive_idx" ON "AdCategory"("isActive");

-- CreateIndex
CREATE INDEX "AdCategory_sortOrder_idx" ON "AdCategory"("sortOrder");

-- CreateIndex
CREATE INDEX "Ad_categoryId_idx" ON "Ad"("categoryId");

-- CreateIndex
CREATE INDEX "Ad_branchId_idx" ON "Ad"("branchId");

-- CreateIndex
CREATE INDEX "Ad_status_idx" ON "Ad"("status");

-- CreateIndex
CREATE INDEX "Ad_userId_idx" ON "Ad"("userId");

-- CreateIndex
CREATE INDEX "Ad_createdAt_idx" ON "Ad"("createdAt");

-- CreateIndex
CREATE INDEX "Ad_status_createdAt_idx" ON "Ad"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Ad_isPromoted_status_idx" ON "Ad"("isPromoted", "status");

-- CreateIndex
CREATE INDEX "AdItem_adId_idx" ON "AdItem"("adId");

-- CreateIndex
CREATE INDEX "AdItem_adId_sortOrder_idx" ON "AdItem"("adId", "sortOrder");

-- CreateIndex
CREATE INDEX "AdImage_adId_idx" ON "AdImage"("adId");

-- CreateIndex
CREATE INDEX "AdImage_adId_sortOrder_idx" ON "AdImage"("adId", "sortOrder");

-- CreateIndex
CREATE INDEX "AdFavorite_userId_idx" ON "AdFavorite"("userId");

-- CreateIndex
CREATE INDEX "AdFavorite_adId_idx" ON "AdFavorite"("adId");

-- CreateIndex
CREATE UNIQUE INDEX "AdFavorite_adId_userId_key" ON "AdFavorite"("adId", "userId");

-- AddForeignKey
ALTER TABLE "AdCategory" ADD CONSTRAINT "AdCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AdCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AdCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdItem" ADD CONSTRAINT "AdItem_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdImage" ADD CONSTRAINT "AdImage_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdFavorite" ADD CONSTRAINT "AdFavorite_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdFavorite" ADD CONSTRAINT "AdFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
