import { clerk } from '@clerk/testing/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi } from './mockApi';

// The college student governments' scholarships, as a BSIT student who
// holds none yet: each is shown only to its own college's students.

const EMAIL = process.env.E2E_STUDENT_EMAIL;
test.skip(!EMAIL || !process.env.CLERK_SECRET_KEY, 'Set E2E_STUDENT_EMAIL in .env.e2e (and a Clerk secret key) to run the signed-in tests.');
test.afterEach(async ({ page }) => { await clerk.signOut({ page }).catch(() => {}); });

// Every college scholarship opened by its office.
const OPEN = ['s11', 's13', 's14', 's15', 's16', 's17'].map(id => ({ id, status: 'Open' }));

async function explore(page: Page, student: Record<string, unknown> = {}, applications?: Record<string, unknown>[]) {
  await mockApi(page, { notScholar: true, scholarships: OPEN, student, applications });
  await page.goto('/');
  await clerk.signIn({ page, emailAddress: EMAIL! });
  await expect(page.getByRole('heading', { name: 'Juan Miguel' })).toBeVisible({ timeout: 20_000 });
  const toggle = page.getByRole('button', { name: 'Toggle Sidebar' });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Explore Grants', exact: true }).click();
}

test('a CICS student sees Padayon Pioneers, not the other colleges\' scholarships', async ({ page }) => {
  await explore(page);
  await expect(page.getByText('Padayon Pioneers: CICS Student Financial Aid Grant').first()).toBeVisible();
  for (const name of ['CBAASG Achie Scholarship', 'CBAASG Officers’ Partial Scholarship', 'CEAT Financial Aid Scholarship', 'CCJESG Officers’ Financial Grant']) {
    await expect(page.getByText(name)).toHaveCount(0);
  }
});

test('Padayon Pioneers shows its grant and the CICSSG\'s documents', async ({ page }) => {
  await explore(page);
  await page.getByText('Padayon Pioneers: CICS Student Financial Aid Grant').first().click();
  await expect(page.getByText(/up to ₱50,000/).first()).toBeVisible();
  await expect(page.getByText('Photo of the inside of your house')).toBeVisible();
  await expect(page.getByText('Photo of the outside of your house')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply For This Scholarship' })).toBeEnabled();
});

test('a CBAA student sees the CBAASG scholarships instead', async ({ page }) => {
  await explore(page, { programCode: 'BSA', course: 'Bachelor of Science in Accountancy', college: 'College of Business Administration and Accountancy' });
  await expect(page.getByText('CBAASG Achie Scholarship').first()).toBeVisible();
  await expect(page.getByText('CBAASG Officers’ Partial Scholarship').first()).toBeVisible();
  await expect(page.getByText('Padayon Pioneers: CICS Student Financial Aid Grant')).toHaveCount(0);
});

// One-semester grants: last semester's application doesn't stop a new one.
const usgApplication = (submittedAt: string) => ({
  _id: 'usg-1', scholarshipId: 's11', scholarshipName: 'USG Student Financial Aid Grant', status: 'Approved',
  submittedAt, createdAt: submittedAt, documents: [], referenceCode: 'USGF-2026-0001',
});

test('a USG grantee from an earlier semester can apply again', async ({ page }) => {
  await explore(page, {}, [usgApplication('2025-04-10T03:00:00.000Z')]);
  await page.getByText('USG Student Financial Aid Grant').first().click();
  await expect(page.getByRole('button', { name: 'Apply For This Scholarship' })).toBeEnabled();
  await expect(page.getByText('For one semester: no renewals, so apply again in the next call')).toBeVisible();
});

test('a USG application from this semester still shows as applied', async ({ page }) => {
  await explore(page, {}, [usgApplication(new Date().toISOString())]);
  await page.getByText('USG Student Financial Aid Grant').first().click();
  await expect(page.getByRole('button', { name: 'Apply For This Scholarship' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /View in My Applications/ })).toBeVisible();
});
