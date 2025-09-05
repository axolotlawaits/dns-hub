-- DropForeignKey
ALTER TABLE "Filial" DROP CONSTRAINT "Filial_routeDayId_fkey";

-- DropForeignKey
ALTER TABLE "Loader" DROP CONSTRAINT "Loader_filialId_fkey";

-- AddForeignKey
ALTER TABLE "Filial" ADD CONSTRAINT "Filial_routeDayId_fkey" FOREIGN KEY ("routeDayId") REFERENCES "RouteDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loader" ADD CONSTRAINT "Loader_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "Filial"("id") ON DELETE CASCADE ON UPDATE CASCADE;
