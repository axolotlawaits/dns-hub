/*
  Warnings:

  - You are about to drop the `BugReport` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "UserToolAccess" ADD COLUMN     "grantedBy" TEXT,
ADD COLUMN     "isTemporary" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "validFrom" TIMESTAMP(3),
ADD COLUMN     "validUntil" TIMESTAMP(3);

-- DropTable
DROP TABLE "BugReport";

-- DropEnum
DROP TYPE "BugReportErrorType";

-- DropEnum
DROP TYPE "BugReportSeverity";

-- CreateTable
CREATE TABLE "AccessTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "toolAccesses" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "AccessTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleaningBranch" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "folder" TEXT NOT NULL DEFAULT 'Рабочий',
    "organizationName" TEXT,
    "wetCleaningTime" TEXT,
    "wetCleaningCost" TEXT,
    "territoryCleaningTime" TEXT,
    "territoryCleaningCost" TEXT,
    "documentsReceived" BOOLEAN NOT NULL DEFAULT false,
    "documentsReceivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CleaningBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleaningDocument" (
    "id" TEXT NOT NULL,
    "cleaningBranchId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CleaningDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccessTemplate_createdBy_idx" ON "AccessTemplate"("createdBy");

-- CreateIndex
CREATE INDEX "CleaningBranch_branchId_idx" ON "CleaningBranch"("branchId");

-- CreateIndex
CREATE INDEX "CleaningBranch_folder_idx" ON "CleaningBranch"("folder");

-- CreateIndex
CREATE INDEX "CleaningBranch_documentsReceived_idx" ON "CleaningBranch"("documentsReceived");

-- CreateIndex
CREATE INDEX "CleaningBranch_updatedAt_idx" ON "CleaningBranch"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CleaningBranch_branchId_key" ON "CleaningBranch"("branchId");

-- CreateIndex
CREATE INDEX "CleaningDocument_cleaningBranchId_idx" ON "CleaningDocument"("cleaningBranchId");

-- CreateIndex
CREATE INDEX "CleaningDocument_uploadedById_idx" ON "CleaningDocument"("uploadedById");

-- CreateIndex
CREATE INDEX "CleaningDocument_uploadedAt_idx" ON "CleaningDocument"("uploadedAt");

-- AddForeignKey
ALTER TABLE "AccessTemplate" ADD CONSTRAINT "AccessTemplate_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningBranch" ADD CONSTRAINT "CleaningBranch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningDocument" ADD CONSTRAINT "CleaningDocument_cleaningBranchId_fkey" FOREIGN KEY ("cleaningBranchId") REFERENCES "CleaningBranch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningDocument" ADD CONSTRAINT "CleaningDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
