/*
  Warnings:

  - You are about to drop the column `groupName` on the `GroupToolAccess` table. All the data in the column will be lost.
  - You are about to drop the column `positionName` on the `PositionToolAccess` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[groupId,toolId]` on the table `GroupToolAccess` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[positionId,toolId]` on the table `PositionToolAccess` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "GroupToolAccess" DROP CONSTRAINT "GroupToolAccess_groupName_fkey";

-- DropForeignKey
ALTER TABLE "PositionToolAccess" DROP CONSTRAINT "PositionToolAccess_positionName_fkey";

-- DropIndex
DROP INDEX "GroupToolAccess_groupName_toolId_key";

-- DropIndex
DROP INDEX "PositionToolAccess_positionName_toolId_key";

-- AlterTable
ALTER TABLE "GroupToolAccess" DROP COLUMN "groupName",
ADD COLUMN     "groupId" TEXT;

-- AlterTable
ALTER TABLE "PositionToolAccess" DROP COLUMN "positionName",
ADD COLUMN     "positionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "GroupToolAccess_groupId_toolId_key" ON "GroupToolAccess"("groupId", "toolId");

-- CreateIndex
CREATE UNIQUE INDEX "PositionToolAccess_positionId_toolId_key" ON "PositionToolAccess"("positionId", "toolId");

-- AddForeignKey
ALTER TABLE "GroupToolAccess" ADD CONSTRAINT "GroupToolAccess_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("name") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionToolAccess" ADD CONSTRAINT "PositionToolAccess_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("name") ON DELETE SET NULL ON UPDATE CASCADE;
