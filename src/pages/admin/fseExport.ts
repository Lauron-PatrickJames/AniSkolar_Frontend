import type { Borders, Cell, Workbook, Worksheet } from 'exceljs';
import { FseCategory, FseReport, FseScholar, FseScholarship, FseSpecialFunding, SPECIAL_FUNDING_LABELS } from './fse';

// The Excel export, laid out and styled like the AdSO's own FSE workbook:
//   - "FSE": the 1st / 2nd semester table (rows 12–13), then a block per
//     semester with mainstream / external / special / institutional FSE,
//     the head count computation and the Lasallian SPOON recipients. Cells
//     are formulas over rows 12–13, with their results stored.
//   - a tab per category (Internal Academic, Internal Non Academic,
//     Externally Funded, Special Program) with the scholars behind the
//     numbers, in the workbook's own columns, so this page reads the file
//     back (parseRegistrarWorkbook).
// The look (Arial 10, Calibri 11 headers, light green block headers, medium
// outlines, red totals) is copied from the office's template. ExcelJS is
// loaded only when exporting.

const COUNT = '#,##0';
const FSE_FMT = '0.00';
const PCT = '0.00%';
const MONEY = '#,##0.00';

const BLACK = { argb: 'FF000000' };
const RED = { argb: 'FFFF0000' };
const GREEN_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE2EFDA' } };
const ARIAL = { name: 'Arial', size: 10, color: BLACK };
const ARIAL_BOLD = { ...ARIAL, bold: true };
const CALIBRI_BOLD = { name: 'Calibri', size: 11, bold: true, color: BLACK };

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

// --- Cell helpers ------------------------------------------------------------------

const colNo = (letters: string) => letters.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
function rangeOf(ref: string) {
  const [a, b = a] = ref.split(':');
  const parse = (x: string) => { const m = /^([A-Z]+)(\d+)$/.exec(x)!; return { c: colNo(m[1]), r: Number(m[2]) }; };
  const s = parse(a); const e = parse(b);
  return { r1: s.r, c1: s.c, r2: e.r, c2: e.c };
}

// Borders for a block: `outer` around it, `inner` between its cells.
function box(ws: Worksheet, ref: string, outer: 'thin' | 'medium' = 'medium', inner: 'thin' | null = 'thin') {
  const { r1, c1, r2, c2 } = rangeOf(ref);
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = ws.getCell(r, c);
      const side = (edge: boolean) => (edge ? { style: outer, color: BLACK } : inner ? { style: inner, color: BLACK } : undefined);
      const border: Partial<Borders> = { ...cell.border };
      const set = (k: 'top' | 'left' | 'bottom' | 'right', edge: boolean) => {
        const b = side(edge);
        // A medium edge already drawn by a neighbouring block stays.
        if (b && !(cell.border?.[k]?.style === 'medium' && b.style === 'thin')) border[k] = b;
      };
      set('top', r === r1); set('bottom', r === r2); set('left', c === c1); set('right', c === c2);
      cell.border = border;
    }
  }
}

function fill(ws: Worksheet, ref: string) {
  const { r1, c1, r2, c2 } = rangeOf(ref);
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) ws.getCell(r, c).fill = GREEN_FILL;
}

type Style = { font?: Cell['font']; align?: Cell['alignment']; fmt?: string };
function put(ws: Worksheet, addr: string, value: string | number | null | undefined, style: Style = {}): Cell {
  const cell = ws.getCell(addr);
  if (value !== null && value !== undefined && value !== '') cell.value = value;
  cell.font = style.font ?? ARIAL;
  if (style.align) cell.alignment = style.align;
  if (style.fmt) cell.numFmt = style.fmt;
  return cell;
}
function calc(ws: Worksheet, addr: string, formula: string, result: number, style: Style = {}): Cell {
  const cell = put(ws, addr, null, style);
  cell.value = { formula, result: Number.isFinite(result) ? result : 0 };
  return cell;
}

const CENTER = { horizontal: 'center' as const, vertical: 'middle' as const };
const CENTER_WRAP = { ...CENTER, wrapText: true };

// --- The FSE sheet -------------------------------------------------------------------

function fseSheet(wb: Workbook, academicYear: string, reports: FseReport[]) {
  const ws = wb.addWorksheet('FSE', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  const ay = academicYear.replace(/^AY\s*/, '').replace('–', '-');
  const first = reports.find(r => r.term === '1st Semester');
  const second = reports.find(r => r.term === '2nd Semester');
  const latest = reports.map(r => r.asOf).filter((d): d is string => !!d).sort().pop();
  const asOfText = new Date(latest ?? Date.now()).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });

  // Column widths and row heights of the office's sheet.
  const widths: Record<string, number> = { A: 3, B: 16, C: 12.9, D: 16.7, E: 9.5, F: 11.7, G: 10, H: 13, I: 9.5, J: 9.5, K: 9.5, L: 10, M: 12, N: 9.5, O: 9.5, P: 9.5, Q: 12.6, R: 9.5, S: 11.1, T: 9.5, U: 9.7, V: 10.7, W: 10.7, X: 10 };
  Object.entries(widths).forEach(([c, w]) => { ws.getColumn(c).width = w; });
  const heights: Record<number, number> = { 8: 13.8, 9: 15, 17: 43.95, 18: 15, 19: 29.4, 20: 23.25, 21: 14.4, 24: 43.95, 25: 33.75, 26: 31.5, 27: 23.25, 28: 26.25, 29: 14.4 };
  Object.entries(heights).forEach(([r, h]) => { ws.getRow(Number(r)).height = h; });

  // Title.
  put(ws, 'B2', 'COLLEGE', { font: ARIAL_BOLD });
  put(ws, 'C5', `Full Scholarship Equivalent (as of ${asOfText})`, { font: ARIAL_BOLD });
  ws.mergeCells('C6:G6');
  put(ws, 'C6', `For AY ${ay}`, { font: ARIAL_BOLD, align: { horizontal: 'center' } });

  // Table headers (rows 8–11).
  const head = (ref: string, text: string, style: Style = {}) => {
    if (ref.includes(':')) ws.mergeCells(ref);
    put(ws, ref.split(':')[0], text, { align: CENTER, ...style });
  };
  head('C8:L8', 'Mainstream / Internally Funded');
  head('C9:G9', 'Academic');
  head('H9:L9', 'Non-Academic');
  head('M9:P9', 'Externally funded Scholarship');
  head('Q9:W9', 'Special Programs', { align: CENTER_WRAP });
  head('X9:X10', 'Student Total Population', { font: { name: 'Calibri', size: 11, color: BLACK }, align: CENTER_WRAP });
  for (const [c, pctTo, fseCol, fseTo] of [['C', 'D', 'E', 'F'], ['H', 'I', 'J', 'K'], ['M', 'N', 'O', 'P'], ['Q', 'R', 'S', 'T']]) {
    head(`${c}10:${pctTo}10`, 'Headcount %');
    head(`${fseCol}10:${fseTo}10`, 'FSE %');
    head(`${c}11`, '# of Scholars');
    head(`${pctTo}11`, '%');
    head(`${fseCol}11`, c === 'Q' ? 'FSE Count' : 'FSE');
    head(`${fseTo}11`, 'FSE %');
  }
  head('G10:G11', 'Total Pop');
  head('L10:L11', 'Total Pop');
  const small = { name: 'Arial', size: 6, color: BLACK };
  head('U10', 'Internally Funded', { font: small });
  head('V10', 'Externally Funded', { font: small });
  head('W10', 'Co-Funded', { font: small });

  // Rows 12–13: one per semester.
  const sems = [
    { row: 12, label: '1st Semester', block: 17, title: 'FIRST SEM', spoonTitle: `First Semester, SY ${ay}`, report: first },
    { row: 13, label: '2nd Semester', block: 24, title: 'SECOND SEM', spoonTitle: `Second Semester, SY ${ay}`, report: second }
  ];
  const mid = { horizontal: 'center' as const };
  for (const s of sems) {
    put(ws, `B${s.row}`, s.label);
    if (!s.report) continue;
    const d = semesterFigures(s.report);
    const r = s.row;
    const n = (addr: string, v: number, fmt: string) => put(ws, addr, v, { fmt, align: mid });
    const f = (addr: string, formula: string, v: number, fmt: string) => calc(ws, addr, formula, v, { fmt, align: mid });
    n(`C${r}`, d.ia.count, COUNT); f(`D${r}`, `C${r}/G${r}`, d.ia.count / d.pop, PCT);
    n(`E${r}`, d.ia.fse, FSE_FMT); f(`F${r}`, `E${r}/G${r}`, d.ia.fse / d.pop, PCT);
    n(`G${r}`, d.pop, COUNT);
    n(`H${r}`, d.ina.count, COUNT); f(`I${r}`, `H${r}/L${r}`, d.ina.count / d.pop, PCT);
    n(`J${r}`, d.ina.fse, FSE_FMT); f(`K${r}`, `J${r}/L${r}`, d.ina.fse / d.pop, PCT);
    n(`L${r}`, d.pop, COUNT);
    n(`M${r}`, d.ext.count, COUNT); f(`N${r}`, `M${r}/X${r}`, d.ext.count / d.pop, PCT);
    n(`O${r}`, d.ext.fse, FSE_FMT); f(`P${r}`, `O${r}/X${r}`, d.ext.fse / d.pop, PCT);
    f(`Q${r}`, `U${r}+V${r}+W${r}`, d.sp.count, COUNT); f(`R${r}`, `Q${r}/X${r}`, d.sp.count / d.pop, PCT);
    n(`S${r}`, d.sp.fse, FSE_FMT); f(`T${r}`, `S${r}/X${r}`, d.sp.fse / d.pop, PCT);
    n(`U${r}`, d.spInternal, COUNT);
    n(`V${r}`, d.spExternal, COUNT);
    n(`W${r}`, d.spCoFunded, COUNT);
    n(`X${r}`, d.pop, COUNT);
  }
  // Outlines: each group of the table, and the semester labels.
  box(ws, 'C8:L8');
  for (const ref of ['C9:G13', 'H9:L13', 'M9:P13', 'Q9:W13', 'X9:X13', 'B12:B13']) box(ws, ref);

  // Semester blocks (rows 17–21 and 24–28).
  const big = { name: 'Arial', size: 11, color: BLACK };
  const bigBold = { ...big, bold: true };
  for (const s of sems) {
    const t = s.block;
    const r = s.row;
    const d = s.report ? semesterFigures(s.report) : null;
    const pop = d?.pop || 1;

    ws.mergeCells(`B${t}:B${t + 1}`);
    put(ws, `B${t}`, s.title, { font: ARIAL_BOLD, align: CENTER });
    ws.mergeCells(`C${t}:E${t}`);
    put(ws, `C${t}`, 'FSE Mainstream', { font: CALIBRI_BOLD, align: CENTER_WRAP });
    put(ws, `C${t + 1}`, 'Academic', { font: CALIBRI_BOLD, align: CENTER_WRAP });
    put(ws, `D${t + 1}`, 'Non-Academic', { font: CALIBRI_BOLD, align: CENTER_WRAP });
    put(ws, `E${t + 1}`, 'Total', { font: CALIBRI_BOLD, align: CENTER_WRAP });
    for (const [c, label] of [['F', 'Externally Funded Scholarship'], ['G', 'FSE Special Programs'], ['H', 'FSE Institutional']]) {
      ws.mergeCells(`${c}${t}:${c}${t + 1}`);
      put(ws, `${c}${t}`, label, { font: CALIBRI_BOLD, align: CENTER_WRAP });
    }
    fill(ws, `B${t}:H${t + 1}`);
    put(ws, `B${t + 2}`, 'Student Population/FTE', { font: CALIBRI_BOLD, align: { vertical: 'middle', wrapText: true } });
    put(ws, `B${t + 3}`, 'FSE Count', { font: ARIAL_BOLD });
    put(ws, `B${t + 4}`, 'FSE %', { font: ARIAL_BOLD });

    const lines: [number, string, string, string, string, number, number, number, number, string][] = [
      [t + 2, `C${r}`, `H${r}`, `M${r}`, `Q${r}`, d?.ia.count ?? 0, d?.ina.count ?? 0, d?.ext.count ?? 0, d?.sp.count ?? 0, COUNT],
      [t + 3, `E${r}`, `J${r}`, `O${r}`, `S${r}`, d?.ia.fse ?? 0, d?.ina.fse ?? 0, d?.ext.fse ?? 0, d?.sp.fse ?? 0, FSE_FMT],
      [t + 4, `F${r}`, `K${r}`, `P${r}`, `T${r}`, (d?.ia.fse ?? 0) / pop, (d?.ina.fse ?? 0) / pop, (d?.ext.fse ?? 0) / pop, (d?.sp.fse ?? 0) / pop, PCT]
    ];
    for (const [row, a, na, ext, sp, va, vna, vext, vsp, fmt] of lines) {
      calc(ws, `C${row}`, a, va, { font: big, fmt });
      calc(ws, `D${row}`, na, vna, { font: big, fmt });
      calc(ws, `E${row}`, `C${row}+D${row}`, va + vna, { font: big, fmt });
      calc(ws, `F${row}`, ext, vext, { font: big, fmt });
      calc(ws, `G${row}`, sp, vsp, { font: big, fmt });
      // Institutional = mainstream + external + special programs.
      calc(ws, `H${row}`, `E${row}+F${row}+G${row}`, va + vna + vext + vsp, { font: row === t + 4 ? { ...bigBold, color: RED } : bigBold, fmt });
    }
    box(ws, `B${t}:G${t + 4}`);
    box(ws, `H${t}:H${t + 4}`);
    box(ws, `C${t + 1}:E${t + 1}`);

    // Head count computation: mainstream, external and special programs,
    // each scholar once, so the total is the number of scholars. (Special
    // programs funded internally are under Special Program only.) The
    // office's sheet has the second semester's block one row lower.
    const h = s.row === 13 ? t + 1 : t;
    ws.mergeCells(`K${h}:P${h}`);
    put(ws, `K${h}`, 'Head Count Computation', { font: ARIAL_BOLD, align: CENTER });
    const internal = (d?.ia.count ?? 0) + (d?.ina.count ?? 0);
    const counts: [string, string, number][] = [
      ['Internally Funded Scholarship', `C${r}+H${r}`, internal],
      ['Externally Funded Scholarship', `M${r}`, d?.ext.count ?? 0],
      ['Special Program', `Q${r}`, d?.sp.count ?? 0]
    ];
    counts.forEach(([label, formula, v], i) => {
      const row = h + 1 + i;
      ws.mergeCells(`K${row}:M${row}`);
      put(ws, `K${row}`, label, { font: ARIAL_BOLD, align: { vertical: 'middle' } });
      ws.mergeCells(`N${row}:P${row}`);
      calc(ws, `N${row}`, formula, v, { font: ARIAL_BOLD, align: CENTER, fmt: COUNT });
    });
    ws.mergeCells(`K${h + 4}:O${h + 4}`);
    put(ws, `K${h + 4}`, 'Total', { font: bigBold, align: CENTER });
    calc(ws, `P${h + 4}`, `N${h + 1}+N${h + 2}+N${h + 3}`, internal + (d?.ext.count ?? 0) + (d?.sp.count ?? 0), { font: { ...ARIAL_BOLD, color: RED }, align: CENTER, fmt: COUNT });
    box(ws, `K${h}:P${h + 4}`);
    box(ws, `K${h + 4}:P${h + 4}`, 'medium', null);

    // Lasallian SPOON recipients.
    ws.mergeCells(`R${t}:X${t}`);
    put(ws, `R${t}`, 'Lasallian SPOON Recipients', { font: ARIAL_BOLD, align: CENTER });
    put(ws, `R${t + 1}`, s.spoonTitle, { font: ARIAL_BOLD, align: { vertical: 'middle' } });
    ws.mergeCells(`R${t + 2}:V${t + 2}`);
    put(ws, `R${t + 2}`, 'Total', { font: bigBold, align: CENTER });
    put(ws, `X${t + 2}`, d?.spoon ?? null, { font: { ...ARIAL_BOLD, color: RED }, align: CENTER, fmt: COUNT });
    box(ws, `R${t}:X${t + 2}`, 'medium', null);
    box(ws, `R${t}:X${t}`, 'medium', null);
  }
}

// --- Category tabs -------------------------------------------------------------------

const CATEGORY_TABS: { category: FseCategory; name: string; fundSource: string }[] = [
  { category: 'internalAcademic', name: 'Internal Academic', fundSource: 'Internally Funded' },
  { category: 'internalNonAcademic', name: 'Internal Non Academic', fundSource: 'Internally Funded' },
  { category: 'external', name: 'Externally Funded', fundSource: 'Externally Funded' },
  { category: 'special', name: 'Special Program', fundSource: 'Special Program' }
];

// The office's column headers, as written in its workbook (G–R).
const TAB_HEADERS = [
  'Meal allowance                              (SPOON / ATHLETE)',
  'Monthly                     Allowance',
  'DORM ALLOWANCE for Student Athlete (5mos)',
  'Other Financial Assistance (Academic Scholarship, etc. )',
  'Book allowance',
  'Matriculation', 'Discount', 'Total Discount', 'HEADCOUNT', 'FSE', 'TOTAL HEADCOUNT', 'TOTAL FSE'
];
// Allowance columns G–K, in the order above.
const ALLOWANCE_COLS: [string, keyof NonNullable<FseScholar['allowanceDetail']>][] = [['G', 'meal'], ['H', 'monthly'], ['I', 'dorm'], ['J', 'other'], ['K', 'book']];

// One category's scholars, in the office's layout: A fund source,
// B subcategory, C "CODE:" / running number, D code / student ID,
// E scholarship, F program, G–K allowances, L matriculation, M discount,
// N total discount, O head count, P FSE, Q–R the tab's totals (row 2).
function categorySheet(wb: Workbook, name: string, scholarships: FseScholarship[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  const widths = [21.7, 26.6, 6.9, 18.4, 34.1, 12, 20.7, 14, 20.7, 20.7, 14, 16, 14, 16, 13, 10, 13, 12];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.getRow(1).height = 55.5;
  for (let c = 1; c <= 18; c++) {
    const cell = ws.getCell(1, c);
    if (c >= 7) cell.value = TAB_HEADERS[c - 7];
    cell.font = c >= 16 ? ARIAL_BOLD : c === 10 ? { ...CALIBRI_BOLD, size: 8 } : CALIBRI_BOLD;
    cell.alignment = CENTER_WRAP;
  }
  box(ws, 'A1:R1', 'thin');

  const top = { vertical: 'top' as const };
  let row = 3;   // row 2 holds the totals
  const headCells: string[] = [];
  const fseCells: string[] = [];
  let scholars = 0;
  let fse = 0;
  for (const sc of scholarships) {
    const tab = CATEGORY_TABS.find(t => t.category === sc.category)!;
    const sub = sc.category === 'internalAcademic' ? 'Academic Scholarship'
      : sc.category === 'internalNonAcademic' ? 'Non Academic Scholarship'
        : sc.category === 'special' ? SPECIAL_FUNDING_LABELS[sc.specialFunding ?? 'internal']
          : sc.subcategory;
    put(ws, `A${row}`, tab.fundSource); put(ws, `B${row}`, sub); put(ws, `C${row}`, 'CODE:');
    put(ws, `D${row}`, sc.code, { align: top }); put(ws, `E${row}`, sc.name, { align: top });
    row++;
    const firstRow = row;
    sc.scholars.forEach((r, i) => {
      put(ws, `C${row}`, i + 1, { align: top, fmt: '0' });
      put(ws, `D${row}`, r.studentId, { align: top });
      put(ws, `F${row}`, r.program, { align: top });
      // The breakdown when the upload had it; otherwise the total under
      // "Other Financial Assistance".
      const detail = r.allowanceDetail ?? (r.allowances ? { other: r.allowances } : {});
      for (const [c, key] of ALLOWANCE_COLS) if (detail[key]) put(ws, `${c}${row}`, detail[key], { align: top, fmt: MONEY });
      put(ws, `L${row}`, r.matriculation, { align: top, fmt: MONEY });
      put(ws, `M${row}`, r.discount, { align: top, fmt: MONEY });
      // The office's formula, when it gives the saved total.
      const sum = ALLOWANCE_COLS.reduce((m, [, key]) => m + (detail[key] ?? 0), 0) + r.discount;
      if (Math.abs(sum - r.totalDiscount) < 0.01) calc(ws, `N${row}`, `G${row}+H${row}+I${row}+J${row}+K${row}+M${row}`, r.totalDiscount, { align: top, fmt: MONEY });
      else put(ws, `N${row}`, r.totalDiscount, { align: top, fmt: MONEY });
      calc(ws, `P${row}`, `N${row}/L${row}`, r.fse, { align: top, fmt: '0.0000' });
      row++;
    });
    const subtotal = sc.scholars.reduce((m, r) => m + r.fse, 0);
    put(ws, `O${row}`, sc.scholars.length, { font: ARIAL_BOLD, align: top, fmt: COUNT });
    calc(ws, `P${row}`, `SUM(P${firstRow}:P${row - 1})`, subtotal, { font: ARIAL_BOLD, align: top, fmt: FSE_FMT });
    headCells.push(`O${row}`); fseCells.push(`P${row}`);
    scholars += sc.scholars.length; fse += subtotal;
    row += 2;
  }
  const totalStyle = { font: ARIAL_BOLD, align: CENTER };
  if (headCells.length) {
    calc(ws, 'Q2', headCells.join('+'), scholars, { ...totalStyle, fmt: COUNT });
    calc(ws, 'R2', fseCells.join('+'), fse, { ...totalStyle, fmt: FSE_FMT });
  } else {
    put(ws, 'Q2', 0, { ...totalStyle, fmt: COUNT });
    put(ws, 'R2', 0, { ...totalStyle, fmt: FSE_FMT });
  }
}

// --- Workbook ----------------------------------------------------------------------

// The year's workbook: the FSE sheet, then a tab per category for each
// saved semester ("1st Sem …" / "2nd Sem …" when the year has both).
export async function buildFseWorkbook(academicYear: string, reports: FseReport[]): Promise<Workbook> {
  const mod = await import('exceljs');
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AniSkolar';
  wb.calcProperties.fullCalcOnLoad = true;
  fseSheet(wb, academicYear, reports);
  const sems = (['1st Semester', '2nd Semester'] as const).map(term => reports.find(r => r.term === term)).filter((r): r is FseReport => !!r);
  for (const report of sems) {
    for (const tab of CATEGORY_TABS) {
      const name = `${sems.length > 1 ? `${report.term.replace('Semester', 'Sem')} ` : ''}${tab.name}`;
      categorySheet(wb, name, report.scholarships.filter(sc => sc.category === tab.category));
    }
  }
  return wb;
}

export async function exportAcademicYear(academicYear: string, reports: FseReport[]) {
  const wb = await buildFseWorkbook(academicYear, reports);
  const ay = academicYear.replace(/^AY\s*/, '').replace('–', '-');
  const data = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `FSE-AY-${ay}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
