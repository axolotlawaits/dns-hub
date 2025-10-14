/*
  Warnings:

  - You are about to drop the `Merch` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "MerchCard" DROP CONSTRAINT "MerchCard_categoryId_fkey";

-- DropTable
DROP TABLE "Merch";

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "children" TEXT NOT NULL DEFAULT '[]',
    "layer" INTEGER NOT NULL,
    "imageUrl" TEXT,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MerchCard" ADD CONSTRAINT "MerchCard_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
