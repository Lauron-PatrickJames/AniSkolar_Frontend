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
  // Who funds a special program; the FSE sheet splits its headcount by it.
  specialFunding?: FseSpecialFunding | null;
  scholars: FseScholar[];
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
//
// One "FSE" sheet per academic year, laid out like the AdSO's FSE workbook:
// a 1st/2nd semester table (rows 12–13), then a block per semester with
// mainstream / external / special / institutional FSE, the head count
// computation and the Lasallian SPOON recipients. Cells are formulas over
// rows 12–13, with cached values so viewers that don't recalculate still
// show numbers.

interface Totals { count: number; fse: number }

function semesterFigures(report: FseReport) {
  const of = (pick: (s: FseScholarship) => boolean): Totals => {
    const list = report.scholarships.filter(pick);
    return {
      count: list.reduce((n, s) => n + s.scholars.length, 0),
      fse: list.reduce((n, s) => n + s.scholars.reduce((m, r) => m + r.fse, 0), 0)
    };
  };
  const special = (f: FseSpecialFunding) => of(s => s.category === 'special' && (s.specialFunding ?? 'internal') === f).count;
  return {
    pop: report.population,
    ia: of(s => s.category === 'internalAcademic'),
    ina: of(s => s.category === 'internalNonAcademic'),
    ext: of(s => s.category === 'external'),
    sp: of(s => s.category === 'special'),
    spInternal: special('internal'),
    spExternal: special('external'),
    spCoFunded: special('coFunded'),
    spoon: report.spoonRecipients ?? null
  };
}

const COUNT = '#,##0';
const FSE_FMT = '0.00';
const PCT = '0.00%';

export function exportAcademicYear(academicYear: string, reports: FseReport[]) {
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  const put = (addr: string, v: string | number | null | undefined, z?: string) => {
    if (v === null || v === undefined || v === '') return;
    ws[addr] = typeof v === 'number' ? { t: 'n', v, ...(z ? { z } : {}) } : { t: 's', v };
  };
  const calc = (addr: string, f: string, v: number, z: string) => {
    ws[addr] = { t: 'n', f, v: Number.isFinite(v) ? v : 0, z };
  };
  const merge = (ref: string) => merges.push(XLSX.utils.decode_range(ref));
  const ay = academicYear.replace(/^AY\s*/, '').replace('–', '-');

  const first = reports.find(r => r.term === '1st Semester');
  const second = reports.find(r => r.term === '2nd Semester');
  const latest = reports.map(r => r.asOf).filter((d): d is string => !!d).sort().pop();
  const asOfText = latest
    ? new Date(latest).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
    : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });

  // Title and table headers (rows 2–11).
  put('B2', 'COLLEGE');
  put('C5', `Full Scholarship Equivalent (as of ${asOfText})`);
  put('C6', `For AY ${ay}`); merge('C6:G6');
  put('C8', 'Mainstream / Internally Funded'); merge('C8:L8');
  put('C9', 'Academic'); merge('C9:G9');
  put('H9', 'Non-Academic'); merge('H9:L9');
  put('M9', 'Externally funded Scholarship'); merge('M9:P9');
  put('Q9', 'Special Programs'); merge('Q9:W9');
  put('X9', 'Student Total Population'); merge('X9:X10');
  for (const [c, pctTo, fseTo] of [['C', 'D', 'F'], ['H', 'I', 'K'], ['M', 'N', 'P'], ['Q', 'R', 'T']] as const) {
    const fseCol = String.fromCharCode(c.charCodeAt(0) + 2);
    put(`${c}10`, 'Headcount %'); merge(`${c}10:${pctTo}10`);
    put(`${fseCol}10`, 'FSE %'); merge(`${fseCol}10:${fseTo}10`);
    put(`${c}11`, '# of Scholars');
    put(`${pctTo}11`, '%');
    put(`${fseCol}11`, c === 'Q' ? 'FSE Count' : 'FSE');
    put(`${fseTo}11`, 'FSE %');
  }
  put('G10', 'Total Pop'); merge('G10:G11');
  put('L10', 'Total Pop'); merge('L10:L11');
  put('U10', 'Internally Funded');
  put('V10', 'Externally Funded');
  put('W10', 'Co-Funded');

  // Rows 12–13: one per semester.
  const sems = [
    { row: 12, label: '1st Semester', block: 17, title: 'FIRST SEM', spoonTitle: `First Semester, SY ${ay}`, report: first },
    { row: 13, label: '2nd Semester', block: 24, title: 'SECOND SEM', spoonTitle: `Second Semester, SY ${ay}`, report: second }
  ];
  for (const s of sems) {
    put(`B${s.row}`, s.label);
    if (!s.report) continue;
    const d = semesterFigures(s.report);
    const r = s.row;
    put(`C${r}`, d.ia.count, COUNT); calc(`D${r}`, `C${r}/G${r}`, d.ia.count / d.pop, PCT);
    put(`E${r}`, d.ia.fse, FSE_FMT); calc(`F${r}`, `E${r}/G${r}`, d.ia.fse / d.pop, PCT);
    put(`G${r}`, d.pop, COUNT);
    put(`H${r}`, d.ina.count, COUNT); calc(`I${r}`, `H${r}/L${r}`, d.ina.count / d.pop, PCT);
    put(`J${r}`, d.ina.fse, FSE_FMT); calc(`K${r}`, `J${r}/L${r}`, d.ina.fse / d.pop, PCT);
    put(`L${r}`, d.pop, COUNT);
    put(`M${r}`, d.ext.count, COUNT); calc(`N${r}`, `M${r}/X${r}`, d.ext.count / d.pop, PCT);
    put(`O${r}`, d.ext.fse, FSE_FMT); calc(`P${r}`, `O${r}/X${r}`, d.ext.fse / d.pop, PCT);
    calc(`Q${r}`, `U${r}+V${r}+W${r}`, d.sp.count, COUNT); calc(`R${r}`, `Q${r}/X${r}`, d.sp.count / d.pop, PCT);
    put(`S${r}`, d.sp.fse, FSE_FMT); calc(`T${r}`, `S${r}/X${r}`, d.sp.fse / d.pop, PCT);
    put(`U${r}`, d.spInternal, COUNT);
    put(`V${r}`, d.spExternal, COUNT);
    put(`W${r}`, d.spCoFunded, COUNT);
    put(`X${r}`, d.pop, COUNT);
  }

  // Semester blocks (rows 17–21 and 24–28).
  for (const s of sems) {
    const t = s.block;
    const r = s.row;
    const d = s.report ? semesterFigures(s.report) : null;
    const pop = d?.pop || 1;
    put(`B${t}`, s.title);
    put(`C${t}`, 'FSE Mainstream'); merge(`C${t}:E${t}`);
    put(`C${t + 1}`, 'Academic'); put(`D${t + 1}`, 'Non-Academic'); put(`E${t + 1}`, 'Total');
    put(`F${t}`, 'Externally Funded Scholarship'); merge(`F${t}:F${t + 1}`);
    put(`G${t}`, 'FSE Special Programs'); merge(`G${t}:G${t + 1}`);
    put(`H${t}`, 'FSE Institutional'); merge(`H${t}:H${t + 1}`);
    put(`B${t + 2}`, 'Student Population/FTE');
    put(`B${t + 3}`, 'FSE Count');
    put(`B${t + 4}`, 'FSE %');
    const lines: [number, string, string, string, string, number, number, number, number, string][] = [
      [t + 2, `C${r}`, `H${r}`, `M${r}`, `Q${r}`, d?.ia.count ?? 0, d?.ina.count ?? 0, d?.ext.count ?? 0, d?.sp.count ?? 0, COUNT],
      [t + 3, `E${r}`, `J${r}`, `O${r}`, `S${r}`, d?.ia.fse ?? 0, d?.ina.fse ?? 0, d?.ext.fse ?? 0, d?.sp.fse ?? 0, FSE_FMT],
      [t + 4, `F${r}`, `K${r}`, `P${r}`, `T${r}`, (d?.ia.fse ?? 0) / pop, (d?.ina.fse ?? 0) / pop, (d?.ext.fse ?? 0) / pop, (d?.sp.fse ?? 0) / pop, PCT]
    ];
    for (const [row, a, na, ext, sp, va, vna, vext, vsp, z] of lines) {
      calc(`C${row}`, a, va, z);
      calc(`D${row}`, na, vna, z);
      calc(`E${row}`, `C${row}+D${row}`, va + vna, z);
      calc(`F${row}`, ext, vext, z);
      calc(`G${row}`, sp, vsp, z);
      // Institutional = mainstream + external + special programs.
      calc(`H${row}`, `E${row}+F${row}+G${row}`, va + vna + vext + vsp, z);
    }

    // Head count computation.
    put(`K${t}`, 'Head Count Computation'); merge(`K${t}:P${t}`);
    const internal = (d?.ia.count ?? 0) + (d?.ina.count ?? 0) + (d?.spInternal ?? 0);
    put(`K${t + 1}`, 'Internally Funded Scholarship'); merge(`K${t + 1}:M${t + 1}`);
    calc(`N${t + 1}`, `C${r}+H${r}+U${r}`, internal, COUNT); merge(`N${t + 1}:P${t + 1}`);
    put(`K${t + 2}`, 'Externally Funded Scholarship'); merge(`K${t + 2}:M${t + 2}`);
    calc(`N${t + 2}`, `M${r}`, d?.ext.count ?? 0, COUNT); merge(`N${t + 2}:P${t + 2}`);
    put(`K${t + 3}`, 'Special Program'); merge(`K${t + 3}:M${t + 3}`);
    calc(`N${t + 3}`, `Q${r}`, d?.sp.count ?? 0, COUNT); merge(`N${t + 3}:P${t + 3}`);
    put(`K${t + 4}`, 'Total'); merge(`K${t + 4}:O${t + 4}`);
    calc(`P${t + 4}`, `N${t + 1}+N${t + 2}+N${t + 3}`, internal + (d?.ext.count ?? 0) + (d?.sp.count ?? 0), COUNT);

    // Lasallian SPOON recipients.
    put(`R${t}`, 'Lasallian SPOON Recipients'); merge(`R${t}:X${t}`);
    put(`R${t + 1}`, s.spoonTitle);
    put(`R${t + 2}`, 'Total'); merge(`R${t + 2}:V${t + 2}`);
    put(`X${t + 2}`, d?.spoon ?? null, COUNT);
  }

  ws['!ref'] = 'A1:X28';
  ws['!merges'] = merges;
  ws['!cols'] = [
    { wch: 2 }, { wch: 22 }, { wch: 13 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 13 },
    ...Array.from({ length: 16 }, () => ({ wch: 11 }))
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'FSE');
  // Scholar-level detail behind the numbers, one sheet per semester.
  for (const s of sems) {
    if (!s.report) continue;
    const detail: (string | number)[][] = [['Code', 'Scholarship', 'Category', 'Special funding', 'Student ID', 'Program', 'Matriculation', 'Discount', 'Allowances', 'Total discount', 'FSE']];
    s.report.scholarships.forEach(sc => sc.scholars.forEach(r => detail.push([
      sc.code, sc.name, sc.category ? CATEGORY_LABELS[sc.category] : '',
      sc.category === 'special' ? SPECIAL_FUNDING_LABELS[sc.specialFunding ?? 'internal'] : '',
      r.studentId, r.program ?? '', r.matriculation, r.discount, r.allowances, r.totalDiscount, Number(r.fse.toFixed(6))
    ])));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detail), `${s.label} scholars`);
  }
  XLSX.writeFile(wb, `FSE-AY-${ay}.xlsx`);
}
