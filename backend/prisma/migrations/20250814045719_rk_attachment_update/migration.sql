/*
  Warnings:

  - Added the required column `typeAttachment` to the `RKAttachment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RKAttachment" ADD COLUMN     "typeAttachment" TEXT NOT NULL;
