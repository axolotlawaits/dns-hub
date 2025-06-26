-- CreateEnum
CREATE TYPE "Role" AS ENUM ('DEVELOPER', 'ADMIN', 'SUPERVISOR', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "AccessLevel" AS ENUM ('READONLY', 'CONTRIBUTOR', 'FULL');

-- CreateTable
CREATE TABLE "UserData" (
    "uuid" TEXT NOT NULL,
    "birthday" TIMESTAMP(3) NOT NULL,
    "fio" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "branch_uuid" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "last_update" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserData_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Position" (
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "groupUuid" TEXT NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Group" (
    "uuid" TEXT NOT NULL,
    "uuidPosition" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Branch" (
    "uuid" TEXT NOT NULL,
    "division" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "rrs" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "last_update" TIMESTAMP(3) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "totalArea" INTEGER NOT NULL,
    "tradingArea" INTEGER NOT NULL,
    "warehouseArea" INTEGER NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "Type" (
    "id" TEXT NOT NULL,
    "model_uuid" TEXT NOT NULL,
    "chapter" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colorHex" TEXT,

    CONSTRAINT "Type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tool" (
    "id" TEXT NOT NULL,
    "parent_id" TEXT,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL,
    "included" BOOLEAN DEFAULT true,

    CONSTRAINT "Tool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchImage" (
    "id" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "branch_uuid" TEXT NOT NULL,

    CONSTRAINT "BranchImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "image" TEXT,
    "login" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupToolAccess" (
    "id" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "accessLevel" "AccessLevel" NOT NULL,

    CONSTRAINT "GroupToolAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionToolAccess" (
    "id" TEXT NOT NULL,
    "positionName" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "accessLevel" "AccessLevel" NOT NULL,

    CONSTRAINT "PositionToolAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserToolAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "accessLevel" "AccessLevel" NOT NULL,

    CONSTRAINT "UserToolAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "News" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "News_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeterReading" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "counter" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "MeterReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Correspondence" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ReceiptDate" TIMESTAMP(3) NOT NULL,
    "userAdd" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "typeMail" TEXT NOT NULL,
    "numberMail" TEXT NOT NULL,

    CONSTRAINT "Correspondence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorrespondenceAttachment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "record_id" TEXT NOT NULL,
    "userAdd" TEXT NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "CorrespondenceAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Route" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rrs" TEXT NOT NULL,
    "contractor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteDay" (
    "id" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "routeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouteDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Filial" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "place" INTEGER,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "feedback" TEXT,
    "routeId" TEXT NOT NULL,
    "routeDayId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Filial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loader" (
    "id" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "filialId" TEXT NOT NULL,

    CONSTRAINT "Loader_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyDocs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "addedById" TEXT NOT NULL,
    "inn" INTEGER NOT NULL,
    "counterParty" TEXT NOT NULL,
    "demandsForPayment" TEXT NOT NULL,
    "statusRequirements" TEXT NOT NULL,
    "fileInvoicePayment" TEXT NOT NULL,
    "costBranchId" TEXT NOT NULL,
    "settlementSpecialistId" TEXT,
    "statusOfPTiU" TEXT NOT NULL,
    "filePTiU" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "fileNote" TEXT NOT NULL,
    "requirementNumber" TEXT NOT NULL,

    CONSTRAINT "SupplyDocs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyDocsAttachment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAdd" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,

    CONSTRAINT "SupplyDocsAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "userAddId" TEXT NOT NULL,
    "userUpdatedId" TEXT,
    "name" TEXT,
    "information" TEXT,
    "urlMedia2" TEXT,
    "typeContentId" TEXT,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAttachment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAddId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,

    CONSTRAINT "MediaAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintService" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "tovarName" TEXT NOT NULL,
    "tovarCode" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "brand" TEXT NOT NULL,
    "tovarId" TEXT NOT NULL,
    "format" INTEGER NOT NULL,

    CONSTRAINT "PrintService_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserData_email_key" ON "UserData"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Position_name_key" ON "Position"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Group_name_key" ON "Group"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");

-- CreateIndex
CREATE UNIQUE INDEX "GroupToolAccess_groupName_toolId_key" ON "GroupToolAccess"("groupName", "toolId");

-- CreateIndex
CREATE UNIQUE INDEX "PositionToolAccess_positionName_toolId_key" ON "PositionToolAccess"("positionName", "toolId");

-- CreateIndex
CREATE UNIQUE INDEX "UserToolAccess_userId_toolId_key" ON "UserToolAccess"("userId", "toolId");

-- CreateIndex
CREATE UNIQUE INDEX "Route_name_key" ON "Route"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RouteDay_day_key" ON "RouteDay"("day");

-- AddForeignKey
ALTER TABLE "UserData" ADD CONSTRAINT "UserData_branch_uuid_fkey" FOREIGN KEY ("branch_uuid") REFERENCES "Branch"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserData" ADD CONSTRAINT "UserData_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_groupUuid_fkey" FOREIGN KEY ("groupUuid") REFERENCES "Group"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Type" ADD CONSTRAINT "Type_model_uuid_fkey" FOREIGN KEY ("model_uuid") REFERENCES "Tool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchImage" ADD CONSTRAINT "BranchImage_branch_uuid_fkey" FOREIGN KEY ("branch_uuid") REFERENCES "Branch"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupToolAccess" ADD CONSTRAINT "GroupToolAccess_groupName_fkey" FOREIGN KEY ("groupName") REFERENCES "Group"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupToolAccess" ADD CONSTRAINT "GroupToolAccess_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "Tool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionToolAccess" ADD CONSTRAINT "PositionToolAccess_positionName_fkey" FOREIGN KEY ("positionName") REFERENCES "Position"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionToolAccess" ADD CONSTRAINT "PositionToolAccess_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "Tool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserToolAccess" ADD CONSTRAINT "UserToolAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserToolAccess" ADD CONSTRAINT "UserToolAccess_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "Tool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "News" ADD CONSTRAINT "News_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeterReading" ADD CONSTRAINT "MeterReading_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_userAdd_fkey" FOREIGN KEY ("userAdd") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrespondenceAttachment" ADD CONSTRAINT "CorrespondenceAttachment_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "Correspondence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrespondenceAttachment" ADD CONSTRAINT "CorrespondenceAttachment_userAdd_fkey" FOREIGN KEY ("userAdd") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteDay" ADD CONSTRAINT "RouteDay_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Filial" ADD CONSTRAINT "Filial_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Filial" ADD CONSTRAINT "Filial_routeDayId_fkey" FOREIGN KEY ("routeDayId") REFERENCES "RouteDay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loader" ADD CONSTRAINT "Loader_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "Filial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyDocs" ADD CONSTRAINT "SupplyDocs_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyDocs" ADD CONSTRAINT "SupplyDocs_statusRequirements_fkey" FOREIGN KEY ("statusRequirements") REFERENCES "Type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyDocs" ADD CONSTRAINT "SupplyDocs_costBranchId_fkey" FOREIGN KEY ("costBranchId") REFERENCES "Branch"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyDocs" ADD CONSTRAINT "SupplyDocs_settlementSpecialistId_fkey" FOREIGN KEY ("settlementSpecialistId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyDocs" ADD CONSTRAINT "SupplyDocs_statusOfPTiU_fkey" FOREIGN KEY ("statusOfPTiU") REFERENCES "Type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyDocsAttachment" ADD CONSTRAINT "SupplyDocsAttachment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "SupplyDocs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyDocsAttachment" ADD CONSTRAINT "SupplyDocsAttachment_userAdd_fkey" FOREIGN KEY ("userAdd") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_userAddId_fkey" FOREIGN KEY ("userAddId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_userUpdatedId_fkey" FOREIGN KEY ("userUpdatedId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_typeContentId_fkey" FOREIGN KEY ("typeContentId") REFERENCES "Type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAttachment" ADD CONSTRAINT "MediaAttachment_userAddId_fkey" FOREIGN KEY ("userAddId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAttachment" ADD CONSTRAINT "MediaAttachment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintService" ADD CONSTRAINT "PrintService_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

