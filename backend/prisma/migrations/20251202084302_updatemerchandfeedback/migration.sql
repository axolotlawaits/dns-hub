-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FeedbackPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- AlterTable
ALTER TABLE "Feedback" ADD COLUMN     "assignedTo" TEXT,
ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priority" "FeedbackPriority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "FeedbackResponse" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "sentEmail" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FeedbackResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedbackResponse_feedbackId_idx" ON "FeedbackResponse"("feedbackId");

-- CreateIndex
CREATE INDEX "FeedbackResponse_createdAt_idx" ON "FeedbackResponse"("createdAt");

-- CreateIndex
CREATE INDEX "FeedbackResponse_userId_idx" ON "FeedbackResponse"("userId");

-- CreateIndex
CREATE INDEX "Feedback_status_idx" ON "Feedback"("status");

-- CreateIndex
CREATE INDEX "Feedback_priority_idx" ON "Feedback"("priority");

-- CreateIndex
CREATE INDEX "Feedback_assignedTo_idx" ON "Feedback"("assignedTo");

-- CreateIndex
CREATE INDEX "Feedback_pinned_idx" ON "Feedback"("pinned");

-- CreateIndex
CREATE INDEX "Feedback_email_idx" ON "Feedback"("email");

-- CreateIndex
CREATE INDEX "Merch_parentId_idx" ON "Merch"("parentId");

-- CreateIndex
CREATE INDEX "Merch_layer_idx" ON "Merch"("layer");

-- CreateIndex
CREATE INDEX "Merch_isActive_idx" ON "Merch"("isActive");

-- CreateIndex
CREATE INDEX "Merch_parentId_layer_idx" ON "Merch"("parentId", "layer");

-- CreateIndex
CREATE INDEX "Merch_sortOrder_idx" ON "Merch"("sortOrder");

-- CreateIndex
CREATE INDEX "Merch_parentId_sortOrder_idx" ON "Merch"("parentId", "sortOrder");

-- CreateIndex
CREATE INDEX "MerchAttachment_recordId_idx" ON "MerchAttachment"("recordId");

-- CreateIndex
CREATE INDEX "MerchAttachment_recordId_sortOrder_idx" ON "MerchAttachment"("recordId", "sortOrder");

-- CreateIndex
CREATE INDEX "MerchAttachment_type_idx" ON "MerchAttachment"("type");

-- CreateIndex
CREATE INDEX "MerchTgUserStats_userId_idx" ON "MerchTgUserStats"("userId");

-- CreateIndex
CREATE INDEX "MerchTgUserStats_action_idx" ON "MerchTgUserStats"("action");

-- CreateIndex
CREATE INDEX "MerchTgUserStats_timestamp_idx" ON "MerchTgUserStats"("timestamp");

-- CreateIndex
CREATE INDEX "MerchTgUserStats_userId_action_idx" ON "MerchTgUserStats"("userId", "action");

-- CreateIndex
CREATE INDEX "MerchTgUserStats_action_timestamp_idx" ON "MerchTgUserStats"("action", "timestamp");

-- AddForeignKey
ALTER TABLE "FeedbackResponse" ADD CONSTRAINT "FeedbackResponse_feedbackId_fkey" FOREIGN KEY ("feedbackId") REFERENCES "Feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackResponse" ADD CONSTRAINT "FeedbackResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
