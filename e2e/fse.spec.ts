import { clerk } from '@clerk/testing/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import * as XLSX from 'xlsx';
import { API } from './mockApi';
import { mockAdminApi } from './mockAdminApi';

// The FSE report page, signed in as the AdSO with a faked API: one saved
// report, and a registrar-style file of fictional scholars to generate a
// new one from. Nothing reaches the real backend.

const ADSO = process.env.E2E_ADSO_EMAIL;
const hasClerk = !!process.env.CLERK_SECRET_KEY;
const SHOTS = process.env.FSE_SHOTS; // folder for screenshots, when set

// code, name, scholars as [assessment, discount]
const BLOCKS: [string, string, [number, number][]][] = [
  ['1002', 'ACADEMIC SCHOLARSHIP - 100% TUITION FEE DISCOUNT', [[50000, 50000], [48000, 48000], [52000, 52000]]],
  ['1060', 'VARSITY- 100% TLMOF', [[45000, 45000], [47000, 47000], [46000, 46000], [44000, 44000]]],
  ['1744', 'CHED TES - 13500', [[40000, 13500], [42000, 13500]]],
  ['1374', 'DLSU-D NIGHT COLLEGE SCHOLARSHIP', [[30000, 27000], [31000, 27900], [29000, 26100]]],
  ['9999', 'NEW DONOR GRANT', [[50000, 25000]]],
];

// The registrar's layout: a header, then per scholarship a CODE: row, its
// scholars and a SUB TOTAL, and a GRAND TOTAL at the end of the page.
function registrarFile(): Buffer {
  const rows: unknown[][] = [['', 'ID', 'NAME OF STUDENT', 'PROG', 'UNITS', 'TOTAL ASSESSMENT', 'TOTAL DISC']];
  let n = 100;
  for (const [code, name, scholars] of BLOCKS) {
    rows.push(['CODE:', code, name, 'TUITION: 100%/LAB: 0%/MISC: 0%']);
    for (const [assessment, discount] of scholars) rows.push([n - 99, `2023991${n++}`, 'Student, Sample', 'BSIT', 21, assessment, discount]);
    // CHED's SUB TOTAL counts 2 more scholars than are listed (rows lost from the export).
    const missing = code === '1744' ? [80000, 27000] : [0, 0];
    rows.push(['SUB TOTAL', '', '', '', '', scholars.reduce((s, r) => s + r[0], 0) + missing[0], scholars.reduce((s, r) => s + r[1], 0) + missing[1]]);
  }
  rows.push(['GRAND TOTAL']);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

const CATEGORY: Record<string, string> = { '1002': 'internalAcademic', '1060': 'internalNonAcademic', '1744': 'external', '1374': 'special' };
const SAVED = {
  id: 'r1', academicYear: 'AY 2026–2027', term: '1st Semester', population: 8541, asOf: '2026-09-25',
  createdAt: '2026-11-10T02:00:00.000Z', updatedBy: 'adso@dlsud.edu.ph', fileName: 'scholarship report.xlsx',
  scholarships: BLOCKS.filter(([code]) => CATEGORY[code]).map(([code, name, scholars]) => ({
    code, name, fundSource: '', subcategory: '', category: CATEGORY[code],
    specialFunding: code === '1374' ? 'internal' : null,
    // The first varsity scholar has a ₱5,000 meal allowance entered.
    scholars: scholars.map(([matriculation, discount], i) => {
      const meal = code === '1060' && i === 0 ? 5000 : 0;
      const totalDiscount = discount + meal;
      return {
        studentId: `S${code}${i}`, matriculation, discount, totalDiscount, allowances: meal, fse: totalDiscount / matriculation,
        ...(meal ? { entered: { meal }, allowanceDetail: { meal } } : {}),
      };
    }),
  })),
};

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

// The same year's 2nd semester, generated earlier.
const SECOND = { ...SAVED, id: 'r3', term: '2nd Semester', createdAt: '2026-11-01T02:00:00.000Z' };

async function signIn(page: Page, posted: unknown[], fetched: string[] = []) {
  await mockAdminApi(page);
  // Registered after the general mock, so it answers the FSE requests.
  await page.route(`${API}/api/fse**`, route => {
    const req = route.request();
    if (req.method() === 'PUT') {
      const body = req.postDataJSON();
      posted.push({ ...body, edited: true });
      return json(route, { report: { ...SAVED, ...body, scholarships: SAVED.scholarships, updatedAt: new Date().toISOString() } });
    }
    if (req.method() === 'POST') {
      const body = req.postDataJSON();
      posted.push(body);
      return json(route, { report: { ...body, id: 'r2', createdAt: new Date().toISOString() } }, 201);
    }
    const { pathname } = new URL(req.url());
    const summary = ({ scholarships, ...r }: typeof SAVED) => ({ ...r, scholarships: scholarships.map(({ scholars: _s, ...s }) => s) });
    if (pathname === '/api/fse') return json(route, { reports: [summary(SAVED), summary(SECOND)] });
    fetched.push(pathname);
    return json(route, { report: pathname.endsWith('/r3') ? SECOND : SAVED });
  });
  await page.goto('/');
  await clerk.signIn({ page, emailAddress: ADSO! });
  await expect(page.locator('#admin-sidebar')).toBeAttached({ timeout: 45_000 });
  const open = page.getByRole('button', { name: 'Open navigation' });
  if (await open.isVisible()) await open.click();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /^FSE report/ }).click();
}

test.afterEach(async ({ page }) => { await clerk.signOut({ page }).catch(() => {}); });

test.describe('FSE report', () => {
  test.skip(!ADSO || !hasClerk, 'Set E2E_ADSO_EMAIL in .env.e2e to run the AdSO tests.');

  test('shows the saved report and generates a new one from the registrar’s file', async ({ page }) => {
    const posted: { population: number; scholarships: { code: string; category: string; specialFunding: string | null; allowances?: Record<string, number>; adjustment?: unknown }[] }[] = [];
    await signIn(page, posted);

    // The saved report: headline numbers, the category breakdown, the table.
    await expect(page.getByText('Institutional FSE', { exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Externally funded/ })).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/fse-1-report.png`, fullPage: true });

    // Step 1: term, file, population.
    await page.getByRole('button', { name: 'Generate report' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(dialog.getByText('Upload the registrar’s report.')).toBeVisible();
    await dialog.locator('input[type="file"]').setInputFiles({ name: 'scholarship report.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: registrarFile() });
    await expect(dialog.getByText('5 scholarships · 13 scholars')).toBeVisible();
    await dialog.getByPlaceholder('e.g. 8541').fill('8541');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/fse-2-step1.png` });
    await dialog.getByRole('button', { name: 'Next', exact: true }).click();

    // Step 2, Categories: the known codes are categorized; the new one needs one.
    await expect(dialog.getByRole('tab', { name: /Needs a category/ })).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.getByText('NEW DONOR GRANT')).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/fse-3-categories.png` });
    await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(dialog.getByText(/Choose a category for 1 scholarship/)).toBeVisible();
    await dialog.getByRole('combobox', { name: 'Category for 9999' }).selectOption('external');
    await dialog.getByRole('button', { name: 'Next', exact: true }).click();

    // Step 3, Allowances. CHED is short of its SUB TOTAL: add the 2 missing
    // scholars (filled in from it).
    await expect(dialog.getByText('~2 missing from file')).toBeVisible();
    await dialog.getByRole('button', { name: 'Add missing' }).first().click();
    await expect(dialog.getByRole('spinbutton', { name: 'Scholars to add to 1744' })).toHaveValue('2');
    await expect(dialog.getByRole('spinbutton', { name: 'Total assessment of the added scholars for 1744' })).toHaveValue('80000');
    await dialog.getByRole('textbox', { name: 'Source of the added scholars for 1744' }).fill('CHED list from the AdSO');
    await expect(dialog.getByRole('button', { name: '+2 added' })).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/fse-5-adjust.png` });

    // DOST for two students the file lists under the Academic Scholarship.
    await dialog.getByRole('button', { name: 'Add a grant' }).click();
    await dialog.getByRole('textbox', { name: 'Name of grant 1' }).fill('DOST');
    await dialog.getByRole('spinbutton', { name: 'Amount of grant 1' }).fill('65000');
    await dialog.getByRole('textbox', { name: 'Student numbers for grant 1' }).fill('2023991100\n2023991101\n2023990000');
    await expect(dialog.getByText('2 of 3 found in the file · 1 not found')).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/fse-6-grants.png` });

    // Allowances per scholar: a meal allowance for one varsity scholar, and
    // the same book allowance for all four.
    const varsity = dialog.locator('li', { hasText: 'VARSITY- 100% TLMOF' });
    await dialog.getByRole('button', { name: 'Allowances for 1060' }).click();
    await dialog.getByRole('spinbutton', { name: 'Meal for 2023991103' }).fill('5000');
    await dialog.getByRole('spinbutton', { name: 'Book for every scholar of 1060' }).fill('1000');
    await expect(varsity.getByText('4 of 4 with allowances')).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/fse-4-allowances.png` });

    // Step 4, Review: the summary and what was entered.
    await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(dialog.getByText('Scholars with allowances')).toBeVisible();
    await expect(dialog.getByText('DOST × 2')).toBeVisible();
    await expect(dialog.getByText('1744 +2')).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/fse-7-review.png` });
    await dialog.getByRole('button', { name: 'Generate report' }).click();
    await expect(page.getByText('Generated the FSE report for AY 2026–2027 · 1st Semester.')).toBeVisible();
    expect(posted).toHaveLength(1);
    const sent = Object.fromEntries(posted[0].scholarships.map(s => [s.code, s]));
    expect(posted[0].population).toBe(8541);
    expect(sent['1002'].category).toBe('internalAcademic');
    expect(sent['1374']).toMatchObject({ category: 'special', specialFunding: 'internal' });
    expect(sent['9999'].category).toBe('external');
    const varsityRows = (sent['1060'] as unknown as { scholars: { studentId: string; entered?: object }[] }).scholars;
    expect(varsityRows.find(r => r.studentId === '2023991103')?.entered).toEqual({ meal: 5000, book: 1000 });
    expect(varsityRows.find(r => r.studentId === '2023991104')?.entered).toEqual({ book: 1000 });
    expect(sent['1744'].adjustment).toEqual({ scholars: 2, assessment: 80000, discount: 27000, note: 'CHED list from the AdSO' });
    expect(sent['1002'].adjustment).toBeUndefined();
    expect((posted[0] as unknown as { grants: unknown }).grants).toEqual([{ label: 'DOST', amount: 65000, studentIds: ['2023991100', '2023991101', '2023990000'] }]);
  });

  test('edits a saved report without uploading the file again', async ({ page }) => {
    const posted: { edited?: boolean; population: number; scholarships: { code: string; category: string; specialFunding: string | null; allowances?: Record<string, number> | null }[] }[] = [];
    await signIn(page, posted);
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Edit report' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('To use another file, generate a new report.')).toBeVisible();
    await expect(dialog.getByPlaceholder('e.g. 8541')).toHaveValue('8541');
    await dialog.getByPlaceholder('e.g. 8541').fill('8872');
    await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    await dialog.getByRole('combobox', { name: 'Category for 1744' }).selectOption('special');
    await dialog.getByRole('combobox', { name: 'Funding for 1744' }).selectOption('coFunded');
    await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    // The saved allowance is the one scholar's, shown once (not added twice).
    await expect(dialog.getByText('1 of 4 with allowances')).toBeVisible();
    await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Saved your changes to the report.')).toBeVisible();
    expect(posted).toHaveLength(1);
    expect(posted[0].edited).toBe(true);
    expect(posted[0].population).toBe(8872);
    const sent = Object.fromEntries(posted[0].scholarships.map(s => [s.code, s]));
    expect(sent['1744']).toMatchObject({ category: 'special', specialFunding: 'coFunded' });
    expect((sent['1060'] as unknown as { entered: object }).entered).toEqual({ S10600: { meal: 5000 } });
    // Only the AdSO's choices are sent, not the scholar rows.
    expect(sent['1002']).not.toHaveProperty('scholars');
  });

  test('exports the whole academic year: both semesters', async ({ page }) => {
    const fetched: string[] = [];
    await signIn(page, [], fetched);
    await expect(page.getByText('Institutional FSE', { exact: true })).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export year to Excel' }).click();
    expect((await download).suggestedFilename()).toMatch(/.xlsx$/);
    // The other semester's report was loaded for the workbook.
    expect(fetched).toContain('/api/fse/r3');
  });
});
