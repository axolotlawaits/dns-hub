/*
  Warnings:

  - Made the column `groupId` on table `GroupToolAccess` required. This step will fail if there are existing NULL values in that column.
  - Made the column `positionId` on table `PositionToolAccess` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "GroupToolAccess" DROP CONSTRAINT "GroupToolAccess_groupId_fkey";

-- DropForeignKey
ALTER TABLE "PositionToolAccess" DROP CONSTRAINT "PositionToolAccess_positionId_fkey";

-- AlterTable
ALTER TABLE "GroupToolAccess" ALTER COLUMN "groupId" SET NOT NULL;

-- AlterTable
ALTER TABLE "PositionToolAccess" ALTER COLUMN "positionId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "GroupToolAccess" ADD CONSTRAINT "GroupToolAccess_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionToolAccess" ADD CONSTRAINT "PositionToolAccess_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("name") ON DELETE RESTRICT ON UPDATE CASCADE;
