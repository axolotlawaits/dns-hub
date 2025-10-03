/*
  Warnings:

  - You are about to drop the column `fileName` on the `App` table. All the data in the column will be lost.
  - You are about to drop the column `filePath` on the `App` table. All the data in the column will be lost.
  - You are about to drop the column `version` on the `App` table. All the data in the column will be lost.
  - Added the required column `name` to the `App` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `appType` on the `App` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `category` to the `App` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AppCategory" AS ENUM ('MOBILE', 'DESKTOP', 'UTILITY', 'TOOL');

-- CreateEnum
CREATE TYPE "AppType" AS ENUM ('ANDROID_APK', 'WINDOWS_EXE', 'WINDOWS_MSI', 'MACOS_DMG', 'LINUX_DEB', 'LINUX_RPM', 'ARCHIVE');

-- AlterTable
ALTER TABLE "App" DROP COLUMN "fileName",
DROP COLUMN "filePath",
DROP COLUMN "version",
ADD COLUMN     "icon" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "name" TEXT NOT NULL,
DROP COLUMN "appType",
ADD COLUMN     "appType" "AppType" NOT NULL,
DROP COLUMN "category",
ADD COLUMN     "category" "AppCategory" NOT NULL;

-- CreateTable
CREATE TABLE "AppVersion" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppVersion_appId_idx" ON "AppVersion"("appId");

-- CreateIndex
CREATE INDEX "AppVersion_version_idx" ON "AppVersion"("version");

-- CreateIndex
CREATE INDEX "AppVersion_isActive_idx" ON "AppVersion"("isActive");

-- CreateIndex
CREATE INDEX "AppVersion_createdAt_idx" ON "AppVersion"("createdAt");

-- CreateIndex
CREATE INDEX "App_category_idx" ON "App"("category");

-- CreateIndex
CREATE INDEX "App_appType_idx" ON "App"("appType");

-- CreateIndex
CREATE INDEX "App_isActive_idx" ON "App"("isActive");

-- AddForeignKey
ALTER TABLE "AppVersion" ADD CONSTRAINT "AppVersion_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;
