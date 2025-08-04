-- CreateTable
CREATE TABLE "RK" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "userAddId" TEXT NOT NULL,
    "userUpdatedId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "agreedTo" TIMESTAMP(3) NOT NULL,
    "sizeXY" TEXT NOT NULL,
    "сlarification" TEXT NOT NULL,
    "typeStructureId" TEXT NOT NULL,
    "approvalStatusId" TEXT NOT NULL,

    CONSTRAINT "RK_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RKAttachment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAddId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,

    CONSTRAINT "RKAttachment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "RK" ADD CONSTRAINT "RK_userAddId_fkey" FOREIGN KEY ("userAddId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RK" ADD CONSTRAINT "RK_userUpdatedId_fkey" FOREIGN KEY ("userUpdatedId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RK" ADD CONSTRAINT "RK_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RK" ADD CONSTRAINT "RK_typeStructureId_fkey" FOREIGN KEY ("typeStructureId") REFERENCES "Type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RK" ADD CONSTRAINT "RK_approvalStatusId_fkey" FOREIGN KEY ("approvalStatusId") REFERENCES "Type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RKAttachment" ADD CONSTRAINT "RKAttachment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "RK"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RKAttachment" ADD CONSTRAINT "RKAttachment_userAddId_fkey" FOREIGN KEY ("userAddId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
