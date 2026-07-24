-- DevSeedData.sql
-- Comprehensive seed for testing AutoAssignRoomAttendantJob
-- Password for all users: Password123!
-- Requires pgcrypto extension.
--
-- Usage:
--   Local:     psql -h localhost -U postgres -d bookingcalendar -f prisma/seedData/DevSeedData.sql
--   Docker:    docker compose exec -T db psql -U postgres -d bookingcalendar < prisma/seedData/DevSeedData.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_hash TEXT;

  -- Role IDs
  v_client_role_id       UUID;
  v_attendant_role_id    UUID;

  -- SMS Gateway
  v_sms_gateway_id       UUID;

  -- Client IDs (user + profile)
  v_client1_user_id      UUID;
  v_client1_profile_id   UUID;
  v_client2_user_id      UUID;
  v_client2_profile_id   UUID;
  v_client3_user_id      UUID;
  v_client3_profile_id   UUID;

  -- Room Attendant IDs (user + profile)
  v_att1_user_id         UUID;
  v_att1_profile_id      UUID;
  v_att2_user_id         UUID;
  v_att2_profile_id      UUID;
  v_att3_user_id         UUID;
  v_att3_profile_id      UUID;
  v_att4_user_id         UUID;
  v_att4_profile_id      UUID;

  -- Booking Provider IDs
  v_provider1_id         UUID;
  v_provider2_id         UUID;
  v_provider3_id         UUID;

  -- Booking Fetch Data IDs
  v_fetch1_id            UUID;
  v_fetch2_id            UUID;
  v_fetch3_id            UUID;

  -- Booking IDs (GuestBookingInfo)
  v_booking1_id          UUID;
  v_booking2_id          UUID;
  v_booking3_id          UUID;
  v_booking4_id          UUID;
  v_booking5_id          UUID;
  v_booking6_id          UUID;

  -- Task Schedule IDs
  v_schedule1_id         UUID;
  v_schedule2_id         UUID;
  v_schedule3_id         UUID;

  -- Availability IDs
  v_avail1_id            UUID;
  v_avail2_id            UUID;
  v_avail3_id            UUID;
  v_avail4_id            UUID;

BEGIN
  v_hash := crypt('Password123!', gen_salt('bf', 10));

  -- ============================================================
  -- 1. ROLES
  -- ============================================================
  INSERT INTO "role" (id, name)
  VALUES (gen_random_uuid(), 'SUPER_ADMIN')
  ON CONFLICT (name) DO NOTHING;

  INSERT INTO "role" (id, name)
  VALUES (gen_random_uuid(), 'CLIENT')
  ON CONFLICT (name) DO NOTHING
  RETURNING id INTO v_client_role_id;

  INSERT INTO "role" (id, name)
  VALUES (gen_random_uuid(), 'ROOM_ATTENDANT')
  ON CONFLICT (name) DO NOTHING
  RETURNING id INTO v_attendant_role_id;

  -- Re-fetch role IDs if they already existed
  SELECT id INTO v_client_role_id FROM "role" WHERE name = 'CLIENT';
  SELECT id INTO v_attendant_role_id FROM "role" WHERE name = 'ROOM_ATTENDANT';

  -- ============================================================
  -- 2. SMS GATEWAY
  -- ============================================================
  INSERT INTO "smsGateway" (id, name, domain, "updatedAt")
  VALUES (gen_random_uuid(), 'TestGateway', 'email.uscc.net', now())
  ON CONFLICT (name) DO NOTHING;

  SELECT id INTO v_sms_gateway_id FROM "smsGateway" WHERE name = 'TestGateway';

  -- ============================================================
  -- 3. CLIENTS
  -- ============================================================

  -- client1: "Alpha Client"
  SELECT id INTO v_client1_user_id FROM "user" WHERE email = 'client1@test.com';
  IF v_client1_user_id IS NULL THEN
    INSERT INTO "user" (id, email, "passwordHash", "displayName", "roleId", "isActive", "updatedAt")
    VALUES (gen_random_uuid(), 'client1@test.com', v_hash, 'Alpha Client', v_client_role_id, true, now())
    RETURNING id INTO v_client1_user_id;
  END IF;

  INSERT INTO "clientProfile" (id, "userId", "Email", "firstName", "lastName", "phoneNo", "updatedAt")
  VALUES (gen_random_uuid(), v_client1_user_id, 'client1@test.com', 'Alpha', 'Client', '555-0100', now())
  ON CONFLICT ("userId") DO NOTHING;
  SELECT id INTO v_client1_profile_id FROM "clientProfile" WHERE "userId" = v_client1_user_id;

  -- client2: "Beta Client"
  SELECT id INTO v_client2_user_id FROM "user" WHERE email = 'client2@test.com';
  IF v_client2_user_id IS NULL THEN
    INSERT INTO "user" (id, email, "passwordHash", "displayName", "roleId", "isActive", "updatedAt")
    VALUES (gen_random_uuid(), 'client2@test.com', v_hash, 'Beta Client', v_client_role_id, true, now())
    RETURNING id INTO v_client2_user_id;
  END IF;

  INSERT INTO "clientProfile" (id, "userId", "Email", "firstName", "lastName", "phoneNo", "updatedAt")
  VALUES (gen_random_uuid(), v_client2_user_id, 'client2@test.com', 'Beta', 'Client', '555-0101', now())
  ON CONFLICT ("userId") DO NOTHING;
  SELECT id INTO v_client2_profile_id FROM "clientProfile" WHERE "userId" = v_client2_user_id;

  -- client3: "Gamma Client"
  SELECT id INTO v_client3_user_id FROM "user" WHERE email = 'client3@test.com';
  IF v_client3_user_id IS NULL THEN
    INSERT INTO "user" (id, email, "passwordHash", "displayName", "roleId", "isActive", "updatedAt")
    VALUES (gen_random_uuid(), 'client3@test.com', v_hash, 'Gamma Client', v_client_role_id, true, now())
    RETURNING id INTO v_client3_user_id;
  END IF;

  INSERT INTO "clientProfile" (id, "userId", "Email", "firstName", "lastName", "phoneNo", "updatedAt")
  VALUES (gen_random_uuid(), v_client3_user_id, 'client3@test.com', 'Gamma', 'Client', '555-0102', now())
  ON CONFLICT ("userId") DO NOTHING;
  SELECT id INTO v_client3_profile_id FROM "clientProfile" WHERE "userId" = v_client3_user_id;

  -- ============================================================
  -- 4. ROOM ATTENDANTS
  -- ============================================================

  -- attendant1: "John Doe" — dedicated to client1
  SELECT id INTO v_att1_user_id FROM "user" WHERE email = 'attendant1@test.com';
  IF v_att1_user_id IS NULL THEN
    INSERT INTO "user" (id, email, "passwordHash", "displayName", "roleId", "isActive", "updatedAt")
    VALUES (gen_random_uuid(), 'attendant1@test.com', v_hash, 'John Doe', v_attendant_role_id, true, now())
    RETURNING id INTO v_att1_user_id;
  END IF;

  INSERT INTO "roomAttendantProfile" (id, "userId", "clientId", "Email", "firstName", "lastName", "phoneNo", "smsGatewayId", "serviceArea", "hourlyRate", "updatedAt")
  VALUES (gen_random_uuid(), v_att1_user_id, v_client1_profile_id, 'attendant1@test.com', 'John', 'Doe', '555-0200', v_sms_gateway_id, 'Downtown', 25, now())
  ON CONFLICT ("userId") DO NOTHING;
  SELECT id INTO v_att1_profile_id FROM "roomAttendantProfile" WHERE "userId" = v_att1_user_id;

  -- attendant2: "Jane Smith" — dedicated to client2
  SELECT id INTO v_att2_user_id FROM "user" WHERE email = 'attendant2@test.com';
  IF v_att2_user_id IS NULL THEN
    INSERT INTO "user" (id, email, "passwordHash", "displayName", "roleId", "isActive", "updatedAt")
    VALUES (gen_random_uuid(), 'attendant2@test.com', v_hash, 'Jane Smith', v_attendant_role_id, true, now())
    RETURNING id INTO v_att2_user_id;
  END IF;

  INSERT INTO "roomAttendantProfile" (id, "userId", "clientId", "Email", "firstName", "lastName", "phoneNo", "smsGatewayId", "serviceArea", "hourlyRate", "updatedAt")
  VALUES (gen_random_uuid(), v_att2_user_id, v_client2_profile_id, 'attendant2@test.com', 'Jane', 'Smith', '555-0201', v_sms_gateway_id, 'Uptown', 28, now())
  ON CONFLICT ("userId") DO NOTHING;
  SELECT id INTO v_att2_profile_id FROM "roomAttendantProfile" WHERE "userId" = v_att2_user_id;

  -- attendant3: "Bob Wilson" — free pool (assigned to client1 so appears in free pool for all clients)
  SELECT id INTO v_att3_user_id FROM "user" WHERE email = 'attendant3@test.com';
  IF v_att3_user_id IS NULL THEN
    INSERT INTO "user" (id, email, "passwordHash", "displayName", "roleId", "isActive", "updatedAt")
    VALUES (gen_random_uuid(), 'attendant3@test.com', v_hash, 'Bob Wilson', v_attendant_role_id, true, now())
    RETURNING id INTO v_att3_user_id;
  END IF;

  INSERT INTO "roomAttendantProfile" (id, "userId", "clientId", "Email", "firstName", "lastName", "phoneNo", "smsGatewayId", "serviceArea", "hourlyRate", "updatedAt")
  VALUES (gen_random_uuid(), v_att3_user_id, v_client1_profile_id, 'attendant3@test.com', 'Bob', 'Wilson', '555-0202', v_sms_gateway_id, 'Suburb', 22, now())
  ON CONFLICT ("userId") DO NOTHING;
  SELECT id INTO v_att3_profile_id FROM "roomAttendantProfile" WHERE "userId" = v_att3_user_id;

  -- attendant4: "Alice Brown" — free pool (assigned to client3 so client3 has a free pool)
  SELECT id INTO v_att4_user_id FROM "user" WHERE email = 'attendant4@test.com';
  IF v_att4_user_id IS NULL THEN
    INSERT INTO "user" (id, email, "passwordHash", "displayName", "roleId", "isActive", "updatedAt")
    VALUES (gen_random_uuid(), 'attendant4@test.com', v_hash, 'Alice Brown', v_attendant_role_id, true, now())
    RETURNING id INTO v_att4_user_id;
  END IF;

  INSERT INTO "roomAttendantProfile" (id, "userId", "clientId", "Email", "firstName", "lastName", "phoneNo", "smsGatewayId", "serviceArea", "hourlyRate", "updatedAt")
  VALUES (gen_random_uuid(), v_att4_user_id, v_client3_profile_id, 'attendant4@test.com', 'Alice', 'Brown', '555-0203', v_sms_gateway_id, 'Beach', 30, now())
  ON CONFLICT ("userId") DO NOTHING;
  SELECT id INTO v_att4_profile_id FROM "roomAttendantProfile" WHERE "userId" = v_att4_user_id;

  -- ============================================================
  -- 5. ROOM ATTENDANT AVAILABILITY (all available from yesterday onward)
  -- ============================================================
  INSERT INTO "roomAttendantAvailability" (id, "clientId", "roomAttendantId", "fromDate", "isActive", "updatedAt")
  VALUES (gen_random_uuid(), v_client1_profile_id, v_att1_profile_id, CURRENT_DATE - 1, true, now())
  ON CONFLICT DO NOTHING;

  INSERT INTO "roomAttendantAvailability" (id, "clientId", "roomAttendantId", "fromDate", "isActive", "updatedAt")
  VALUES (gen_random_uuid(), v_client2_profile_id, v_att2_profile_id, CURRENT_DATE - 1, true, now())
  ON CONFLICT DO NOTHING;

  INSERT INTO "roomAttendantAvailability" (id, "clientId", "roomAttendantId", "fromDate", "isActive", "updatedAt")
  VALUES (gen_random_uuid(), v_client1_profile_id, v_att3_profile_id, CURRENT_DATE - 1, true, now())
  ON CONFLICT DO NOTHING;

  INSERT INTO "roomAttendantAvailability" (id, "clientId", "roomAttendantId", "fromDate", "isActive", "updatedAt")
  VALUES (gen_random_uuid(), v_client3_profile_id, v_att4_profile_id, CURRENT_DATE - 1, true, now())
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- 6. BOOKING PROVIDERS + FETCH DATA + GUEST BOOKINGS
  -- ============================================================

  -- Provider for client1
  INSERT INTO "clientBookingProvider" (id, "clientId", name, url, "isActive", "updatedAt")
  VALUES (gen_random_uuid(), v_client1_profile_id, 'Airbnb', 'https://airbnb.com/alpha', true, now())
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_provider1_id FROM "clientBookingProvider" WHERE "clientId" = v_client1_profile_id LIMIT 1;

  -- Provider for client2
  INSERT INTO "clientBookingProvider" (id, "clientId", name, url, "isActive", "updatedAt")
  VALUES (gen_random_uuid(), v_client2_profile_id, 'Booking.com', 'https://booking.com/beta', true, now())
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_provider2_id FROM "clientBookingProvider" WHERE "clientId" = v_client2_profile_id LIMIT 1;

  -- Provider for client3
  INSERT INTO "clientBookingProvider" (id, "clientId", name, url, "isActive", "updatedAt")
  VALUES (gen_random_uuid(), v_client3_profile_id, 'VRBO', 'https://vrbo.com/gamma', true, now())
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_provider3_id FROM "clientBookingProvider" WHERE "clientId" = v_client3_profile_id LIMIT 1;

  -- FetchData for provider1
  INSERT INTO "bookingFetchData" (id, "providerId", "clientId", "payloadHash", "rawData", "fetchedAt")
  VALUES (gen_random_uuid(), v_provider1_id, v_client1_profile_id, 'hash1', '{}'::jsonb, now())
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_fetch1_id FROM "bookingFetchData" WHERE "providerId" = v_provider1_id LIMIT 1;

  -- FetchData for provider2
  INSERT INTO "bookingFetchData" (id, "providerId", "clientId", "payloadHash", "rawData", "fetchedAt")
  VALUES (gen_random_uuid(), v_provider2_id, v_client2_profile_id, 'hash2', '{}'::jsonb, now())
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_fetch2_id FROM "bookingFetchData" WHERE "providerId" = v_provider2_id LIMIT 1;

  -- FetchData for provider3
  INSERT INTO "bookingFetchData" (id, "providerId", "clientId", "payloadHash", "rawData", "fetchedAt")
  VALUES (gen_random_uuid(), v_provider3_id, v_client3_profile_id, 'hash3', '{}'::jsonb, now())
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_fetch3_id FROM "bookingFetchData" WHERE "providerId" = v_provider3_id LIMIT 1;

  -- ============================================================
  -- GUEST BOOKINGS (6 bookings covering all test scenarios)
  -- ============================================================

  -- Scenario 3: client1, startDate = today-5, endDate = today+2
  --   → existing schedule (attendant1), Initial sent, needs Reminder
  INSERT INTO "guestBookingInfo" (id, "providerId", "clientId", "fetchDataId", "dedupeKey", summary, "startDate", "endDate", status)
  VALUES (gen_random_uuid(), v_provider1_id, v_client1_profile_id, v_fetch1_id, 'booking-scenario3', 'Beach House - Scenario 3', CURRENT_DATE - 5, CURRENT_DATE + 2, 'confirmed');
  SELECT id INTO v_booking1_id FROM "guestBookingInfo" WHERE "dedupeKey" = 'booking-scenario3';

  -- Scenario 4: client2, startDate = today-3, endDate = today+1
  --   → existing schedule (attendant2), Initial record exists with null status, needs Initial send
  INSERT INTO "guestBookingInfo" (id, "providerId", "clientId", "fetchDataId", "dedupeKey", summary, "startDate", "endDate", status)
  VALUES (gen_random_uuid(), v_provider2_id, v_client2_profile_id, v_fetch2_id, 'booking-scenario4', 'Condo - Scenario 4', CURRENT_DATE - 3, CURRENT_DATE + 1, 'confirmed');
  SELECT id INTO v_booking2_id FROM "guestBookingInfo" WHERE "dedupeKey" = 'booking-scenario4';

  -- Scenario 1: client1, startDate = today-2, endDate = today+5
  --   → no schedule yet, today >= startDate → job will create + send Initial
  INSERT INTO "guestBookingInfo" (id, "providerId", "clientId", "fetchDataId", "dedupeKey", summary, "startDate", "endDate", status)
  VALUES (gen_random_uuid(), v_provider1_id, v_client1_profile_id, v_fetch1_id, 'booking-scenario1', 'Villa - Scenario 1', CURRENT_DATE - 2, CURRENT_DATE + 5, 'confirmed');
  SELECT id INTO v_booking3_id FROM "guestBookingInfo" WHERE "dedupeKey" = 'booking-scenario1';

  -- Scenario 2: client2, startDate = today+1, endDate = today+8
  --   → no schedule yet, startDate in future → job will create + defer Initial
  INSERT INTO "guestBookingInfo" (id, "providerId", "clientId", "fetchDataId", "dedupeKey", summary, "startDate", "endDate", status)
  VALUES (gen_random_uuid(), v_provider2_id, v_client2_profile_id, v_fetch2_id, 'booking-scenario2', 'Penthouse - Scenario 2', CURRENT_DATE + 1, CURRENT_DATE + 8, 'confirmed');
  SELECT id INTO v_booking4_id FROM "guestBookingInfo" WHERE "dedupeKey" = 'booking-scenario2';

  -- Scenario 5: client3, startDate = today-10, endDate = today-3
  --   → existing schedule (bob), Initial + Reminder already sent, nothing to do
  INSERT INTO "guestBookingInfo" (id, "providerId", "clientId", "fetchDataId", "dedupeKey", summary, "startDate", "endDate", status)
  VALUES (gen_random_uuid(), v_provider3_id, v_client3_profile_id, v_fetch3_id, 'booking-scenario5', 'Cabin - Scenario 5', CURRENT_DATE - 10, CURRENT_DATE - 3, 'checked-out');
  SELECT id INTO v_booking5_id FROM "guestBookingInfo" WHERE "dedupeKey" = 'booking-scenario5';

  -- Scenario 6: client3, startDate = today, endDate = today+6
  --   → no schedule yet, no dedicated attendant → job uses free pool
  INSERT INTO "guestBookingInfo" (id, "providerId", "clientId", "fetchDataId", "dedupeKey", summary, "startDate", "endDate", status)
  VALUES (gen_random_uuid(), v_provider3_id, v_client3_profile_id, v_fetch3_id, 'booking-scenario6', 'Lake House - Scenario 6', CURRENT_DATE, CURRENT_DATE + 6, 'confirmed');
  SELECT id INTO v_booking6_id FROM "guestBookingInfo" WHERE "dedupeKey" = 'booking-scenario6';

  -- ============================================================
  -- 7. EXISTING TASK SCHEDULES
  -- ============================================================

  -- Schedule for Scenario 3: client1 + attendant1, assignedDate = endDate = today+2
  INSERT INTO "roomAttendantTaskSchedule" (id, "clientId", "roomAttendantId", "assignedDate", status, "isActive", "updatedAt")
  VALUES (gen_random_uuid(), v_client1_profile_id, v_att1_profile_id, CURRENT_DATE + 2, 0, true, now())
  ON CONFLICT ("clientId", "roomAttendantId", "assignedDate") DO NOTHING;
  SELECT id INTO v_schedule1_id FROM "roomAttendantTaskSchedule"
    WHERE "clientId" = v_client1_profile_id AND "roomAttendantId" = v_att1_profile_id AND "assignedDate" = CURRENT_DATE + 2;

  -- Schedule for Scenario 4: client2 + attendant2, assignedDate = endDate = today+1
  INSERT INTO "roomAttendantTaskSchedule" (id, "clientId", "roomAttendantId", "assignedDate", status, "isActive", "updatedAt")
  VALUES (gen_random_uuid(), v_client2_profile_id, v_att2_profile_id, CURRENT_DATE + 1, 0, true, now())
  ON CONFLICT ("clientId", "roomAttendantId", "assignedDate") DO NOTHING;
  SELECT id INTO v_schedule2_id FROM "roomAttendantTaskSchedule"
    WHERE "clientId" = v_client2_profile_id AND "roomAttendantId" = v_att2_profile_id AND "assignedDate" = CURRENT_DATE + 1;

  -- Schedule for Scenario 5: client3 + attendant3 (free), assignedDate = endDate = today-3
  INSERT INTO "roomAttendantTaskSchedule" (id, "clientId", "roomAttendantId", "assignedDate", status, "isActive", "updatedAt")
  VALUES (gen_random_uuid(), v_client3_profile_id, v_att3_profile_id, CURRENT_DATE - 3, 0, true, now())
  ON CONFLICT ("clientId", "roomAttendantId", "assignedDate") DO NOTHING;
  SELECT id INTO v_schedule3_id FROM "roomAttendantTaskSchedule"
    WHERE "clientId" = v_client3_profile_id AND "roomAttendantId" = v_att3_profile_id AND "assignedDate" = CURRENT_DATE - 3;

  -- ============================================================
  -- 8. NOTIFICATION HISTORY
  -- ============================================================

  -- Scenario 3: Initial sent (smsSentStatus=1), no Reminder yet → job should send Reminder
  INSERT INTO "roomAttendantTaskNotificationHistory" (id, "clientId", "roomAttendantId", "taskScheduleId", "Email", "firstName", "lastName", "phoneNo", "notificationType", "notificationDate", "emailSentStatus", "emailFailedResult", "smsSentStatus", "smsFailedResult")
  VALUES (gen_random_uuid(), v_client1_profile_id, v_att1_profile_id, v_schedule1_id, 'attendant1@test.com', 'John', 'Doe', '555-0200', 0, CURRENT_DATE - 5, NULL, '', 1, '');

  -- Scenario 4: Initial record exists but null smsSentStatus (deferred) → job should send Initial
  INSERT INTO "roomAttendantTaskNotificationHistory" (id, "clientId", "roomAttendantId", "taskScheduleId", "Email", "firstName", "lastName", "phoneNo", "notificationType", "notificationDate", "emailSentStatus", "emailFailedResult", "smsSentStatus", "smsFailedResult")
  VALUES (gen_random_uuid(), v_client2_profile_id, v_att2_profile_id, v_schedule2_id, 'attendant2@test.com', 'Jane', 'Smith', '555-0201', 0, NULL, NULL, '', NULL, '');

  -- Scenario 5: Initial sent + Reminder sent (complete)
  INSERT INTO "roomAttendantTaskNotificationHistory" (id, "clientId", "roomAttendantId", "taskScheduleId", "Email", "firstName", "lastName", "phoneNo", "notificationType", "notificationDate", "emailSentStatus", "emailFailedResult", "smsSentStatus", "smsFailedResult")
  VALUES (gen_random_uuid(), v_client3_profile_id, v_att3_profile_id, v_schedule3_id, 'attendant3@test.com', 'Bob', 'Wilson', '555-0202', 0, CURRENT_DATE - 10, NULL, '', 1, '');

  INSERT INTO "roomAttendantTaskNotificationHistory" (id, "clientId", "roomAttendantId", "taskScheduleId", "Email", "firstName", "lastName", "phoneNo", "notificationType", "notificationDate", "emailSentStatus", "emailFailedResult", "smsSentStatus", "smsFailedResult")
  VALUES (gen_random_uuid(), v_client3_profile_id, v_att3_profile_id, v_schedule3_id, 'attendant3@test.com', 'Bob', 'Wilson', '555-0202', 1, CURRENT_DATE - 4, NULL, '', 1, '');

END $$;
