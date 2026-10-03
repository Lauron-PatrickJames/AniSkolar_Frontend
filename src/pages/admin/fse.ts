import * as XLSX from 'xlsx';

// Full Scholarship Equivalent (FSE), per the DLSP FSE e-Instructional Manual:
//   FSE of a scholar  = total discount (incl. counted subsidies) / matriculation
//   Headcount %       = scholars / student population
//   FSE %             = total FSE / student population
// The rows come from the registrar's scholarship export (the "Raw" sheet of
// the FSE template): a header row with Matriculation / Discount / Total
// Discount, then for each scholarship a "CODE:" row followed by its scholars.

export type FseCategory = 'internalAcademic' | 'internalNonAcademic' | 'external' | 'special';
export type FseTerm = '1st Semester' | '2nd Semester' | 'Midyear';
export const FSE_TERMS: FseTerm[] = ['1st Semester', '2nd Semester', 'Midyear'];

export const CATEGORY_LABELS: Record<FseCategory, string> = {
  internalAcademic: 'Internally funded — Academic',
  internalNonAcademic: 'Internally funded — Non-academic',
  external: 'Externally funded',
  special: 'Special programs'
};

export interface FseScholar {
  studentId: string;
  program?: string;
  matriculation: number;
  discount: number;
  allowances: number;
  totalDiscount: number;
  fse: number;
}

export interface FseScholarship {
  code: string;
  name: string;
  fundSource: string;
  subcategory: string;
  // null until classified (the export leaves some scholarships blank).
  category: FseCategory | null;
  scholars: FseScholar[];
}

export interface FseReport {
  id?: string;
  academicYear: string;
  term: FseTerm;
  population: number;
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
}

// Reads the registrar export. Prefers a sheet named "Raw"; otherwise the
// first sheet with a "Matriculation" header and "CODE:" rows.
export function parseRegistrarWorkbook(data: ArrayBuffer): ParseResult {
  const wb = XLSX.read(data, { type: 'array' });
  const order = [...wb.SheetNames].sort((a, b) => Number(b.trim().toLowerCase() === 'raw') - Number(a.trim().toLowerCase() === 'raw'));
  for (const name of order) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: '' });
    const parsed = parseRows(rows);
    if (parsed) return { sheetName: name, ...parsed };
  }
  throw new Error("Couldn't find the scholarship list. Upload the registrar's FSE export (a sheet with Matriculation and Discount columns and CODE: rows).");
}

function parseRows(rows: unknown[][]): Omit<ParseResult, 'sheetName'> | null {
  const headerIndex = rows.findIndex(r => r.some(c => /matriculation/i.test(text(c))));
  if (headerIndex < 0) return null;
  const header = rows[headerIndex].map(c => text(c).toLowerCase().replace(/\s+/g, ' '));
  const col = (re: RegExp) => header.findIndex(h => re.test(h));
  const matricCol = col(/matriculation/);
  const totalCol = col(/total discount/);
  const discountCol = header.findIndex(h => /discount/.test(h) && !/total/.test(h));
  const allowanceCols = header.map((h, i) => (/allowance|financial assistance/.test(h) ? i : -1)).filter(i => i >= 0);
  if (discountCol < 0 && totalCol < 0) return null;

  // Keyed by code: the export can repeat a scholarship's block.
  const byCode = new Map<string, FseScholarship>();
  const seen = new Set<string>();
  const warnings: string[] = [];
  let current: FseScholarship | null = null;
  let orphans = 0;
  let noMatric = 0;
  let duplicates = 0;

  for (const row of rows.slice(headerIndex + 1)) {
    const codeAt = row.findIndex(c => text(c).toUpperCase() === 'CODE:');
    if (codeAt >= 0) {
      const code = text(row[codeAt + 1]);
      current = byCode.get(code) ?? null;
      if (!current) {
        current = {
          code,
          name: text(row[codeAt + 2]).replace(/\s+/g, ' '),
          fundSource: text(row[0]),
          subcategory: text(row[1]),
          category: classify(text(row[0]), text(row[1])),
          scholars: []
        };
        byCode.set(code, current);
      }
      continue;
    }
    // Scholar rows: a running number, the student ID, (name), program.
    const studentId = text(row[3]);
    if (!/^\d{5,}$/.test(studentId)) continue;   // subtotal / blank rows
    const matriculation = num(row[matricCol]);
    if (!current) { orphans++; continue; }
    if (matriculation <= 0) { noMatric++; continue; }
    const discount = discountCol >= 0 ? num(row[discountCol]) : 0;
    const allowances = allowanceCols.reduce((sum, i) => sum + num(row[i]), 0);
    const totalDiscount = totalCol >= 0 && num(row[totalCol]) > 0 ? num(row[totalCol]) : discount + allowances;
    // The same student with the same amounts under the same code is a
    // repeated row in the export, not a second scholarship.
    const key = `${current.code}|${studentId}|${matriculation}|${totalDiscount}`;
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    current.scholars.push({
      studentId,
      program: text(row[5]) || undefined,
      matriculation,
      discount,
      allowances,
      totalDiscount,
      fse: totalDiscount / matriculation
    });
  }

  const scholarships = [...byCode.values()];
  if (scholarships.length === 0) return null;
  if (duplicates) warnings.push(`${duplicates} repeated row(s) (same student, scholarship and amounts) were removed.`);
  if (orphans) warnings.push(`${orphans} row(s) appeared before any CODE: row and were skipped.`);
  if (noMatric) warnings.push(`${noMatric} scholar row(s) had no matriculation amount and were skipped.`);
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

// --- Excel export ----------------------------------------------------------------

export function exportReport(report: FseReport) {
  const summary = summarize(report);
  const wb = XLSX.utils.book_new();
  const head = [
    ['Full Scholarship Equivalent'],
    [`${report.academicYear} · ${report.term}`],
    ['Student population', report.population],
    [],
    ['Category', 'Scholars', 'Headcount %', 'FSE count', 'FSE %']
  ];
  const rows = summary.map(l => [l.label, l.scholars, l.headcountPct, Number(l.fse.toFixed(4)), l.fsePct]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([...head, ...rows]), 'FSE');
  const detail = [['Code', 'Scholarship', 'Category', 'Student ID', 'Program', 'Matriculation', 'Discount', 'Allowances', 'Total discount', 'FSE']];
  report.scholarships.forEach(s => s.scholars.forEach(r => detail.push([
    s.code, s.name, s.category ? CATEGORY_LABELS[s.category] : '', r.studentId, r.program ?? '',
    r.matriculation, r.discount, r.allowances, r.totalDiscount, Number(r.fse.toFixed(6))
  ] as never)));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detail), 'Scholars');
  const slug = `${report.academicYear.replace(/[^0-9–]/g, '').replace('–', '-')}-${report.term.replace(/\s+/g, '-')}`;
  XLSX.writeFile(wb, `FSE-${slug}.xlsx`);
}
