/*
  Warnings:

  - Added the required column `documentTypeId` to the `Correspondence` table without a default value. This is not possible if the table is not empty.
  - Added the required column `responsibleId` to the `Correspondence` table without a default value. This is not possible if the table is not empty.
  - Added the required column `senderName` to the `Correspondence` table without a default value. This is not possible if the table is not empty.
  - Added the required column `senderTypeId` to the `Correspondence` table without a default value. This is not possible if the table is not empty.

*/
-- Step 1: Add columns as nullable first
ALTER TABLE "Correspondence" ADD COLUMN     "comments" TEXT,
ADD COLUMN     "documentTypeId" TEXT,
ADD COLUMN     "responsibleId" TEXT,
ADD COLUMN     "senderName" TEXT,
ADD COLUMN     "senderSubSubTypeId" TEXT,
ADD COLUMN     "senderSubTypeId" TEXT,
ADD COLUMN     "senderTypeId" TEXT,
ALTER COLUMN "from" DROP NOT NULL,
ALTER COLUMN "from" SET DEFAULT '',
ALTER COLUMN "to" DROP NOT NULL,
ALTER COLUMN "to" SET DEFAULT '',
ALTER COLUMN "content" DROP NOT NULL,
ALTER COLUMN "content" SET DEFAULT '',
ALTER COLUMN "typeMail" DROP NOT NULL,
ALTER COLUMN "typeMail" SET DEFAULT '',
ALTER COLUMN "numberMail" DROP NOT NULL,
ALTER COLUMN "numberMail" SET DEFAULT '';

-- Step 2: Fill existing records with default values or delete them
-- Option 1: Delete existing records (if they are test data)
-- DELETE FROM "Correspondence";

-- Option 2: Fill with default values (uncomment and adjust if needed)
-- You need to provide valid UUIDs for senderTypeId, documentTypeId, responsibleId
-- UPDATE "Correspondence" 
-- SET 
--   "senderTypeId" = (SELECT id FROM "Type" WHERE chapter = 'Отправитель' LIMIT 1),
--   "documentTypeId" = (SELECT id FROM "Type" WHERE chapter = 'Тип документа' LIMIT 1),
--   "responsibleId" = (SELECT id FROM "User" LIMIT 1),
--   "senderName" = 'Не указано'
-- WHERE "senderTypeId" IS NULL OR "documentTypeId" IS NULL OR "responsibleId" IS NULL OR "senderName" IS NULL;

-- For now, we'll delete existing records to avoid NULL values
DELETE FROM "Correspondence";

-- Step 3: Make columns NOT NULL
ALTER TABLE "Correspondence" ALTER COLUMN "documentTypeId" SET NOT NULL;
ALTER TABLE "Correspondence" ALTER COLUMN "responsibleId" SET NOT NULL;
ALTER TABLE "Correspondence" ALTER COLUMN "senderName" SET NOT NULL;
ALTER TABLE "Correspondence" ALTER COLUMN "senderTypeId" SET NOT NULL;

-- Step 4: Create indexes
CREATE INDEX "Correspondence_ReceiptDate_idx" ON "Correspondence"("ReceiptDate");
CREATE INDEX "Correspondence_senderTypeId_idx" ON "Correspondence"("senderTypeId");
CREATE INDEX "Correspondence_documentTypeId_idx" ON "Correspondence"("documentTypeId");
CREATE INDEX "Correspondence_responsibleId_idx" ON "Correspondence"("responsibleId");
CREATE INDEX "Correspondence_userAdd_idx" ON "Correspondence"("userAdd");

-- Step 5: Add foreign keys
ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_senderTypeId_fkey" FOREIGN KEY ("senderTypeId") REFERENCES "Type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_senderSubTypeId_fkey" FOREIGN KEY ("senderSubTypeId") REFERENCES "Type"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_senderSubSubTypeId_fkey" FOREIGN KEY ("senderSubSubTypeId") REFERENCES "Type"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "Type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
