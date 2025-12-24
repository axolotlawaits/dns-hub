/*
  Warnings:

  - You are about to drop the column `numberMail` on the `Correspondence` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Correspondence" DROP COLUMN "numberMail",
ADD COLUMN     "documentNumber" TEXT,
ADD COLUMN     "trackNumber" TEXT;

-- AlterTable
ALTER TABLE "Poll" ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "startDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Correspondence_documentNumber_idx" ON "Correspondence"("documentNumber");

-- CreateIndex
CREATE INDEX "Correspondence_trackNumber_idx" ON "Correspondence"("trackNumber");

-- CreateIndex
CREATE INDEX "Poll_startDate_idx" ON "Poll"("startDate");

-- CreateIndex
CREATE INDEX "Poll_endDate_idx" ON "Poll"("endDate");
