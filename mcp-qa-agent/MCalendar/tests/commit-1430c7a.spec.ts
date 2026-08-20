import { test, expect, APIRequestContext } from '@playwright/test';

// ============================================================
// FIXTURES & HELPERS
// ============================================================

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

interface AuthCredentials {
  email: string;
  password: string;
}

interface BookingPayload {
  title?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  attendees?: string[];
  [key: string]: unknown;
}

interface TokenCache {
  [key: string]: string;
}

const tokenCache: TokenCache = {};

async function getAuthToken(
  apiContext: APIRequestContext,
  credentials: AuthCredentials = { email: 'testuser@test.com', password: 'Password123!' }
): Promise<string> {
  const cacheKey = credentials.email;
  if (tokenCache[cacheKey]) return tokenCache[cacheKey];

  const response = await apiContext.post(`${BASE_URL}/api/auth/login`, {
    data: credentials,
  });

  if (response.ok()) {
    const body = await response.json();
    const token = body.token || body.access_token || body.data?.token || '';
    tokenCache[cacheKey] = token;
    return token;
  }

  const registerResponse = await apiContext.post(`${BASE_URL}/api/auth/register`, {
    data: {
      name: 'Test User',
      email: credentials.email,
      password: credentials.password,
    },
  });

  const registerBody = await registerResponse.json();
  const token = registerBody.token || registerBody.access_token || registerBody.data?.token || '';
  tokenCache[cacheKey] = token;
  return token;
}

function createBookingPayload(overrides: Partial<BookingPayload> = {}): BookingPayload {
  return {
    title: 'Team Standup',
    date: '2026-08-01',
    start_time: '09:00',
    end_time: '09:30',
    attendees: ['user1@test.com'],
    ...overrides,
  };
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function createBookingAndGetId(
  apiContext: APIRequestContext,
  token: string,
  payload?: Partial<BookingPayload>
): Promise<string> {
  const response = await apiContext.post(`${BASE_URL}/api/bookings`, {
    data: createBookingPayload(payload),
    headers: authHeaders(token),
  });
  expect(response.status()).toBe(201);
  const body = await response.json();
  return body.id || body.data?.id || body.booking?.id;
}

async function deleteBooking(
  apiContext: APIRequestContext,
  token: string,
  id: string
): Promise<void> {
  await apiContext.delete(`${BASE_URL}/api/bookings/${id}`, {
    headers: authHeaders(token),
  });
}

// ============================================================
// CREATE BOOKING TESTS
// ============================================================

test.describe('POST /api/bookings - Create Booking', () => {
  let apiContext: APIRequestContext;
  let authToken: string;
  const createdBookingIds: string[] = [];

  test.beforeAll(async ({ playwright }) => {
    apiContext = await playwright.request.newContext({ baseURL: BASE_URL });
    authToken = await getAuthToken(apiContext);
  });

  test.afterAll(async () => {
    for (const id of createdBookingIds) {
      await deleteBooking(apiContext, authToken, id).catch(() => {});
    }
    await apiContext.dispose();
  });

  test('TC-001 | should create a booking successfully with valid payload', async () => {
    const payload = createBookingPayload({
      title: 'Team Standup',
      date: '2026-08-01',
      start_time: '09:00',
      end_time: '09:30',
      attendees: ['user1@test.com'],
    });

    const response = await apiContext.post(`${BASE_URL}/api/bookings`, {
      data: payload,
      headers: authHeaders(authToken),
    });

    expect(response.status()).toBe(201);

    const body = await response.json();
    const bookingId = body.id || body.data?.id || body.booking?.id;
    expect(bookingId).toBeTruthy();
    createdBookingIds.push(bookingId);

    const bookingData = body.data || body.booking || body;
    expect(bookingData.title).toBe(payload.title);
    expect(bookingData.date).toBe(payload.date);
    expect(bookingData.start_time).toBe(payload.start_time);
    expect(bookingData.end_time).toBe(payload.end_time);
  });

  test('TC-002 | should return 400 when title is missing', async () => {
    const payload = createBookingPayload();
    delete payload.title;

    const response = await apiContext.post(`${BASE_URL}/api/bookings`, {
      data: payload,
      headers: authHeaders(authToken),
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    const errorText = JSON.stringify(body).toLowerCase();
    expect(errorText).toContain('title');
  });

  test('TC-003 | should return 400 when date is missing', async () => {
    const payload = createBookingPayload();
    delete payload.date;

    const response = await apiContext.post(`${BASE_URL}/api/bookings`, {
      data: payload,
      headers: authHeaders(authToken),
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    const errorText = JSON.stringify(body).toLowerCase();
    expect(errorText).toContain('date');
  });

  test('TC-004 | should return 400 when start_time is missing', async () => {
    const payload = createBookingPayload();
    delete payload.start_time;

    const response = await apiContext.post(`${BASE_URL}/api/bookings`, {
      data: payload,
      headers: authHeaders(authToken),
    });

    expect([400, 422]).toContain(response.status());
  });

  test('TC-005 | should return 409 when booking overlaps an existing time slot', async () => {
    const uniqueDate = '2026-08-15';
    const firstPayload = createBookingPayload({
      title: 'First Booking',
      date: uniqueDate,
      start_time: '09:00',
      end_time: '09:30',
    });

    const firstResponse = await apiContext.post(`${BASE_URL}/api/bookings`, {
      data: firstPayload,
      headers: authHeaders(authToken),
    });

    if (firstResponse.status() === 201) {
      const firstBody = await firstResponse.json();
      const firstId = firstBody.id || firstBody.data?.id || firstBody.booking?.id;
      if (firstId) createdBookingIds.push(firstId);
    }

    const overlappingPayload = createBookingPayload({
      title: 'Overlapping Booking',
      date: uniqueDate,
      start_time: '09:00',
      end_time: '09:30',
    });

    const response = await apiContext.post(`${BASE_URL}/api/bookings`, {
      data: overlappingPayload,
      headers: authHeaders(authToken),
    });

    expect(response.status()).toBe(409);
    const body = await response.json();
    const errorText = JSON.stringify(body).toLowerCase();
    expect(errorText).toMatch(/already booked|conflict|overlap/);
  });

  test('TC-006 | should return 422 when date format is invalid', async () => {
    const payload = createBookingPayload({ date: '01-08-2026' });

    const response = await apiContext.post(`${BASE_URL}/api/bookings`, {
      data: payload,
      headers: authHeaders(authToken),
    });

    expect([400, 422]).toContain(response.status());
    const body = await response.json();
    const errorText = JSON.stringify(body).toLowerCase();
    expect(errorText).toContain('date');
  });

  test('TC-007 | should return 422 when end_time is before start_time', async () => {
    const payload = createBookingPayload({
      start_time: '10:00',
      end_time: '09:00',
    });

    const response = await apiContext.post(`${BASE_URL}/api/bookings`, {
      data: payload,
      headers: authHeaders(authToken),
    });

    expect([400, 422]).toContain(response.status());
    const body = await response.json();
    const errorText = JSON.stringify(body).toLowerCase();
    expect(errorText).toMatch(/end_time|end time|after start/);
  });

  test('TC-008 | should return 401 when creating booking without authentication', async () => {
    const payload = createBookingPayload();

    const response = await apiContext.post(`${BASE_URL}/api/bookings`, {
      data: payload,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    const errorText = JSON.stringify(body).toLowerCase();
    expect(errorText).toMatch(/unauthorized|unauthenticated|authentication/);
  });

  test('TC-009 | should return 401 when creating booking with invalid token', async () => {
    const payload = createBookingPayload();

    const response = await apiContext.post(`${BASE_URL}/api/bookings`, {
      data: payload,
      headers: {
        Authorization: 'Bearer invalid-token-xyz',
        'Content-Type': 'application/json',
      },
    });

    expect(response.status()).toBe(401);
  });

  test('TC-010 | should return 422 when end_time equals start_time', async () => {
    const payload = createBookingPayload({
      start_time: '10:00',
      end_time: '10:00',
    });

    const response = await apiContext.post(`${BASE_URL}/api/bookings`, {
      data: payload,
      headers: authHeaders(authToken),
    });

    expect([400, 422]).toContain(response.status());
  });

  test('TC-011 | created booking should contain id and all submitted fields in response', async () => {
    const payload = createBookingPayload({
      title: 'Response Validation Test',
      date: '2026-08-20',
      start_time: '14:00',
      end_time: '14:30',
    });

    const response = await apiContext.post(`${BASE_URL}/api/bookings`, {
      data: payload,
      headers: authHeaders(authToken),
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    const bookingData = body.data || body.booking || body;
    const bookingId = bookingData.id;

    expect(bookingId).toBeTruthy();
    createdBookingIds.push(bookingId);

    expect(typeof bookingId).toBe('string');
    expect(bookingData.title).toBe(payload.title);
    expect(bookingData.date).toBe(payload.date);
    expect(bookingData.start_time).toBe(payload.start_time);
    expect(bookingData.end_time).toBe(payload.end_time);
  });
});

// ============================================================
// GET BOOKING TESTS
// ============================================================

test.describe('GET /api/bookings - Retrieve Bookings', () => {
  let apiContext: APIRequestContext;
  let authToken: string;
  let userBToken: string;
  const createdBookingIds: string[] = [];
  let singleBookingId: string;

  test.beforeAll(async ({ playwright }) => {
    apiContext = await playwright.request.newContext({ baseURL: BASE_URL });
    authToken = await getAuthToken(apiContext, {
      email: 'gettest_usera@test.com',
      password: 'Password123!',
    });
    userBToken = await getAuthToken(apiContext, {
      email: 'gettest_userb@test.com',
      password: 'Password123!',
    });

    // Create bookings for listing tests
    const booking1Id = await createBookingAndGetId(apiContext, authToken, {
      title: 'Get Test Booking 1',
      date: '2026-08-02',
      start_time: '10:00',
      end_time: '10:30',
    });
    const booking2Id = await createBookingAndGetId(apiContext, authToken, {
      title: 'Get Test Booking 2',
      date: '2026-08-03',
      start_time: '11:00',
      end_time: '11:30',
    });

    createdBookingIds.push(booking1Id, booking2Id);
    singleBookingId = booking1Id;
  });

  test.afterAll(async () => {
    for (const id of createdBookingIds) {
      await deleteBooking(apiContext, authToken, id).catch(() => {});
    }
    await apiContext.dispose();
  });

  test('TC-012 | should return 200 and array of bookings for authenticated user', async () => {
    const response = await apiContext.get(`${BASE_URL}/api/bookings`, {
      headers: authHeaders(authToken),
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    const bookingsArray = Array.isArray(body) ? body : body.data || body.bookings || [];

    expect(Array.isArray(bookingsArray)).toBe(true);
    expect(bookingsArray.length).toBeGreaterThanOrEqual(2);
  });

  test('TC-013 | each booking in list should contain required fields', async () => {
    const response = await apiContext.get(`${BASE_URL}/api/bookings`, {
      headers: authHeaders(authToken),
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    const bookingsArray = Array.isArray(body) ? body : body.data || body.bookings || [];

    expect(Array.isArray(bookingsArray)).toBe(true);
    bookingsArray.forEach((booking: Record<string, unknown>) => {
      expect(booking).toHaveProperty('id');
      expect(booking).toHaveProperty('title');
      expect(booking).toHaveProperty('date');
      expect(booking).toHaveProperty('start_time');
      expect(booking).toHaveProperty('end_time');
    });
  });

  test('TC-014 | should return 200 and single booking by ID', async () => {
    const response = await apiContext.get(`${BASE_URL}/api/bookings/${singleBookingId}`, {
      headers: authHeaders(authToken),
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    const bookingData = body.data || body.booking || body;

    expect(bookingData.id).toBe(s