/*
  Warnings:

  - The `documentNumber` column on the `Correspondence` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Correspondence" DROP COLUMN "documentNumber",
ADD COLUMN     "documentNumber" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "Roc" ALTER COLUMN "agreedTo" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Correspondence_documentNumber_idx" ON "Correspondence"("documentNumber");
