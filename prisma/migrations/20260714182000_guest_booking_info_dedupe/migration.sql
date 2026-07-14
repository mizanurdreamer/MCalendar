ALTER TABLE "GuestBookingInfo"
  ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT;

UPDATE "GuestBookingInfo"
SET "dedupeKey" = md5(
  concat_ws(
    '|',
    "endpointId"::text,
    coalesce("summary", ''),
    coalesce("status", ''),
    coalesce(to_char("startDate", 'YYYY-MM-DD"T"HH24:MI:SS.MS'), ''),
    coalesce(to_char("endDate", 'YYYY-MM-DD"T"HH24:MI:SS.MS'), '')
  )
)
WHERE "dedupeKey" IS NULL;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "dedupeKey"
      ORDER BY "fetchedAt" DESC, "createdAt" DESC, id DESC
    ) AS rn
  FROM "GuestBookingInfo"
)
DELETE FROM "GuestBookingInfo" g
USING ranked r
WHERE g.id = r.id
  AND r.rn > 1;

ALTER TABLE "GuestBookingInfo"
  ALTER COLUMN "dedupeKey" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "GuestBookingInfo_dedupeKey_key"
  ON "GuestBookingInfo"("dedupeKey");
