-- DropIndex
DROP INDEX "cleanerTaskSchedule_clientId_cleanerId_startDate_key";

-- DropIndex
DROP INDEX "cleanerTaskSchedules_startDate_endDate_idx";

-- AlterTable
ALTER TABLE "cleanerTaskSchedule" DROP COLUMN "startDate",
DROP COLUMN "endDate",
ADD COLUMN "assignedDate" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "cleanerTaskSchedule_clientId_cleanerId_assignedDate_key" ON "cleanerTaskSchedule"("clientId", "cleanerId", "assignedDate");

-- CreateIndex
CREATE INDEX "cleanerTaskSchedule_assignedDate_idx" ON "cleanerTaskSchedule"("assignedDate");
