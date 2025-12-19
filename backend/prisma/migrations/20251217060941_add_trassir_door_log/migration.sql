-- CreateTable
CREATE TABLE "TrassirDoorLog" (
    "id" TEXT NOT NULL,
    "doorId" INTEGER NOT NULL,
    "doorName" TEXT,
    "personName" TEXT,
    "tgId" INTEGER,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrassirDoorLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrassirDoorLog_doorId_idx" ON "TrassirDoorLog"("doorId");

-- CreateIndex
CREATE INDEX "TrassirDoorLog_tgId_idx" ON "TrassirDoorLog"("tgId");

-- CreateIndex
CREATE INDEX "TrassirDoorLog_openedAt_idx" ON "TrassirDoorLog"("openedAt");
