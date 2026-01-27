-- CreateTable
CREATE TABLE "Manager" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "statusId" TEXT NOT NULL,
    "branchCount" INTEGER,
    "employeeCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Manager_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmploymentHistory" (
    "id" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "changeTypeId" TEXT NOT NULL,
    "fromBranchId" TEXT,
    "toBranchId" TEXT,
    "fromPosition" TEXT,
    "toPosition" TEXT,
    "changeDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmploymentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingProgram" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "parentId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingProgress" (
    "id" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "trainingProgramId" TEXT NOT NULL,
    "statusId" TEXT NOT NULL,
    "completionDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeworkStatus" (
    "id" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "trainingProgramId" TEXT NOT NULL,
    "statusId" TEXT NOT NULL,
    "checkerId" TEXT,
    "submissionDate" TIMESTAMP(3),
    "checkDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeworkStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Manager_userId_key" ON "Manager"("userId");

-- CreateIndex
CREATE INDEX "Manager_userId_idx" ON "Manager"("userId");

-- CreateIndex
CREATE INDEX "Manager_statusId_idx" ON "Manager"("statusId");

-- CreateIndex
CREATE INDEX "EmploymentHistory_managerId_idx" ON "EmploymentHistory"("managerId");

-- CreateIndex
CREATE INDEX "EmploymentHistory_changeDate_idx" ON "EmploymentHistory"("changeDate");

-- CreateIndex
CREATE INDEX "EmploymentHistory_changeTypeId_idx" ON "EmploymentHistory"("changeTypeId");

-- CreateIndex
CREATE INDEX "TrainingProgram_parentId_idx" ON "TrainingProgram"("parentId");

-- CreateIndex
CREATE INDEX "TrainingProgram_typeId_idx" ON "TrainingProgram"("typeId");

-- CreateIndex
CREATE INDEX "TrainingProgram_isRequired_idx" ON "TrainingProgram"("isRequired");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingProgress_managerId_trainingProgramId_key" ON "TrainingProgress"("managerId", "trainingProgramId");

-- CreateIndex
CREATE INDEX "TrainingProgress_managerId_idx" ON "TrainingProgress"("managerId");

-- CreateIndex
CREATE INDEX "TrainingProgress_statusId_idx" ON "TrainingProgress"("statusId");

-- Комментарии используют универсальную таблицу Comment с entityType='TRAINING_MANAGER' или 'TRAINING_PROGRAM'

-- CreateIndex
CREATE UNIQUE INDEX "HomeworkStatus_managerId_trainingProgramId_key" ON "HomeworkStatus"("managerId", "trainingProgramId");

-- CreateIndex
CREATE INDEX "HomeworkStatus_managerId_idx" ON "HomeworkStatus"("managerId");

-- CreateIndex
CREATE INDEX "HomeworkStatus_statusId_idx" ON "HomeworkStatus"("statusId");

-- AddForeignKey
ALTER TABLE "Manager" ADD CONSTRAINT "Manager_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Manager" ADD CONSTRAINT "Manager_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "Type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentHistory" ADD CONSTRAINT "EmploymentHistory_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentHistory" ADD CONSTRAINT "EmploymentHistory_changeTypeId_fkey" FOREIGN KEY ("changeTypeId") REFERENCES "Type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingProgram" ADD CONSTRAINT "TrainingProgram_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TrainingProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingProgram" ADD CONSTRAINT "TrainingProgram_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "Type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingProgress" ADD CONSTRAINT "TrainingProgress_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingProgress" ADD CONSTRAINT "TrainingProgress_trainingProgramId_fkey" FOREIGN KEY ("trainingProgramId") REFERENCES "TrainingProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingProgress" ADD CONSTRAINT "TrainingProgress_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "Type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Комментарии используют универсальную таблицу Comment с entityType='TRAINING_MANAGER' или 'TRAINING_PROGRAM'

-- AddForeignKey
ALTER TABLE "HomeworkStatus" ADD CONSTRAINT "HomeworkStatus_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeworkStatus" ADD CONSTRAINT "HomeworkStatus_trainingProgramId_fkey" FOREIGN KEY ("trainingProgramId") REFERENCES "TrainingProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeworkStatus" ADD CONSTRAINT "HomeworkStatus_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "Type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeworkStatus" ADD CONSTRAINT "HomeworkStatus_checkerId_fkey" FOREIGN KEY ("checkerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
