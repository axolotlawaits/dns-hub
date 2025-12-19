-- DropIndex
DROP INDEX IF EXISTS "User_trassirChatId_key";

-- DropIndex
DROP INDEX IF EXISTS "User_trassirLinkToken_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN IF EXISTS "trassirChatId";
ALTER TABLE "User" DROP COLUMN IF EXISTS "trassirLinkToken";

