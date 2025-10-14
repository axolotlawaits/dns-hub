/*
  Warnings:

  - You are about to drop the column `parentId` on the `Merch` table. All the data in the column will be lost.
  - You are about to drop the `MerchCard` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `updatedAt` to the `Merch` table without a default value. This is not possible if the table is not empty.
  - Made the column `imageUrl` on table `Merch` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Merch" DROP CONSTRAINT "Merch_parentId_fkey";

-- DropForeignKey
ALTER TABLE "MerchCard" DROP CONSTRAINT "MerchCard_categoryId_fkey";

-- AlterTable
ALTER TABLE "Merch" DROP COLUMN "parentId",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "imageUrl" SET NOT NULL;

-- DropTable
DROP TABLE "MerchCard";

-- CreateTable
CREATE TABLE "MerchAttachment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAddId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,

    CONSTRAINT "MerchAttachment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MerchAttachment" ADD CONSTRAINT "MerchAttachment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Merch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchAttachment" ADD CONSTRAINT "MerchAttachment_userAddId_fkey" FOREIGN KEY ("userAddId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
