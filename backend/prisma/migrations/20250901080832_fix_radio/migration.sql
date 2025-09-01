/*
  Warnings:

  - Added the required column `lastSeen` to the `Devices` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Devices" ADD COLUMN     "lastSeen" TIMESTAMP(3) NOT NULL;
