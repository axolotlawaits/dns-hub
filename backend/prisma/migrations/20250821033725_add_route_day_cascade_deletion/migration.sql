-- DropForeignKey
ALTER TABLE "RouteDay" DROP CONSTRAINT "RouteDay_routeId_fkey";

-- AddForeignKey
ALTER TABLE "RouteDay" ADD CONSTRAINT "RouteDay_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE CASCADE ON UPDATE CASCADE;
