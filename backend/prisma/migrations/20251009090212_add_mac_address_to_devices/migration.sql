/*
  Warnings:

  - A unique constraint covering the columns `[macAddress]` on the table `Devices` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Devices" ADD COLUMN     "macAddress" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Devices_macAddress_key" ON "Devices"("macAddress");
