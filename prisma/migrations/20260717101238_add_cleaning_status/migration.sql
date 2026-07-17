-- AlterTable
ALTER TABLE "cleanerTaskSchedule" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ASSIGNED';

-- CreateIndex
CREATE INDEX "cleanerTaskSchedule_status_idx" ON "cleanerTaskSchedule"("status");
