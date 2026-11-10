import { clerk } from '@clerk/testing/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi, STUDENT } from './mockApi';

// Signed in as a scholar. Clerk signs in a real test account
// (E2E_STUDENT_EMAIL in .env.e2e, an existing user in the Clerk development
// instance); everything the app asks the backend is answered by mockApi,
// so the account's real records are never read or changed.

const EMAIL = process.env.E2E_STUDENT_EMAIL;
test.skip(!EMAIL || !process.env.CLERK_SECRET_KEY, 'Set E2E_STUDENT_EMAIL in .env.e2e (and a Clerk secret key) to run the signed-in tests.');

async function signIn(page: Page) {
  await mockApi(page);
  await page.goto('/');
  await clerk.signIn({ page, emailAddress: EMAIL! });
  await expect(page.getByRole('heading', { name: 'Juan Miguel' })).toBeVisible({ timeout: 20_000 });
}

// The sidebar is a drawer on phones: open it first.
async function openPage(page: Page, name: string) {
  const toggle = page.getByRole('button', { name: 'Toggle Sidebar' });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name, exact: true }).click();
}

const noSidewaysScroll = async (page: Page) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'page scrolls sideways').toBeLessThanOrEqual(1);
};

test.beforeEach(async ({ page }) => signIn(page));
// Ends the session so test runs don't pile up under Account Security.
test.afterEach(async ({ page }) => { await clerk.signOut({ page }).catch(() => {}); });

test('dashboard greets the scholar and shows the scholarship', async ({ page }) => {
  await expect(page.getByText(/good (morning|afternoon|evening),/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /SFAG.*50%/ }).first()).toBeVisible();
  await noSidewaysScroll(page);
});

test('duty hours card stops at the requirement and shows the extra', async ({ page }) => {
  const card = page.getByRole('button', { name: /duty hours/i }).filter({ hasText: 'of 55 h' });
  await expect(card).toContainText('55');
  await expect(card).toContainText('+8 h extra');
  await expect(card).not.toContainText('63');
});

test('top bar title matches the sidebar name on every page', async ({ page }) => {
  for (const name of ['My Scholarship', 'Renewal', 'Duty Hours', 'My Applications', 'Messages', 'Announcements', 'GPA Calculator', 'Dashboard']) {
    await openPage(page, name);
    await expect(page.locator('header').getByText(name, { exact: true })).toBeVisible();
    await noSidewaysScroll(page);
  }
});

test('My Scholarship shows the grant and what keeps it', async ({ page }) => {
  await openPage(page, 'My Scholarship');
  await expect(page.getByText('50%').first()).toBeVisible();
  await expect(page.getByText('tuition discount')).toBeVisible();
  await expect(page.getByText('To keep your scholarship')).toBeVisible();
  await expect(page.getByText('SFAG-2026-0001')).toBeVisible();
});

test('Duty Hours shows the hours over the requirement', async ({ page }) => {
  await openPage(page, 'Duty Hours');
  await expect(page.getByText(/completed your duty hours/i)).toBeVisible();
  await expect(page.getByText(/8 over the requirement/i)).toBeVisible();
});

test('the AniSkolar logo goes back to the dashboard', async ({ page }) => {
  await openPage(page, 'Messages');
  const toggle = page.getByRole('button', { name: 'Toggle Sidebar' });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole('button', { name: 'AniSkolar, go to Dashboard' }).click();
  await expect(page.locator('header').getByText('Dashboard', { exact: true })).toBeVisible();
});

test('the account menu opens under the profile photo', async ({ page }) => {
  const button = page.getByRole('button', { name: 'Account menu' });
  await button.click();
  const logOut = page.getByRole('button', { name: /log out/i });
  await expect(logOut).toBeVisible();
  await expect(page.getByText(STUDENT.email)).toBeVisible();
  // The menu's right edge lines up with the photo's, just below it.
  const photo = (await button.boundingBox())!;
  const menu = (await page.getByText(STUDENT.email).locator('xpath=ancestor::div[contains(@class,"shadow-xl")]').boundingBox())!;
  expect(Math.abs(menu.x + menu.width - (photo.x + photo.width))).toBeLessThan(4);
  expect(menu.y).toBeGreaterThan(photo.y + photo.height - 1);
  expect(menu.y - (photo.y + photo.height)).toBeLessThan(24);
});
