import { test, expect, APIRequestContext } from '@playwright/test';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

interface BookingPayload {
  title: string;
  start_time: string;
  end_time: string;
  description?: string;
  user_id?: number;
}

interface AuthResponse {
  token: string;
  user?: {
    id: number;
    email: string;
  };
}

interface BookingResponse {
  id: number | string;
  title: string;
  start_time: string;
  end_time: string;
  description?: string;
  user_id?: number;
}

async function getAuthToken(request: APIRequestContext, email = 'admin@bookingcalendar.com', password = 'Password123!'): Promise<string> {
  const loginResponse = await request.post(`${BASE_URL}/auth/login`, {
    data: { email, password }
  });
  if (loginResponse.ok()) {
    const body: AuthResponse = await loginResponse.json();
    return body.token;
  }
  return 'mock-test-token-for-testing';
}

async function createBooking(request: APIRequestContext, token: string, payload: BookingPayload) {
  return request.post(`${BASE_URL}/bookings`, {
    headers: { Authorization: `Bearer ${token}` },
    data: payload
  });
}

async function deleteBookingById(request: APIRequestContext, token: string, id: number | string) {
  return request.delete(`${BASE_URL}/bookings/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// ─────────────────────────────────────────────
// SUITE 1: POST /bookings - Create Booking
// ─────────────────────────────────────────────
test.describe('POST /bookings - Create Booking', () => {
  let authToken: string;
  const createdBookingIds: (number | string)[] = [];

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request);
  });

  test.afterAll(async ({ request }) => {
    for (const id of createdBookingIds) {
      await deleteBookingById(request, authToken, id).catch(() => {});
    }
  });

  test('TC-BOOK-001: Should create a booking with valid payload', async ({ request }) => {
    const payload: BookingPayload = {
      title: 'Team Meeting',
      start_time: '2026-08-01T10:00:00Z',
      end_time: '2026-08-01T11:00:00Z',
      description: 'Weekly sync'
    };

    const response = await createBooking(request, authToken, payload);

    expect(response.status()).toBe(201);
    const body: BookingResponse = await response.json();
    expect(body).toHaveProperty('id');
    expect(body.title).toBe('Team Meeting');
    expect(body.start_time).toBe('2026-08-01T10:00:00Z');
    expect(body.end_time).toBe('2026-08-01T11:00:00Z');

    if (body.id) createdBookingIds.push(body.id);
  });

  test('TC-BOOK-002: Should return 400 when start_time is missing', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/bookings`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        title: 'Incomplete Booking',
        end_time: '2026-08-02T11:00:00Z'
      }
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).toMatch(/start_time/i);
  });

  test('TC-BOOK-003: Should return 400 when end_time is missing', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/bookings`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        title: 'Missing End Time',
        start_time: '2026-08-02T10:00:00Z'
      }
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).toMatch(/end_time/i);
  });

  test('TC-BOOK-004: Should return 400 when title is missing', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/bookings`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        start_time: '2026-08-03T10:00:00Z',
        end_time: '2026-08-03T11:00:00Z'
      }
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).toMatch(/title/i);
  });

  test('TC-BOOK-005: Should return 400 when all fields are missing', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/bookings`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {}
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toBeDefined();
  });

  test('TC-BOOK-006: Should return 409 on time slot conflict', async ({ request }) => {
    const firstPayload: BookingPayload = {
      title: 'First Booking Conflict Test',
      start_time: '2026-08-05T14:00:00Z',
      end_time: '2026-08-05T15:00:00Z'
    };

    const firstResponse = await createBooking(request, authToken, firstPayload);
    if (firstResponse.ok()) {
      const firstBody: BookingResponse = await firstResponse.json();
      if (firstBody.id) createdBookingIds.push(firstBody.id);
    }

    const conflictingPayload: BookingPayload = {
      title: 'Conflicting Booking',
      start_time: '2026-08-05T14:30:00Z',
      end_time: '2026-08-05T15:30:00Z'
    };

    const response = await createBooking(request, authToken, conflictingPayload);

    expect(response.status()).toBe(409);
    const body = await response.json();
    const bodyStr = JSON.stringify(body).toLowerCase();
    expect(bodyStr).toMatch(/conflict/i);
  });

  test('TC-BOOK-007: Should return 401 without auth token', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/bookings`, {
      data: {
        title: 'Unauthorized Booking',
        start_time: '2026-08-06T10:00:00Z',
        end_time: '2026-08-06T11:00:00Z'
      }
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    const bodyStr = JSON.stringify(body).toLowerCase();
    expect(bodyStr).toMatch(/unauthorized/i);
  });

  test('TC-BOOK-008: Should return 401 with expired token', async ({ request }) => {
    const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlRlc3QiLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MX0.invalid_expired_token';

    const response = await request.post(`${BASE_URL}/bookings`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
      data: {
        title: 'Expired Token Booking',
        start_time: '2026-08-07T10:00:00Z',
        end_time: '2026-08-07T11:00:00Z'
      }
    });

    expect([401, 403]).toContain(response.status());
  });

  test('TC-BOOK-009: Should return 400 when end_time is before start_time', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/bookings`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        title: 'Invalid Time Range',
        start_time: '2026-08-08T11:00:00Z',
        end_time: '2026-08-08T10:00:00Z'
      }
    });

    expect(response.status()).toBe(400);
  });

  test('TC-BOOK-010: Response body should match submitted booking data', async ({ request }) => {
    const payload: BookingPayload = {
      title: 'Data Integrity Test',
      start_time: '2026-08-09T09:00:00Z',
      end_time: '2026-08-09T10:00:00Z',
      description: 'Checking data integrity'
    };

    const response = await createBooking(request, authToken, payload);

    expect(response.status()).toBe(201);
    const body: BookingResponse = await response.json();
    expect(body.title).toBe(payload.title);
    expect(body.start_time).toBe(payload.start_time);
    expect(body.end_time).toBe(payload.end_time);
    expect(body).toHaveProperty('id');

    if (body.id) createdBookingIds.push(body.id);
  });
});

// ─────────────────────────────────────────────
// SUITE 2: GET /bookings - Retrieve Bookings
// ─────────────────────────────────────────────
test.describe('GET /bookings - Retrieve Bookings', () => {
  let authToken: string;
  let seededBookingId: number | string;

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request);

    const response = await createBooking(request, authToken, {
      title: 'Seeded Booking for GET Tests',
      start_time: '2026-09-01T10:00:00Z',
      end_time: '2026-09-01T11:00:00Z',
      description: 'Seed data'
    });

    if (response.ok()) {
      const body: BookingResponse = await response.json();
      seededBookingId = body.id;
    }
  });

  test.afterAll(async ({ request }) => {
    if (seededBookingId) {
      await deleteBookingById(request, authToken, seededBookingId).catch(() => {});
    }
  });

  test('TC-BOOK-011: Should retrieve all bookings with status 200', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/bookings`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBeTruthy();
  });

  test('TC-BOOK-012: Each booking should contain required fields', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/bookings`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    expect(response.status()).toBe(200);
    const body: BookingResponse[] = await response.json();

    if (body.length > 0) {
      for (const booking of body) {
        expect(booking).toHaveProperty('id');
        expect(booking).toHaveProperty('title');
        expect(booking).toHaveProperty('start_time');
        expect(booking).toHaveProperty('end_time');
      }
    }
  });

  test('TC-BOOK-013: Should retrieve a single booking by ID', async ({ request }) => {
    test.skip(!seededBookingId, 'No seeded booking available');

    const response = await request.get(`${BASE_URL}/bookings/${seededBookingId}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    expect(response.status()).toBe(200);
    const body: BookingResponse = await response.json();
    expect(body.id.toString()).toBe(seededBookingId.toString());
    expect(body).toHaveProperty('title');
    expect(body).toHaveProperty('start_time');
    expect(body).toHaveProperty('end_time');
  });

  test('TC-BOOK-014: Should return 404 for non-existent booking ID', async ({ request }) => {
    const nonExistentId = 999999999;

    const response = await request.get(`${BASE_URL}/bookings/${nonExistentId}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    expect(response.status()).toBe(404);
    const body = await response.json();
    const bodyStr = JSON.stringify(body).toLowerCase();
    expect(bodyStr).toMatch(/not found/i);
  });

  test('TC-BOOK-015: Should filter bookings by date range', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/bookings?from=2026-09-01&to=2026-09-30`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    expect(response.status()).toBe(200);
    const body: BookingResponse[] = await response.json();
    expect(Array.isArray(body)).toBeTruthy();

    for (const booking of body) {
      const startDate = new Date(booking.start_time);
      const fromDate = new Date('2026-09-01');
      const toDate = new Date('2026-09-30T23:59:59Z');
      expect(startDate.getTime()).toBeGreaterThanOrEqual(fromDate.getTime());
      expect(startDate.getTime()).toBeLessThanOrEqual(toDate.getTime());
    }
  });

  test('TC-BOOK-016: Should return 401 when retrieving bookings without auth', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/bookings`);

    expect(response.status()).toBe(401);
    const body = await response.json();
    const bodyStr = JSON.stringify(body).toLowerCase();
    expect(bodyStr).toMatch(/unauthorized/i);
  });

  test('TC-BOOK-017: Should return 401 when retrieving a booking by ID without auth', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/bookings/1`);

    expect(response.status()).toBe(401);
  });

  test('TC-BOOK-018: Should return bookings list as array even when empty', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/bookings?from=2000-01-01&to=2000-01-02`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────
// SUITE 3: PUT /bookings/:id - Update Booking
// ─────────────────────────────────────────────
test.describe('PUT /bookings/:id - Update Booking', () => {
  let authToken: string;
  let bookingId: number | string;
  let conflictBookingId: number | string;

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request);

    const createResponse = await createBooking(request, authToken, {
      title: 'Original Title',
      start_time: '2026-10-01T10:00:00Z',
      end_time: '2026-10-01T11:00:00Z'
    });

    if (createResponse.ok()) {
      const body: BookingResponse = await createResponse.json();
      bookingId = body.id;
    }

    const conflictResponse = await createBooking(request, authToken, {
      title: 'Conflict Reference Booking',
      start_time: '2026-10-02T12:00:00Z',
      end_time: '2026-10-02T13:00:00Z'
    });

    if (conflictResponse.ok()) {
      const body: BookingResponse = await conflictResponse.json();
      conflictBookingId = body.id;
    }
  });

  test.afterAll(async ({ request }) => {
    for (const id of [bookingId, conflictBookingId]) {
      if (id) await deleteBookingById(request, authToken, id).catch(() => {});
    }
  });

  test('TC-BOOK-019: Should successfully update an existing booking title', async ({ request }) => {
    test.skip(!bookingId, 'No booking available to update');

    const response = await request.put(`${BASE_URL}/bookings/${bookingId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        title: 'Updated Meeting Title',
        start_time: '2026-10-01T10:00:00Z',
        end_time: '2026-10-01T11:00:00Z'
      }
    });

    expect(response.status()).toBe(200);
    const body: BookingResponse = await response.json();
    expect(body.title).toBe('Updated Meeting Title');
    expect(body.id.toString()).toBe(bookingId.toString());
  });

  test('TC-BOOK-020: Should successfully update booking time', async ({ request }) => {
    test.skip(!bookingId, 'No booking available to update');

    const response = await request.put(`${BASE_URL}/bookings/${bookingId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        title: 'Updated Meeting Title',
        start_time: '2026-10-01T14:00:00Z',
        end_time: '2026-10-01T15:00:00Z'
      }
    });

    expect(response.status()).toBe(200);
    const body: BookingResponse = await response.json();
    expect(body.start_time).toBe('2026-10-01T14:00:00Z');
    expect(body.end_time).toBe('2026-10-01T15:00:00Z');
  });

  test('TC-BOOK-021: Should return 409 when update creates a time conflict', async ({ request }) => {
    test.skip(!bookingId || !conflictBookingId, 'Missing bookings for conflict test');

    const response = await request.put(`${BASE_URL}/bookings/${bookingId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        title: 'Conflict Update',
        start_time: '2026-10-02T12:30:00Z',
        end_time: '2026-10-02T13:30:00Z'
      }
    });

    expect(response.status()).toBe(409);
    const body = await response.json();
    const bodyStr = JSON.stringify(body).toLowerCase();
    expect(bodyStr).toMatch(/conflict/i);
  });

  test('TC-BOOK-022: Should return 404 when updating non-existent booking', async ({ request }) => {
    const nonExistentId = 999999999;

    const response = await request.put(`${BASE_URL}/bookings/${nonExistentId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        title: 'Ghost Update',
        start_time: '2026-10-10T10:00:00Z',
        end_time: '2026-10-10T11:00:00Z'
      }
    });

    expect(response.status()).toBe(404);
    const body = await response.json();
    const bodyStr = JSON.stringify(body).toLowerCase();
    expect(bodyStr).toMatch(/not found/i);
  });

  test('TC-BOOK-023: Should return 401 when updating without auth token', async ({ request }) => {
    test.skip(!bookingId, 'No booking available');

    const response = await request.put(`${BASE_URL}/bookings/${bookingId}`, {
      data: {
        title: 'Unauthorized Update',
        start_time: '2026-10-01T10:00:00Z',
        end_time: '2026-10-01T11:00:00Z'
      }
    });

    expect(response.status()).toBe(401);
  });

  test('TC-BOOK-024: Should return 403 when user does not own the booking', async ({ request }) => {
    test.skip(!bookingId, 'No booking available');

    const otherUserToken = await getAuthToken(request, 'otheruser@example.com', 'OtherPass123!');

    if (!otherUserToken || otherUserToken === 'mock-test-token-for-testing') {
      test.skip(true, 'Could not obtain second user token');
      return;
    }

    const response = await request.put(`${BASE_URL}/bookings/${bookingId}`, {
      headers: { Authorization: `Bearer ${otherUserToken}` },
      data: {
        title: 'Forbidden Update',
        start_time: '2026-10-01T10:00:00Z',
        end_time: '2026-10-01T11:00:00Z'
      }
    });

    expect(response.status()).toBe(403);
    const body = await response.json();
    const bodyStr = JSON.stringify(body).toLowerCase();
    expect(bodyStr).toMatch(/forbidden/i);
  });

  test('TC-BOOK-025: Should return 400 when update payload has missing required fields', async ({ request }) => {
    test.skip(!bookingId, 'No booking available');

    const response = await request.put(`${BASE_URL}/bookings/${bookingId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        title: 'Missing Times Update'
      }
    });

    expect(response.status()).toBe(400);
  });
});

// ─────────────────────────────────────────────
// SUITE 4: DELETE /bookings/:id - Delete Booking
// ─────────────────────────────────────────────
test.describe('DELETE /bookings/:id - Delete Booking', () => {
  let authToken: string;

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request);
  });

  test('TC-BOOK-026: Should successfully delete an existing booking', async ({ request }) => {
    const createResponse = await createBooking(request, authToken, {
      title: 'Booking to Delete',
      start_time: '2026-11-01T10:00:00Z',
      end_time: '2026-11-01T11:00:00Z'
    });

    expect(createResponse.ok()).toBeTruthy();
    const createdBody: BookingResponse = await createResponse.json();
    const idToDelete = createdBody.id;

    const deleteResponse = await deleteBookingById(request, authToken, idToDelete);

    expect([200, 204]).toContain(deleteResponse.status());

    const verifyResponse = await request.get(`${BASE_URL}/bookings/${idToDelete}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    expect(verifyResponse.status()).toBe(404);
  });

  test('TC-BOOK-027: Should return 404 when deleting non-existent booking', async ({ request }) => {
    const nonExistentId = 999999999;

    const response = await deleteBookingById(request, authToken, nonExistentId);

    expect(response.status()).toBe(404);
    const body = await response.json();
    const bodyStr = JSON.stringify(body).toLowerCase();
    expect(bodyStr).toMatch(/not found/i);
  });

  test('TC-BOOK-028: Should return 401 when deleting without auth token', async ({ request }) => {
    const response = await request.delete(`${BASE_URL}/bookings/1`);

    expect(response.status()).toBe(401);
    const body = await response.json();
    const bodyStr = JSON.stringify(body).toLowerCase();
    expect(bodyStr).toMatch(/unauthorized/i);
  });

  test('TC-BOOK-029: Should return 403 when deleting a booking user does not own', async ({ request }) => {
    const createResponse = await createBooking(request, authToken, {
      title: 'Protected Booking',
      start_time: '2026-11-02T10:00:00Z',
      end_time: '2026-11-02T11:00:00Z'
    });

    if (!createResponse.ok()) {
      test.skip(true, 'Could not create booking for ownership test');
      return;
    }

    const createdBody: BookingResponse = await createResponse.json();
    const idToProtect = createdBody.id;

    const otherToken = await getAuthToken(request, 'otheruser@example.com', 'OtherPass123!');

    if (!otherToken || otherToken === 'mock-test-token-for-testing') {
      await deleteBookingById(request, authToken, idToProtect).catch(() => {});
      test.skip(true, 'Could not obtain second user token');
      return;
    }

    const deleteResponse = await request.delete(`${BASE_URL}/bookings/${idToProtect}`, {
      headers: { Authorization: `Bearer ${otherToken}` }
    });

    expect(deleteResponse.status()).toBe(403);

    await deleteBookingById(request, authToken, idToProtect).catch(() => {});
  });

  test('TC-BOOK-030: Should not be able to retrieve booking after deletion', async ({ request }) => {
    const createResponse = await createBooking(request, authToken, {
      title: 'Booking Deletion Verification',
      start_time: '2026-11-03T10:00:00Z',
      end_time: '2026-11-03T11:00:00Z'
    });

    expect(createResponse.ok()).toBeTruthy();
    const createdBody: BookingResponse = await createResponse.json();
    const bookingId = createdBody.id;

    await deleteBookingById(request, authToken, bookingId);

    const getResponse = await request.get(`${BASE_URL}/bookings/${bookingId}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    expect(getResponse.status()).toBe(404);
  });
});

// ─────────────────────────────────────────────
// SUITE 5: Authentication & Authorization
// ─────────────────────────────────────────────
test.describe('Booking Endpoint Security - Authentication & Authorization', () => {
  const endpoints = [
    { method: 'GET', path: '/bookings' },
    { method: 'POST', path: '/bookings' },
    { method: 'GET', path: '/bookings/1' },
    { method: 'PUT', path: '/bookings/1' },
    { method: 'DELETE', path: '/bookings/1' }
  ];

  for (const endpoint of endpoints) {
    test(`TC-BOOK-AUTH: ${endpoint.method} ${endpoint.path} should return 401 without token`, async ({ request }) => {
      let response;

      switch (endpoint.method) {
        case 'GET':
          response = await request.get(`${BASE_URL}${endpoint.path}`);
          break;
        case 'POST':
          response = await request.post(`${BASE_URL}${endpoint.path}`, {
            data: {
              title: 'No Auth',
              start_time: '2026-12-01T10:00:00Z',
              end_time: '2026-12-01T11:00:00Z'
            }
          });
          break;
        case 'PUT':
          response = await request.put(`${BASE_URL}${endpoint.path}`, {
            data: {
              title: 'No Auth Update',
              start_time: '2026-12-01T10:00:00Z',
              end_time: '2026-12-01T11:00:00Z'
            }
          });
          break;
        case 'DELETE':
          response = await request.delete(`${BASE_URL}${endpoint.path}`);
          break;
        default:
          throw new Error(`Unsupported method: ${endpoint.method}`);
      }

      expect(response.status()).toBe(401);
    });
  }

  test('TC-BOOK-031: Should return 401 with malformed bearer token', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/bookings`, {
      headers: { Authorization: 'Bearer invalid.malformed.token' }
    });

    expect([401, 403]).toContain(response.status());
  });

  test('TC-BOOK-032: Should return 401 with expired JWT token', async ({ request }) => {
    const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjF9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

    const response = await request.get(`${BASE_URL}/bookings`, {
      headers: { Authorization: `Bearer ${expiredToken}` }
    });

    expect([401, 403]).toContain(response.status());
  });

  test('TC-BOOK-033: Should return 401 with no Authorization header', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/bookings`, {
      headers: {}
    });

    expect(response.status()).toBe(401);
  });

  test('TC-BOOK-034: Should return 401 with wrong auth scheme', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/bookings`, {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' }
    });

    expect([401, 403]).toContain(response.status());
  });
});

// ─────────────────────────────────────────────
// SUITE 6: End-to-End Booking Flow
// ─────────────────────────────────────────────
test.describe('E2E: Full Booking Lifecycle', () => {
  let authToken: string;
  let bookingId: number | string;

  test.beforeAll(async ({ request }) => {
    authToken = await getAuthToken(request);
  });

  test('TC-BOOK-E2E-001: Full booking lifecycle - create, read, update, delete', async ({ request }) => {
    // Step 1: Create
    const createResponse = await createBooking(request, authToken, {
      title: 'Lifecycle Test Booking',
      start_time: '2026-12-10T09:00:00Z',
      end_time: '2026-12-10T10:00:00Z',
      description: 'E2E lifecycle test'
    });

    expect(createResponse.status()).toBe(201);
    const createdBooking: BookingResponse = await createResponse.json();
    expect(createdBooking).toHaveProperty('id');
    bookingId = createdBooking.id;

    // Step 2: Read
    const getResponse = await request.get(`${BASE_URL}/bookings/${bookingId}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    expect(getResponse.status()).toBe(200);
    const fetchedBooking: BookingResponse = await getResponse.json();
    expect(fetchedBooking.title).toBe('Lifecycle Test Booking');

    // Step 3: Update
    const updateResponse = await request.put(`${BASE_URL}/bookings/${bookingId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        title: 'Updated Lifecycle Booking',
        start_time: '2026-12-10T09:00:00Z',
        end_time: '2026-12-10T10:00:00Z'
      }
    });

    expect(updateResponse.status()).toBe(200);
    const updatedBooking: BookingResponse = await updateResponse.json();
    expect(updatedBooking.title).toBe('Updated Lifecycle Booking');

    // Step 4: Delete
    const deleteResponse = await deleteBookingById(request, authToken, bookingId);
    expect([200, 204]).toContain(deleteResponse.status());

    // Step 5: Verify deletion
    const verifyResponse = await request.get(`${BASE_URL}/bookings/${bookingId}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    expect(verifyResponse.status()).toBe(404);
  });

  test('TC-BOOK-E2E-002: Booking appears in list after creation', async ({ request }) => {
    const createResponse = await createBooking(request, authToken, {
      title: 'List Appearance Test',
      start_time: '2026-12-15T10:00:00Z',
      end_time: '2026-12-15T11:00:00Z'
    });

    expect(createResponse.status()).toBe(201);
    const created: BookingResponse = await createResponse.json();
    const newId = created.id;

    const listResponse = await request.get(`${BASE_URL}/bookings`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    expect(listResponse.status()).toBe(200);
    const bookings: BookingResponse[] = await listResponse.json();
    const found = bookings.find(b => b.id.toString() === newId.toString());
    expect(found).toBeDefined();

    await deleteBookingById(request, authToken, newId).catch(() => {});
  });

  test('TC-BOOK-E2E-003: Multiple non-overlapping bookings can be created', async ({ request }) => {
    const bookingIds: (number | string)[] = [];

    const slots = [
      { start: '2026-12-20T08:00:00Z', end: '2026-12-20T09:00:00Z' },
      { start: '2026-12-20T09:30:00Z', end: '2026-12-20T10:30:00Z' },
      { start: '2026-12-20T11:00:00Z', end: '2026-12-20T12:00:00Z' }
    ];

    for (const slot of slots) {
      const response = await createBooking(request, authToken, {
        title: `Non-Overlapping Booking ${slot.start}`,
        start_time: slot.start,
        end_time: slot.end
      });

      expect(response.status()).toBe(201);
      const body: BookingResponse = await response.json();
      bookingIds.push(body.id);
    }

    for (const id of bookingIds) {
      await deleteBookingById(request, authToken, id).catch(() => {});
    }
  });

  test('TC-BOOK-E2E-004: Date range filter returns only relevant bookings', async ({ request }) => {
    const bookingIds: (number | string)[] = [];

    const novemberBooking = await createBooking(request, authToken, {
      title: 'November Booking',
      start_time: '2026-11-15T10:00:00Z',
      end_time: '2026-11-15T11:00:00Z'
    });

    if (novemberBooking.ok()) {
      const b: BookingResponse = await novemberBooking.json();
      bookingIds.push(b.id);
    }

    const decemberBooking = await createBooking(request, authToken, {
      title: 'December Booking',
      start_time: '2026-12-25T10:00:00Z',
      end_time: '2026-12-25T11:00:00Z'
    });

    if (decemberBooking.ok()) {
      const b: BookingResponse = await decemberBooking.json();
      bookingIds.push(b.id);
    }

    const filterResponse = await request.get(`${BASE_URL}/bookings?from=2026-12-01&to=2026-12-31`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    expect(filterResponse.status()).toBe(200);
    const filtered: BookingResponse[] = await filterResponse.json();

    for (const booking of filtered) {
      const startDate = new Date(booking.start_time);
      expect(startDate.getTime()).toBeGreaterThanOrEqual(new Date('2026-12-01').getTime());
      expect(startDate.getTime()).toBeLessThanOrEqual(new Date('2026-12-31T23:59:59Z').getTime());
    }

    const decemberFound = filtered.some(b => b.title === 'December Booking');
    const novemberFound = filtered.some(b => b.title === 'November Booking');
    expect(decemberFound).toBeTruthy();
    expect(novemberFound).toBeFalsy();

    for (const id of bookingIds) {
      await deleteBookingById(request, authToken, id).catch(() => {});
    }
  });
});