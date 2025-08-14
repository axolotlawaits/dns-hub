/*
  Warnings:

  - You are about to drop the column `agreedTo` on the `RK` table. All the data in the column will be lost.
  - You are about to drop the column `approvalStatusId` on the `RK` table. All the data in the column will be lost.
  - You are about to drop the column `typeStructureId` on the `RK` table. All the data in the column will be lost.
  - Added the required column `approvalStatusId` to the `RKAttachment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `typeStructureId` to the `RKAttachment` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "RK" DROP CONSTRAINT "RK_approvalStatusId_fkey";

-- DropForeignKey
ALTER TABLE "RK" DROP CONSTRAINT "RK_typeStructureId_fkey";

-- AlterTable
ALTER TABLE "RK" DROP COLUMN "agreedTo",
DROP COLUMN "approvalStatusId",
DROP COLUMN "typeStructureId";

-- AlterTable
ALTER TABLE "RKAttachment" ADD COLUMN     "agreedTo" TIMESTAMP(3),
ADD COLUMN     "approvalStatusId" TEXT NOT NULL,
ADD COLUMN     "typeStructureId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "RKAttachment" ADD CONSTRAINT "RKAttachment_typeStructureId_fkey" FOREIGN KEY ("typeStructureId") REFERENCES "Type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RKAttachment" ADD CONSTRAINT "RKAttachment_approvalStatusId_fkey" FOREIGN KEY ("approvalStatusId") REFERENCES "Type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
