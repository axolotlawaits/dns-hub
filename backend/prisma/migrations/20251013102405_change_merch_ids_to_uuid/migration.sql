/*
  Warnings:

  - The primary key for the `MerchCard` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the `categories` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "MerchCard" DROP CONSTRAINT "MerchCard_categoryId_fkey";

-- AlterTable
ALTER TABLE "MerchCard" DROP CONSTRAINT "MerchCard_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "categoryId" SET DATA TYPE TEXT,
ADD CONSTRAINT "MerchCard_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "MerchCard_id_seq";

-- DropTable
DROP TABLE "categories";

-- CreateTable
CREATE TABLE "Merch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "children" TEXT NOT NULL DEFAULT '[]',
    "layer" INTEGER NOT NULL,
    "imageUrl" TEXT,

    CONSTRAINT "Merch_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MerchCard" ADD CONSTRAINT "MerchCard_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Merch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
