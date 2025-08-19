/*
  Warnings:

  - Added the required column `additional` to the `RocAttachment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RocAttachment" ADD COLUMN     "additional" BOOLEAN NOT NULL;
