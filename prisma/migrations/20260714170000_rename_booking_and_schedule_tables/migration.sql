DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ClientBookingData'
  ) THEN
    ALTER TABLE "ClientBookingData" RENAME TO "GuestBookingInfo";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'CleanerAssignments'
  ) THEN
    ALTER TABLE "CleanerAssignments" RENAME TO "CleanerTaskSchedules";
  END IF;
END $$;

ALTER INDEX IF EXISTS "ClientBookingData_endpointId_idx" RENAME TO "GuestBookingInfo_endpointId_idx";
ALTER INDEX IF EXISTS "ClientBookingData_clientId_idx" RENAME TO "GuestBookingInfo_clientId_idx";
ALTER INDEX IF EXISTS "ClientBookingData_fetchedAt_idx" RENAME TO "GuestBookingInfo_fetchedAt_idx";
ALTER INDEX IF EXISTS "ClientBookingData_pkey" RENAME TO "GuestBookingInfo_pkey";

ALTER INDEX IF EXISTS "CleanerAssignments_clientId_cleanerId_startDate_key"
  RENAME TO "CleanerTaskSchedules_clientId_cleanerId_startDate_key";
ALTER INDEX IF EXISTS "CleanerAssignments_clientId_idx" RENAME TO "CleanerTaskSchedules_clientId_idx";
ALTER INDEX IF EXISTS "CleanerAssignments_cleanerId_idx" RENAME TO "CleanerTaskSchedules_cleanerId_idx";
ALTER INDEX IF EXISTS "CleanerAssignments_startDate_endDate_idx"
  RENAME TO "CleanerTaskSchedules_startDate_endDate_idx";
ALTER INDEX IF EXISTS "CleanerAssignments_deletedAt_idx" RENAME TO "CleanerTaskSchedules_deletedAt_idx";
ALTER INDEX IF EXISTS "CleanerAssignments_pkey" RENAME TO "CleanerTaskSchedules_pkey";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ClientBookingData_endpointId_fkey'
  ) THEN
    ALTER TABLE "GuestBookingInfo"
      RENAME CONSTRAINT "ClientBookingData_endpointId_fkey" TO "GuestBookingInfo_endpointId_fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ClientBookingData_clientId_fkey'
  ) THEN
    ALTER TABLE "GuestBookingInfo"
      RENAME CONSTRAINT "ClientBookingData_clientId_fkey" TO "GuestBookingInfo_clientId_fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CleanerAssignments_clientId_fkey'
  ) THEN
    ALTER TABLE "CleanerTaskSchedules"
      RENAME CONSTRAINT "CleanerAssignments_clientId_fkey" TO "CleanerTaskSchedules_clientId_fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CleanerAssignments_cleanerId_fkey'
  ) THEN
    ALTER TABLE "CleanerTaskSchedules"
      RENAME CONSTRAINT "CleanerAssignments_cleanerId_fkey" TO "CleanerTaskSchedules_cleanerId_fkey";
  END IF;
END $$;
