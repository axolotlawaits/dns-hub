/*
  Warnings:

  - You are about to drop the column `counter` on the `MeterReading` table. All the data in the column will be lost.
  - Added the required column `dataJson` to the `MeterReading` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "MeterReading" DROP COLUMN "counter",
ADD COLUMN     "dataJson" TEXT NOT NULL;
