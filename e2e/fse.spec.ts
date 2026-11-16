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
    rows.push(['SUB TOTAL', '', '', '', '', scholars.reduce((s, r) => s + r[0], 0), scholars.reduce((s, r) => s + r[1], 0)]);
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
    allowances: code === '1060' ? { meal: 5000 } : undefined,
    scholars: scholars.map(([matriculation, discount], i) => {
      const totalDiscount = discount + (code === '1060' ? 5000 : 0);
      return { studentId: `S${code}${i}`, matriculation, discount, totalDiscount, allowances: totalDiscount - discount, fse: totalDiscount / matriculation };
    }),
  })),
};

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function signIn(page: Page, posted: unknown[]) {
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
    if (pathname === '/api/fse') return json(route, { reports: [{ ...SAVED, scholarships: SAVED.scholarships.map(({ scholars: _s, ...s }) => s) }] });
    return json(route, { report: SAVED });
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
    const posted: { population: number; scholarships: { code: string; category: string; specialFunding: string | null; allowances?: Record<string, number> }[] }[] = [];
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

    // Step 2: the known codes are categorized; the new one needs a category.
    await expect(dialog.getByRole('tab', { name: /Needs attention/ })).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.getByText('NEW DONOR GRANT')).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/fse-3-attention.png` });
    await dialog.getByRole('combobox', { name: 'Category for 9999' }).selectOption('external');

    // Allowances for the varsity scholars (remembered from the last report).
    await dialog.getByRole('tab', { name: /^All/ }).click();
    await expect(dialog.getByRole('button', { name: '₱5,000 / scholar' })).toBeVisible();
    await dialog.getByRole('button', { name: '₱5,000 / scholar' }).click();
    await dialog.getByRole('spinbutton', { name: /Book for 1060/ }).fill('1000');
    await expect(dialog.getByRole('button', { name: '₱6,000 / scholar' })).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/fse-4-review.png` });

    await dialog.getByRole('button', { name: 'Generate report' }).click();
    await expect(page.getByText('Generated the FSE report for AY 2026–2027 · 1st Semester.')).toBeVisible();
    expect(posted).toHaveLength(1);
    const sent = Object.fromEntries(posted[0].scholarships.map(s => [s.code, s]));
    expect(posted[0].population).toBe(8541);
    expect(sent['1002'].category).toBe('internalAcademic');
    expect(sent['1374']).toMatchObject({ category: 'special', specialFunding: 'internal' });
    expect(sent['9999'].category).toBe('external');
    expect(sent['1060'].allowances).toEqual({ meal: 5000, book: 1000 });
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
    // The saved allowances show once, not added twice.
    await expect(dialog.getByRole('button', { name: '₱5,000 / scholar' })).toBeVisible();
    await dialog.getByRole('combobox', { name: 'Category for 1744' }).selectOption('special');
    await dialog.getByRole('combobox', { name: 'Funding for 1744' }).selectOption('coFunded');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Saved your changes to the report.')).toBeVisible();
    expect(posted).toHaveLength(1);
    expect(posted[0].edited).toBe(true);
    expect(posted[0].population).toBe(8872);
    const sent = Object.fromEntries(posted[0].scholarships.map(s => [s.code, s]));
    expect(sent['1744']).toMatchObject({ category: 'special', specialFunding: 'coFunded' });
    expect(sent['1060'].allowances).toEqual({ meal: 5000 });
    // Only the AdSO's choices are sent, not the scholar rows.
    expect(sent['1002']).not.toHaveProperty('scholars');
  });
});
