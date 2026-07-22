-- Drop indexes from columns that will be removed
DROP INDEX IF EXISTS "cleanerTaskSchedule_clientId_cleanerId_startDate_key";
DROP INDEX IF EXISTS "cleanerTaskSchedules_startDate_endDate_idx";

-- Alter cleanerTaskSchedule: replace startDate/endDate with assignedDate, add SMS fields, add integer status
ALTER TABLE "cleanerTaskSchedule"
  DROP COLUMN "startDate",
  DROP COLUMN "endDate",
  ADD COLUMN "assignedDate" TIMESTAMP(3) NOT NULL,
  ADD COLUMN "isSentSms" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "smsSentDate" TIMESTAMP(3),
  ADD COLUMN "status" INTEGER NOT NULL DEFAULT 0;

-- Alter cleanerProfile: add clientId
ALTER TABLE "cleanerProfile" ADD COLUMN "clientId" UUID;

-- Alter cleanerAvailability: add clientId
ALTER TABLE "cleanerAvailability" ADD COLUMN "clientId" UUID;

-- Create new indexes
CREATE UNIQUE INDEX "cleanerTaskSchedule_clientId_cleanerId_assignedDate_key" ON "cleanerTaskSchedule"("clientId", "cleanerId", "assignedDate");
CREATE INDEX "cleanerTaskSchedule_assignedDate_idx" ON "cleanerTaskSchedule"("assignedDate");
CREATE INDEX "cleanerTaskSchedule_status_idx" ON "cleanerTaskSchedule"("status");
CREATE INDEX "cleanerTaskSchedule_isSentSms_idx" ON "cleanerTaskSchedule"("isSentSms");
CREATE INDEX "cleanerTaskSchedule_smsSentDate_idx" ON "cleanerTaskSchedule"("smsSentDate");
CREATE INDEX "cleanerAvailability_clientId_idx" ON "cleanerAvailability"("clientId");
CREATE INDEX "cleanerProfile_clientId_idx" ON "cleanerProfile"("clientId");

-- Add foreign keys
ALTER TABLE "cleanerAvailability" ADD CONSTRAINT "cleanerAvailability_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cleanerProfile" ADD CONSTRAINT "cleanerProfile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clientProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
