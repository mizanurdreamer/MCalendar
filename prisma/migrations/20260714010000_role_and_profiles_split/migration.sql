CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS "roles" (
  "name" VARCHAR(32) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "roles_pkey" PRIMARY KEY ("name")
);

INSERT INTO "roles" ("name") VALUES ('SUPER_ADMIN'), ('CLIENT'), ('CLEANER')
ON CONFLICT ("name") DO NOTHING;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "roleId" TEXT;
UPDATE "users" SET "roleId" = COALESCE("roleId", "role"::text);
ALTER TABLE "users" ALTER COLUMN "roleId" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_roleId_fkey'
  ) THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_roleId_fkey"
      FOREIGN KEY ("roleId") REFERENCES "roles"("name")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS "users_roleId_idx" ON "users"("roleId");

CREATE TABLE IF NOT EXISTS "client_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" UUID,
  "updatedBy" UUID,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "client_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "client_profiles_userId_key" ON "client_profiles"("userId");
CREATE INDEX IF NOT EXISTS "client_profiles_deletedAt_idx" ON "client_profiles"("deletedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_profiles_userId_fkey'
  ) THEN
    ALTER TABLE "client_profiles"
      ADD CONSTRAINT "client_profiles_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "cleaner_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" UUID,
  "updatedBy" UUID,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "cleaner_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cleaner_profiles_userId_key" ON "cleaner_profiles"("userId");
CREATE INDEX IF NOT EXISTS "cleaner_profiles_deletedAt_idx" ON "cleaner_profiles"("deletedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cleaner_profiles_userId_fkey'
  ) THEN
    ALTER TABLE "cleaner_profiles"
      ADD CONSTRAINT "cleaner_profiles_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

INSERT INTO "client_profiles" ("id", "userId", "createdAt", "updatedAt", "deletedAt")
SELECT gen_random_uuid(), u."id", u."createdAt", NOW(), u."deletedAt"
FROM "users" u
WHERE u."roleId" = 'CLIENT'
  AND NOT EXISTS (SELECT 1 FROM "client_profiles" cp WHERE cp."userId" = u."id");

INSERT INTO "cleaner_profiles" ("id", "userId", "createdAt", "updatedAt", "deletedAt")
SELECT gen_random_uuid(), u."id", u."createdAt", NOW(), u."deletedAt"
FROM "users" u
WHERE u."roleId" = 'CLEANER'
  AND NOT EXISTS (SELECT 1 FROM "cleaner_profiles" cp WHERE cp."userId" = u."id");

CREATE TABLE IF NOT EXISTS "ClientBookingData" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "endpointId" UUID NOT NULL,
  "clientId" UUID NOT NULL,
  "rawData" JSONB NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "summary" TEXT,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "status" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientBookingData_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ClientBookingData_endpointId_idx" ON "ClientBookingData"("endpointId");
CREATE INDEX IF NOT EXISTS "ClientBookingData_clientId_idx" ON "ClientBookingData"("clientId");
CREATE INDEX IF NOT EXISTS "ClientBookingData_fetchedAt_idx" ON "ClientBookingData"("fetchedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ClientBookingData_endpointId_fkey'
  ) THEN
    ALTER TABLE "ClientBookingData"
      ADD CONSTRAINT "ClientBookingData_endpointId_fkey"
      FOREIGN KEY ("endpointId") REFERENCES "ClientBookingEndpoints"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ClientBookingData_clientId_fkey'
  ) THEN
    ALTER TABLE "ClientBookingData"
      ADD CONSTRAINT "ClientBookingData_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "CleanerAssignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "clientId" UUID NOT NULL,
  "cleanerId" UUID NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" UUID,
  "updatedBy" UUID,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "CleanerAssignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CleanerAssignments_clientId_cleanerId_startDate_key"
  ON "CleanerAssignments"("clientId", "cleanerId", "startDate");
CREATE INDEX IF NOT EXISTS "CleanerAssignments_clientId_idx" ON "CleanerAssignments"("clientId");
CREATE INDEX IF NOT EXISTS "CleanerAssignments_cleanerId_idx" ON "CleanerAssignments"("cleanerId");
CREATE INDEX IF NOT EXISTS "CleanerAssignments_startDate_endDate_idx" ON "CleanerAssignments"("startDate", "endDate");
CREATE INDEX IF NOT EXISTS "CleanerAssignments_deletedAt_idx" ON "CleanerAssignments"("deletedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CleanerAssignments_clientId_fkey'
  ) THEN
    ALTER TABLE "CleanerAssignments"
      ADD CONSTRAINT "CleanerAssignments_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CleanerAssignments_cleanerId_fkey'
  ) THEN
    ALTER TABLE "CleanerAssignments"
      ADD CONSTRAINT "CleanerAssignments_cleanerId_fkey"
      FOREIGN KEY ("cleanerId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'refresh_tokens_userId_fkey'
  ) THEN
    ALTER TABLE "refresh_tokens"
      ADD CONSTRAINT "refresh_tokens_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DROP INDEX IF EXISTS "users_role_idx";
ALTER TABLE "users" DROP COLUMN IF EXISTS "role";
DROP TYPE IF EXISTS "Role";
