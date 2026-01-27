/*
  Warnings:

  - You are about to drop the `AccessTemplate` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AccessTemplate" DROP CONSTRAINT "AccessTemplate_createdBy_fkey";

-- DropTable
DROP TABLE "AccessTemplate";
