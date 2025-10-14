/*
  Warnings:

  - You are about to drop the column `children` on the `Merch` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Merch" DROP COLUMN "children",
ADD COLUMN     "parentId" TEXT;

-- AddForeignKey
ALTER TABLE "Merch" ADD CONSTRAINT "Merch_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Merch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
