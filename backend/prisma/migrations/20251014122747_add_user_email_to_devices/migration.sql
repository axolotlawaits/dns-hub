/*
  Warnings:

  - You are about to drop the column `userId` on the `Devices` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Devices" DROP CONSTRAINT "Devices_userId_fkey";

-- AlterTable
ALTER TABLE "Devices" DROP COLUMN "userId",
ADD COLUMN     "userEmail" TEXT;
