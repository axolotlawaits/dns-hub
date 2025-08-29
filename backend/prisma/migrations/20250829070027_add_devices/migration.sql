-- CreateEnum
CREATE TYPE "Activity" AS ENUM ('On', 'Off');

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "typeOfDist" TEXT;

-- CreateTable
CREATE TABLE "Devices" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vendor" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timeFrom" TIMESTAMP(3) NOT NULL,
    "timeUntil" TIMESTAMP(3) NOT NULL,
    "activity" "Activity" NOT NULL,
    "network" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "app" TEXT NOT NULL,
    "os" TEXT NOT NULL,

    CONSTRAINT "Devices_pkey" PRIMARY KEY ("id")
);
