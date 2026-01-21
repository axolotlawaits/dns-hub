-- Drop existing unique constraint and index on journalId
DROP INDEX IF EXISTS "SafetyJournalChat_journalId_checkerId_key";
DROP INDEX IF EXISTS "SafetyJournalChat_journalId_idx";

-- Rename column from journalId to branchId
ALTER TABLE "SafetyJournalChat" RENAME COLUMN "journalId" TO "branchId";

-- Create new unique constraint on branchId and checkerId
CREATE UNIQUE INDEX "SafetyJournalChat_branchId_checkerId_key" ON "SafetyJournalChat"("branchId", "checkerId");

-- Create new index on branchId
CREATE INDEX "SafetyJournalChat_branchId_idx" ON "SafetyJournalChat"("branchId");

