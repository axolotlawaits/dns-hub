-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "readBy" TEXT,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Feedback_tool_idx" ON "Feedback"("tool");

-- CreateIndex
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");

-- CreateIndex
CREATE INDEX "Feedback_isRead_idx" ON "Feedback"("isRead");

-- CreateIndex
CREATE INDEX "Feedback_tool_isRead_idx" ON "Feedback"("tool", "isRead");
