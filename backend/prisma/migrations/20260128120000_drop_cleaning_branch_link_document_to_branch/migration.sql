-- CleaningDocument: add branchId, copy from CleaningBranch, drop cleaningBranchId, drop CleaningBranch
ALTER TABLE "CleaningDocument" ADD COLUMN "branchId" TEXT;

UPDATE "CleaningDocument" AS cd
SET "branchId" = cb."branchId"
FROM "CleaningBranch" AS cb
WHERE cd."cleaningBranchId" = cb."id";

ALTER TABLE "CleaningDocument" ALTER COLUMN "branchId" SET NOT NULL;

ALTER TABLE "CleaningDocument" DROP CONSTRAINT "CleaningDocument_cleaningBranchId_fkey";
DROP INDEX IF EXISTS "CleaningDocument_cleaningBranchId_idx";
ALTER TABLE "CleaningDocument" DROP COLUMN "cleaningBranchId";

CREATE INDEX "CleaningDocument_branchId_idx" ON "CleaningDocument"("branchId");
ALTER TABLE "CleaningDocument" ADD CONSTRAINT "CleaningDocument_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE "CleaningBranch";
