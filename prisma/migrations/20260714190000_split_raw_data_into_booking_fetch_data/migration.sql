CREATE TABLE IF NOT EXISTS "BookingFetchData" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "endpointId" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "rawData" JSONB NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingFetchData_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BookingFetchData_endpointId_payloadHash_key"
  ON "BookingFetchData"("endpointId", "payloadHash");
CREATE INDEX IF NOT EXISTS "BookingFetchData_endpointId_idx" ON "BookingFetchData"("endpointId");
CREATE INDEX IF NOT EXISTS "BookingFetchData_clientId_idx" ON "BookingFetchData"("clientId");
CREATE INDEX IF NOT EXISTS "BookingFetchData_fetchedAt_idx" ON "BookingFetchData"("fetchedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BookingFetchData_endpointId_fkey'
  ) THEN
    ALTER TABLE "BookingFetchData"
      ADD CONSTRAINT "BookingFetchData_endpointId_fkey"
      FOREIGN KEY ("endpointId") REFERENCES "ClientBookingEndpoints"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BookingFetchData_clientId_fkey'
  ) THEN
    ALTER TABLE "BookingFetchData"
      ADD CONSTRAINT "BookingFetchData_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "BookingFetchData" ("endpointId", "clientId", "payloadHash", "rawData", "fetchedAt")
SELECT
  g."endpointId",
  g."clientId",
  md5(g."rawData"::text) AS "payloadHash",
  g."rawData",
  MAX(g."fetchedAt") AS "fetchedAt"
FROM "GuestBookingInfo" g
GROUP BY g."endpointId", g."clientId", md5(g."rawData"::text), g."rawData"
ON CONFLICT ("endpointId", "payloadHash")
DO UPDATE SET "fetchedAt" = GREATEST("BookingFetchData"."fetchedAt", EXCLUDED."fetchedAt");

ALTER TABLE "GuestBookingInfo"
  ADD COLUMN IF NOT EXISTS "fetchDataId" UUID;

UPDATE "GuestBookingInfo" g
SET "fetchDataId" = b."id"
FROM "BookingFetchData" b
WHERE b."endpointId" = g."endpointId"
  AND b."clientId" = g."clientId"
  AND b."payloadHash" = md5(g."rawData"::text)
  AND g."fetchDataId" IS NULL;

ALTER TABLE "GuestBookingInfo"
  ALTER COLUMN "fetchDataId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "GuestBookingInfo_fetchDataId_idx"
  ON "GuestBookingInfo"("fetchDataId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'GuestBookingInfo_fetchDataId_fkey'
  ) THEN
    ALTER TABLE "GuestBookingInfo"
      ADD CONSTRAINT "GuestBookingInfo_fetchDataId_fkey"
      FOREIGN KEY ("fetchDataId") REFERENCES "BookingFetchData"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DROP INDEX IF EXISTS "GuestBookingInfo_fetchedAt_idx";
ALTER TABLE "GuestBookingInfo" DROP COLUMN IF EXISTS "rawData";
ALTER TABLE "GuestBookingInfo" DROP COLUMN IF EXISTS "fetchedAt";
