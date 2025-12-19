-- CreateTable
CREATE TABLE "ScanSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "printerIp" TEXT NOT NULL,
    "printerPort" INTEGER NOT NULL,
    "folderName" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "ScanSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScannedFile" (
    "id" TEXT NOT NULL,
    "scanSessionId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScannedFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Printer" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 9100,
    "name" TEXT,
    "vendor" TEXT,
    "model" TEXT,
    "hasScanner" BOOLEAN NOT NULL DEFAULT false,
    "scannerType" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Printer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScanSession_userId_idx" ON "ScanSession"("userId");

-- CreateIndex
CREATE INDEX "ScanSession_startedAt_idx" ON "ScanSession"("startedAt");

-- CreateIndex
CREATE INDEX "ScannedFile_scanSessionId_idx" ON "ScannedFile"("scanSessionId");

-- CreateIndex
CREATE INDEX "Printer_ip_idx" ON "Printer"("ip");

-- CreateIndex
CREATE INDEX "Printer_hasScanner_idx" ON "Printer"("hasScanner");

-- CreateIndex
CREATE UNIQUE INDEX "Printer_ip_port_key" ON "Printer"("ip", "port");

-- AddForeignKey
ALTER TABLE "ScanSession" ADD CONSTRAINT "ScanSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScannedFile" ADD CONSTRAINT "ScannedFile_scanSessionId_fkey" FOREIGN KEY ("scanSessionId") REFERENCES "ScanSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
