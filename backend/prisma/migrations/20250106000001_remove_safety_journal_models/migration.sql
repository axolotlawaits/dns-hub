-- DropSafetyJournalModels
-- This migration removes all SafetyJournal related tables and enums

-- Drop tables in correct order (respecting foreign key constraints)
DROP TABLE IF EXISTS "SafetyJournalAttachment" CASCADE;
DROP TABLE IF EXISTS "SafetyJournalEntry" CASCADE;
DROP TABLE IF EXISTS "SafetyJournal" CASCADE;

-- Drop enums
DROP TYPE IF EXISTS "SafetyEntryStatus" CASCADE;
DROP TYPE IF EXISTS "SafetyEntryType" CASCADE;
DROP TYPE IF EXISTS "SafetyJournalStatus" CASCADE;
DROP TYPE IF EXISTS "SafetyJournalType" CASCADE;
