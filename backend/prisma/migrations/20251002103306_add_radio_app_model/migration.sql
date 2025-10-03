-- CreateTable
CREATE TABLE "App" (
    "id" TEXT NOT NULL,
    "appType" TEXT NOT NULL,
    "category" TEXT,
    "version" TEXT NOT NULL,
    "description" TEXT,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "App_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "App_appType_idx" ON "App"("appType");

-- CreateIndex
CREATE INDEX "App_category_idx" ON "App"("category");

-- CreateIndex
CREATE INDEX "App_createdAt_idx" ON "App"("createdAt");
