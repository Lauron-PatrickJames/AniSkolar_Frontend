import React, { useMemo, useState } from 'react';
import {
  ArrowLeft, Users, Repeat, Award, Clock, CheckCircle, XCircle, AlertCircle, FileText,
  RefreshCw, Download, Printer, ChevronRight, Send, ChevronDown as ChevronDownIcon
} from 'lucide-react';
import {
  AdminAvatar, Button, DetailField, EmptyState, ErrorBanner, KpiCard, PageHeader, Pagination, Panel,
  SearchInput, SelectInput, SkeletonRows, StatusBadge, Tag, Td, Th, usePagination
} from './AdminUI';

// --- Types (mirror AdminDashboard.tsx) -------------------------------------

type AppStatus = 'Under Evaluation' | 'Approved' | 'Rejected' | 'Needs Revision';
type HistoryStatus = AppStatus | 'Submitted' | 'Resubmitted' | 'Forwarded to LSO';

interface HistoryEntry {
  status: HistoryStatus;
  note?: string;
  changedBy?: string;
  changedAt: string;
}

interface AdminApplication {
  _id: string;
  studentNumber: string;
  avatarUrl?: string;
  scholarshipId: string;
  scholarshipName: string;
  applicationFormType: 'standard' | 'sfag' | 'polca' | 'alumni';
  status: AppStatus;
  createdAt: string;
  history?: HistoryEntry[];
  reviewNote?: string;
  standardInfo?: { firstName: string; lastName: string; email: string; phone: string; program: string; yearLevel: string; gpa: string };
  personalInfo?: { firstName: string; lastName: string; course: string; yearLevel: string; email?: string };
  contactSchool?: { email?: string; mobileNo: string };
}

interface AdminScholarsProps {
  applications: AdminApplication[];
  isLoading?: boolean;
  getToken: () => Promise<string | null>;
  apiBaseUrl: string;
  onRefresh?: () => void;
}


const TIMELINE_STYLES: Record<HistoryStatus, { dot: string; icon: React.ElementType }> = {
  'Submitted': { dot: 'bg-slate-400', icon: FileText },
  'Resubmitted': { dot: 'bg-slate-400', icon: RefreshCw },
  'Under Evaluation': { dot: 'bg-amber-500', icon: Clock },
  'Approved': { dot: 'bg-emerald-500', icon: CheckCircle },
  'Rejected': { dot: 'bg-rose-500', icon: XCircle },
  'Needs Revision': { dot: 'bg-sky-500', icon: AlertCircle },
  'Forwarded to LSO': { dot: 'bg-violet-500', icon: Send }
};

// --- Derived helpers (same shape as AdminDashboard.tsx) --------------------

// SFAG and the grant forms (POLCA / Alumni) keep these on personalInfo /
// contactSchool; only the standard form uses standardInfo.
function usesSectionForm(app: AdminApplication): boolean {
  return app.applicationFormType !== 'standard';
}

function applicantName(app: AdminApplication): string {
  if (usesSectionForm(app) && app.personalInfo) {
    return `${app.personalInfo.firstName} ${app.personalInfo.lastName}`;
  }
  if (app.standardInfo) return `${app.standardInfo.firstName} ${app.standardInfo.lastName}`;
  return 'Unknown Applicant';
}

function applicantEmail(app: AdminApplication): string {
  if (!usesSectionForm(app)) return app.standardInfo?.email ?? '';
  return app.contactSchool?.email || app.personalInfo?.email || '';
}

function applicantPhone(app: AdminApplication): string {
  return usesSectionForm(app) ? app.contactSchool?.mobileNo ?? '' : app.standardInfo?.phone ?? '';
}

function applicantProgram(app: AdminApplication): string {
  return usesSectionForm(app) ? app.personalInfo?.course ?? '' : app.standardInfo?.program ?? '';
}

function applicantYearLevel(app: AdminApplication): string {
  return usesSectionForm(app) ? app.personalInfo?.yearLevel ?? '' : app.standardInfo?.yearLevel ?? '';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Philippine academic-year convention: June through May. A submission in
// March 2026 falls in AY 2025–2026; a submission in September 2026 falls
// in AY 2026–2027. This is derived purely from createdAt — there's no
// separate "cycle"/"term" field on Application, so this is the best
// available proxy for "which scholarship cycle was this."
function academicYearOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-indexed, so 5 = June
  const startYear = month >= 5 ? year : year - 1;
  return `AY ${startYear}\u2013${startYear + 1}`;
}

// --- Scholar aggregation (client-side, used for LIST/DETAIL rendering and
// for the Print/PDF export, which stays client-side) ----------------------

interface ScholarSummary {
  studentNumber: string;
  name: string;
  avatarUrl?: string;
  email: string;
  phone: string;
  program: string;
  yearLevel: string;
  applications: AdminApplication[];
  cycles: string[];
  totalApplications: number;
  approvedCount: number;
  rejectedCount: number;
  latestApplication: AdminApplication;
  latestStatus: AppStatus;
  firstSubmission: string;
  isRenewing: boolean;
}

function buildScholarSummaries(applications: AdminApplication[]): ScholarSummary[] {
  const map = new Map<string, AdminApplication[]>();
  applications.forEach(app => {
    const list = map.get(app.studentNumber) ?? [];
    list.push(app);
    map.set(app.studentNumber, list);
  });

  return Array.from(map.entries()).map(([studentNumber, apps]) => {
    const sorted = [...apps].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const oldest = [...apps].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
    const latest = sorted[0];
    const cycles = Array.from(new Set(apps.map(a => academicYearOf(a.createdAt)))).sort();

    return {
      studentNumber,
      name: applicantName(latest),
      avatarUrl: latest.avatarUrl,
      email: applicantEmail(latest),
      phone: applicantPhone(latest),
      program: applicantProgram(latest),
      yearLevel: applicantYearLevel(latest),
      applications: sorted,
      cycles,
      totalApplications: apps.length,
      approvedCount: apps.filter(a => a.status === 'Approved').length,
      rejectedCount: apps.filter(a => a.status === 'Rejected').length,
      latestApplication: latest,
      latestStatus: latest.status,
      firstSubmission: oldest.createdAt,
      isRenewing: apps.length > 1
    };
  }).sort((a, b) => new Date(b.latestApplication.createdAt).getTime() - new Date(a.latestApplication.createdAt).getTime());
}

// Flattens history entries from every one of a scholar's applications into
// one chronological longitudinal record, tagging each entry with which
// scholarship/cycle it belongs to so a merged timeline still reads clearly
// even when it's stitched together from several separate applications.
interface MergedHistoryEntry extends HistoryEntry {
  scholarshipName: string;
  applicationId: string;
  cycle: string;
}

function buildMergedHistory(applications: AdminApplication[]): MergedHistoryEntry[] {
  const entries: MergedHistoryEntry[] = [];
  applications.forEach(app => {
    const appEntries = app.history && app.history.length > 0
      ? app.history
      : [{ status: app.status, changedAt: app.createdAt } as HistoryEntry];
    appEntries.forEach(h => {
      entries.push({
        ...h,
        scholarshipName: app.scholarshipName,
        applicationId: app._id,
        cycle: academicYearOf(app.createdAt)
      });
    });
  });
  return entries.sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime());
}

// --- Export column registry -----------------------------------------------

// Shared by both CSV export (sent to the backend as ?columns=) and the
// Print/PDF table (rendered client-side). Keys MUST match the backend's
// COLUMN_REGISTRY in routes/applications.js exactly, since CSV export
// passes these keys straight through as a query param. `getValue` is what
// the Print view uses to read a cell for a given ScholarSummary; the CSV
// export doesn't need getValue since the server computes values itself —
// it only needs the key.
const EXPORT_COLUMNS: { key: string; label: string; getValue: (s: ScholarSummary) => string | number }[] = [
  { key: 'studentNumber', label: 'Student Number', getValue: s => s.studentNumber },
  { key: 'name', label: 'Name', getValue: s => s.name },
  { key: 'email', label: 'Email', getValue: s => s.email || '—' },
  { key: 'phone', label: 'Phone', getValue: s => s.phone || '—' },
  { key: 'program', label: 'Program', getValue: s => s.program || '—' },
  { key: 'yearLevel', label: 'Year Level', getValue: s => s.yearLevel || '—' },
  { key: 'totalApplications', label: 'Total Applications', getValue: s => s.totalApplications },
  { key: 'approvedCount', label: 'Approved', getValue: s => s.approvedCount },
  { key: 'rejectedCount', label: 'Rejected', getValue: s => s.rejectedCount },
  {
    key: 'approvalRate', label: 'Approval Rate', getValue: s => {
      const decided = s.approvedCount + s.rejectedCount;
      return decided > 0 ? `${((s.approvedCount / decided) * 100).toFixed(0)}%` : '—';
    }
  },
  { key: 'latestStatus', label: 'Current Status', getValue: s => s.latestStatus },
  { key: 'isRenewing', label: 'Renewing', getValue: s => (s.isRenewing ? 'Yes' : 'No') },
  { key: 'firstSubmission', label: 'First Submission', getValue: s => formatDate(s.firstSubmission) },
];
const DEFAULT_EXPORT_COLUMNS = [
  'studentNumber', 'name', 'email', 'phone', 'program', 'yearLevel',
  'totalApplications', 'approvedCount', 'rejectedCount', 'latestStatus',
  'isRenewing', 'firstSubmission',
];

// --- Export helpers ------------------------------------------------------

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Server-backed CSV export — hits GET /api/applications/export/scholars
// with the current search/renewal/sort state AND the chosen column list,
// so the export always reflects both the active filters and exactly which
// fields the admin picked, without pulling the entire dataset into the
// browser first. Downloads via Blob since the endpoint needs a Bearer
// token (Clerk auth isn't cookie-based here), so a plain <a href> link
// can't be used directly.
async function exportScholarsToCSV(params: {
  getToken: () => Promise<string | null>;
  apiBaseUrl: string;
  search: string;
  renewalFilter: 'all' | 'renewing' | 'first_time';
  sort: SortOption;
  columns: string[];
}): Promise<{ error?: string }> {
  try {
    const token = await params.getToken();
    const qs = new URLSearchParams({
      search: params.search,
      renewal: params.renewalFilter,
      sort: params.sort,
      columns: params.columns.join(','),
    });
    const response = await fetch(`${params.apiBaseUrl}/api/applications/export/scholars?${qs.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return { error: body.error || 'Failed to export scholars.' };
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    a.download = match ? match[1] : `scholars-export-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to export scholars.' };
  }
}

// Client-side CSV export for a SINGLE scholar's own applications (detail
// view) — this one stays client-side since the data is already fully
// loaded in the browser once you're on their detail page. Not affected by
// the column picker; always exports the full per-application breakdown.
function csvField(value: string | number): string {
  const str = String(value ?? '');
  return `"${str.replace(/"/g, '""')}"`;
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportScholarApplicationsToCSV(scholar: ScholarSummary) {
  const headers = ['Scholarship', 'Cycle', 'Type', 'Submitted', 'Status', 'Review Note'];
  const rows = scholar.applications.map(app => [
    csvField(app.scholarshipName),
    csvField(academicYearOf(app.createdAt)),
    csvField(app.applicationFormType),
    csvField(formatDate(app.createdAt)),
    csvField(app.status),
    csvField(app.reviewNote ?? '')
  ].join(','));

  const csv = '\uFEFF' + [headers.map(csvField).join(','), ...rows].join('\r\n');
  const stamp = new Date().toISOString().slice(0, 10);
  const safeName = scholar.studentNumber.replace(/[^a-z0-9-]/gi, '');
  downloadBlob(csv, `scholar-${safeName}-applications-${stamp}.csv`, 'text/csv;charset=utf-8;');
}

// Opens a formatted, print-ready window built from the CHOSEN columns
// (same EXPORT_COLUMNS registry as the CSV picker), so Print/PDF output
// matches whatever fields the admin selected. Calling window.print() in
// that window lets the admin either print physically or choose "Save as
// PDF" from their browser's print dialog. Stays entirely client-side and
// operates on the currently-loaded/filtered `scholars` list — this is
// meant for "print what I'm looking at right now", which is naturally
// bounded, unlike the full-dataset CSV export above.
function printScholars(scholars: ScholarSummary[], subtitle: string, columnKeys: string[]) {
  const activeColumns = EXPORT_COLUMNS.filter(c => columnKeys.includes(c.key));
  const columnsToUse = activeColumns.length > 0 ? activeColumns : EXPORT_COLUMNS;

  const headerCells = columnsToUse.map(c => {
    const isNumeric = ['totalApplications', 'approvedCount', 'rejectedCount'].includes(c.key);
    return `<th${isNumeric ? ' class="num"' : ''}>${escapeHtml(c.label)}</th>`;
  }).join('');

  const rows = scholars.map(s => {
    const cells = columnsToUse.map(c => {
      const isNumeric = ['totalApplications', 'approvedCount', 'rejectedCount'].includes(c.key);
      return `<td${isNumeric ? ' class="num"' : ''}>${escapeHtml(String(c.getValue(s)))}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Scholar Lifecycle Report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Arial, sans-serif; padding: 32px; color: #0f172a; }
  h1 { font-size: 18px; margin: 0 0 4px 0; }
  p.meta { font-size: 11px; color: #64748b; margin: 0 0 20px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #e2e8f0; padding: 7px 10px; text-align: left; }
  th { background: #f1f5f9; text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em; color: #475569; }
  td.num, th.num { text-align: right; }
  tr:nth-child(even) td { background: #f8fafc; }
  @media print {
    body { padding: 12px; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <h1>Scholar Lifecycle Report</h1>
  <p class="meta">${escapeHtml(subtitle)} &middot; Generated ${new Date().toLocaleString()} &middot; ${scholars.length} scholar${scholars.length !== 1 ? 's' : ''}</p>
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;

  const printWindow = window.open('', '_blank', 'width=1000,height=800');
  if (!printWindow) {
    // Popup blocked — nothing else we can do without a library; the admin
    // will need to allow popups for this site.
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.onload = () => {
    printWindow.print();
  };
}

// --- Presentational pieces ---------------------------------------------

function CycleBadge({ cycle }: { cycle: string }) {
  return <Tag>{cycle}</Tag>;
}

function MergedTimeline({ entries }: { entries: MergedHistoryEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">No recorded history for this scholar yet.</p>;
  }
  return (
    <ol className="relative">
      {entries.map((entry, idx) => {
        const style = TIMELINE_STYLES[entry.status] ?? TIMELINE_STYLES['Under Evaluation'];
        const Icon = style.icon;
        const last = idx === entries.length - 1;
        return (
          <li key={`${entry.applicationId}-${idx}`} className="relative flex gap-3 pb-5 last:pb-0">
            {!last && <span className="absolute left-3.5 top-8 bottom-0 w-px bg-slate-200" aria-hidden />}
            <span className={`relative w-7 h-7 rounded-full flex items-center justify-center shrink-0 ring-4 ring-white ${style.dot}`}>
              <Icon className="w-3.5 h-3.5 text-white" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <p className="text-sm font-medium text-slate-900">{entry.status}</p>
                <time className="text-xs text-slate-400 tabular-nums">{formatDateTime(entry.changedAt)}</time>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <span className="text-xs text-slate-500 truncate">{entry.scholarshipName}</span>
                <CycleBadge cycle={entry.cycle} />
              </div>
              {entry.changedBy && (
                <p className="text-xs text-slate-400 mt-0.5">by {entry.changedBy === 'student' ? 'Student' : entry.changedBy}</p>
              )}
              {entry.note && (
                <p className="text-sm text-slate-600 mt-2 bg-slate-50 ring-1 ring-inset ring-slate-200 rounded-lg px-3 py-2 wrap-break-word">{entry.note}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// Column-picker modal, shared by both the CSV and Print/PDF export paths.
// `actionLabel` customizes the confirm button text so it reads correctly
// for whichever export the admin triggered ("Export (8)" vs "Print (8)").
function ColumnPickerModal({
  selected, onToggle, onSelectAll, onSelectNone, onConfirm, onCancel, actionLabel
}: {
  selected: Set<string>;
  onToggle: (key: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  actionLabel: string;
}) {
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="column-picker-title"
        className="bg-white rounded-xl shadow-2xl ring-1 ring-slate-200 max-w-sm w-full max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 id="column-picker-title" className="text-sm font-semibold text-slate-900">Choose columns</h2>
            <p className="text-xs text-slate-500 mt-0.5">Pick what to include in the {actionLabel.toLowerCase()}.</p>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={onSelectAll}>All</Button>
            <Button size="sm" variant="ghost" onClick={onSelectNone}>None</Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {EXPORT_COLUMNS.map(col => (
            <label key={col.key} className="flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-slate-50 cursor-pointer text-sm text-slate-700">
              <input
                type="checkbox"
                checked={selected.has(col.key)}
                onChange={() => onToggle(col.key)}
                className="w-4 h-4 rounded border-slate-300 accent-brand-green"
              />
              {col.label}
            </label>
          ))}
        </div>
        <div className="px-5 py-3.5 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/60">
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" disabled={selected.size === 0} onClick={onConfirm}>
            {actionLabel} ({selected.size})
          </Button>
        </div>
      </div>
    </div>
  );
}

// "Export" dropdown — CSV + Print/PDF options, both of which open the
// shared column picker rather than exporting directly.
function ExportMenu({ onPickCsv, onPickPrint, disabled, isExporting }: {
  onPickCsv: () => void;
  onPickPrint: () => void;
  disabled?: boolean;
  isExporting?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      tabIndex={-1}
      onBlur={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <Button
        icon={Download}
        loading={isExporting}
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        iconRight={<ChevronDownIcon className="w-4 h-4 text-slate-400" />}
      >
        {isExporting ? 'Exporting…' : 'Export'}
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 mt-1.5 w-52 bg-white rounded-lg ring-1 ring-slate-200 shadow-lg z-10 py-1">
          <button
            type="button"
            role="menuitem"
            onClick={() => { onPickCsv(); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
          >
            <FileText className="w-4 h-4 text-slate-400 shrink-0" />
            Export as CSV (Excel)
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { onPickPrint(); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left"
          >
            <Printer className="w-4 h-4 text-slate-400 shrink-0" />
            Print / save as PDF
          </button>
        </div>
      )}
    </div>
  );
}

type SortOption = 'recent' | 'most_applications' | 'name';
type PendingExportAction = 'csv' | 'print' | null;

export default function AdminScholars({ applications, isLoading, getToken, apiBaseUrl, onRefresh }: AdminScholarsProps) {
  const [search, setSearch] = useState('');
  const [renewalFilter, setRenewalFilter] = useState<'all' | 'renewing' | 'first_time'>('all');
  const [sort, setSort] = useState<SortOption>('recent');
  const [selectedStudentNumber, setSelectedStudentNumber] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set(DEFAULT_EXPORT_COLUMNS));
  // Which export the column picker is currently open for — determines
  // both the confirm button's label and what happens when confirmed.
  const [pendingAction, setPendingAction] = useState<PendingExportAction>(null);

  const scholars = useMemo(() => buildScholarSummaries(applications), [applications]);

  const filtered = useMemo(() => {
    let list = scholars;
    if (renewalFilter === 'renewing') list = list.filter(s => s.isRenewing);
    if (renewalFilter === 'first_time') list = list.filter(s => !s.isRenewing);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.studentNumber.toLowerCase().includes(q) ||
        s.program.toLowerCase().includes(q)
      );
    }
    const sorted = [...list];
    if (sort === 'most_applications') sorted.sort((a, b) => b.totalApplications - a.totalApplications);
    else if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    // 'recent' is already the default order from buildScholarSummaries
    return sorted;
  }, [scholars, search, renewalFilter, sort]);

  const renewingCount = useMemo(() => scholars.filter(s => s.isRenewing).length, [scholars]);

  const selected = selectedStudentNumber ? scholars.find(s => s.studentNumber === selectedStudentNumber) ?? null : null;
  const mergedHistory = useMemo(() => (selected ? buildMergedHistory(selected.applications) : []), [selected]);

  // Human-readable description of the current filter state, embedded into
  // exports so the file is self-describing (e.g. someone opens the CSV a
  // month later and can tell what it was scoped to).
  const filterSubtitle = useMemo(() => {
    const parts: string[] = [];
    parts.push(renewalFilter === 'renewing' ? 'Returning only' : renewalFilter === 'first_time' ? 'First-time only' : 'All scholars');
    if (search.trim()) parts.push(`search: "${search.trim()}"`);
    const sortLabel = sort === 'most_applications' ? 'sorted by most applications' : sort === 'name' ? 'sorted by name' : 'sorted by recent activity';
    parts.push(sortLabel);
    return parts.join(' · ');
  }, [renewalFilter, search, sort]);

  const toggleColumn = (key: string) => {
    setSelectedColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Column order for actually building the export always follows
  // EXPORT_COLUMNS' fixed order, regardless of the order checkboxes were
  // toggled in — keeps output predictable.
  const orderedSelectedColumnKeys = () => EXPORT_COLUMNS.map(c => c.key).filter(k => selectedColumns.has(k));

  const handleConfirmExport = async () => {
    const columns = orderedSelectedColumnKeys();
    const action = pendingAction;
    setPendingAction(null);

    if (action === 'print') {
      printScholars(filtered, filterSubtitle, columns);
      return;
    }
    if (action === 'csv') {
      setIsExporting(true);
      setExportError('');
      const { error } = await exportScholarsToCSV({ getToken, apiBaseUrl, search, renewalFilter, sort, columns });
      if (error) setExportError(error);
      setIsExporting(false);
    }
  };

  const pager = usePagination(filtered, 15, `${search}|${renewalFilter}|${sort}`);

  // === Detail view: one scholar's full longitudinal record ================
  if (selected) {
    const meta: [string, React.ReactNode][] = [
      ['Student no.', selected.studentNumber],
      ['Program', [selected.program, selected.yearLevel].filter(Boolean).join(' · ')],
      ['Email', selected.email],
      ['Mobile', selected.phone],
      ['First submission', formatDate(selected.firstSubmission)],
      ['Active cycles', selected.cycles.join(', ')]
    ];
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => setSelectedStudentNumber(null)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to scholars
          </button>
          {/* Detail view keeps a simple non-customized export — always
              the full per-application breakdown for this one scholar. */}
          <div className="flex gap-2">
            <Button icon={FileText} onClick={() => exportScholarApplicationsToCSV(selected)}>CSV</Button>
            <Button icon={Printer} onClick={() => printScholars([selected], `${selected.name} · Student No. ${selected.studentNumber}`, DEFAULT_EXPORT_COLUMNS)}>Print</Button>
          </div>
        </div>

        <Panel>
          <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-5">
            <AdminAvatar name={selected.name} avatarUrl={selected.avatarUrl} size="lg" />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">{selected.name}</h1>
                <StatusBadge status={selected.latestStatus} />
                {selected.isRenewing && <Tag tone="green"><Repeat className="w-3 h-3" /> Returning scholar</Tag>}
              </div>
              <dl className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 mt-5 pt-5 border-t border-slate-100">
                {meta.map(([label, value]) => <DetailField key={label} label={label} value={value} />)}
              </dl>
            </div>
          </div>
        </Panel>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Applications" value={selected.totalApplications} icon={FileText} tone="slate" />
          <KpiCard label="Approved" value={selected.approvedCount} icon={CheckCircle} tone="green" />
          <KpiCard label="Rejected" value={selected.rejectedCount} icon={XCircle} tone="rose" />
          <KpiCard label="Cycles" value={selected.cycles.length} icon={Clock} tone="amber" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <Panel title="Applications" description="Every application this student has submitted, newest first" className="lg:col-span-2" bodyClassName="p-0">
            <ul className="divide-y divide-slate-100">
              {selected.applications.map(app => (
                <li key={app._id} className="px-5 sm:px-6 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{app.scholarshipName}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs text-slate-500">
                        <CycleBadge cycle={academicYearOf(app.createdAt)} />
                        <span>Submitted {formatDate(app.createdAt)}</span>
                      </div>
                    </div>
                    <StatusBadge status={app.status} />
                  </div>
                  {app.reviewNote && (
                    <p className="text-sm text-slate-600 mt-2.5 bg-slate-50 ring-1 ring-inset ring-slate-200 rounded-lg px-3 py-2 wrap-break-word">{app.reviewNote}</p>
                  )}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Full timeline" className="lg:sticky lg:top-24">
            <MergedTimeline entries={mergedHistory} />
          </Panel>
        </div>
      </div>
    );
  }

  // === List view: all scholars ============================================
  const filtersActive = search.trim() !== '' || renewalFilter !== 'all';
  return (
    <div className="space-y-6">
      <PageHeader
        title="Scholars"
        description="Every student's applications and outcomes across all scholarship cycles."
        actions={
          <>
            {onRefresh && <Button icon={RefreshCw} onClick={onRefresh} disabled={isLoading}>Refresh</Button>}
            <ExportMenu
              onPickCsv={() => setPendingAction('csv')}
              onPickPrint={() => setPendingAction('print')}
              disabled={isLoading || isExporting}
              isExporting={isExporting}
            />
          </>
        }
      />

      <ErrorBanner message={exportError} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Total scholars" value={scholars.length} hint="Students with at least one application" icon={Users} tone="slate" />
        <KpiCard label="Returning" value={renewingCount} hint="Applied in more than one cycle" icon={Repeat} tone="green" />
        <KpiCard label="First-time" value={scholars.length - renewingCount} hint="Single application on file" icon={Award} tone="sky" />
      </div>

      <section className="bg-white rounded-xl border border-slate-200/80 shadow-[0_1px_2px_rgba(16,24,40,0.04)] min-w-0">
        <div className="p-4 flex flex-col md:flex-row gap-3 border-b border-slate-100">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, student no. or program…" className="flex-1" />
          <SelectInput value={renewalFilter} onChange={v => setRenewalFilter(v as typeof renewalFilter)} className="md:w-48" ariaLabel="Filter scholars">
            <option value="all">All scholars</option>
            <option value="renewing">Returning only</option>
            <option value="first_time">First-time only</option>
          </SelectInput>
          <SelectInput value={sort} onChange={v => setSort(v as SortOption)} className="md:w-56" ariaLabel="Sort scholars">
            <option value="recent">Most recent activity</option>
            <option value="most_applications">Most applications</option>
            <option value="name">Name (A–Z)</option>
          </SelectInput>
        </div>

        {isLoading ? (
          <SkeletonRows />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title={filtersActive ? 'No scholars match your filters' : 'No scholars yet'}
            description={filtersActive ? 'Try a different search term or filter.' : 'Students appear here once they submit an application.'}
            action={filtersActive ? <Button size="sm" onClick={() => { setSearch(''); setRenewalFilter('all'); }}>Clear filters</Button> : undefined}
          />
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50/70 border-b border-slate-100">
                  <tr>
                    <Th>Scholar</Th>
                    <Th>Program</Th>
                    <Th>Cycles</Th>
                    <Th className="text-right">Applications</Th>
                    <Th>Latest status</Th>
                    <Th className="w-10"><span className="sr-only">Open</span></Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pager.pageItems.map(scholar => (
                    <tr key={scholar.studentNumber} onClick={() => setSelectedStudentNumber(scholar.studentNumber)} className="group cursor-pointer hover:bg-slate-50/80 transition-colors">
                      <Td>
                        <div className="flex items-center gap-3 min-w-0">
                          <AdminAvatar name={scholar.name} avatarUrl={scholar.avatarUrl} size="sm" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setSelectedStudentNumber(scholar.studentNumber); }}
                                className="text-sm font-medium text-slate-900 truncate hover:text-brand-green focus:outline-hidden focus-visible:underline text-left"
                              >
                                {scholar.name}
                              </button>
                              {scholar.isRenewing && <Tag tone="green"><Repeat className="w-3 h-3" /> Returning</Tag>}
                            </div>
                            <p className="text-xs text-slate-500 tabular-nums">{scholar.studentNumber}</p>
                          </div>
                        </div>
                      </Td>
                      <Td><span className="text-sm text-slate-700">{scholar.program || 'Unspecified'}</span></Td>
                      <Td><div className="flex flex-wrap gap-1">{scholar.cycles.map(c => <CycleBadge key={c} cycle={c} />)}</div></Td>
                      <Td className="text-right tabular-nums">
                        <span className="text-slate-900 font-medium">{scholar.totalApplications}</span>
                        <span className="text-xs text-slate-400 ml-1">({scholar.approvedCount} approved)</span>
                      </Td>
                      <Td><StatusBadge status={scholar.latestStatus} /></Td>
                      <Td><ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-600" /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="md:hidden divide-y divide-slate-100">
              {pager.pageItems.map(scholar => (
                <li key={scholar.studentNumber}>
                  <button onClick={() => setSelectedStudentNumber(scholar.studentNumber)} className="w-full flex items-start gap-3 p-4 text-left hover:bg-slate-50">
                    <AdminAvatar name={scholar.name} avatarUrl={scholar.avatarUrl} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-slate-900 truncate">{scholar.name}</p>
                        <StatusBadge status={scholar.latestStatus} />
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">{scholar.program || 'Unspecified'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{scholar.totalApplications} application{scholar.totalApplications !== 1 ? 's' : ''} · {scholar.cycles.join(', ')}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            <div className="px-4 py-3 border-t border-slate-100">
              <Pagination page={pager.page} pageCount={pager.pageCount} total={pager.total} pageSize={pager.pageSize} onChange={pager.setPage} noun="scholars" />
            </div>
          </>
        )}
      </section>

      {pendingAction && (
        <ColumnPickerModal
          selected={selectedColumns}
          onToggle={toggleColumn}
          onSelectAll={() => setSelectedColumns(new Set(EXPORT_COLUMNS.map(c => c.key)))}
          onSelectNone={() => setSelectedColumns(new Set())}
          onConfirm={handleConfirmExport}
          onCancel={() => setPendingAction(null)}
          actionLabel={pendingAction === 'print' ? 'Print' : 'Export'}
        />
      )}
    </div>
  );
}
