-- DropForeignKey
ALTER TABLE "Filial" DROP CONSTRAINT "Filial_routeId_fkey";

-- AddForeignKey
ALTER TABLE "Filial" ADD CONSTRAINT "Filial_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE CASCADE ON UPDATE CASCADE;
