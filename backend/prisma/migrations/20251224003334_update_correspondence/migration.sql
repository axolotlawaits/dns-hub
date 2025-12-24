/*
  Warnings:

  - You are about to drop the column `content` on the `Correspondence` table. All the data in the column will be lost.
  - You are about to drop the column `from` on the `Correspondence` table. All the data in the column will be lost.
  - You are about to drop the column `to` on the `Correspondence` table. All the data in the column will be lost.
  - You are about to drop the column `typeMail` on the `Correspondence` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Correspondence" DROP COLUMN "content",
DROP COLUMN "from",
DROP COLUMN "to",
DROP COLUMN "typeMail";
