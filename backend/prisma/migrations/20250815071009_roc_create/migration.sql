-- CreateEnum
CREATE TYPE "RocTypeByTerm" AS ENUM ('Urgent', 'Extended', 'Perpetual', 'LongTerm');

-- CreateTable
CREATE TABLE "Doc" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "inn" INTEGER NOT NULL,
    "ogrn" TEXT NOT NULL,
    "kpp" TEXT NOT NULL,
    "taxationSystem" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "siEgrul" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "deStatusCode" TEXT NOT NULL,
    "liquidationDate" TIMESTAMP(3) NOT NULL,
    "successorName" TEXT NOT NULL,
    "successorINN" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Doc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Roc" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "userAddId" TEXT NOT NULL,
    "userUpdatedId" TEXT NOT NULL,
    "terminationLetter" BOOLEAN NOT NULL DEFAULT false,
    "dateSendCorrespondence" TIMESTAMP(3) NOT NULL,
    "docId" TEXT NOT NULL,
    "shelfLife" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "typeTerm" "RocTypeByTerm" NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "dateContract" TIMESTAMP(3) NOT NULL,
    "agreedTo" TIMESTAMP(3) NOT NULL,
    "typeContractId" TEXT NOT NULL,
    "statusContractId" TEXT NOT NULL,
    "terminationСonditions" TEXT NOT NULL,
    "peculiarities" TEXT NOT NULL,
    "folderNo" TEXT NOT NULL,

    CONSTRAINT "Roc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RocAttachment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "userAddId" TEXT NOT NULL,
    "typeAttachment" TEXT NOT NULL,

    CONSTRAINT "RocAttachment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Roc" ADD CONSTRAINT "Roc_userAddId_fkey" FOREIGN KEY ("userAddId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Roc" ADD CONSTRAINT "Roc_userUpdatedId_fkey" FOREIGN KEY ("userUpdatedId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Roc" ADD CONSTRAINT "Roc_docId_fkey" FOREIGN KEY ("docId") REFERENCES "Doc"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Roc" ADD CONSTRAINT "Roc_typeContractId_fkey" FOREIGN KEY ("typeContractId") REFERENCES "Type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Roc" ADD CONSTRAINT "Roc_statusContractId_fkey" FOREIGN KEY ("statusContractId") REFERENCES "Type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RocAttachment" ADD CONSTRAINT "RocAttachment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Roc"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RocAttachment" ADD CONSTRAINT "RocAttachment_userAddId_fkey" FOREIGN KEY ("userAddId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
