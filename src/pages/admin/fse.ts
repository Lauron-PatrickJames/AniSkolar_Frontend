import * as XLSX from 'xlsx';

// Full Scholarship Equivalent (FSE), per the DLSP FSE e-Instructional Manual:
//   FSE of a scholar  = total discount (incl. counted subsidies) / matriculation
//   Headcount %       = scholars / student population
//   FSE %             = total FSE / student population
// The rows come from the registrar's scholarship export: a header row, then
// for each scholarship a "CODE:" row followed by its scholars and a SUB
// TOTAL. Two layouts are read:
//   - the registrar's report (ID, NAME OF STUDENT, PROG, UNITS, fee columns,
//     TOTAL ASSESSMENT, TOTAL DISC): matriculation is TOTAL ASSESSMENT. Its
//     header is one column left of the data (rows start with a running
//     number), and it runs several pages, each ending in a GRAND TOTAL;
//   - the "Raw" sheet of the FSE template (Matriculation / Discount / Total
//     Discount, with fund source and subcategory beside each CODE:);
//   - the template's four category tabs (Internal Academic, Internal Non
//     Academic, Externally Funded, Special Program), which the office edits
//     by hand (allowances, scholars left out) and its FSE sheet is built
//     from. When a workbook has them they are read instead of Raw, and each
//     scholarship takes its tab's category.

export type FseCategory = 'internalAcademic' | 'internalNonAcademic' | 'external' | 'special';
export type FseTerm = '1st Semester' | '2nd Semester' | 'Midyear';
export const FSE_TERMS: FseTerm[] = ['1st Semester', '2nd Semester', 'Midyear'];

export const CATEGORY_LABELS: Record<FseCategory, string> = {
  internalAcademic: 'Internally funded — Academic',
  internalNonAcademic: 'Internally funded — Non-academic',
  external: 'Externally funded',
  special: 'Special programs'
};

export type FseSpecialFunding = 'internal' | 'external' | 'coFunded';
export const SPECIAL_FUNDING_LABELS: Record<FseSpecialFunding, string> = {
  internal: 'Internally funded',
  external: 'Externally funded',
  coFunded: 'Co-funded'
};

// Special programs are internally funded when the export says so; otherwise
// the office picks.
export function guessSpecialFunding(subcategory: string): FseSpecialFunding | null {
  const sub = subcategory.toLowerCase();
  if (/co[\s-]*fund/.test(sub)) return 'coFunded';
  if (sub.includes('extern')) return 'external';
  if (sub.includes('intern')) return 'internal';
  return null;
}

export interface FseScholar {
  studentId: string;
  program?: string;
  matriculation: number;
  discount: number;
  allowances: number;
  // The allowances by kind, when the upload has the office's columns (meal,
  // monthly, dorm, other financial assistance, book); the export writes
  // them back to the same columns.
  allowanceDetail?: Partial<Record<AllowanceKind, number>>;
  totalDiscount: number;
  fse: number;
}

export type AllowanceKind = 'meal' | 'monthly' | 'dorm' | 'other' | 'book';
// Which allowance a column header is ("Meal allowance (SPOON / ATHLETE)",
// "DORM ALLOWANCE for Student Athlete (5mos)", …); anything else is "other".
function allowanceKind(header: string): AllowanceKind {
  if (/meal/.test(header)) return 'meal';
  if (/monthly/.test(header)) return 'monthly';
  if (/dorm/.test(header)) return 'dorm';
  if (/book/.test(header)) return 'book';
  return 'other';
}

export interface FseScholarship {
  code: string;
  name: string;
  fundSource: string;
  subcategory: string;
  // null until classified (the export leaves some scholarships blank).
  category: FseCategory | null;
  // Who funds a special program; the FSE sheet splits its headcount by it.
  specialFunding?: FseSpecialFunding | null;
  scholars: FseScholar[];
  // Upload review only (not saved): which part of the export it came from
  // (the registrar's report runs several pages, each ending in a GRAND
  // TOTAL) and its discount rule, e.g. "TUITION: 50%/LAB: 0%/…".
  part?: number;
  // The tab it came from, when the workbook has category tabs.
  partLabel?: string;
  discountRule?: string;
}

export interface FseReport {
  id?: string;
  academicYear: string;
  term: FseTerm;
  population: number;
  // Lasallian SPOON recipients for the term (entered by the office).
  spoonRecipients?: number | null;
  asOf?: string | null;
  fileName?: string;
  scholarships: FseScholarship[];
  updatedAt?: string;
  updatedBy?: string;
}

// "Internally Funded" + "Non Academic Scholarship" → internalNonAcademic, etc.
export function classify(fundSource: string, subcategory: string): FseCategory | null {
  const fund = fundSource.toLowerCase();
  const sub = subcategory.toLowerCase();
  if (fund.includes('special')) return 'special';
  if (fund.includes('extern')) return 'external';
  if (fund.includes('intern')) return /non[\s-]*academic/.test(sub) ? 'internalNonAcademic' : 'internalAcademic';
  return null;
}

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export interface ParseResult {
  sheetName: string;
  scholarships: FseScholarship[];
  warnings: string[];
  // Read from the workbook's category tabs (each scholarship's category
  // comes from its tab).
  fromTabs?: boolean;
}

// What each scholarship was counted as in the reports saved before, newest
// first: the registrar's report names almost no categories, so the office's
// last choice is filled in.
export type CategoryMemory = Map<string, { category: FseCategory; specialFunding?: FseSpecialFunding | null }>;

export function rememberCategories(saved: { updatedAt?: string; scholarships?: Pick<FseScholarship, 'code' | 'category' | 'specialFunding'>[] }[]): CategoryMemory {
  const memory: CategoryMemory = new Map();
  [...saved]
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    .forEach(r => (r.scholarships ?? []).forEach(s => {
      if (s.category && !memory.has(s.code)) memory.set(s.code, { category: s.category, specialFunding: s.specialFunding });
    }));
  return memory;
}

// The export names a few scholarships' category outright, e.g. "ACADEMIC
// SCHOLARSHIP - 50% … (INTERNALLY, ACADEMIC)".
function classifyFromName(name: string): FseCategory | null {
  const m = /\((internally|externally)[^)]*\)/i.exec(name);
  if (!m) return null;
  return classify(m[1], /non[\s-]*academic/i.test(m[0]) ? 'non academic' : 'academic');
}

// A category tab's category, from its name ("Internal Non Academic",
// "Externally Funded", "Special Progarm" [sic], "2nd Sem Internal Academic").
export function tabCategory(sheetName: string): FseCategory | null {
  const n = sheetName.toLowerCase();
  if (/special/.test(n)) return 'special';
  if (/extern/.test(n)) return 'external';
  if (/intern/.test(n) && /non[\s-]*acad/.test(n)) return 'internalNonAcademic';
  if (/intern/.test(n) && /acad/.test(n)) return 'internalAcademic';
  return null;
}

// The semester a tab is for, when its name starts with one (this page's
// own export names them "1st Sem …" / "2nd Sem …" when a year has both).
function tabTerm(sheetName: string): FseTerm | null {
  const n = sheetName.trim().toLowerCase();
  if (/^(1st|first)\b/.test(n)) return '1st Semester';
  if (/^(2nd|second)\b/.test(n)) return '2nd Semester';
  if (/^mid/.test(n)) return 'Midyear';
  return null;
}

// The four category tabs, read together. Null when the workbook has none.
function parseCategoryTabs(wb: XLSX.WorkBook, term?: FseTerm): ParseResult | null {
  let tabs = wb.SheetNames
    .map(name => ({ name, category: tabCategory(name), term: tabTerm(name) }))
    .filter((t): t is { name: string; category: FseCategory; term: FseTerm | null } => !!t.category)
    .map(t => ({ ...t, parsed: parseRows(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[t.name], { header: 1, raw: true, defval: '' })) }))
    .filter(t => t.parsed);
  if (tabs.length === 0) return null;

  const warnings: string[] = [];
  // Tabs for more than one semester: read one semester's.
  const terms = [...new Set(tabs.map(t => t.term).filter((t): t is FseTerm => !!t))];
  if (terms.length > 1) {
    const use = term && terms.includes(term) ? term : terms[0];
    tabs = tabs.filter(t => t.term === use);
    warnings.push(`This workbook has tabs for ${terms.join(' and ')}. Read the ${use} tabs. To upload the other one, choose its term first, then pick the file again.`);
  }

  const byCode = new Map<string, FseScholarship>();
  const repeated = new Set<string>();
  tabs.forEach((t, i) => {
    for (const s of t.parsed!.scholarships) {
      const seen = byCode.get(s.code);
      if (seen) { repeated.add(s.code); seen.scholars.push(...s.scholars); continue; }
      byCode.set(s.code, { ...s, category: t.category, part: i + 1, partLabel: t.name.trim() });
    }
    t.parsed!.warnings.forEach(w => warnings.push(`${t.name.trim()}: ${w}`));
  });
  if (repeated.size) warnings.push(`Code${repeated.size > 1 ? 's' : ''} ${[...repeated].join(', ')} appear${repeated.size > 1 ? '' : 's'} in more than one tab; counted under the first.`);
  const missing = (Object.keys(CATEGORY_LABELS) as FseCategory[]).filter(c => !tabs.some(t => t.category === c));
  if (missing.length) warnings.push(`No tab for ${missing.map(c => CATEGORY_LABELS[c]).join(', ')}.`);
  return { sheetName: tabs.map(t => t.name.trim()).join(', '), scholarships: [...byCode.values()], warnings, fromTabs: true };
}

// Reads the workbook. Category tabs first (see above); otherwise a sheet
// named "Raw"; otherwise the first sheet with a Matriculation / Total
// Assessment header and "CODE:" rows. `term`: which semester's tabs to read
// when the workbook has tabs for two.
export function parseRegistrarWorkbook(data: ArrayBuffer, term?: FseTerm): ParseResult {
  const wb = XLSX.read(data, { type: 'array' });
  const fromTabs = parseCategoryTabs(wb, term);
  if (fromTabs) return fromTabs;
  const order = [...wb.SheetNames].sort((a, b) => Number(b.trim().toLowerCase() === 'raw') - Number(a.trim().toLowerCase() === 'raw'));
  for (const name of order) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: '' });
    const parsed = parseRows(rows);
    if (parsed) return { sheetName: name, ...parsed };
  }
  throw new Error("Couldn't find the scholarship list. Upload the registrar's scholarship export (a sheet with TOTAL ASSESSMENT or Matriculation and discount columns, and CODE: rows).");
}

const MATRIC_HEADER = /matriculation|total assessment/;

// A student ID: 8–10 digits, in one of the first columns.
const studentIdAt = (row: unknown[]) => row.findIndex((c, i) => i <= 4 && /^\d{8,10}$/.test(text(c)));

function parseRows(rows: unknown[][]): Omit<ParseResult, 'sheetName'> | null {
  const norm = (c: unknown) => text(c).toLowerCase().replace(/\s+/g, ' ');
  const headerIndex = rows.findIndex(r => r.some(c => MATRIC_HEADER.test(norm(c))));
  if (headerIndex < 0) return null;
  const header = rows[headerIndex].map(norm);
  const col = (re: RegExp) => header.findIndex(h => re.test(h));
  const matricCol = col(MATRIC_HEADER);
  const totalCol = col(/total disc/);           // "Total Discount" or "TOTAL DISC"
  const discountCol = header.findIndex(h => /discount/.test(h) && !/total/.test(h));
  const allowanceCols = header.map((h, i) => (/allowance|financial assistance/.test(h) ? i : -1)).filter(i => i >= 0);
  const idCol = header.findIndex(h => h === 'id' || /student (no|number|id)/.test(h));
  const progCol = header.findIndex(h => h === 'prog' || /^program/.test(h));
  if (discountCol < 0 && totalCol < 0) return null;

  // Keyed by code: the export can repeat a scholarship's block.
  const byCode = new Map<string, FseScholarship>();
  const seen = new Set<string>();
  const warnings: string[] = [];
  let current: FseScholarship | null = null;
  let part = 1;
  let orphans = 0;
  let noMatric = 0;
  let duplicates = 0;
  const overOne = new Set<string>();
  let overOneCount = 0;
  const seenIds = new Set<string>();
  let conflicting = 0;
  const conflictCodes = new Set<string>();
  // This block's rows, to check against its SUB TOTAL line.
  let blockAssessment = 0;
  let blockDiscount = 0;
  const offTotals: string[] = [];

  for (const row of rows.slice(headerIndex + 1)) {
    const first = norm(row[0]);
    // Each page of the registrar's report ends in a GRAND TOTAL.
    if (/^grand total/.test(first)) { part++; current = null; continue; }
    // The SUB TOTAL should repeat the block's total assessment and total
    // discount; if neither appears, rows are missing or extra.
    if (/^sub ?total/.test(first)) {
      if (current && (blockAssessment || blockDiscount)) {
        const amounts = row.map(num);
        const has = (v: number) => amounts.some(a => Math.abs(a - v) < 0.05);
        if (!has(blockAssessment) || !has(blockDiscount)) offTotals.push(current.code);
      }
      blockAssessment = 0;
      blockDiscount = 0;
      continue;
    }
    const codeAt = row.findIndex(c => text(c).toUpperCase() === 'CODE:');
    if (codeAt >= 0) {
      blockAssessment = 0;
      blockDiscount = 0;
      const code = text(row[codeAt + 1]);
      current = byCode.get(code) ?? null;
      if (!current) {
        const name = text(row[codeAt + 2]).replace(/\s+/g, ' ');
        // The template's Raw sheet has fund source and subcategory before CODE:.
        const fundSource = codeAt >= 2 ? text(row[0]) : '';
        const subcategory = codeAt >= 2 ? text(row[1]) : '';
        const rule = text(row[codeAt + 3]).replace(/\s+/g, ' ');
        current = {
          code,
          name,
          fundSource,
          subcategory,
          category: classify(fundSource, subcategory) ?? classifyFromName(name),
          scholars: [],
          part,
          discountRule: /tuition:/i.test(rule) ? rule : undefined
        };
        byCode.set(code, current);
      }
      continue;
    }
    // Scholar rows: a running number, the student ID, (name), program, …
    // Subtotal, page and repeated header rows have no student ID.
    const idAt = studentIdAt(row);
    if (idAt < 0) continue;
    const studentId = text(row[idAt]);
    // The report's header sits one column left of its data; line the
    // columns up by where the ID is.
    const shift = idCol >= 0 ? idAt - idCol : 0;
    const at = (c: number) => row[c + shift];
    const matriculation = num(at(matricCol));
    if (!current) { orphans++; continue; }
    if (matriculation <= 0) { noMatric++; continue; }
    const discount = discountCol >= 0 ? num(at(discountCol)) : 0;
    const allowanceDetail: Partial<Record<AllowanceKind, number>> = {};
    for (const i of allowanceCols) {
      const amount = num(at(i));
      if (amount > 0) { const kind = allowanceKind(header[i]); allowanceDetail[kind] = (allowanceDetail[kind] ?? 0) + amount; }
    }
    const allowances = Object.values(allowanceDetail).reduce((sum, v) => sum + v, 0);
    const totalDiscount = totalCol >= 0 && num(at(totalCol)) > 0 ? num(at(totalCol)) : discount + allowances;
    blockAssessment += matriculation;
    blockDiscount += totalDiscount;
    // The same student with the same amounts under the same code is a
    // repeated row in the export, not a second scholarship.
    const key = `${current.code}|${studentId}|${matriculation}|${totalDiscount}`;
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    // The same student under the same code with *different* amounts is
    // kept (it can't be told which is right) but flagged: it usually means
    // two versions of a list were pasted into the file.
    const idKey = `${current.code}|${studentId}`;
    if (seenIds.has(idKey)) { conflicting++; conflictCodes.add(current.code); }
    seenIds.add(idKey);
    if (totalDiscount > matriculation + 0.005) { overOne.add(current.code); overOneCount++; }
    current.scholars.push({
      studentId,
      program: text(progCol >= 0 ? at(progCol) : row[5]) || undefined,
      matriculation,
      discount,
      allowances,
      ...(allowances > 0 ? { allowanceDetail } : {}),
      totalDiscount,
      fse: totalDiscount / matriculation
    });
  }

  const scholarships = [...byCode.values()];
  if (scholarships.length === 0) return null;
  if (duplicates) warnings.push(`${duplicates} repeated row(s) (same student, scholarship and amounts) were removed.`);
  if (orphans) warnings.push(`${orphans} row(s) appeared before any CODE: row and were skipped.`);
  if (noMatric) warnings.push(`${noMatric} scholar row(s) had no matriculation amount and were skipped.`);
  if (conflicting) {
    warnings.push(`${conflicting} student(s) appear twice under the same code with different amounts (code${conflictCodes.size > 1 ? 's' : ''} ${[...conflictCodes].join(', ')}), so they're counted twice. The file may contain two versions of that list — keep only the registrar's.`);
  }
  if (offTotals.length) {
    warnings.push(`The rows under code${offTotals.length > 1 ? 's' : ''} ${offTotals.join(', ')} don’t add up to the SUB TOTAL in the file, so some scholars may be missing from the export. Ask the registrar for a complete export before saving.`);
  }
  if (overOneCount) {
    warnings.push(`${overOneCount} scholar(s) have a total discount above their total assessment, so their FSE is above 1.00 (codes ${[...overOne].join(', ')}). Check these with the registrar before saving.`);
  }
  const empty = scholarships.filter(s => s.scholars.length === 0).length;
  if (empty) warnings.push(`${empty} scholarship(s) have no scholars this term.`);
  return { scholarships: scholarships.filter(s => s.scholars.length > 0), warnings };
}

// --- Summary ---------------------------------------------------------------------

export interface FseLine { label: string; scholars: number; fse: number; headcountPct: number; fsePct: number; total?: boolean }

function line(label: string, scholarships: FseScholarship[], population: number, total = false): FseLine {
  const scholars = scholarships.reduce((n, s) => n + s.scholars.length, 0);
  const fse = scholarships.reduce((n, s) => n + s.scholars.reduce((m, r) => m + r.fse, 0), 0);
  return { label, scholars, fse, headcountPct: population ? scholars / population : 0, fsePct: population ? fse / population : 0, total };
}

// Rows like the template's FSE sheet: mainstream (internal academic +
// non-academic), externally funded, special programs, and institutional
// (all four).
export function summarize(report: Pick<FseReport, 'scholarships' | 'population'>): FseLine[] {
  const by = (c: FseCategory) => report.scholarships.filter(s => s.category === c);
  const p = report.population;
  return [
    line(CATEGORY_LABELS.internalAcademic, by('internalAcademic'), p),
    line(CATEGORY_LABELS.internalNonAcademic, by('internalNonAcademic'), p),
    line('Mainstream total', [...by('internalAcademic'), ...by('internalNonAcademic')], p, true),
    line(CATEGORY_LABELS.external, by('external'), p),
    line(CATEGORY_LABELS.special, by('special'), p),
    line('Institutional total', report.scholarships.filter(s => s.category), p, true)
  ];
}

export const formatPct = (x: number) => `${(x * 100).toFixed(2)}%`;
export const formatFse = (x: number) => x.toFixed(2);
