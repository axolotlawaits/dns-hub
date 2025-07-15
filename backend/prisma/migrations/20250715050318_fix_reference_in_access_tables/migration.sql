-- DropForeignKey
ALTER TABLE "GroupToolAccess" DROP CONSTRAINT "GroupToolAccess_groupId_fkey";

-- DropForeignKey
ALTER TABLE "PositionToolAccess" DROP CONSTRAINT "PositionToolAccess_positionId_fkey";

-- AddForeignKey
ALTER TABLE "GroupToolAccess" ADD CONSTRAINT "GroupToolAccess_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionToolAccess" ADD CONSTRAINT "PositionToolAccess_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;
