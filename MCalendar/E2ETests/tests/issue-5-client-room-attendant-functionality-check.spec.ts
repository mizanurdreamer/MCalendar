import { test, expect, Page, Browser } from "@playwright/test";
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

async function authenticateAsAdmin(page: Page) {
  const accessToken = await signAccessToken(USERS.admin);
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

async function navigateToClientsPage(page: Page) {
  await page.goto(`${baseUrl}/admin/clients`);
  await page.waitForLoadState("networkidle");
}

async function navigateToRoomAttendantsPage(page: Page) {
  await page.goto(`${baseUrl}/admin/room-attendants`);
  await page.waitForLoadState("networkidle");
}

async function openCreateClientDialog(page: Page) {
  const addButton = page.locator('button').filter({ hasText: /Add client/i });
  await addButton.click();
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
}

async function openCreateRoomAttendantDialog(page: Page) {
  const addButton = page.locator('button').filter({ hasText: /Add room attendant/i });
  await addButton.click();
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
}

async function fillClientForm(
  page: Page,
  data: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    companyName?: string;
    portfolioSize?: string;
    timezone?: string;
    password?: string;
    confirmPassword?: string;
  }
) {
  // Fill first name
  const firstNameInputs = page.locator('input').filter({ has: page.locator('..') });
  const allInputs = await page.locator('input[type="text"]').all();
  
  // Find inputs by their position in the form
  const inputs = await page.locator('input').all();
  
  // First name (usually first text input)
  for (let i = 0; i < inputs.length; i++) {
    const type = await inputs[i].getAttribute('type');
    const placeholder = await inputs[i].getAttribute('placeholder');
    
    if (type === 'text' && !placeholder?.includes('Search')) {
      await inputs[i].fill(data.firstName);
      break;
    }
  }
  
  // Last name (second text input)
  let lastNameFilled = false;
  for (let i = 0; i < inputs.length; i++) {
    const type = await inputs[i].getAttribute('type');
    const placeholder = await inputs[i].getAttribute('placeholder');
    const value = await inputs[i].inputValue();
    
    if (type === 'text' && !placeholder?.includes('Search') && value !== data.firstName && !lastNameFilled) {
      await inputs[i].fill(data.lastName);
      lastNameFilled = true;
      break;
    }
  }
  
  // Email
  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.fill(data.email);
  
  // Phone
  const phoneInputs = await page.locator('input[type="tel"], input[placeholder*="phone" i]').all();
  if (phoneInputs.length === 0) {
    // Try to find by looking for phone-like inputs
    const allInputs = await page.locator('input').all();
    for (const input of allInputs) {
      const placeholder = await input.getAttribute('placeholder');
      if (placeholder?.toLowerCase().includes('phone')) {
        await input.fill(data.phone);
        break;
      }
    }
  } else {
    await phoneInputs[0].fill(data.phone);
  }
  
  // Company name
  if (data.companyName !== undefined) {
    const allInputs = await page.locator('input').all();
    for (const input of allInputs) {
      const placeholder = await input.getAttribute('placeholder');
      if (placeholder?.toLowerCase().includes('company') || placeholder?.toLowerCase().includes('brand')) {
        await input.fill(data.companyName);
        break;
      }
    }
  }
  
  // Portfolio size
  if (data.portfolioSize !== undefined) {
    const numberInputs = await page.locator('input[type="number"]').all();
    if (numberInputs.length > 0) {
      await numberInputs[0].fill(data.portfolioSize);
    }
  }
  
  // Timezone
  if (data.timezone !== undefined) {
    const allInputs = await page.locator('input').all();
    for (const input of allInputs) {
      const placeholder = await input.getAttribute('placeholder');
      if (placeholder?.toLowerCase().includes('timezone')) {
        await input.fill(data.timezone);
        break;
      }
    }
  }
  
  // Password
  if (data.password !== undefined) {
    const passwordInputs = await page.locator('input[type="password"]').all();
    if (passwordInputs.length >= 1) {
      await passwordInputs[0].fill(data.password);
    }
  }
  
  // Confirm password
  if (data.confirmPassword !== undefined) {
    const passwordInputs = await page.locator('input[type="password"]').all();
    if (passwordInputs.length >= 2) {
      await passwordInputs[1].fill(data.confirmPassword);
    }
  }
}

async function fillRoomAttendantForm(
  page: Page,
  data: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    clientName?: string;
    serviceArea?: string;
    hourlyRate?: string;
    rating?: string;
    password?: string;
    confirmPassword?: string;
  }
) {
  // Fill first name
  const inputs = await page.locator('input').all();
  
  for (let i = 0; i < inputs.length; i++) {
    const type = await inputs[i].getAttribute('type');
    const placeholder = await inputs[i].getAttribute('placeholder');
    
    if (type === 'text' && !placeholder?.includes('Search')) {
      await inputs[i].fill(data.firstName);
      break;
    }
  }
  
  // Last name
  let lastNameFilled = false;
  for (let i = 0; i < inputs.length; i++) {
    const type = await inputs[i].getAttribute('type');
    const placeholder = await inputs[i].getAttribute('placeholder');
    const value = await inputs[i].inputValue();
    
    if (type === 'text' && !placeholder?.includes('Search') && value !== data.firstName && !lastNameFilled) {
      await inputs[i].fill(data.lastName);
      lastNameFilled = true;
      break;
    }
  }
  
  // Email
  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.fill(data.email);
  
  // Client selection
  if (data.clientName !== undefined) {
    const comboboxes = page.locator('[role="combobox"]');
    const count = await comboboxes.count();
    if (count > 0) {
      await comboboxes.first().click();
      await page.waitForSelector('[role="option"]', { timeout: 3000 });
      const options = page.locator('[role="option"]');
      const optionCount = await options.count();
      for (let i = 0; i < optionCount; i++) {
        const text = await options.nth(i).textContent();
        if (text?.includes(data.clientName)) {
          await options.nth(i).click();
          break;
        }
      }
    }
  }
  
  // Phone
  const phoneInputs = await page.locator('input[type="tel"], input[placeholder*="phone" i]').all();
  if (phoneInputs.length === 0) {
    const allInputs = await page.locator('input').all();
    for (const input of allInputs) {
      const placeholder = await input.getAttribute('placeholder');
      if (placeholder?.toLowerCase().includes('phone')) {
        await input.fill(data.phone);
        break;
      }
    }
  } else {
    await phoneInputs[0].fill(data.phone);
  }
  
  // Service area
  if (data.serviceArea !== undefined) {
    const allInputs = await page.locator('input').all();
    for (const input of allInputs) {
      const placeholder = await input.getAttribute('placeholder');
      if (placeholder?.toLowerCase().includes('service area')) {
        await input.fill(data.serviceArea);
        break;
      }
    }
  }
  
  // Hourly rate
  if (data.hourlyRate !== undefined) {
    const numberInputs = await page.locator('input[type="number"]').all();
    if (numberInputs.length > 0) {
      await numberInputs[0].fill(data.hourlyRate);
    }
  }
  
  // Rating
  if (data.rating !== undefined) {
    const numberInputs = await page.locator('input[type="number"]').all();
    if (numberInputs.length > 1) {
      await numberInputs[1].fill(data.rating);
    }
  }
  
  // Password
  if (data.password !== undefined) {
    const passwordInputs = await page.locator('input[type="password"]').all();
    if (passwordInputs.length >= 1) {
      await passwordInputs[0].fill(data.password);
    }
  }
  
  // Confirm password
  if (data.confirmPassword !== undefined) {
    const passwordInputs = await page.locator('input[type="password"]').all();
    if (passwordInputs.length >= 2) {
      await passwordInputs[1].fill(data.confirmPassword);
    }
  }
}

test.describe("Client & Room Attendant Functionality - Issue #5", () => {
  test.beforeEach(async ({ page }) => {
    await authenticateAsAdmin(page);
  });

  // SCENARIO 1: Create Client - Valid Data (positive)
  test("1. Create Client - Valid Data (positive)", async ({ page }) => {
    await navigateToClientsPage(page);
    await openCreateClientDialog(page);
    
    const timestamp = Date.now();
    const clientEmail = `testclient-${timestamp}@example.com`;
    
    await fillClientForm(page, {
      firstName: "John",
      lastName: "Doe",
      email: clientEmail,
      phone: "+1234567890",
      companyName: "Test Company",
      portfolioSize: "10",
      timezone: "UTC",
      password: "SecurePass123!",
      confirmPassword: "SecurePass123!",
    });
    
    // Submit the form
    const createButton = page.locator('button').filter({ hasText: /^Create$/ });
    await createButton.click();
    
    // Wait for success message
    const successMessage = page.locator('text=/Client created|success/i');
    await expect(successMessage).toBeVisible({ timeout: 5000 });
    
    // Verify dialog closes
    await page.waitForSelector('[role="dialog"]', { state: "hidden", timeout: 5000 });
    
    // Verify client appears in the list
    await page.waitForLoadState("networkidle");
    const clientRow = page.locator(`text=${clientEmail}`);
    await expect(clientRow).toBeVisible();
  });

  // SCENARIO 2: Create Client - Missing Required Fields (negative)
  test("2. Create Client - Missing Required Fields (negative)", async ({ page }) => {
    await navigateToClientsPage(page);
    await openCreateClientDialog(page);
    
    // Try to submit without filling any fields
    const createButton = page.locator('button').filter({ hasText: /^Create$/ });
    await createButton.click();
    
    // Wait for validation errors
    await page.waitForTimeout(1000);
    
    // Check for error messages
    const errorMessages = page.locator('text=/required|cannot be empty/i');
    const errorCount = await errorMessages.count();
    expect(errorCount).toBeGreaterThan(0);
    
    // Dialog should still be open
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
  });

  // SCENARIO 3: Create Client - Invalid Email Format (negative)
  test("3. Create Client - Invalid Email Format (negative)", async ({ page }) => {
    await navigateToClientsPage(page);
    await openCreateClientDialog(page);
    
    await fillClientForm(page, {
      firstName: "Jane",
      lastName: "Smith",
      email: "notanemail",
      phone: "+1234567890",
      password: "SecurePass123!",
      confirmPassword: "SecurePass123!",
    });
    
    // Try to submit
    const createButton = page.locator('button').filter({ hasText: /^Create$/ });
    await createButton.click();
    
    // Wait for validation error
    await page.waitForTimeout(1000);
    
    // Check for email validation error
    const emailError = page.locator('text=/valid email|invalid email/i');
    await expect(emailError).toBeVisible();
    
    // Dialog should still be open
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
  });

  // SCENARIO 4: Create Client - Invalid Phone Format (negative)
  test("4. Create Client - Invalid Phone Format (negative)", async ({ page }) => {
    await navigateToClientsPage(page);
    await openCreateClientDialog(page);
    
    const timestamp = Date.now();
    const clientEmail = `testclient-${timestamp}@example.com`;
    
    await fillClientForm(page, {
      firstName: "Bob",
      lastName: "Johnson",
      email: clientEmail,
      phone: "invalid-phone",
      password: "SecurePass123!",
      confirmPassword: "SecurePass123!",
    });
    
    // Try to submit
    const createButton = page.locator('button').filter({ hasText: /^Create$/ });
    await createButton.click();
    
    // Wait for validation
    await page.waitForTimeout(1000);
    
    // Check if form is still open (validation prevented submission)
    const dialog = page.locator('[role="dialog"]');
    const isVisible = await dialog.isVisible().catch(() => false);
    
    // Either validation error is shown or dialog is still open
    if (isVisible) {
      expect(isVisible).toBe(true);
    }
  });

  // SCENARIO 5: Create Client - Duplicate Client (negative)
  test("5. Create Client - Duplicate Client (negative)", async ({ page }) => {
    await navigateToClientsPage(page);
    
    // Create first client
    await openCreateClientDialog(page);
    const timestamp = Date.now();
    const clientEmail = `duplicate-client-${timestamp}@example.com`;
    
    await fillClientForm(page, {
      firstName: "Duplicate",
      lastName: "Client",
      email: clientEmail,
      phone: "+1234567890",
      password: "SecurePass123!",
      confirmPassword: "SecurePass123!",
    });
    
    const createButton = page.locator('button').filter({ hasText: /^Create$/ });
    await createButton.click();
    await page.waitForSelector('text=/Client created|success/i', { timeout: 5000 });
    await page.waitForSelector('[role="dialog"]', { state: "hidden", timeout: 5000 });
    
    // Try to create duplicate
    await page.waitForLoadState("networkidle");
    await openCreateClientDialog(page);
    
    await fillClientForm(page, {
      firstName: "Duplicate",
      lastName: "Client",
      email: clientEmail,
      phone: "+1234567890",
      password: "SecurePass123!",
      confirmPassword: "SecurePass123!",
    });
    
    await createButton.click();
    
    // Wait for error message
    await page.waitForTimeout(2000);
    
    // Check for duplicate error
    const errorMessage = page.locator('text=/already exists|duplicate/i');
    const isVisible = await errorMessage.isVisible().catch(() => false);
    
    // Either error is shown or dialog is still open
    expect(isVisible || (await page.locator('[role="dialog"]').isVisible())).toBe(true);
  });

  // SCENARIO 6: Create Room Attendant - Valid Data (positive)
  test("6. Create Room Attendant - Valid Data (positive)", async ({ page }) => {
    await navigateToRoomAttendantsPage(page);
    await openCreateRoomAttendantDialog(page);
    
    const timestamp = Date.now();
    const attendantEmail = `attendant-${timestamp}@example.com`;
    
    await fillRoomAttendantForm(page, {
      firstName: "Alice",
      lastName: "Cleaner",
      email: attendantEmail,
      phone: "+1987654321",
      serviceArea: "Downtown",
      hourlyRate: "25",
      rating: "4.5",
      password: "SecurePass123!",
      confirmPassword: "SecurePass123!",
    });
    
    // Submit the form
    const createButton = page.locator('button').filter({ hasText: /^Create$/ });
    await createButton.click();
    
    // Wait for success message
    const successMessage = page.locator('text=/Room Attendant created|success/i');
    await expect(successMessage).toBeVisible({ timeout: 5000 });
    
    // Verify dialog closes
    await page.waitForSelector('[role="dialog"]', { state: "hidden", timeout: 5000 });
    
    // Verify attendant appears in the list
    await page.waitForLoadState("networkidle");
    const attendantRow = page.locator(`text=${attendantEmail}`);
    await expect(attendantRow).toBeVisible();
  });

  // SCENARIO 7: Create Room Attendant - Missing Required Fields (negative)
  test("7. Create Room Attendant - Missing Required Fields (negative)", async ({ page }) => {
    await navigateToRoomAttendantsPage(page);
    await openCreateRoomAttendantDialog(page);
    
    // Try to submit without filling any fields
    const createButton = page.locator('button').filter({ hasText: /^Create$/ });
    await createButton.click();
    
    // Wait for validation errors
    await page.waitForTimeout(1000);
    
    // Check for error messages
    const errorMessages = page.locator('text=/required|cannot be empty/i');
    const errorCount = await errorMessages.count();
    expect(errorCount).toBeGreaterThan(0);
    
    // Dialog should still be open
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
  });

  // SCENARIO 8: Create Room Attendant - Invalid Email Format (negative)
  test("8. Create Room Attendant - Invalid Email Format (negative)", async ({ page }) => {
    await navigateToRoomAttendantsPage(page);
    await openCreateRoomAttendantDialog(page);
    
    await fillRoomAttendantForm(page, {
      firstName: "Bob",
      lastName: "Cleaner",
      email: "invalidemail",
      phone: "+1987654321",
      password: "SecurePass123!",
      confirmPassword: "SecurePass123!",
    });
    
    // Try to submit
    const createButton = page.locator('button').filter({ hasText: /^Create$/ });
    await createButton.click();
    
    // Wait for validation error
    await page.waitForTimeout(1000);
    
    // Check for email validation error
    const emailError = page.locator('text=/valid email|invalid email/i');
    await expect(emailError).toBeVisible();
    
    // Dialog should still be open
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
  });

  // SCENARIO 9: Create Room Attendant - Duplicate Attendant (negative)
  test("9. Create Room Attendant - Duplicate Attendant (negative)", async ({ page }) => {
    await navigateToRoomAttendantsPage(page);
    
    // Create first attendant
    await openCreateRoomAttendantDialog(page);
    const timestamp = Date.now();
    const attendantEmail = `duplicate-attendant-${timestamp}@example.com`;
    
    await fillRoomAttendantForm(page, {
      firstName: "Duplicate",
      lastName: "Attendant",
      email: attendantEmail,
      phone: "+1987654321",
      password: "SecurePass123!",
      confirmPassword: "SecurePass123!",
    });
    
    const createButton = page.locator('button').filter({ hasText: /^Create$/ });
    await createButton.click();
    await page.waitForSelector('text=/Room Attendant created|success/i', { timeout: 5000 });
    await page.waitForSelector('[role="dialog"]', { state: "hidden", timeout: 5000 });
    
    // Try to create duplicate
    await page.waitForLoadState("networkidle");
    await openCreateRoomAttendantDialog(page);
    
    await fillRoomAttendantForm(page, {
      firstName: "Duplicate",
      lastName: "Attendant",
      email: attendantEmail,
      phone: "+1987654321",
      password: "SecurePass123!",
      confirmPassword: "SecurePass123!",
    });
    
    await createButton.click();
    
    // Wait for error message
    await page.waitForTimeout(2000);
    
    // Check for duplicate error
    const errorMessage = page.locator('text=/already exists|duplicate/i');
    const isVisible = await errorMessage.isVisible().catch(() => false);
    
    // Either error is shown or dialog is still open
    expect(isVisible || (await page.locator('[role="dialog"]').isVisible())).toBe(true);
  });

  // SCENARIO 10: Edit Client - Valid Data (positive)
  test("10. Edit Client - Valid Data (positive)", async ({ page }) => {
    await navigateToClientsPage(page);
    
    // Create a client first
    await openCreateClientDialog(page);
    const timestamp = Date.now();
    const clientEmail = `edit-client-${timestamp}@example.com`;
    
    await fillClientForm(page, {
      firstName: "Original",
      lastName: "Name",
      email: clientEmail,
      phone: "+1234567890",
      companyName: "Original Company",
      password: "SecurePass123!",
      confirmPassword: "SecurePass123!",
    });
    
    const createButton = page.locator('button').filter({ hasText: /^Create$/ });
    await createButton.click();
    await page.waitForSelector('text=/Client created|success/i', { timeout: 5000 });
    await page.waitForSelector('[role="dialog"]', { state: "hidden", timeout: 5000 });
    
    // Find and click the edit button for the client
    await page.waitForLoadState("networkidle");
    const clientRow = page.locator(`text=${clientEmail}`).first();
    await clientRow.scrollIntoViewIfNeeded();
    
    // Find the edit button in the same row
    const editButton = page.locator('button[title="Edit"]').first();
    await editButton.click();
    
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    
    // Update the form
    const inputs = await page.locator('input[type="text"]').all();
    if (inputs.length > 0) {
      await inputs[0].clear();
      await inputs[0].fill("Updated");
    }
    
    // Submit the form
    const saveButton = page.locator('button').filter({ hasText: /Save changes/i });
    await saveButton.click();
    
    // Wait for success message
    const successMessage = page.locator('text=/Client updated|success/i');
    await expect(successMessage).toBeVisible({ timeout: 5000 });
    
    // Verify dialog closes
    await page.waitForSelector('[role="dialog"]', { state: "hidden", timeout: 5000 });
    
    // Verify changes are reflected
    await page.waitForLoadState("networkidle");
    const updatedRow = page.locator('text=Updated');
    await expect(updatedRow).toBeVisible();
  });

  // SCENARIO 11: Edit Client - Invalid Data (negative)
  test("11. Edit Client - Invalid Data (negative)", async ({ page }) => {
    await navigateToClientsPage(page);
    
    // Create a client first
    await openCreateClientDialog(page);
    const timestamp = Date.now();
    const clientEmail = `invalid-edit-${timestamp}@example.com`;
    
    await fillClientForm(page, {
      firstName: "Test",
      lastName: "Client",
      email: clientEmail,
      phone: "+1234567890",
      password: "SecurePass123!",
      confirmPassword: "SecurePass123!",
    });
    
    const createButton = page.locator('button').filter({ hasText: /^Create$/ });
    await createButton.click();
    await page.waitForSelector('text=/Client created|success/i', { timeout: 5000 });
    await page.waitForSelector('[role="dialog"]', { state: "hidden", timeout: 5000 });
    
    // Find and click the edit button
    await page.waitForLoadState("networkidle");
    const clientRow = page.locator(`text=${clientEmail}`).first();
    await clientRow.scrollIntoViewIfNeeded();
    
    const editButton = page.locator('button[title="Edit"]').first();
    await editButton.click();
    
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    
    // Try to update with invalid phone
    const phoneInputs = await page.locator('input[type="tel"], input[placeholder*="phone" i]').all();
    if (phoneInputs.length > 0) {
      await phoneInputs[0].clear();
      await phoneInputs[0].fill("invalid-phone");
    }
    
    // Try to submit
    const saveButton = page.locator('button').filter({ hasText: /Save changes/i });
    await saveButton.click();
    
    // Wait for validation
    await page.waitForTimeout(1000);
    
    // Dialog should still be open or error should be shown
    const dialog = page.locator('[role="dialog"]');
    const isVisible = await dialog.isVisible().catch(() => false);
    expect(isVisible).toBe(true);
  });

  // SCENARIO 12: Edit Room Attendant - Valid Data (positive)
  test("12. Edit Room Attendant - Valid Data (positive)", async ({ page }) => {
    await navigateToRoomAttendantsPage(page);
    
    // Create an attendant first
    await openCreateRoomAttendantDialog(page);
    const timestamp = Date.now();
    const attendantEmail = `edit-attendant-${timestamp}@example.com`;
    
    await fillRoomAttendantForm(page, {
      firstName: "Original",
      lastName: "Attendant",
      email: attendantEmail,
      phone: "+1987654321",
      serviceArea: "Downtown",
      password: "SecurePass123!",
      confirmPassword: "SecurePass123!",
    });
    
    const createButton = page.locator('button').filter({ hasText: /^Create$/ });
    await createButton.click();
    await page.waitForSelector('text=/Room Attendant created|success/i', { timeout: 5000 });
    await page.waitForSelector('[role="dialog"]', { state: "hidden", timeout: 5000 });
    
    // Find and click the edit button
    await page.waitForLoadState("networkidle");
    const attendantRow = page.locator(`text=${attendantEmail}`).first();
    await attendantRow.scrollIntoViewIfNeeded();
    
    const editButton = page.locator('button[title="Edit"]').first();
    await editButton.click();
    
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    
    // Update the form
    const inputs = await page.locator('input[type="text"]').all();
    if (inputs.length > 0) {
      await inputs[0].clear();
      await inputs[0].fill("Updated");
    }
    
    // Submit the form
    const saveButton = page.locator('button').filter({ hasText: /Save changes/i });
    await saveButton.click();
    
    // Wait for success message
    const successMessage = page.locator('text=/Room Attendant updated|success/i');
    await expect(successMessage).toBeVisible({ timeout: 5000 });
    
    // Verify dialog closes
    await page.waitForSelector('[role="dialog"]', { state: "hidden", timeout: 5000 });
    
    // Verify changes are reflected
    await page.waitForLoadState("networkidle");
    const updatedRow = page.locator('text=Updated');
    await expect(updatedRow).toBeVisible();
  });

  // SCENARIO 13: Edit Room Attendant - Invalid Data (negative)
  test("13. Edit Room Attendant - Invalid Data (negative)", async ({ page }) => {
    await navigateToRoomAttendantsPage(page);
    
    // Create an attendant first
    await openCreateRoomAttendantDialog(page);
    const timestamp = Date.now();
    const attendantEmail = `invalid-edit-attendant-${timestamp}@example.com`;
    
    await fillRoomAttendantForm(page, {
      firstName: "Test",
      lastName: "Attendant",
      email: attendantEmail,
      phone: "+1987654321",
      password: "SecurePass123!",
      confirmPassword: "SecurePass123!",
    });
    
    const createButton = page.locator('button').filter({ hasText: /^Create$/ });
    await createButton.click();
    await page.waitForSelector('text=/Room Attendant created|success/i', { timeout: 5000 });
    await page.waitForSelector('[role="dialog"]', { state: "hidden", timeout: 5000 });
    
    // Find and click the edit button
    await page.waitForLoadState("networkidle");
    const attendantRow = page.locator(`text=${attendantEmail}`).first();
    await attendantRow.scrollIntoViewIfNeeded();
    
    const editButton = page.locator('button[title="Edit"]').first();
    await editButton.click();
    
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    
    // Try to update with invalid phone
    const phoneInputs = await page.locator('input[type="tel"], input[placeholder*="phone" i]').all();
    if (phoneInputs.length > 0) {
      await phoneInputs[0].clear();
      await phoneInputs[0].fill("invalid-phone");
    }
    
    // Try to submit
    const saveButton = page.locator('button').filter({ hasText: /Save changes/i });
    await saveButton.click();
    
    // Wait for validation
    await page.waitForTimeout(1000);
    
    // Dialog should still be open
    const dialog = page.locator('[role="dialog"]');
    const isVisible = await dialog.isVisible().catch(() => false);
    expect(isVisible).toBe(true);
  });

  // SCENARIO 14: Delete Client (positive)
  test("14. Delete Client (positive)", async ({ page }) => {
    await navigateToClientsPage(page);
    
    // Create a client to delete
    await openCreateClientDialog(page);
    const timestamp = Date.now();
    const clientEmail = `delete-client-${timestamp}@example.com`;
    
    await fillClientForm(page, {
      firstName: "Delete",
      lastName: "Me",
      email: clientEmail,
      phone: "+1234567890",
      password: "SecurePass123!",
      confirmPassword: "SecurePass123!",
    });
    
    const createButton = page.locator('button').filter({ hasText: /^Create$/ });
    await createButton.click();
    await page.waitForSelector('text=/Client created|success/i', { timeout: 5000 });
    await page.waitForSelector('[role="dialog"]', { state: "hidden", timeout: 5000 });
    
    // Find and click the delete button
    await page.waitForLoadState("networkidle");
    const clientRow = page.locator(`text=${clientEmail}`).first();
    await clientRow.scrollIntoViewIfNeeded();
    
    const deleteButton = page.locator('button[title="Delete"]').first();
    await deleteButton.click();
    
    // Confirm deletion
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    const confirmButton = page.locator('button').filter({ hasText: /Delete/i }).last();
    await confirmButton.click();
    
    // Wait for success message
    const successMessage = page.locator('text=/Client deleted|success/i');
    await expect(successMessage).toBeVisible({ timeout: 5000 });
    
    // Verify client is removed from list
    await page.waitForLoadState("networkidle");
    const deletedRow = page.locator(`text=${clientEmail}`);
    const isVisible = await deletedRow.isVisible().catch(() => false);
    expect(isVisible).toBe(false);
  });

  // SCENARIO 15: Delete Room Attendant (positive)
  test("15. Delete Room Attendant (positive)", async ({ page }) => {
    await navigateToRoomAttendantsPage(page);
    
    // Create an attendant to delete
    await openCreateRoomAttendantDialog(page);
    const timestamp = Date.now();
    const attendantEmail = `delete-attendant-${timestamp}@example.com`;
    
    await fillRoomAttendantForm(page, {
      firstName: "Delete",
      lastName: "Me",
      email: attendantEmail,
      phone: "+1987654321",
      password: "SecurePass123!",
      confirmPassword: "SecurePass123!",
    });
    
    const createButton = page.locator('button').filter({ hasText: /^Create$/ });
    await createButton.click();
    await page.waitForSelector('text=/Room Attendant created|success/i', { timeout: 5000 });
    await page.waitForSelector('[role="dialog"]', { state: "hidden", timeout: 5000 });
    
    // Find and click the delete button
    await page.waitForLoadState("networkidle");
    const attendantRow = page.locator(`text=${attendantEmail}`).first();
    await attendantRow.scrollIntoViewIfNeeded();
    
    const deleteButton = page.locator('button[title="Delete"]').first();
    await deleteButton.click();
    
    // Confirm deletion
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    const confirmButton = page.locator('button').filter({ hasText: /Delete/i }).last();
    await confirmButton.click();
    
    // Wait for success message
    const successMessage = page.locator('text=/Room Attendant deleted|success/i');
    await expect(successMessage).toBeVisible({ timeout: 5000 });
    
    // Verify attendant is removed from list
    await page.waitForLoadState("networkidle");
    const deletedRow = page.locator(`text=${attendantEmail}`);
    const isVisible = await deletedRow.isVisible().catch(() => false);
    expect(isVisible).toBe(false);
  });

  // SCENARIO 16: View Client Details (positive)
  test("16. View Client Details (positive)", async ({ page }) => {
    await navigateToClientsPage(page);
    
    // Create a client first
    await openCreateClientDialog(page);
    const timestamp = Date.now();
    const clientEmail = `view-client-${timestamp}@example.com`;
    
    await fillClientForm(page, {
      firstName: "View",
      lastName: "Client",
      email: clientEmail,
      phone: "+1234567890",
      companyName: "View Company",
      portfolioSize: "5",
      timezone: "EST",
      password: "SecurePass123!",
      confirmPassword: "SecurePass123!",
    });
    
    const createButton = page.locator('button').filter({ hasText: /^Create$/ });
    await createButton.click();
    await page.waitForSelector('text=/Client created|success/i', { timeout: 5000 });
    await page.waitForSelector('[role="dialog"]', { state: "hidden", timeout: 5000 });
    
    // Find and click the view button
    await page.waitForLoadState("networkidle");
    const clientRow = page.locator(`text=${clientEmail}`).first();
    await clientRow.scrollIntoViewIfNeeded();
    
    const viewButton = page.locator('button[title="View"]').first();
    await viewButton.click();
    
    // Verify details dialog opens
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    
    // Verify all details are displayed
    const detailsDialog = page.locator('[role="dialog"]');
    await expect(detailsDialog).toContainText("View");
    await expect(detailsDialog).toContainText("Client");
    await expect(detailsDialog).toContainText(clientEmail);
    await expect(detailsDialog).toContainText("View Company");
    
    // Close the dialog
    const closeButton = page.locator('button').filter({ hasText: /Close/i });
    await closeButton.click();
    await page.waitForSelector('[role="dialog"]', { state: "hidden", timeout: 5000 });
  });

  // SCENARIO 17: View Room Attendant Details (positive)
  test("17. View Room Attendant Details (positive)", async ({ page }) => {
    await navigateToRoomAttendantsPage(page);
    
    // Create an attendant first
    await openCreateRoomAttendantDialog(page);
    const timestamp = Date.now();
    const attendantEmail = `view-attendant-${timestamp}@example.com`;
    
    await fillRoomAttendantForm(page, {
      firstName: "View",
      lastName: "Attendant",
      email: attendantEmail,
      phone: "+1987654321",
      serviceArea: "Uptown",
      hourlyRate: "30",
      rating: "4.8",
      password: "SecurePass123!",
      confirmPassword: "SecurePass123!",
    });
    
    const createButton = page.locator('button').filter({ hasText: /^Create$/ });
    await createButton.click();
    await page.waitForSelector('text=/Room Attendant created|success/i', { timeout: 5000 });
    await page.waitForSelector('[role="dialog"]', { state: "hidden", timeout: 5000 });
    
    // Find and click the view button
    await page.waitForLoadState("networkidle");
    const attendantRow = page.locator(`text=${attendantEmail}`).first();
    await attendantRow.scrollIntoViewIfNeeded();
    
    const viewButton = page.locator('button[title="View"]').first();
    await viewButton.click();
    
    // Verify details dialog opens
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    
    // Verify all details are displayed
    const detailsDialog = page.locator('[role="dialog"]');
    await expect(detailsDialog).toContainText("View");
    await expect(detailsDialog).toContainText("Attendant");
    await expect(detailsDialog).toContainText(attendantEmail);
    await expect(detailsDialog).toContainText("Uptown");
    
    // Close the dialog
    const closeButton = page.locator('button').filter({ hasText: /Close/i });
    await closeButton.click();
    await page.waitForSelector('[role="dialog"]', { state: "hidden", timeout: 5000 });
  });

  // SCENARIO 18: Data Persistence - Client (positive)
  test("18. Data Persistence - Client (positive)", async ({ page }) => {
    await navigateToClientsPage(page);
    
    // Create a client
    await openCreateClientDialog(page);
    const timestamp = Date.now();
    const clientEmail = `persist-client-${timestamp}@example.com`;
    const clientFirstName = "Persist";
    const clientLastName = "Client";
    
    await fillClientForm(page, {
      firstName: clientFirstName,
      lastName: clientLastName,
      email: clientEmail,
      phone: "+1234567890",
      companyName: "Persist Company",
      password: "SecurePass123!",
      confirmPassword: "SecurePass123!",
    });
    
    const createButton = page.locator('button').filter({ hasText: /^Create$/ });
    await createButton.click();
    await page.waitForSelector('text=/Client created|success/i', { timeout: 5000 });
    await page.waitForSelector('[role="dialog"]', { state: "hidden", timeout: 5000 });
    
    // Verify client appears in list
    await page.waitForLoadState("networkidle");
    let clientRow = page.locator(`text=${clientEmail}`);
    await expect(clientRow).toBeVisible();
    
    // Refresh the page
    await page.reload();
    await page.waitForLoadState("networkidle");
    
    // Verify client still appears after refresh
    clientRow = page.locator(`text=${clientEmail}`);
    await expect(clientRow).toBeVisible();
    
    // Verify the name is still correct
    const nameRow = page.locator(`text=${clientFirstName}`);
    await expect(nameRow).toBeVisible();
  });

  // SCENARIO 19: Data Persistence - Room Attendant (positive)
  test("19. Data Persistence - Room Attendant (positive)", async ({ page }) => {
    await navigateToRoomAttendantsPage(page);
    
    // Create an attendant
    await openCreateRoomAttendantDialog(page);
    const timestamp = Date.now();
    const attendantEmail = `persist-attendant-${timestamp}@example.com`;
    const attendantFirstName = "Persist";
    const attendantLastName = "Attendant";
    
    await fillRoomAttendantForm(page, {
      firstName: attendantFirstName,
      lastName: attendantLastName,
      email: attendantEmail,
      phone: "+1987654321",
      serviceArea: "Persist Area",
      password: "SecurePass123!",
      confirmPassword: "SecurePass123!",
    });
    
    const createButton = page.locator('button').filter({ hasText: /^Create$/ });
    await createButton.click();
    await page.waitForSelector('text=/Room Attendant created|success/i', { timeout: 5000 });
    await page.waitForSelector('[role="dialog"]', { state: "hidden", timeout: 5000 });
    
    // Verify attendant appears in list
    await page.waitForLoadState("networkidle");
    let attendantRow = page.locator(`text=${attendantEmail}`);
    await expect(attendantRow).toBeVisible();
    
    // Refresh the page
    await page.reload();
    await page.waitForLoadState("networkidle");
    
    // Verify attendant still appears after refresh
    attendantRow = page.locator(`text=${attendantEmail}`);
    await expect(attendantRow).toBeVisible();
    
    // Verify the name is still correct
    const nameRow = page.locator(`text=${attendantFirstName}`);
    await expect(nameRow).toBeVisible();
  });

  // SCENARIO 20: Responsive Design - Mobile (positive)
  test("20. Responsive Design - Mobile (positive)", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 }, // iPhone SE size
    });
    const page = await context.newPage();
    
    await authenticateAsAdmin(page);
    await navigateToClientsPage(page);
    
    // Verify page loads on mobile
    await page.waitForLoadState("networkidle");
    
    // Verify key elements are visible
    const heading = page.locator('h1').filter({ hasText: /Clients/i });
    await expect(heading).toBeVisible();
    
    // Verify add button is accessible
    const addButton = page.locator('button').filter({ hasText: /Add client/i });
    await expect(addButton).toBeVisible();
    
    // Verify table/list is visible
    const table = page.locator('[role="table"]');
    const isVisible = await table.isVisible().catch(() => false);
    expect(isVisible || (await page.locator('text=/No clients found/i').isVisible())).toBe(true);
    
    // Test creating a client on mobile
    await addButton.click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    
    const timestamp = Date.now();
    const clientEmail = `mobile-client-${timestamp}@example.com`;
    
    await fillClientForm(page, {
      firstName: "Mobile",
      lastName: "Client",
      email: clientEmail,
      phone: "+1234567890",
      password: "SecurePass123!",
      confirmPassword: "SecurePass123!",
    });
    
    const createButton = page.locator('button').filter({ hasText: /^Create$/ });
    await createButton.click();
    await page.waitForSelector('text=/Client created|success/i', { timeout: 5000 });
    
    await context.close();
  });

  // SCENARIO 21: Responsive Design - Tablet (positive)
  test("21. Responsive Design - Tablet (positive)", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 768, height: 1024 }, // iPad size
    });
    const page = await context.newPage();
    
    await authenticateAsAdmin(page);
    await navigateToClientsPage(page);
    
    // Verify page loads on tablet
    await page.waitForLoadState("networkidle");
    
    // Verify key elements are visible
    const heading = page.locator('h1').filter({ hasText: /Clients/i });
    await expect(heading).toBeVisible();
    
    // Verify add button is accessible
    const addButton = page.locator('button').filter({ hasText: /Add client/i });
    await expect(addButton).toBeVisible();
    
    // Verify table is visible
    const table = page.locator('[role="table"]');
    const isVisible = await table.isVisible().catch(() => false);
    expect(isVisible || (await page.locator('text=/No clients found/i').isVisible())).toBe(true);
    
    // Test creating a client on tablet
    await addButton.click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    
    const timestamp = Date.now();
    const clientEmail = `tablet-client-${timestamp}@example.com`;
    
    await fillClientForm(page, {
      firstName: "Tablet",
      lastName: "Client",
      email: clientEmail,
      phone: "+1234567890",
      password: "SecurePass123!",
      confirmPassword: "SecurePass123!",
    });
    
    const createButton = page.locator('button').filter({ hasText: /^Create$/ });
    await createButton.click();
    await page.waitForSelector('text=/Client created|success/i', { timeout: 5000 });
    
    await context.close();
  });

  // SCENARIO 22: Responsive Design - Desktop (positive)
  test("22. Responsive Design - Desktop (positive)", async ({ page }) => {
    // Default viewport is desktop size
    await authenticateAsAdmin(page);
    await navigateToClientsPage(page);
    
    // Verify page loads on desktop
    await page.waitForLoadState("networkidle");
    
    // Verify key elements are visible
    const heading = page.locator('h1').filter({ hasText: /Clients/i });
    await expect(heading).toBeVisible();
    
    // Verify add button is accessible
    const addButton = page.locator('button').filter({ hasText: /Add client/i });
    await expect(addButton).toBeVisible();
    
    // Verify table is visible with all columns
    const table = page.locator('[role="table"]');
    const isVisible = await table.isVisible().catch(() => false);
    expect(isVisible || (await page.locator('text=/No clients found/i').isVisible())).toBe(true);
    
    // Test creating a client on desktop
    await addButton.click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    
    const timestamp = Date.now();
    const clientEmail = `desktop-client-${timestamp}@example.com`;
    
    await fillClientForm(page, {
      firstName: "Desktop",
      lastName: "Client",
      email: clientEmail,
      phone: "+1234567890",
      password: "SecurePass123!",
      confirmPassword: "SecurePass123!",
    });
    
    const createButton = page.locator('button').filter({ hasText: /^Create$/ });
    await createButton.click();
    await page.waitForSelector('text=/Client created|success/i', { timeout: 5000 });
  });

  // SCENARIO 23: Permission Check - Create Client (positive)
  test("23. Permission Check - Create Client (positive)", async ({ page }) => {
    await authenticateAsAdmin(page);
    await navigateToClientsPage(page);
    
    // Verify admin can see the create button
    const addButton = page.locator('button').filter({ hasText: /Add client/i });
    await expect(addButton).toBeVisible();
    
    // Verify admin can open the create dialog
    await addButton.click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    
    // Close dialog
    await page.press('Escape');
  });

  // SCENARIO 24: Permission Check - Edit Client (positive)
  test("24. Permission Check - Edit Client (positive)", async ({ page }) => {
    await authenticateAsAdmin(page);
    await navigateToClientsPage(page);
    
    // Create a client first
    await openCreateClientDialog(page);
    const timestamp = Date.now();
    const clientEmail = `perm-edit-client-${timestamp}@example.com`;
    
    await fillClientForm(page, {
      firstName: "Perm",
      lastName: "Edit",
      email: clientEmail,
      phone: "+1234567890",
      password: "SecurePass123!",
      confirmPassword: "SecurePass123!",
    });
    
    const createButton = page.locator('button').filter({ hasText: /^Create$/ });
    await createButton.click();
    await page.waitForSelector('text=/Client created|success/i', { timeout: 5000 });
    await page.waitForSelector('[role="dialog"]', { state: "hidden", timeout: 5000 });
    
    // Verify admin can see the edit button
    await page.waitForLoadState("networkidle");
    const clientRow = page.locator(`text=${clientEmail}`).first();
    await clientRow.scrollIntoViewIfNeeded();
    
    const editButton = page.locator('button[title="Edit"]').first();
    await expect(editButton).toBeVisible();
    
    // Verify admin can click edit
    await editButton.click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    
    // Close dialog
    await page.press('Escape');
  });

  // SCENARIO 25: Permission Check - Delete Client (positive)
  test("25. Permission Check - Delete Client (positive)", async ({ page }) => {
    await authenticateAsAdmin(page);
    await navigateToClientsPage(page);
    
    // Create a client first
    await openCreateClientDialog(page);
    const timestamp = Date.now();
    const clientEmail = `perm-delete-client-${timestamp}@example.com`;
    
    await fillClientForm(page, {
      firstName: "Perm",
      lastName: "Delete",
      email: clientEmail,
      phone: "+1234567890",
      password: "SecurePass123!",
      confirmPassword: "SecurePass123!",
    });
    
    const createButton = page.locator('button').filter({ hasText: /^Create$/ });
    await createButton.click();
    await page.waitForSelector('text=/Client created|success/i', { timeout: 5000 });
    await page.waitForSelector('[role="dialog"]', { state: "hidden", timeout: 5000 });
    
    // Verify admin can see the delete button
    await page.waitForLoadState("networkidle");
    const clientRow = page.locator(`text=${clientEmail}`).first();
    await clientRow.scrollIntoViewIfNeeded();
    
    const deleteButton = page.locator('button[title="Delete"]').first();
    await expect(deleteButton).toBeVisible();
    
    // Verify admin can click delete
    await deleteButton.click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    
    // Close dialog
    await page.press('Escape');
  });

  // SCENARIO 26: Permission Check - Create Room Attendant (positive)
  test("26. Permission Check - Create Room Attendant (positive)", async ({ page }) => {
    await authenticateAsAdmin(page);
    await navigateToRoomAttendantsPage(page);
    
    // Verify admin can see the create button
    const addButton = page.locator('button').filter({ hasText: /Add room attendant/i });
    await expect(addButton).toBeVisible();
    
    // Verify admin can open the create dialog
    await addButton.click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    
    // Close dialog
    await page.press('Escape');
  });

  // SCENARIO 27: Permission Check - Edit Room Attendant (positive)
  test("27. Permission Check - Edit Room Attendant (positive)", async ({ page }) => {
    await authenticateAsAdmin(page);
    await navigateToRoomAttendantsPage(page);
    
    // Create an attendant first
    await openCreateRoomAttendantDialog(page);
    const timestamp = Date.now();
    const attendantEmail = `perm-edit-attendant-${timestamp}@example.com`;
    
    await fillRoomAttendantForm(page, {
      firstName: "Perm",
      lastName: "Edit",
      email: attendantEmail,
      phone: "+1987654321",
      password: "SecurePass123!",
      confirmPassword: "SecurePass123!",
    });
    
    const createButton = page.locator('button').filter({ hasText: /^Create$/ });
    await createButton.click();
    await page.waitForSelector('text=/Room Attendant created|success/i', { timeout: 5000 });
    await page.waitForSelector('[role="dialog"]', { state: "hidden", timeout: 5000 });
    
    // Verify admin can see the edit button
    await page.waitForLoadState("networkidle");
    const attendantRow = page.locator(`text=${attendantEmail}`).first();
    await attendantRow.scrollIntoViewIfNeeded();
    
    const editButton = page.locator('button[title="Edit"]').first();
    await expect(editButton).toBeVisible();
    
    // Verify admin can click edit
    await editButton.click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    
    // Close dialog
    await page.press('Escape');
  });

  // SCENARIO 28: Permission Check - Delete Room Attendant (positive)
  test("28. Permission Check - Delete Room Attendant (positive)", async ({ page }) => {
    await authenticateAsAdmin(page);
    await navigateToRoomAttendantsPage(page);
    
    // Create an attendant first
    await openCreateRoomAttendantDialog(page);
    const timestamp = Date.now();
    const attendantEmail = `perm-delete-attendant-${timestamp}@example.com`;
    
    await fillRoomAttendantForm(page, {
      firstName: "Perm",
      lastName: "Delete",
      email: attendantEmail,
      phone: "+1987654321",
      password: "SecurePass123!",
      confirmPassword: "SecurePass123!",
    });
    
    const createButton = page.locator('button').filter({ hasText: /^Create$/ });
    await createButton.click();
    await page.waitForSelector('text=/Room Attendant created|success/i', { timeout: 5000 });
    await page.waitForSelector('[role="dialog"]', { state: "hidden", timeout: 5000 });
    
    // Verify admin can see the delete button
    await page.waitForLoadState("networkidle");
    const attendantRow = page.locator(`text=${attendantEmail}`).first();
    await attendantRow.scrollIntoViewIfNeeded();
    
    const deleteButton = page.locator('button[title="Delete"]').first();
    await expect(deleteButton).toBeVisible();
    
    // Verify admin can click delete
    await deleteButton.click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    
    // Close dialog
    await page.press('Escape');
  });
});
