/*
  Warnings:

  - You are about to drop the `AdCategory` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Ad" DROP CONSTRAINT "Ad_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "AdCategory" DROP CONSTRAINT "AdCategory_parentId_fkey";

-- AlterTable
ALTER TABLE "Type" ADD COLUMN     "parent_type" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "AdCategory";

-- CreateIndex
CREATE INDEX "Type_parent_type_idx" ON "Type"("parent_type");

-- CreateIndex
CREATE INDEX "Type_model_uuid_chapter_idx" ON "Type"("model_uuid", "chapter");

-- CreateIndex
CREATE INDEX "Type_model_uuid_chapter_sortOrder_idx" ON "Type"("model_uuid", "chapter", "sortOrder");

-- CreateIndex
CREATE INDEX "Type_parent_type_sortOrder_idx" ON "Type"("parent_type", "sortOrder");

-- AddForeignKey
ALTER TABLE "Type" ADD CONSTRAINT "Type_parent_type_fkey" FOREIGN KEY ("parent_type") REFERENCES "Type"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
