-- Drop indexes from columns that will be removed
DROP INDEX IF EXISTS "roomAttendantTaskSchedule_clientId_roomAttendantId_startDate_key";
DROP INDEX IF EXISTS "roomAttendantTaskSchedules_startDate_endDate_idx";

-- Alter roomAttendantTaskSchedule: replace startDate/endDate with assignedDate, add SMS fields, add integer status
ALTER TABLE "roomAttendantTaskSchedule"
  DROP COLUMN "startDate",
  DROP COLUMN "endDate",
  ADD COLUMN "assignedDate" TIMESTAMP(3) NOT NULL,
  ADD COLUMN "isSentSms" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "smsSentDate" TIMESTAMP(3),
  ADD COLUMN "status" INTEGER NOT NULL DEFAULT 0;

-- Alter roomAttendantProfile: add clientId
ALTER TABLE "roomAttendantProfile" ADD COLUMN "clientId" UUID;
jj
-- Alter roomAttendantAvailability: add clientId
ALTER TABLE "roomAttendantAvailability" ADD COLUMN "clientId" UUID;

-- Create new indexes
CREATE UNIQUE INDEX "roomAttendantTaskSchedule_clientId_roomAttendantId_assignedDate_key" ON "roomAttendantTaskSchedule"("clientId", "roomAttendantId", "assignedDate");
CREATE INDEX "roomAttendantTaskSchedule_assignedDate_idx" ON "roomAttendantTaskSchedule"("assignedDate");
CREATE INDEX "roomAttendantTaskSchedule_status_idx" ON "roomAttendantTaskSchedule"("status");
CREATE INDEX "roomAttendantTaskSchedule_isSentSms_idx" ON "roomAttendantTaskSchedule"("isSentSms");
CREATE INDEX "roomAttendantTaskSchedule_smsSentDate_idx" ON "roomAttendantTaskSchedule"("smsSentDate");
CREATE INDEX "roomAttendantAvailability_clientId_idx" ON "roomAttendantAvailability"("clientId");
CREATE INDEX "roomAttendantProfile_clientId_idx" ON "roomAttendantProfile"("clientId");

-- Add foreign keys
ALTER TABLE "roomAttendantAvailability" ADD CONSTRAINT "roomAttendantAvailability_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "roomAttendantProfile" ADD CONSTRAINT "roomAttendantProfile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clientProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
