-- Remove unnecessary columns from Bookmarks table
ALTER TABLE "Bookmarks" DROP COLUMN IF EXISTS "chapter";
ALTER TABLE "Bookmarks" DROP COLUMN IF EXISTS "colorHex";
ALTER TABLE "Bookmarks" DROP COLUMN IF EXISTS "model_uuid";
