-- CreateEnum
CREATE TYPE "SafetyJournalType" AS ENUM ('LABOR_SAFETY', 'FIRE_SAFETY', 'ELECTRICAL_SAFETY', 'INDUSTRIAL_SAFETY');

-- CreateEnum
CREATE TYPE "SafetyJournalStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "SafetyEntryType" AS ENUM ('INSPECTION', 'INSTRUCTION', 'VIOLATION', 'CORRECTIVE_ACTION', 'TRAINING', 'INCIDENT', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "SafetyEntryStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'OVERDUE');

-- CreateTable
CREATE TABLE "SafetyJournal" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "userAddId" TEXT NOT NULL,
    "userUpdatedId" TEXT,
    "journalType" "SafetyJournalType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT NOT NULL,
    "responsiblePerson" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "lastEntryDate" TIMESTAMP(3),
    "status" "SafetyJournalStatus" NOT NULL DEFAULT 'ACTIVE',
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "branchId" TEXT,

    CONSTRAINT "SafetyJournal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyJournalEntry" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "userAddId" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "entryType" "SafetyEntryType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "participants" TEXT,
    "location" TEXT,
    "findings" TEXT,
    "actionsTaken" TEXT,
    "responsiblePerson" TEXT,
    "deadline" TIMESTAMP(3),
    "status" "SafetyEntryStatus" NOT NULL DEFAULT 'OPEN',

    CONSTRAINT "SafetyJournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyJournalAttachment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAddId" TEXT NOT NULL,
    "journalId" TEXT,
    "entryId" TEXT,
    "source" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "description" TEXT,

    CONSTRAINT "SafetyJournalAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SafetyJournal_journalType_idx" ON "SafetyJournal"("journalType");

-- CreateIndex
CREATE INDEX "SafetyJournal_status_idx" ON "SafetyJournal"("status");

-- CreateIndex
CREATE INDEX "SafetyJournal_startDate_idx" ON "SafetyJournal"("startDate");

-- CreateIndex
CREATE INDEX "SafetyJournal_userAddId_idx" ON "SafetyJournal"("userAddId");

-- CreateIndex
CREATE INDEX "SafetyJournalEntry_journalId_idx" ON "SafetyJournalEntry"("journalId");

-- CreateIndex
CREATE INDEX "SafetyJournalEntry_entryDate_idx" ON "SafetyJournalEntry"("entryDate");

-- CreateIndex
CREATE INDEX "SafetyJournalEntry_entryType_idx" ON "SafetyJournalEntry"("entryType");

-- CreateIndex
CREATE INDEX "SafetyJournalEntry_status_idx" ON "SafetyJournalEntry"("status");

-- CreateIndex
CREATE INDEX "SafetyJournalAttachment_journalId_idx" ON "SafetyJournalAttachment"("journalId");

-- CreateIndex
CREATE INDEX "SafetyJournalAttachment_entryId_idx" ON "SafetyJournalAttachment"("entryId");

-- AddForeignKey
ALTER TABLE "SafetyJournal" ADD CONSTRAINT "SafetyJournal_userAddId_fkey" FOREIGN KEY ("userAddId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyJournal" ADD CONSTRAINT "SafetyJournal_userUpdatedId_fkey" FOREIGN KEY ("userUpdatedId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyJournal" ADD CONSTRAINT "SafetyJournal_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyJournalEntry" ADD CONSTRAINT "SafetyJournalEntry_userAddId_fkey" FOREIGN KEY ("userAddId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyJournalEntry" ADD CONSTRAINT "SafetyJournalEntry_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "SafetyJournal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyJournalAttachment" ADD CONSTRAINT "SafetyJournalAttachment_userAddId_fkey" FOREIGN KEY ("userAddId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyJournalAttachment" ADD CONSTRAINT "SafetyJournalAttachment_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "SafetyJournal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyJournalAttachment" ADD CONSTRAINT "SafetyJournalAttachment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "SafetyJournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
