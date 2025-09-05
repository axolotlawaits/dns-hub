/*
  Warnings:

  - Made the column `timeFrom` on table `Devices` required. This step will fail if there are existing NULL values in that column.
  - Made the column `timeUntil` on table `Devices` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Devices" ALTER COLUMN "timeFrom" SET NOT NULL,
ALTER COLUMN "timeFrom" SET DEFAULT '08:00',
ALTER COLUMN "timeFrom" SET DATA TYPE TEXT,
ALTER COLUMN "timeUntil" SET NOT NULL,
ALTER COLUMN "timeUntil" SET DEFAULT '22:00',
ALTER COLUMN "timeUntil" SET DATA TYPE TEXT;
