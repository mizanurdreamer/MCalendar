-- DevSeedData.sql
-- Seed development users with password "Password123!"
-- Requires pgcrypto extension for password hashing.
--
-- Usage:
--   Local:     psql -h localhost -U postgres -d bookingcalendar -f prisma/DevSeedData.sql
--   Docker:    docker compose exec -T db psql -U postgres -d bookingcalendar < prisma/DevSeedData.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_client_id  UUID;
  v_cleaner_id UUID;
  v_hash       TEXT;
BEGIN
  v_hash := crypt('Password123!', gen_salt('bf', 10));

  -- Ensure roles exist
  INSERT INTO "role" (id, name) VALUES (gen_random_uuid(), 'SUPER_ADMIN') ON CONFLICT (name) DO NOTHING;
  INSERT INTO "role" (id, name) VALUES (gen_random_uuid(), 'CLIENT')      ON CONFLICT (name) DO NOTHING;
  INSERT INTO "role" (id, name) VALUES (gen_random_uuid(), 'CLEANER')     ON CONFLICT (name) DO NOTHING;

  -- ============================================================
  -- client@bookingcalendar.com  (CLIENT)
  -- ============================================================
  SELECT id INTO v_client_id FROM "user" WHERE email = 'client@bookingcalendar.com';

  IF v_client_id IS NULL THEN
    INSERT INTO "user" (id, email, "passwordHash", "displayName", "roleId", "isActive", "updatedAt")
    SELECT gen_random_uuid(), 'client@bookingcalendar.com', v_hash, 'Client User', id, true, now()
    FROM "role" WHERE name = 'CLIENT'
    RETURNING id INTO v_client_id;
  END IF;

  INSERT INTO "clientProfile" (id, "userId", "Email", "firstName", "lastName", "phoneNo", "updatedAt")
  VALUES (gen_random_uuid(), v_client_id, 'client@bookingcalendar.com', 'Client', 'User', '555-0100', now())
  ON CONFLICT ("userId") DO NOTHING;

  -- ============================================================
  -- cleaner@bookingcalendar.com  (CLEANER)
  -- ============================================================
  SELECT id INTO v_cleaner_id FROM "user" WHERE email = 'cleaner@bookingcalendar.com';

  IF v_cleaner_id IS NULL THEN
    INSERT INTO "user" (id, email, "passwordHash", "displayName", "roleId", "isActive", "updatedAt")
    SELECT gen_random_uuid(), 'cleaner@bookingcalendar.com', v_hash, 'Cleaner User', id, true, now()
    FROM "role" WHERE name = 'CLEANER'
    RETURNING id INTO v_cleaner_id;
  END IF;

  INSERT INTO "cleanerProfile" (id, "userId", "Email", "firstName", "lastName", "phoneNo", "serviceArea", "hourlyRate", "updatedAt")
  VALUES (gen_random_uuid(), v_cleaner_id, 'cleaner@bookingcalendar.com', 'Cleaner', 'User', '555-0200', 'Downtown', 25, now())
  ON CONFLICT ("userId") DO NOTHING;

END $$;
