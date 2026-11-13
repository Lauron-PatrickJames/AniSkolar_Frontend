import { expect, test } from '@playwright/test';

// Signed out: the landing page and the sign-in page. No account needed.

test('landing page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('AniSkolar');
  await expect(page).toHaveTitle(/AniSkolar/);
});

test('login button opens the Microsoft sign-in page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /login to access more/i }).first().click();
  await expect(page.getByRole('button', { name: /sign in with microsoft/i })).toBeVisible();
});

test('landing page has no sideways scrolling', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('View All Scholarships asks to log in first', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'View All Scholarships' }).click();
  await expect(page.getByRole('button', { name: /sign in with microsoft/i })).toBeVisible();
  await expect(page.getByText('Log in with your DLSU-D account to see all the scholarships you can apply for.')).toBeVisible();
});

test('Back from sign-in returns to the landing page sections', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation').first();
  if (await nav.getByRole('link', { name: 'About' }).isVisible()) {
    await nav.getByRole('link', { name: 'About' }).click();
    await nav.getByRole('link', { name: 'Scholarships' }).click();
  } else {
    await page.goto('/#about');
    await page.goto('/#scholarships');
  }
  await page.getByRole('button', { name: 'View All Scholarships' }).click();
  await expect(page.getByRole('button', { name: /sign in with microsoft/i })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('button', { name: /sign in with microsoft/i })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Available Scholarships' })).toBeVisible();
});
