/*
  Warnings:

  - You are about to drop the column `sizeXY` on the `RK` table. All the data in the column will be lost.
  - You are about to drop the column `сlarification` on the `RK` table. All the data in the column will be lost.
  - Added the required column `sizeXY` to the `RKAttachment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `сlarification` to the `RKAttachment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RK" DROP COLUMN "sizeXY",
DROP COLUMN "сlarification";

-- AlterTable
ALTER TABLE "RKAttachment" ADD COLUMN     "sizeXY" TEXT NOT NULL,
ADD COLUMN     "сlarification" TEXT NOT NULL;
