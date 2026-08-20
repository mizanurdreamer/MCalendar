# QA Analysis: Booking Endpoints Implementation

> **Commit:** `1430c7a0` | **Author:** iamAnamul Haque Sohel | **Date:** 2026-07-13
> **Message:** *implement Booking Endpoints*

---

## 1. 🎯 Feature Goal / Summary

This commit implements the **Booking Endpoints** for the MCalendar application — a calendar/scheduling platform. In business terms, this feature enables:

- **Creating** new bookings/appointments through the API
- **Retrieving** existing booking details (single & list)
- **Updating** booking information
- **Cancelling/Deleting** bookings
- Laying the backend foundation for users to **schedule, manage, and track appointments** within the calendar system

> ⚠️ **Note:** The commit diff content was not provided — only commit metadata is available. The Acceptance Criteria and Test Strategy below are based on **standard booking API patterns** inferred from the commit message and application context (MCalendar).

---

## 2. ✅ Acceptance Criteria (Gherkin Format)

### 📌 Epic: Booking Management via API

---

### Scenario Group 1: Create a Booking

```gherkin
Feature: Create Booking Endpoint

  Background:
    Given the MCalendar API is running and accessible
    And a valid authenticated user token exists

  # ✅ Happy Path
  Scenario: Successfully create a booking with all required fields
    Given I have a valid booking payload with title, start time, end time, and attendees
    When I send a POST request to "/api/bookings" with the payload
    Then the response status code should be 201
    And the response body should contain a unique booking "id"
    And the response body should contain "status" as "confirmed"
    And the booking should be retrievable via GET "/api/bookings/{id}"

  # ✅ Happy Path - Optional Fields
  Scenario: Successfully create a booking with only required fields
    Given I have a minimal booking payload with only required fields
    When I send a POST request to "/api/bookings"
    Then the response status code should be 201
    And optional fields should have sensible defaults

  # ❌ Edge Case - Missing Required Fields
  Scenario: Fail to create a booking when title is missing
    Given I have a booking payload without a "title"
    When I send a POST request to "/api/bookings"
    Then the response status code should be 400
    And the response body should contain an error message referencing "title"

  # ❌ Edge Case - Invalid Date Range
  Scenario: Fail to create a booking when end time is before start time
    Given I have a booking payload where end_time is "2026-07-13T09:00:00Z"
    And start_time is "2026-07-13T11:00:00Z"
    When I send a POST request to "/api/bookings"
    Then the response status code should be 422
    And the response body should contain an error "end_time must be after start_time"

  # ❌ Edge Case - Past Date
  Scenario: Fail to create a booking in the past
    Given I have a booking payload with a start_time in the past
    When I send a POST request to "/api/bookings"
    Then the response status code should be 422
    And the response body should contain an error about invalid booking time

  # ❌ Edge Case - Overlapping Booking
  Scenario: Fail to create a booking that overlaps with an existing booking
    Given a booking already exists from "2026-07-14T10:00:00Z" to "2026-07-14T11:00:00Z"
    When I send a POST request to "/api/bookings" with overlapping time slot
    Then the response status code should be 409
    And the response body should contain "time slot already booked" or equivalent

  # 🔒 Auth - Unauthenticated Request
  Scenario: Fail to create a booking without authentication
    Given I do not provide an authorization token
    When I send a POST request to "/api/bookings"
    Then the response status code should be 401
    And the response body should contain "Unauthorized"
```

---

### Scenario Group 2: Retrieve a Booking

```gherkin
Feature: Get Booking Endpoint

  # ✅ Happy Path - Get Single Booking
  Scenario: Successfully retrieve a booking by ID
    Given a booking with id "booking-123" exists in the system
    And I am authenticated
    When I send a GET request to "/api/bookings/booking-123"
    Then the response status code should be 200
    And the response body should contain the correct booking details
    And fields "id", "title", "start_time", "end_time", "status" should be present

  # ✅ Happy Path - Get All Bookings
  Scenario: Successfully retrieve all bookings for a user
    Given multiple bookings exist for the authenticated user
    When I send a GET request to "/api/bookings"
    Then the response status code should be 200
    And the response body should be an array of bookings
    And each booking should contain "id", "title", "start_time", "end_time"

  # ❌ Edge Case - Booking Not Found
  Scenario: Fail to retrieve a booking with non-existent ID
    Given no booking exists with id "non-existent-id"
    When I send a GET request to "/api/bookings/non-existent-id"
    Then the response status code should be 404
    And the response body should contain "Booking not found"

  # ❌ Edge Case - Invalid ID Format
  Scenario: Fail to retrieve a booking with invalid ID format
    When I send a GET request to "/api/bookings/!!invalid@@id"
    Then the response status code should be 400
    And the response body should contain a validation error

  # 🔒 Auth - Accessing Another User's Booking
  Scenario: Fail to retrieve another user's booking
    Given a booking belongs to user "user-A"
    And I am authenticated as "user-B"
    When I send a GET request to "/api/bookings/{user-A-booking-id}"
    Then the response status code should be 403
    And the response body should contain "Forbidden"

  # 📄 Pagination
  Scenario: Retrieve bookings with pagination parameters
    Given more than 20 bookings exist for the user
    When I send a GET request to "/api/bookings?page=1&limit=10"
    Then the response status code should be 200
    And the response body should contain exactly 10 bookings
    And pagination metadata "total", "page", "limit" should be present
```

---

### Scenario Group 3: Update a Booking

```gherkin
Feature: Update Booking Endpoint

  # ✅ Happy Path
  Scenario: Successfully update a booking title
    Given a booking with id "booking-123" exists
    And I am the owner of that booking
    When I send a PUT/PATCH request to "/api/bookings/booking-123" with a new title
    Then the response status code should be 200
    And the response body should reflect the updated title

  # ❌ Edge Case - Update with Invalid Data
  Scenario: Fail to update a booking with an invalid time range
    Given a booking with id "booking-123" exists
    When I send a PATCH request with end_time earlier than start_time
    Then the response status code should be 422
    And the response body should contain a time validation error

  # ❌ Edge Case - Update Non-Existent Booking
  Scenario: Fail to update a booking that does not exist
    When I send a PUT request to "/api/bookings/does-not-exist"
    Then the response status code should be 404

  # ❌ Edge Case - Update Cancelled Booking
  Scenario: Fail to update a booking that has been cancelled
    Given a booking with id "booking-123" has status "cancelled"
    When I send a PATCH request to "/api/bookings/booking-123"
    Then the response status code should be 409
    And the response body should contain "Cannot modify a cancelled booking"
```

---

### Scenario Group 4: Cancel / Delete a Booking

```gherkin
Feature: Delete/Cancel Booking Endpoint

  # ✅ Happy Path
  Scenario: Successfully cancel a booking
    Given a booking with id "booking-123" exists with status "confirmed"
    And I am authenticated as the booking owner
    When I send a DELETE request to "/api/bookings/booking-123"
    Then the response status code should be 200 or 204
    And the booking status should be "cancelled" or the record should be removed

  # ❌ Edge Case - Delete Non-Existent Booking
  Scenario: Fail to delete a booking that does not exist
    When I send a DELETE request to "/api/bookings/ghost-booking"
    Then the response status code should be 404

  # ❌ Edge Case - Double Cancellation
  Scenario: Fail to cancel an already cancelled booking
    Given a booking with id "booking-123" has status "cancelled"
    When I send a DELETE request to "/api/bookings/booking-123"
    Then the response status code should be 409
    And the response body should contain "Booking is already cancelled"

  # 🔒 Auth - Unauthorized Deletion
  Scenario: Fail to cancel another user's booking
    Given booking "booking-123" belongs to "user-A"
    And I am authenticated as "user-B"
    When I send a DELETE request to "/api/bookings/booking-123"
    Then the response status code should be 403
```

---

## 3. 🎭 Playwright Test Strategy

### 📁 Recommended Test File Structure

```
tests/
├── api/
│   └── booking/
│       ├── create-booking.spec.ts
│       ├── get-booking.spec.ts
│       ├── update-booking.spec.ts
│       ├── delete-booking.spec.ts
│       └── booking-auth.spec.ts
├── e2e/
│   └── booking-flow.spec.ts
├── fixtures/
│   └── booking.fixtures.ts
└── helpers/
    └── booking.helper.ts
```

---

### 🔧 Test Setup & Fixtures

```typescript
// fixtures/booking.fixtures.ts

import { test as base, expect, APIRequestContext } from '@playwright/test';

type BookingFixtures = {
  apiContext: APIRequestContext;
  authToken: string;
  createdBookingId: string;
};

export const test = base.extend<BookingFixtures>({
  apiContext: async ({ playwright }, use) => {
    const context = await playwright.request.newContext({
      baseURL: process.env.API_BASE_URL || 'http://localhost:3000',
      extraHTTPHeaders: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
    await use(context);
    await context.dispose();
  },

  authToken: async ({ apiContext }, use) => {
    const response = await apiContext.post('/api/auth/login', {
      data: {
        email: process.env.TEST_USER_EMAIL || 'test@mcalendar.com',
        password: process.env.TEST_USER_PASSWORD || 'Test@12345',
      },
    });
    const body = await response.json();
    await use(body.token);
  },

  createdBookingId: async ({ apiContext, authToken }, use) => {
    const response = await apiContext.post('/api/bookings', {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        title: 'Fixture Booking',
        start_time: '2026-08-01T10:00:00Z',
        end_time: '2026-08-01T11:00:00Z',
      },
    });
    const body = await response.json();
    await use(body.id);

    // Cleanup after test
    await apiContext.delete(`/api/bookings/${body.id}`, {
      headers: { Authorization: `Bearer ${authToken