-- CreateEnum
CREATE TYPE "BugReportErrorType" AS ENUM ('CRASH', 'NETWORK_ERROR', 'AUTHENTICATION_ERROR', 'MEDIA_ERROR', 'DOWNLOAD_ERROR', 'PERMISSION_ERROR', 'STORAGE_ERROR', 'SOCKET_ERROR', 'PERFORMANCE_ISSUE', 'UNKNOWN_ERROR');

-- CreateEnum
CREATE TYPE "BugReportSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NetworkType" AS ENUM ('WiFi', 'Mobile', 'Ethernet');

-- CreateTable
CREATE TABLE "BugReport" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT,
    "userEmail" TEXT,
    "branchType" TEXT,
    "branchName" TEXT,
    "errorType" "BugReportErrorType" NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "stackTrace" TEXT,
    "severity" "BugReportSeverity" NOT NULL,
    "appVersion" TEXT NOT NULL,
    "androidVersion" TEXT,
    "deviceModel" TEXT,
    "deviceManufacturer" TEXT,
    "memoryUsage" INTEGER,
    "storageFree" INTEGER,
    "networkType" "NetworkType",
    "isOnline" BOOLEAN,
    "userAction" TEXT,
    "sessionId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "additionalData" JSONB,
    "isAutoReport" BOOLEAN NOT NULL DEFAULT true,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolutionNotes" TEXT,

    CONSTRAINT "BugReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BugReport_deviceId_idx" ON "BugReport"("deviceId");

-- CreateIndex
CREATE INDEX "BugReport_errorType_idx" ON "BugReport"("errorType");

-- CreateIndex
CREATE INDEX "BugReport_severity_idx" ON "BugReport"("severity");

-- CreateIndex
CREATE INDEX "BugReport_isResolved_idx" ON "BugReport"("isResolved");

-- CreateIndex
CREATE INDEX "BugReport_createdAt_idx" ON "BugReport"("createdAt");

-- CreateIndex
CREATE INDEX "BugReport_timestamp_idx" ON "BugReport"("timestamp");

-- CreateIndex
CREATE INDEX "BugReport_userEmail_idx" ON "BugReport"("userEmail");

-- CreateIndex
CREATE INDEX "BugReport_branchType_idx" ON "BugReport"("branchType");
