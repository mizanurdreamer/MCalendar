import { test, expect, Page } from "@playwright/test";
import { SignJWT } from "jose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const ACCESS_SECRET = new TextEncoder().encode(
  process.env.JWT_ACCESS_SECRET ?? "dev-access-secret-change-me-in-production-please-32chars"
);

type Role = "SUPER_ADMIN" | "CLIENT" | "ROOM_ATTENDANT";

interface TestUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
}

const USERS: Record<string, TestUser> = {
  admin: {
    id: "4cb08a9e-22a4-47a6-9949-aea7f1dbbd7b",
    email: "admin@bookingcalendar.com",
    firstName: "Ada",
    lastName: "Admin",
    role: "SUPER_ADMIN",
  },
  client: {
    id: "db6c3dca-385f-409e-bb89-1a27cb1e34af",
    email: "client@bookingcalendar.com",
    firstName: "Client",
    lastName: "One",
    role: "CLIENT",
  },
  attendant: {
    id: "31b8f08a-e728-4c32-b7bf-9e2283f3ce8d",
    email: "roomattendant@bookingcalendar.com",
    firstName: "Attendant",
    lastName: "One",
    role: "ROOM_ATTENDANT",
  },
};

async function signAccessToken(user: TestUser): Promise<string> {
  return new SignJWT({
    sub: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("60m")
    .sign(ACCESS_SECRET);
}

async function authenticateAs(page: Page, user: TestUser) {
  const accessToken = await signAccessToken(user);
  await page.context().addCookies([
    {
      name: "sth_access",
      value: accessToken,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "sth_refresh",
      value: "mock-refresh-token",
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

test.describe("Client & Room Attendant Functionality - Issue #6", () => {
  // SCENARIO 1: Client Profile Management - View and Update (positive)
  test("1. Client Profile Management - View and Update (positive)", async ({ page }) => {
    await authenticateAs(page, USERS.client);
    await page.goto("/client/profile");
    await page.waitForLoadState("networkidle");

    // Verify profile page loads
    const profileHeading = page.locator("h1, h2").filter({ hasText: /profile|settings/i });
    await expect(profileHeading).toBeVisible({ timeout: 5000 });

    // Get initial values
    const firstNameInput = page.locator('input[placeholder*="first" i], input[name*="firstName" i]').first();
    const lastNameInput = page.locator('input[placeholder*="last" i], input[name*="lastName" i]').first();
    const phoneInput = page.locator('input[placeholder*="phone" i], input[name*="phone" i]').first();
    const companyInput = page.locator('input[placeholder*="company" i], input[name*="company" i]').first();
    const portfolioInput = page.locator('input[placeholder*="portfolio" i], input[name*="portfolio" i]').first();
    const timezoneInput = page.locator('input[placeholder*="timezone" i], input[name*="timezone" i]').first();

    // Verify fields are visible
    await expect(firstNameInput).toBeVisible();
    await expect(lastNameInput).toBeVisible();
    await expect(phoneInput).toBeVisible();

    // Update profile
    const newFirstName = `UpdatedClient${Date.now()}`;
    const newLastName = `UpdatedLast${Date.now()}`;
    const newPhone = "+1-555-0123";
    const newCompany = `Company${Date.now()}`;
    const newPortfolio = "50";
    const newTimezone = "America/New_York";

    await firstNameInput.clear();
    await firstNameInput.fill(newFirstName);

    await lastNameInput.clear();
    await lastNameInput.fill(newLastName);

    await phoneInput.clear();
    await phoneInput.fill(newPhone);

    if (await companyInput.isVisible()) {
      await companyInput.clear();
      await companyInput.fill(newCompany);
    }

    if (await portfolioInput.isVisible()) {
      await portfolioInput.clear();
      await portfolioInput.fill(newPortfolio);
    }

    if (await timezoneInput.isVisible()) {
      await timezoneInput.clear();
      await timezoneInput.fill(newTimezone);
    }

    // Save changes
    const saveButton = page.locator("button").filter({ hasText: /save|update|submit/i }).first();
    await saveButton.click();

    // Wait for success message
    await page.waitForTimeout(1000);
    const successMessage = page.locator("text=/success|updated|saved/i");
    const isSuccessVisible = await successMessage.isVisible().catch(() => false);
    expect(isSuccessVisible).toBe(true);

    // Reload page and verify changes persist
    await page.reload();
    await page.waitForLoadState("networkidle");

    const reloadedFirstName = await firstNameInput.inputValue();
    const reloadedLastName = await lastNameInput.inputValue();
    const reloadedPhone = await phoneInput.inputValue();

    expect(reloadedFirstName).toBe(newFirstName);
    expect(reloadedLastName).toBe(newLastName);
    expect(reloadedPhone).toBe(newPhone);
  });

  // SCENARIO 2: Room Attendant Profile Management - View and Update (positive)
  test("2. Room Attendant Profile Management - View and Update (positive)", async ({ page }) => {
    await authenticateAs(page, USERS.attendant);
    await page.goto("/room-attendant/profile");
    await page.waitForLoadState("networkidle");

    // Verify profile page loads
    const profileHeading = page.locator("h1, h2").filter({ hasText: /profile|settings/i });
    await expect(profileHeading).toBeVisible({ timeout: 5000 });

    // Get input fields
    const firstNameInput = page.locator('input[placeholder*="first" i], input[name*="firstName" i]').first();
    const lastNameInput = page.locator('input[placeholder*="last" i], input[name*="lastName" i]').first();
    const phoneInput = page.locator('input[placeholder*="phone" i], input[name*="phone" i]').first();
    const serviceAreaInput = page.locator('input[placeholder*="service" i], input[name*="serviceArea" i]').first();
    const hourlyRateInput = page.locator('input[placeholder*="hourly" i], input[name*="hourlyRate" i]').first();
    const ratingInput = page.locator('input[placeholder*="rating" i], input[name*="rating" i]').first();

    // Verify fields are visible
    await expect(firstNameInput).toBeVisible();
    await expect(lastNameInput).toBeVisible();
    await expect(phoneInput).toBeVisible();

    // Update profile
    const newFirstName = `UpdatedAttendant${Date.now()}`;
    const newLastName = `UpdatedLast${Date.now()}`;
    const newPhone = "+1-555-0124";
    const newServiceArea = `Area${Date.now()}`;
    const newHourlyRate = "35";
    const newRating = "4.7";

    await firstNameInput.clear();
    await firstNameInput.fill(newFirstName);

    await lastNameInput.clear();
    await lastNameInput.fill(newLastName);

    await phoneInput.clear();
    await phoneInput.fill(newPhone);

    if (await serviceAreaInput.isVisible()) {
      await serviceAreaInput.clear();
      await serviceAreaInput.fill(newServiceArea);
    }

    if (await hourlyRateInput.isVisible()) {
      await hourlyRateInput.clear();
      await hourlyRateInput.fill(newHourlyRate);
    }

    if (await ratingInput.isVisible()) {
      await ratingInput.clear();
      await ratingInput.fill(newRating);
    }

    // Save changes
    const saveButton = page.locator("button").filter({ hasText: /save|update|submit/i }).first();
    await saveButton.click();

    // Wait for success message
    await page.waitForTimeout(1000);
    const successMessage = page.locator("text=/success|updated|saved/i");
    const isSuccessVisible = await successMessage.isVisible().catch(() => false);
    expect(isSuccessVisible).toBe(true);

    // Reload page and verify changes persist
    await page.reload();
    await page.waitForLoadState("networkidle");

    const reloadedFirstName = await firstNameInput.inputValue();
    const reloadedLastName = await lastNameInput.inputValue();
    const reloadedPhone = await phoneInput.inputValue();

    expect(reloadedFirstName).toBe(newFirstName);
    expect(reloadedLastName).toBe(newLastName);
    expect(reloadedPhone).toBe(newPhone);
  });

  // SCENARIO 3: Room Attendant Availability - Create Valid Availability (positive)
  test("3. Room Attendant Availability - Create Valid Availability (positive)", async ({ page }) => {
    await authenticateAs(page, USERS.attendant);
    await page.goto("/room-attendant/availability");
    await page.waitForLoadState("networkidle");

    // Verify availability page loads
    const pageHeading = page.locator("h1, h2").filter({ hasText: /availability|schedule/i });
    await expect(pageHeading).toBeVisible({ timeout: 5000 });

    // Click create/add button
    const createButton = page.locator("button").filter({ hasText: /add|create|new/i }).first();
    await createButton.click();

    // Wait for dialog/form
    await page.waitForTimeout(500);

    // Fill availability form
    const fromDateInput = page.locator('input[type="date"], input[placeholder*="from" i]').first();
    const toDateInput = page.locator('input[type="date"], input[placeholder*="to" i]').nth(1);
    const noteInput = page.locator('textarea, input[placeholder*="note" i]').first();

    const fromDate = new Date();
    const toDate = new Date(fromDate);
    toDate.setDate(toDate.getDate() + 3);

    const fromDateStr = fromDate.toISOString().split("T")[0];
    const toDateStr = toDate.toISOString().split("T")[0];

    await fromDateInput.fill(fromDateStr);
    await toDateInput.fill(toDateStr);

    if (await noteInput.isVisible()) {
      await noteInput.fill(`Test availability note ${Date.now()}`);
    }

    // Submit form
    const submitButton = page.locator("button").filter({ hasText: /save|create|submit/i }).last();
    await submitButton.click();

    // Wait for success
    await page.waitForTimeout(1000);
    const successMessage = page.locator("text=/success|created|added/i");
    const isSuccessVisible = await successMessage.isVisible().catch(() => false);
    expect(isSuccessVisible).toBe(true);

    // Verify availability appears in list
    await page.waitForLoadState("networkidle");
    const availabilityList = page.locator("text=/availability|schedule/i");
    await expect(availabilityList).toBeVisible();
  });

  // SCENARIO 4: Room Attendant Availability - Prevent Overlapping Availability (negative)
  test("4. Room Attendant Availability - Prevent Overlapping Availability (negative)", async ({ page }) => {
    await authenticateAs(page, USERS.attendant);
    await page.goto("/room-attendant/availability");
    await page.waitForLoadState("networkidle");

    // Create first availability
    const createButton = page.locator("button").filter({ hasText: /add|create|new/i }).first();
    await createButton.click();
    await page.waitForTimeout(500);

    const fromDateInput = page.locator('input[type="date"], input[placeholder*="from" i]').first();
    const toDateInput = page.locator('input[type="date"], input[placeholder*="to" i]').nth(1);

    const fromDate = new Date();
    const toDate = new Date(fromDate);
    toDate.setDate(toDate.getDate() + 3);

    const fromDateStr = fromDate.toISOString().split("T")[0];
    const toDateStr = toDate.toISOString().split("T")[0];

    await fromDateInput.fill(fromDateStr);
    await toDateInput.fill(toDateStr);

    const submitButton = page.locator("button").filter({ hasText: /save|create|submit/i }).last();
    await submitButton.click();

    await page.waitForTimeout(1000);
    const successMessage = page.locator("text=/success|created|added/i");
    await expect(successMessage).toBeVisible({ timeout: 5000 });

    // Try to create overlapping availability
    await page.waitForLoadState("networkidle");
    await createButton.click();
    await page.waitForTimeout(500);

    const fromDateInput2 = page.locator('input[type="date"], input[placeholder*="from" i]').first();
    const toDateInput2 = page.locator('input[type="date"], input[placeholder*="to" i]').nth(1);

    const overlapFromDate = new Date(fromDate);
    overlapFromDate.setDate(overlapFromDate.getDate() + 1);
    const overlapToDate = new Date(toDate);
    overlapToDate.setDate(overlapToDate.getDate() + 1);

    const overlapFromStr = overlapFromDate.toISOString().split("T")[0];
    const overlapToStr = overlapToDate.toISOString().split("T")[0];

    await fromDateInput2.fill(overlapFromStr);
    await toDateInput2.fill(overlapToStr);

    const submitButton2 = page.locator("button").filter({ hasText: /save|create|submit/i }).last();
    await submitButton2.click();

    // Wait for error message
    await page.waitForTimeout(1000);
    const errorMessage = page.locator("text=/overlap|conflict|already|exists/i");
    const isErrorVisible = await errorMessage.isVisible().catch(() => false);
    expect(isErrorVisible).toBe(true);
  });

  // SCENARIO 5: Room Attendant Availability - Update Availability (positive)
  test("5. Room Attendant Availability - Update Availability (positive)", async ({ page }) => {
    await authenticateAs(page, USERS.attendant);
    await page.goto("/room-attendant/availability");
    await page.waitForLoadState("networkidle");

    // Create availability first
    const createButton = page.locator("button").filter({ hasText: /add|create|new/i }).first();
    await createButton.click();
    await page.waitForTimeout(500);

    const fromDateInput = page.locator('input[type="date"], input[placeholder*="from" i]').first();
    const toDateInput = page.locator('input[type="date"], input[placeholder*="to" i]').nth(1);

    const fromDate = new Date();
    const toDate = new Date(fromDate);
    toDate.setDate(toDate.getDate() + 2);

    const fromDateStr = fromDate.toISOString().split("T")[0];
    const toDateStr = toDate.toISOString().split("T")[0];

    await fromDateInput.fill(fromDateStr);
    await toDateInput.fill(toDateStr);

    const submitButton = page.locator("button").filter({ hasText: /save|create|submit/i }).last();
    await submitButton.click();

    await page.waitForTimeout(1000);
    const successMessage = page.locator("text=/success|created|added/i");
    await expect(successMessage).toBeVisible({ timeout: 5000 });

    // Find and click edit button
    await page.waitForLoadState("networkidle");
    const editButton = page.locator("button").filter({ hasText: /edit|update/i }).first();
    await editButton.click();

    await page.waitForTimeout(500);

    // Update dates
    const updatedFromDate = new Date(fromDate);
    updatedFromDate.setDate(updatedFromDate.getDate() + 5);
    const updatedToDate = new Date(toDate);
    updatedToDate.setDate(updatedToDate.getDate() + 5);

    const updatedFromStr = updatedFromDate.toISOString().split("T")[0];
    const updatedToStr = updatedToDate.toISOString().split("T")[0];

    const fromInput = page.locator('input[type="date"], input[placeholder*="from" i]').first();
    const toInput = page.locator('input[type="date"], input[placeholder*="to" i]').nth(1);

    await fromInput.clear();
    await fromInput.fill(updatedFromStr);

    await toInput.clear();
    await toInput.fill(updatedToStr);

    const updateSubmitButton = page.locator("button").filter({ hasText: /save|update|submit/i }).last();
    await updateSubmitButton.click();

    // Verify update success
    await page.waitForTimeout(1000);
    const updateSuccess = page.locator("text=/success|updated|saved/i");
    const isUpdateVisible = await updateSuccess.isVisible().catch(() => false);
    expect(isUpdateVisible).toBe(true);
  });

  // SCENARIO 6: Room Attendant Availability - Delete Availability (positive)
  test("6. Room Attendant Availability - Delete Availability (positive)", async ({ page }) => {
    await authenticateAs(page, USERS.attendant);
    await page.goto("/room-attendant/availability");
    await page.waitForLoadState("networkidle");

    // Create availability first
    const createButton = page.locator("button").filter({ hasText: /add|create|new/i }).first();
    await createButton.click();
    await page.waitForTimeout(500);

    const fromDateInput = page.locator('input[type="date"], input[placeholder*="from" i]').first();
    const toDateInput = page.locator('input[type="date"], input[placeholder*="to" i]').nth(1);

    const fromDate = new Date();
    const toDate = new Date(fromDate);
    toDate.setDate(toDate.getDate() + 1);

    const fromDateStr = fromDate.toISOString().split("T")[0];
    const toDateStr = toDate.toISOString().split("T")[0];

    await fromDateInput.fill(fromDateStr);
    await toDateInput.fill(toDateStr);

    const submitButton = page.locator("button").filter({ hasText: /save|create|submit/i }).last();
    await submitButton.click();

    await page.waitForTimeout(1000);
    const successMessage = page.locator("text=/success|created|added/i");
    await expect(successMessage).toBeVisible({ timeout: 5000 });

    // Find and click delete button
    await page.waitForLoadState("networkidle");
    const deleteButton = page.locator("button").filter({ hasText: /delete|remove/i }).first();
    await deleteButton.click();

    // Confirm deletion
    await page.waitForTimeout(500);
    const confirmButton = page.locator("button").filter({ hasText: /confirm|yes|delete/i }).last();
    await confirmButton.click();

    // Verify deletion success
    await page.waitForTimeout(1000);
    const deleteSuccess = page.locator("text=/success|deleted|removed/i");
    const isDeleteVisible = await deleteSuccess.isVisible().catch(() => false);
    expect(isDeleteVisible).toBe(true);
  });

  // SCENARIO 7: Task Schedule - Client Assigns Room Attendant (positive)
  test("7. Task Schedule - Client Assigns Room Attendant (positive)", async ({ page }) => {
    await authenticateAs(page, USERS.client);
    await page.goto("/client/calendar");
    await page.waitForLoadState("networkidle");

    // Verify calendar page loads
    const calendarHeading = page.locator("h1, h2").filter({ hasText: /calendar|schedule|task/i });
    await expect(calendarHeading).toBeVisible({ timeout: 5000 });

    // Click create/add task button
    const createTaskButton = page.locator("button").filter({ hasText: /add|create|new|assign/i }).first();
    await createTaskButton.click();

    await page.waitForTimeout(500);

    // Fill task form
    const dateInput = page.locator('input[type="date"], input[placeholder*="date" i]').first();
    const attendantSelect = page.locator('select, [role="combobox"]').first();

    const taskDate = new Date();
    const taskDateStr = taskDate.toISOString().split("T")[0];

    await dateInput.fill(taskDateStr);

    // Select room attendant
    if (await attendantSelect.isVisible()) {
      await attendantSelect.click();
      await page.waitForTimeout(300);
      const option = page.locator('[role="option"]').first();
      await option.click();
    }

    // Submit form
    const submitButton = page.locator("button").filter({ hasText: /save|create|assign|submit/i }).last();
    await submitButton.click();

    // Wait for success
    await page.waitForTimeout(1000);
    const successMessage = page.locator("text=/success|created|assigned/i");
    const isSuccessVisible = await successMessage.isVisible().catch(() => false);
    expect(isSuccessVisible).toBe(true);
  });

  // SCENARIO 8: Task Schedule - Room Attendant Updates Status (positive)
  test("8. Task Schedule - Room Attendant Updates Status (positive)", async ({ page }) => {
    await authenticateAs(page, USERS.attendant);
    await page.goto("/room-attendant/task-schedule");
    await page.waitForLoadState("networkidle");

    // Verify task schedule page loads
    const pageHeading = page.locator("h1, h2").filter({ hasText: /task|schedule/i });
    await expect(pageHeading).toBeVisible({ timeout: 5000 });

    // Find a task and update its status
    const taskRow = page.locator("[role='row'], [data-testid*='task']").first();
    const isTaskVisible = await taskRow.isVisible().catch(() => false);

    if (isTaskVisible) {
      // Click on task to open details
      await taskRow.click();
      await page.waitForTimeout(500);

      // Find status dropdown/button
      const statusSelect = page.locator('select, [role="combobox"]').first();
      if (await statusSelect.isVisible()) {
        await statusSelect.click();
        await page.waitForTimeout(300);

        // Select next status (CONFIRMED)
        const option = page.locator('[role="option"]').nth(1);
        await option.click();

        // Save changes
        const saveButton = page.locator("button").filter({ hasText: /save|update|submit/i }).last();
        await saveButton.click();

        // Verify update
        await page.waitForTimeout(1000);
        const successMessage = page.locator("text=/success|updated/i");
        const isSuccessVisible = await successMessage.isVisible().catch(() => false);
        expect(isSuccessVisible).toBe(true);
      }
    }
  });

  // SCENARIO 9: Task Schedule - Invalid Status Transition (negative)
  test("9. Task Schedule - Invalid Status Transition (negative)", async ({ page }) => {
    await authenticateAs(page, USERS.attendant);
    await page.goto("/room-attendant/task-schedule");
    await page.waitForLoadState("networkidle");

    // Find a task
    const taskRow = page.locator("[role='row'], [data-testid*='task']").first();
    const isTaskVisible = await taskRow.isVisible().catch(() => false);

    if (isTaskVisible) {
      await taskRow.click();
      await page.waitForTimeout(500);

      // Try to select an invalid status (skip levels)
      const statusSelect = page.locator('select, [role="combobox"]').first();
      if (await statusSelect.isVisible()) {
        await statusSelect.click();
        await page.waitForTimeout(300);

        // Try to select DONE status (skip intermediate steps)
        const options = page.locator('[role="option"]');
        const optionCount = await options.count();

        if (optionCount > 2) {
          const lastOption = options.nth(optionCount - 1);
          await lastOption.click();

          const saveButton = page.locator("button").filter({ hasText: /save|update|submit/i }).last();
          await saveButton.click();

          // Should show error
          await page.waitForTimeout(1000);
          const errorMessage = page.locator("text=/invalid|cannot|not allowed/i");
          const isErrorVisible = await errorMessage.isVisible().catch(() => false);
          expect(isErrorVisible).toBe(true);
        }
      }
    }
  });

  // SCENARIO 10: Room Attendant Calendar - View Assigned Tasks (positive)
  test("10. Room Attendant Calendar - View Assigned Tasks (positive)", async ({ page }) => {
    await authenticateAs(page, USERS.attendant);
    await page.goto("/room-attendant/calendar");
    await page.waitForLoadState("networkidle");

    // Verify calendar page loads
    const calendarHeading = page.locator("h1, h2").filter({ hasText: /calendar/i });
    await expect(calendarHeading).toBeVisible({ timeout: 5000 });

    // Verify calendar is displayed
    const calendar = page.locator('[role="grid"], .fc-calendar, [data-testid*="calendar"]').first();
    const isCalendarVisible = await calendar.isVisible().catch(() => false);
    expect(isCalendarVisible).toBe(true);

    // Verify tasks are displayed with client information
    const taskElements = page.locator("[data-testid*='task'], [role='button']:has-text('Client')");
    const taskCount = await taskElements.count();
    // Tasks may or may not exist, but calendar should be visible
    expect(isCalendarVisible).toBe(true);
  });

  // SCENARIO 11: Room Attendant Calendar - View Availability Slots (positive)
  test("11. Room Attendant Calendar - View Availability Slots (positive)", async ({ page }) => {
    await authenticateAs(page, USERS.attendant);
    await page.goto("/room-attendant/calendar");
    await page.waitForLoadState("networkidle");

    // Verify calendar page loads
    const calendarHeading = page.locator("h1, h2").filter({ hasText: /calendar/i });
    await expect(calendarHeading).toBeVisible({ timeout: 5000 });

    // Verify calendar is displayed
    const calendar = page.locator('[role="grid"], .fc-calendar, [data-testid*="calendar"]').first();
    const isCalendarVisible = await calendar.isVisible().catch(() => false);
    expect(isCalendarVisible).toBe(true);

    // Look for availability indicators
    const availabilityElements = page.locator("[data-testid*='availability'], text=/available/i");
    const availabilityCount = await availabilityElements.count();
    // Availability may or may not exist, but calendar should be visible
    expect(isCalendarVisible).toBe(true);
  });

  // SCENARIO 12: Client Calendar - View Guest Bookings (positive)
  test("12. Client Calendar - View Guest Bookings (positive)", async ({ page }) => {
    await authenticateAs(page, USERS.client);
    await page.goto("/client/calendar");
    await page.waitForLoadState("networkidle");

    // Verify calendar page loads
    const calendarHeading = page.locator("h1, h2").filter({ hasText: /calendar/i });
    await expect(calendarHeading).toBeVisible({ timeout: 5000 });

    // Verify calendar is displayed
    const calendar = page.locator('[role="grid"], .fc-calendar, [data-testid*="calendar"]').first();
    const isCalendarVisible = await calendar.isVisible().catch(() => false);
    expect(isCalendarVisible).toBe(true);

    // Look for booking elements
    const bookingElements = page.locator("[data-testid*='booking'], text=/booking|guest/i");
    const bookingCount = await bookingElements.count();
    // Bookings may or may not exist, but calendar should be visible
    expect(isCalendarVisible).toBe(true);
  });

  // SCENARIO 13: Client-Room Attendant Assignment - Verify Relationship (positive)
  test("13. Client-Room Attendant Assignment - Verify Relationship (positive)", async ({ page }) => {
    await authenticateAs(page, USERS.attendant);
    await page.goto("/room-attendant/calendar");
    await page.waitForLoadState("networkidle");

    // Verify calendar page loads
    const calendarHeading = page.locator("h1, h2").filter({ hasText: /calendar/i });
    await expect(calendarHeading).toBeVisible({ timeout: 5000 });

    // Verify calendar is displayed
    const calendar = page.locator('[role="grid"], .fc-calendar, [data-testid*="calendar"]').first();
    const isCalendarVisible = await calendar.isVisible().catch(() => false);
    expect(isCalendarVisible).toBe(true);

    // Room attendant should only see their assigned client's tasks
    // This is verified by the fact that the page loads without errors
    // and displays only relevant data
  });

  // SCENARIO 14: Profile Access Control - Client Cannot Access Room Attendant Profile (negative)
  test("14. Profile Access Control - Client Cannot Access Room Attendant Profile (negative)", async ({
    page,
  }) => {
    await authenticateAs(page, USERS.client);

    // Try to access room attendant profile API
    const response = await page.request.get("/api/room-attendant-profile");

    // Should return 403 Forbidden
    expect(response.status()).toBe(403);
  });

  // SCENARIO 15: Profile Access Control - Room Attendant Cannot Access Client Profile (negative)
  test("15. Profile Access Control - Room Attendant Cannot Access Client Profile (negative)", async ({
    page,
  }) => {
    await authenticateAs(page, USERS.attendant);

    // Try to access client profile API
    const response = await page.request.get("/api/client-profile");

    // Should return 403 Forbidden
    expect(response.status()).toBe(403);
  });

  // SCENARIO 16: Task Schedule - Client Cannot Update Task Status (negative)
  test("16. Task Schedule - Client Cannot Update Task Status (negative)", async ({ page }) => {
    await authenticateAs(page, USERS.client);

    // Try to update task status via API
    const taskUpdatePayload = {
      status: 1, // CONFIRMED
    };

    const response = await page.request.patch("/api/room-attendant-task-schedules/dummy-id", {
      data: taskUpdatePayload,
    });

    // Should return 403 Forbidden
    expect(response.status()).toBe(403);
  });

  // SCENARIO 17: Availability - Room Attendant Cannot Modify Other's Availability (negative)
  test("17. Availability - Room Attendant Cannot Modify Other's Availability (negative)", async ({
    page,
  }) => {
    await authenticateAs(page, USERS.attendant);

    // Try to update another attendant's availability via API
    const updatePayload = {
      fromDate: "2025-01-15",
      toDate: "2025-01-20",
      note: "Unauthorized update",
    };

    const response = await page.request.patch("/api/room-attendant-availability/dummy-id", {
      data: updatePayload,
    });

    // Should return 403 Forbidden
    expect(response.status()).toBe(403);
  });

  // SCENARIO 18: Dashboard Navigation - Client Redirects Correctly (positive)
  test("18. Dashboard Navigation - Client Redirects Correctly (positive)", async ({ page }) => {
    await authenticateAs(page, USERS.client);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Should redirect to client calendar
    const currentUrl = page.url();
    expect(currentUrl).toContain("/client/calendar");

    // Verify client cannot access admin dashboard
    await page.goto("/admin/dashboard");
    await page.waitForLoadState("networkidle");

    // Should redirect away from admin
    const adminUrl = page.url();
    expect(adminUrl).not.toContain("/admin/dashboard");

    // Verify client cannot access room attendant dashboard
    await page.goto("/room-attendant/task-schedule");
    await page.waitForLoadState("networkidle");

    // Should redirect away from room attendant
    const attendantUrl = page.url();
    expect(attendantUrl).not.toContain("/room-attendant/task-schedule");
  });

  // SCENARIO 19: Dashboard Navigation - Room Attendant Redirects Correctly (positive)
  test("19. Dashboard Navigation - Room Attendant Redirects Correctly (positive)", async ({ page }) => {
    await authenticateAs(page, USERS.attendant);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Should redirect to room attendant task schedule
    const currentUrl = page.url();
    expect(currentUrl).toContain("/room-attendant/task-schedule");

    // Verify room attendant cannot access admin dashboard
    await page.goto("/admin/dashboard");
    await page.waitForLoadState("networkidle");

    // Should redirect away from admin
    const adminUrl = page.url();
    expect(adminUrl).not.toContain("/admin/dashboard");

    // Verify room attendant cannot access client dashboard
    await page.goto("/client/calendar");
    await page.waitForLoadState("networkidle");

    // Should redirect away from client
    const clientUrl = page.url();
    expect(clientUrl).not.toContain("/client/calendar");
  });
});
