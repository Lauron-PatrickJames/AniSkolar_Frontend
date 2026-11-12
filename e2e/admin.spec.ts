import { clerk } from '@clerk/testing/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockAdminApi } from './mockAdminApi';

// The admin console, signed in as two office accounts from the Clerk
// development instance: the AdSO (sees everything) and a partner office
// (POLCA: a smaller menu). Every backend request is faked by
// mockAdminApi, so no real application is read or changed.

const ADSO = process.env.E2E_ADSO_EMAIL;
const OFFICE = process.env.E2E_OFFICE_EMAIL;
const hasClerk = !!process.env.CLERK_SECRET_KEY;

async function signIn(page: Page, emailAddress: string, options: Parameters<typeof mockAdminApi>[1] = {}) {
  await mockAdminApi(page, options);
  await page.goto('/');
  await clerk.signIn({ page, emailAddress });
  // The sidebar (a hidden drawer on phones) is in the page once the console loads.
  await expect(page.locator('#admin-sidebar')).toBeAttached({ timeout: 20_000 });
}

// A menu item by its name; counts are read out after a comma
// ("Applications , 1 awaiting review"), and "Scholars" mustn't match
// "Scholarships".
const navItem = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: new RegExp(`^${name}\\s*(,.*)?$`) });

// Below md the sidebar is a drawer.
async function showMenu(page: Page) {
  const open = page.getByRole('button', { name: 'Open navigation' });
  if (await open.isVisible()) await open.click();
}

async function openView(page: Page, name: string) {
  await showMenu(page);
  await navItem(page, name).click();
}

// The page that's open: its menu item is marked current (checked in the
// markup, since the phone drawer closes after a tap) and the page has its
// heading.
async function expectOnPage(page: Page, name: string) {
  await expect(page.locator('#admin-sidebar button[aria-current="page"]')).toHaveText(new RegExp(`^${name}`));
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
}

const noSidewaysScroll = async (page: Page) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'page scrolls sideways').toBeLessThanOrEqual(1);
};

test.afterEach(async ({ page }) => { await clerk.signOut({ page }).catch(() => {}); });

test.describe('AdSO', () => {
  test.skip(!ADSO || !hasClerk, 'Set E2E_ADSO_EMAIL in .env.e2e to run the AdSO tests.');
  test.beforeEach(async ({ page }) => signIn(page, ADSO!));

  test('sees every section in the menu', async ({ page }) => {
    await showMenu(page);
    for (const name of ['Dashboard', 'Scholarships', 'Applications', 'Renewals', 'Scholars', 'Students', 'Duty hours', 'Statistics', 'FSE report', 'Messages', 'Announcements', 'Automation']) {
      await expect(navItem(page, name)).toBeVisible();
    }
  });

  test('every page opens without errors or sideways scrolling', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    for (const name of ['Scholarships', 'Applications', 'Renewals', 'Scholars', 'Students', 'Duty hours', 'Statistics', 'FSE report', 'Messages', 'Announcements', 'Automation', 'Dashboard']) {
      await openView(page, name);
      await expectOnPage(page, name);
      await noSidewaysScroll(page);
    }
    expect(errors, 'JavaScript errors while browsing').toEqual([]);
  });

  test('applications list shows the queue and opens an application', async ({ page }) => {
    await openView(page, 'Applications');
    // Phones get cards, wider screens a table; use whichever is showing.
    const maria = page.getByText('Maria Santos').filter({ visible: true }).first();
    await expect(maria).toBeVisible();
    await maria.click();
    await expect(page.getByText('ENT-2026-0001').first()).toBeVisible();
    await expect(page.getByText(/entrance scholarship/i).first()).toBeVisible();
  });

  test('the logo goes back to the dashboard', async ({ page }) => {
    await openView(page, 'Applications');
    await showMenu(page);
    await page.getByRole('button', { name: 'AniSkolar, go to Home' }).click();
    await expectOnPage(page, 'Dashboard');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/good (morning|afternoon|evening)/i);
  });
});

test.describe('AdSO approves other offices’ announcements', () => {
  test.skip(!ADSO || !hasClerk, 'Set E2E_ADSO_EMAIL in .env.e2e to run the AdSO tests.');

  test('a waiting announcement shows in the sidebar and can be approved', async ({ page }) => {
    const decisions: string[] = [];
    await signIn(page, ADSO!, { decisions });
    await showMenu(page);
    // The sidebar counts what's waiting.
    await expect(navItem(page, 'Announcements')).toHaveAccessibleName(/1 waiting for your approval/);
    await navItem(page, 'Announcements').click();

    const queue = page.getByRole('list', { name: 'Announcements waiting for approval' });
    await expect(queue.getByText('POLCA scholars’ orientation')).toBeVisible();
    await expect(queue.getByText('POLCA Office')).toBeVisible();
    await expect(queue.getByText(/emails students once approved/i)).toBeVisible();

    await queue.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText(/approved “polca scholars’ orientation”/i)).toBeVisible();
    expect(decisions).toEqual(['approve']);
  });

  test('returning needs a note', async ({ page }) => {
    const decisions: string[] = [];
    await signIn(page, ADSO!, { decisions });
    await openView(page, 'Announcements');
    const queue = page.getByRole('list', { name: 'Announcements waiting for approval' });
    await queue.getByRole('button', { name: 'Return' }).click();
    await queue.getByRole('button', { name: 'Return to office' }).click();
    await expect(queue.getByText('Tell the office what to change.')).toBeVisible();
    expect(decisions).toEqual([]);
    await queue.getByRole('textbox').fill('Add the venue.');
    await queue.getByRole('button', { name: 'Return to office' }).click();
    await expect(page.getByText(/returned “polca scholars’ orientation” to polca office/i)).toBeVisible();
    expect(decisions).toEqual(['return']);
  });
});

test.describe('Partner office', () => {
  test.skip(!OFFICE || !hasClerk, 'Set E2E_OFFICE_EMAIL in .env.e2e to run the office tests.');
  test.beforeEach(async ({ page }) => signIn(page, OFFICE!));

  test('submits announcements for the AdSO’s approval instead of publishing', async ({ page }) => {
    await openView(page, 'Announcements');
    // Only the AdSO reviews.
    await expect(page.getByRole('list', { name: 'Announcements waiting for approval' })).toHaveCount(0);
    await page.getByRole('button', { name: /new announcement/i }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New announcement' });
    await expect(dialog.getByRole('button', { name: 'Submit for approval' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^publish$/i })).toHaveCount(0);
  });

  test('sees only its own sections', async ({ page }) => {
    await showMenu(page);
    await expect(navItem(page, 'Applications')).toBeVisible();
    await expect(navItem(page, 'Scholarships')).toBeVisible();
    for (const hidden of ['Statistics', 'FSE report', 'Duty hours', 'Students', 'Messages', 'Automation']) {
      await expect(navItem(page, hidden)).toHaveCount(0);
    }
  });
});
