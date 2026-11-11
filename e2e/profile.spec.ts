import { clerk } from '@clerk/testing/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi } from './mockApi';

// Onboarding (only the core) and the profile filling in over time: the
// dashboard's completion card, and saving one section at a time. Clerk signs
// in the test account; every backend call is faked by mockApi.

const EMAIL = process.env.E2E_STUDENT_EMAIL;
test.skip(!EMAIL || !process.env.CLERK_SECRET_KEY, 'Set E2E_STUDENT_EMAIL in .env.e2e (and a Clerk secret key) to run the signed-in tests.');
test.afterEach(async ({ page }) => { await clerk.signOut({ page }).catch(() => {}); });

async function signIn(page: Page, options: Parameters<typeof mockApi>[1] = {}) {
  await mockApi(page, options);
  await page.goto('/');
  await clerk.signIn({ page, emailAddress: EMAIL! });
}

test('a new student only gives the core, then reaches the dashboard', async ({ page }) => {
  await signIn(page, { newStudent: true });
  await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible({ timeout: 20_000 });
  // Only the core: no personal, contact or family fields.
  await expect(page.getByLabel(/date of birth/i)).toHaveCount(0);
  await expect(page.getByLabel(/mobile number/i)).toHaveCount(0);
  await expect(page.getByLabel(/^section$/i)).toHaveCount(0);

  // Nothing filled: the student stays here.
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Enter your student number.')).toBeVisible();

  await page.getByLabel('Student number').fill('202300001');
  await page.getByPlaceholder('Search your program').fill('BSIT');
  await page.getByPlaceholder('Search your program').press('Enter');
  await page.getByLabel('Year level').selectOption('2nd Year');
  await page.getByLabel(/cumulative gpa/i).fill('3.25');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText(/good (morning|afternoon|evening),/i)).toBeVisible({ timeout: 15_000 });
});

test('a new student can choose to complete the full profile, and skip the rest any time', async ({ page }) => {
  const patches: Record<string, unknown>[] = [];
  await signIn(page, { newStudent: true, patches });
  await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Student number').fill('202300001');
  await page.getByPlaceholder('Search your program').fill('BSIT');
  await page.getByPlaceholder('Search your program').press('Enter');
  await page.getByLabel('Year level').selectOption('2nd Year');
  await page.getByLabel(/cumulative gpa/i).fill('3.25');
  await page.getByRole('button', { name: 'Complete my full profile' }).click();

  // The essentials are saved; the rest follows in steps.
  await expect(page.getByText('Step 1 of 3')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible();
  // An empty step isn't saved.
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByText('Enter your section.')).toBeVisible();
  expect(patches).toHaveLength(0);

  await page.getByRole('button', { name: 'Skip the rest for now' }).click();
  await expect(page.getByText(/good (morning|afternoon|evening),/i)).toBeVisible({ timeout: 15_000 });
});

test('the dashboard shows how complete the profile is, and links to each section', async ({ page }) => {
  await signIn(page);
  const card = page.getByRole('region', { name: /profile 45% complete/i });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '45');
  // Missing sections only (contact is complete).
  await expect(card.getByRole('button', { name: /personal details/i })).toBeVisible();
  await expect(card.getByRole('button', { name: /parents and guardian/i })).toBeVisible();
  await expect(card.getByRole('button', { name: /contact information/i })).toHaveCount(0);

  await card.getByRole('button', { name: /parents and guardian/i }).click();
  await expect(page.getByRole('dialog', { name: /edit profile/i })).toBeVisible();
  await expect(page.getByRole('tab', { name: /parents & guardian/i })).toHaveAttribute('aria-selected', 'true');
});

test('saving one section sends only that section, with the others still empty', async ({ page }) => {
  const patches: Record<string, unknown>[] = [];
  await signIn(page, { patches });
  await page.getByRole('region', { name: /profile 45% complete/i }).getByRole('button', { name: /academic/i }).click({ timeout: 20_000 });
  const dialog = page.getByRole('dialog', { name: /edit profile/i });
  await dialog.getByLabel(/^section$/i).fill('BIT21');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toBeHidden();

  expect(patches).toHaveLength(1);
  expect(patches[0].section).toBe('BIT21');
  // Nothing from the sections the student didn't touch (all still empty).
  for (const field of ['firstName', 'dateOfBirth', 'homeAddress', 'mobileNumber', 'fatherName', 'guardianType']) {
    expect(patches[0]).not.toHaveProperty(field);
  }
});
