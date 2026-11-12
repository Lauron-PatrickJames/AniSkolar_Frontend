import type { Workbook } from 'exceljs';

// Formatted Excel exports (.xlsx), in the same style as the FSE workbook
// (pages/admin/fseExport.ts): a title and "exported from" line, a light
// green bold header row that stays put when scrolling, filters on every
// column, thin borders, widths that fit the content, and numbers, dates and
// percentages stored as real values (so they can be summed and sorted).
// ExcelJS is loaded only when exporting.

export type ExcelValue = string | number | Date | null | undefined;

export interface ExcelColumn {
  header: string;
  // How numbers / dates show. Text otherwise.
  format?: 'integer' | 'decimal' | 'decimal1' | 'percent' | 'money' | 'date';
  // A fixed width in characters; otherwise it fits the content.
  width?: number;
  // Long text (messages, notes) wraps instead of widening the column.
  wrap?: boolean;
  align?: 'left' | 'center' | 'right';
}

export interface ExcelSheet {
  name: string;          // the tab
  title: string;         // row 1
  subtitle?: string;     // row 2, e.g. the term or date range
  columns: ExcelColumn[];
  rows: ExcelValue[][];
}

const NUM_FMT: Record<NonNullable<ExcelColumn['format']>, string> = {
  integer: '#,##0',
  decimal: '0.00',
  decimal1: '0.0',
  percent: '0%',
  money: '#,##0.00',
  date: 'mmm d, yyyy',
};

const BLACK = { argb: 'FF000000' };
const GREEN = { argb: 'FF1E5E3A' };
const GRAY = { argb: 'FF595959' };
const LINE = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } };
const HEADER_LINE = { style: 'thin' as const, color: { argb: 'FF7F7F7F' } };
const GREEN_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE2EFDA' } };
const ARIAL = { name: 'Arial', size: 10, color: BLACK };

// A YYYY-MM-DD day (or an ISO time, read in Philippine time) as an Excel date.
export function excelDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(value));
  const [y, m, d] = day.split('-').map(Number);
  return Number.isFinite(y) ? new Date(Date.UTC(y, m - 1, d)) : null;
}

// Excel tab names: at most 31 characters, none of []:*?/\
const tabName = (name: string) => name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet1';

const textOf = (v: ExcelValue, col: ExcelColumn) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return 'Mmm 00, 0000';
  if (typeof v === 'number') return col.format === 'percent' ? `${Math.round(v * 100)}%` : v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return v;
};

function addSheet(wb: Workbook, sheet: ExcelSheet, exportedOn: string) {
  const ws = wb.addWorksheet(tabName(sheet.name), {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  const cols = sheet.columns;
  const last = Math.max(cols.length, 1);

  // Title and "exported from" line.
  ws.mergeCells(1, 1, 1, last);
  const title = ws.getCell(1, 1);
  title.value = sheet.title;
  title.font = { name: 'Calibri', size: 14, bold: true, color: GREEN };
  ws.getRow(1).height = 22;
  ws.mergeCells(2, 1, 2, last);
  const sub = ws.getCell(2, 1);
  sub.value = [sheet.subtitle, `Exported from AniSkolar on ${exportedOn}`].filter(Boolean).join('  ·  ');
  sub.font = { ...ARIAL, italic: true, color: GRAY };

  // Header row (row 4).
  const HEADER = 4;
  const header = ws.getRow(HEADER);
  cols.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: BLACK };
    cell.fill = GREEN_FILL;
    cell.alignment = { vertical: 'middle', horizontal: c.align ?? (c.format && c.format !== 'date' ? 'right' : 'left'), wrapText: true };
    cell.border = { top: HEADER_LINE, bottom: HEADER_LINE, left: HEADER_LINE, right: HEADER_LINE };
  });
  header.height = 30;

  // Data rows.
  sheet.rows.forEach((values, r) => {
    const row = ws.getRow(HEADER + 1 + r);
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const v = values[i];
      cell.value = v === undefined || v === '' ? null : v;
      cell.font = ARIAL;
      if (c.format && (typeof v === 'number' || v instanceof Date)) cell.numFmt = NUM_FMT[c.format];
      cell.alignment = {
        vertical: 'top',
        horizontal: c.align ?? (typeof v === 'number' ? 'right' : 'left'),
        wrapText: !!c.wrap,
      };
      cell.border = { top: LINE, bottom: LINE, left: LINE, right: LINE };
    });
  });

  // Widths that fit the content (within limits), unless fixed.
  cols.forEach((c, i) => {
    const longest = Math.max(
      ...c.header.split(' ').map(w => w.length + 2),
      Math.min(c.header.length, 18),
      ...sheet.rows.map(row => String(textOf(row[i], c)).length),
    );
    ws.getColumn(i + 1).width = c.width ?? Math.min(c.wrap ? 50 : 40, Math.max(8, longest + 2));
  });

  // The header stays put; every column can be filtered.
  ws.views = [{ state: 'frozen', ySplit: HEADER, xSplit: 0 }];
  if (sheet.rows.length) ws.autoFilter = { from: { row: HEADER, column: 1 }, to: { row: HEADER + sheet.rows.length, column: last } };
  ws.pageSetup.printTitlesRow = `${HEADER}:${HEADER}`;
}

// Builds the workbook and downloads it as `filename` (.xlsx is added).
export async function downloadExcel(filename: string, sheets: ExcelSheet[]): Promise<void> {
  const mod = await import('exceljs');
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AniSkolar';
  wb.created = new Date();
  const exportedOn = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date());
  for (const sheet of sheets) addSheet(wb, sheet, exportedOn);
  const data = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// A CSV (as the server sends it) into rows of cells; handles quotes,
// doubled quotes and line breaks inside quotes.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
