/*
  Warnings:

  - You are about to drop the `radio_streams` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "radio_streams";

-- CreateTable
CREATE TABLE "RadioStream" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "branchTypeOfDist" TEXT NOT NULL,
    "frequencySongs" INTEGER NOT NULL,
    "fadeInDuration" INTEGER NOT NULL,
    "volumeLevel" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "attachment" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RadioStream_pkey" PRIMARY KEY ("id")
);
