import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronRight, Download, FileText, MessageSquare, Pencil, Printer, Trash2, UserPlus, Users } from 'lucide-react';
import EditProfileDialog from '../../components/profile/EditProfileDialog';
import { StudentProfile } from '../../types';
import { downloadZip } from '../../utils/documents';
import {
  API_BASE_URL, AdminApplication, AppStatus, academicCycles, academicYearOf, applicantEmail, applicantName, applicantPhone, authHeaders,
  applicantProgram, applicantYearLevel, formatDate, isReturningScholar, plural, shortAcademicYear, titleCaseName
} from './adminData';
import {
  Alert, Avatar, Badge, Button, Card, Checkbox, ConfirmDialog, CopyButton, DropdownMenu, EmptyState, ErrorState, Menu, MobileList, Modal, PageHeader,
  Pagination, RowLink, SearchInput, SegmentedControl, Select, StatusBadge, STATUS_META, Table, TableSkeleton, Td, Th,
  Toolbar, Tooltip, Tr, Truncate, usePagination
} from './AdminUI';
import HistoryList from './HistoryList';
import { collegeName, findProgram } from '../../data/programs';
import { buildApplicationHistory, buildCombinedHistory } from './history';
import { ExcelColumn, ExcelValue, downloadExcel, excelDate, parseCsv } from '../../utils/excelExport';

interface AdminScholarsProps {
  applications: AdminApplication[];
  isLoading?: boolean;
  error?: string;
  getToken: () => Promise<string | null>;
  apiBaseUrl: string;
  onRefresh?: () => void;
  selectedStudentNumber: string | null;
  onSelectStudent: (studentNumber: string | null) => void;
  // Opens one application in the Applications review.
  onOpenApplication: (applicationId: string) => void;
  // Opens the AdSO's conversation with the student (AdSO only).
  onMessageStudent?: (studentNumber: string) => void;
  // Offices that add their scholars themselves (the SDO): "Add scholar".
  onAddScholar?: () => void;
}

// --- Scholar aggregation (client-side; used for the list/detail views and
// the Print/PDF export) -------------------------------------------------------

interface ScholarSummary {
  studentNumber: string;
  // As stored (often all caps). Used for search and exports.
  rawName: string;
  // Title case, for display.
  name: string;
  avatarUrl?: string;
  email: string;
  phone: string;
  program: string;
  yearLevel: string;
  college: string;                    // college code from the profile, e.g. 'CEAT'
  applications: AdminApplication[];   // newest first
  cycles: string[];                   // distinct academic years, oldest first
  totalApplications: number;
  approvedCount: number;
  rejectedCount: number;
  latestApplication: AdminApplication;
  latestStatus: AppStatus;
  // The latest application was approved but declined / graduated / stopped.
  latestEndReason: string | null;
  firstSubmission: string;
  // Applied in 2+ distinct academic years (isReturningScholar).
  isReturning: boolean;
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
    const latest = sorted[0];
    const oldest = sorted[sorted.length - 1];
    const rawName = applicantName(latest);

    return {
      studentNumber,
      rawName,
      name: titleCaseName(rawName),
      avatarUrl: latest.avatarUrl,
      email: applicantEmail(latest),
      phone: applicantPhone(latest),
      program: applicantProgram(latest),
      yearLevel: applicantYearLevel(latest),
      college: latest.currentProfile?.college || findProgram(latest.currentProfile?.programCode)?.college || '',
      applications: sorted,
      cycles: academicCycles(apps),
      totalApplications: apps.length,
      approvedCount: apps.filter(a => a.status === 'Approved').length,
      rejectedCount: apps.filter(a => a.status === 'Rejected').length,
      latestApplication: latest,
      latestStatus: latest.status,
      latestEndReason: latest.status === 'Approved' ? latest.endReason ?? null : null,
      firstSubmission: oldest.createdAt,
      isReturning: isReturningScholar(apps)
    };
  }).sort((a, b) => new Date(b.latestApplication.createdAt).getTime() - new Date(a.latestApplication.createdAt).getTime());
}

// --- Export column registry ----------------------------------------------------

// Shared by the CSV export (sent to the backend as ?columns=) and the
// Print/PDF table (rendered client-side). Keys MUST match the backend's
// COLUMN_REGISTRY in routes/applications.js exactly.
const EXPORT_COLUMNS: { key: string; label: string; numeric?: boolean; getValue: (s: ScholarSummary) => string | number }[] = [
  { key: 'studentNumber', label: 'Student Number', getValue: s => s.studentNumber },
  { key: 'name', label: 'Name', getValue: s => s.rawName },
  { key: 'email', label: 'Email', getValue: s => s.email || '—' },
  { key: 'phone', label: 'Phone', getValue: s => s.phone || '—' },
  { key: 'program', label: 'Program', getValue: s => s.program || '—' },
  { key: 'yearLevel', label: 'Year Level', getValue: s => s.yearLevel || '—' },
  { key: 'totalApplications', label: 'Total Applications', numeric: true, getValue: s => s.totalApplications },
  { key: 'approvedCount', label: 'Approved', numeric: true, getValue: s => s.approvedCount },
  { key: 'rejectedCount', label: 'Rejected', numeric: true, getValue: s => s.rejectedCount },
  {
    key: 'approvalRate', label: 'Approval Rate', numeric: true, getValue: s => {
      const decided = s.approvedCount + s.rejectedCount;
      return decided > 0 ? `${((s.approvedCount / decided) * 100).toFixed(0)}%` : '—';
    }
  },
  { key: 'latestStatus', label: 'Current Status', getValue: s => (s.latestEndReason === 'Declined' ? 'Declined by student' : s.latestEndReason) || s.latestStatus },
  { key: 'isRenewing', label: 'Returning', getValue: s => (s.isReturning ? 'Yes' : 'No') },
  { key: 'firstSubmission', label: 'First Submission', getValue: s => formatDate(s.firstSubmission) }
];
const DEFAULT_EXPORT_COLUMNS = [
  'studentNumber', 'name', 'email', 'phone', 'program', 'yearLevel',
  'totalApplications', 'approvedCount', 'rejectedCount', 'latestStatus',
  'isRenewing', 'firstSubmission'
];

type SortOption = 'recent' | 'most_applications' | 'name';
type RenewalFilter = 'all' | 'renewing' | 'first_time';
type ApprovedFilter = 'any' | 'yes' | 'no';
type ExportKind = 'csv' | 'print';

// --- Export helpers --------------------------------------------------------------

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Server-backed CSV export (GET /api/applications/export/scholars) with the
// current search/renewal/sort state and the chosen columns. Downloaded via
// Blob because the endpoint needs a Bearer token.
async function exportScholarsToExcel(params: {
  getToken: () => Promise<string | null>;
  apiBaseUrl: string;
  search: string;
  renewalFilter: RenewalFilter;
  approvedFilter: ApprovedFilter;
  sort: SortOption;
  columns: string[];
}): Promise<{ error?: string }> {
  try {
    const token = await params.getToken();
    const qs = new URLSearchParams({
      search: params.search,
      renewal: params.renewalFilter,
      approved: params.approvedFilter,
      sort: params.sort,
      columns: params.columns.join(',')
    });
    const response = await fetch(`${params.apiBaseUrl}/api/applications/export/scholars?${qs.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return { error: body.error || 'Failed to export scholars.' };
    }
    // The server's CSV (with its filters and columns) as a formatted sheet.
    const [header = [], ...lines] = parseCsv(await response.text()).filter(r => r.some(c => c.trim()));
    const NUMBERS = new Set(['Total Applications', 'Approved', 'Rejected']);
    const columns: ExcelColumn[] = header.map(h => (
      NUMBERS.has(h) ? { header: h, format: 'integer' } : h === 'Approval Rate' ? { header: h, format: 'percent' } : { header: h }
    ));
    const rows = lines.map(line => header.map((h, i): ExcelValue => {
      const v = (line[i] ?? '').trim();
      if (!v || v === '—') return null;
      if (NUMBERS.has(h) && /^\d+$/.test(v)) return Number(v);
      if (h === 'Approval Rate' && /^\d+%$/.test(v)) return Number(v.slice(0, -1)) / 100;
      return v;
    }));
    const filters = [params.search && `Search: “${params.search}”`, params.renewalFilter !== 'all' && (params.renewalFilter === 'renewing' ? 'Returning only' : 'First-time only'), params.approvedFilter !== 'any' && (params.approvedFilter === 'yes' ? 'With an approval' : 'Without an approval')].filter(Boolean).join('  ·  ');
    await downloadExcel(`scholars-export-${new Date().toISOString().slice(0, 10)}`, [{
      name: 'Scholars', title: 'Scholars', subtitle: `${rows.length} scholar${rows.length === 1 ? '' : 's'}${filters ? `  ·  ${filters}` : ''}`, columns, rows,
    }]);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to export scholars.' };
  }
}

// Client-side CSV of one scholar's own applications (detail view); the data
// is already loaded, and it always exports the full breakdown.
function exportScholarApplicationsToCSV(scholar: ScholarSummary) {
  const safeName = scholar.studentNumber.replace(/[^a-z0-9-]/gi, '');
  downloadExcel(`scholar-${safeName}-applications-${new Date().toISOString().slice(0, 10)}`, [{
    name: 'Applications',
    title: `${scholar.rawName} (${scholar.studentNumber})`,
    subtitle: 'Applications',
    columns: [
      { header: 'Scholarship' }, { header: 'Cycle' }, { header: 'Type' }, { header: 'Submitted', format: 'date' },
      { header: 'Status' }, { header: 'Review note', wrap: true },
    ],
    rows: scholar.applications.map(app => [
      app.scholarshipName, academicYearOf(app.createdAt), app.applicationFormType, excelDate(app.createdAt), app.status, app.reviewNote ?? null,
    ]),
  }]);
}

// Opens a print-ready window built from the chosen columns; the browser's
// print dialog offers "Save as PDF". Returns false if the pop-up was blocked.
function printScholars(scholars: ScholarSummary[], subtitle: string, columnKeys: string[]): boolean {
  const active = EXPORT_COLUMNS.filter(c => columnKeys.includes(c.key));
  const columns = active.length > 0 ? active : EXPORT_COLUMNS;
  const headerCells = columns.map(c => `<th${c.numeric ? ' class="num"' : ''}>${escapeHtml(c.label)}</th>`).join('');
  const rows = scholars.map(s =>
    `<tr>${columns.map(c => `<td${c.numeric ? ' class="num"' : ''}>${escapeHtml(String(c.getValue(s)))}</td>`).join('')}</tr>`
  ).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Scholar Lifecycle Report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Inter, -apple-system, Segoe UI, Arial, sans-serif; padding: 32px; color: #0f172a; }
  h1 { font-size: 18px; margin: 0 0 4px 0; }
  p.meta { font-size: 11px; color: #64748b; margin: 0 0 20px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #e2e8f0; padding: 7px 10px; text-align: left; }
  th { background: #f8fafc; font-weight: 600; color: #475569; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
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
  if (!printWindow) return false;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.onload = () => printWindow.print();
  return true;
}

const POPUP_BLOCKED = 'Your browser blocked the print window. Allow pop-ups for this site, then try again.';

// --- Column picker ---------------------------------------------------------------

// Export preview: choose the columns and see the rows exactly as they'll
// be exported (first rows), before downloading the Excel / CSV file or
// printing.
const PREVIEW_ROWS = 8;
function ColumnPickerModal({ kind, selected, rows, onChange, onConfirm, onCancel }: {
  kind: ExportKind;
  selected: Set<string>;
  rows: ScholarSummary[];
  onChange: (next: Set<string>) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const columns = EXPORT_COLUMNS.filter(c => selected.has(c.key));
  const action = kind === 'print' ? 'Print' : 'Export to Excel';
  const toggle = (key: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(key); else next.delete(key);
    onChange(next);
  };
  return (
    <Modal
      size="xl"
      title={kind === 'print' ? 'Print preview' : 'Export preview'}
      description={`${rows.length} ${rows.length === 1 ? 'scholar' : 'scholars'}`}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" icon={kind === 'print' ? Printer : Download} disabled={selected.size === 0 || rows.length === 0} onClick={onConfirm}>
            {kind === 'print' ? 'Print' : 'Download for Excel'} ({rows.length} rows)
          </Button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[14rem_1fr]">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs text-ink-subtle tabular-nums">{selected.size} of {EXPORT_COLUMNS.length} columns</p>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => onChange(new Set(EXPORT_COLUMNS.map(c => c.key)))}>All</Button>
              <Button size="sm" variant="ghost" onClick={() => onChange(new Set())}>None</Button>
            </div>
          </div>
          <fieldset className="space-y-2.5">
            <legend className="sr-only">Columns</legend>
            {EXPORT_COLUMNS.map(col => (
              <Checkbox key={col.key} label={col.label} checked={selected.has(col.key)} onChange={on => toggle(col.key, on)} />
            ))}
          </fieldset>
        </div>
        <div className="min-w-0 space-y-2">
          <p className="text-xs font-medium text-ink-muted">Preview{rows.length > PREVIEW_ROWS ? ` (first ${PREVIEW_ROWS} of ${rows.length})` : ''}</p>
          {selected.size === 0 ? (
            <p className="rounded-control bg-surface-muted p-6 text-center text-sm text-danger">Select at least one column.</p>
          ) : rows.length === 0 ? (
            <p className="rounded-control bg-surface-muted p-6 text-center text-sm text-ink-muted">No scholars to export with this search.</p>
          ) : (
            <div className="max-h-[50dvh] overflow-auto rounded-control ring-1 ring-line">
              <table className="w-full border-separate border-spacing-0 text-xs">
                <thead className="sticky top-0 bg-surface-muted">
                  <tr>{columns.map(c => <th key={c.key} className={`whitespace-nowrap border-b border-line px-3 py-2 font-semibold text-ink ${c.numeric ? 'text-right' : 'text-left'}`}>{c.label}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, PREVIEW_ROWS).map(r => (
                    <tr key={r.studentNumber} className="odd:bg-surface even:bg-surface-muted/40">
                      {columns.map(c => <td key={c.key} className={`max-w-56 truncate border-b border-line px-3 py-1.5 text-ink-muted ${c.numeric ? 'text-right tabular-nums' : ''}`}>{String(c.getValue(r))}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// --- Page ------------------------------------------------------------------------

type ScholarSegment = 'All' | 'Returning' | 'First-time';
const SEGMENTS: readonly ScholarSegment[] = ['All', 'Returning', 'First-time'];
const SEGMENT_TO_RENEWAL: Record<ScholarSegment, RenewalFilter> = { 'All': 'all', 'Returning': 'renewing', 'First-time': 'first_time' };

// Refetch when the admin comes back to the tab, at most this often.
const REFETCH_AFTER_MS = 30_000;

export default function AdminScholars({
  applications, isLoading, error, getToken, apiBaseUrl, onRefresh, selectedStudentNumber, onSelectStudent, onOpenApplication, onMessageStudent, onAddScholar
}: AdminScholarsProps) {
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState<ScholarSegment>('All');
  const [approvedFilter, setApprovedFilter] = useState<ApprovedFilter>('any');
  const [sort, setSort] = useState<SortOption>('recent');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set(DEFAULT_EXPORT_COLUMNS));
  const [pickerFor, setPickerFor] = useState<ExportKind | null>(null);
  const renewalFilter = SEGMENT_TO_RENEWAL[segment];

  // Applications are loaded by the dashboard; ask for fresh data when the
  // admin returns to the tab.
  const lastRefetch = useRef(Date.now());
  const refreshIfStale = useCallback(() => {
    if (!onRefresh || Date.now() - lastRefetch.current < REFETCH_AFTER_MS) return;
    lastRefetch.current = Date.now();
    onRefresh();
  }, [onRefresh]);
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') refreshIfStale(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refreshIfStale]);

  const scholars = useMemo(() => buildScholarSummaries(applications), [applications]);
  const counts = useMemo(() => {
    const returning = scholars.filter(s => s.isReturning).length;
    return { 'All': scholars.length, 'Returning': returning, 'First-time': scholars.length - returning } as Record<ScholarSegment, number>;
  }, [scholars]);

  const filtered = useMemo(() => {
    let list = scholars;
    if (segment === 'Returning') list = list.filter(s => s.isReturning);
    if (segment === 'First-time') list = list.filter(s => !s.isReturning);
    if (approvedFilter === 'yes') list = list.filter(s => s.approvedCount > 0);
    if (approvedFilter === 'no') list = list.filter(s => s.approvedCount === 0);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(s =>
        s.rawName.toLowerCase().includes(q) ||
        s.studentNumber.toLowerCase().includes(q) ||
        s.program.toLowerCase().includes(q) ||
        s.college.toLowerCase().includes(q)
      );
    }
    const sorted = [...list];
    if (sort === 'most_applications') sorted.sort((a, b) => b.totalApplications - a.totalApplications);
    else if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    // 'recent' is already the order from buildScholarSummaries.
    return sorted;
  }, [scholars, search, segment, approvedFilter, sort]);

  const pager = usePagination(filtered, 15, `${search}|${segment}|${approvedFilter}|${sort}`);
  const selected = selectedStudentNumber ? scholars.find(s => s.studentNumber === selectedStudentNumber) ?? null : null;

  // Human-readable filter state, embedded in exports so the file explains
  // what it was scoped to.
  const filterSubtitle = [
    segment === 'Returning' ? 'Returning only' : segment === 'First-time' ? 'First-time only' : 'All scholars',
    ...(approvedFilter === 'yes' ? ['with an approved application'] : approvedFilter === 'no' ? ['without an approved application'] : []),
    ...(search.trim() ? [`search: "${search.trim()}"`] : []),
    sort === 'most_applications' ? 'sorted by most applications' : sort === 'name' ? 'sorted by name' : 'sorted by recent activity'
  ].join(' · ');

  const runExport = async () => {
    // Fixed EXPORT_COLUMNS order, regardless of toggle order.
    const columns = EXPORT_COLUMNS.map(c => c.key).filter(k => selectedColumns.has(k));
    const kind = pickerFor;
    setPickerFor(null);
    setExportError('');
    if (kind === 'print') {
      if (!printScholars(filtered, filterSubtitle, columns)) setExportError(POPUP_BLOCKED);
      return;
    }
    setIsExporting(true);
    const { error: err } = await exportScholarsToExcel({ getToken, apiBaseUrl, search, renewalFilter, approvedFilter, sort, columns });
    if (err) setExportError(err);
    setIsExporting(false);
  };

  const hasData = applications.length > 0;
  const firstLoad = !!isLoading && !hasData;
  const failedEmpty = !!error && !hasData && !isLoading;

  if (selected) {
    return (
      <ScholarDetail
        scholar={selected}
        getToken={getToken}
        onOpenApplication={onOpenApplication}
        onMessageStudent={onMessageStudent}
        exportError={exportError}
        onExportError={setExportError}
        onDeleted={() => { onRefresh?.(); onSelectStudent(null); }}
      />
    );
  }

  // === List: all scholars =========================================================
  const filtersActive = search.trim() !== '' || segment !== 'All' || approvedFilter !== 'any';
  const clearFilters = () => { setSearch(''); setSegment('All'); setApprovedFilter('any'); };

  return (
    <>
      <PageHeader
        title="Scholars"
        actions={
          <>
          {onAddScholar && <Button variant="primary" icon={UserPlus} onClick={onAddScholar}>Add scholar</Button>}
          <Menu
            label={isExporting ? 'Exporting…' : 'Export'}
            icon={Download}
            loading={isExporting}
            disabled={!hasData}
            items={[
              { key: 'csv', label: 'Export to Excel', icon: FileText, onSelect: () => setPickerFor('csv') },
              { key: 'print', label: 'Print / save as PDF', icon: Printer, onSelect: () => setPickerFor('print') }
            ]}
          />
          </>
        }
      />

      {exportError && <Alert tone="danger" onDismiss={() => setExportError('')}>{exportError}</Alert>}
      {error && hasData && (
        <Alert tone="danger" title="Couldn't refresh scholars" action={onRefresh && <Button size="sm" onClick={onRefresh}>Try again</Button>}>
          {error} Showing the last loaded list.
        </Alert>
      )}

      <Card
        flush
        headerSlot={
          <Toolbar>
            <SearchInput value={search} onChange={setSearch} label="Search scholars" placeholder="Search name, student no., program or college…" className="min-w-56 flex-1" />
          </Toolbar>
        }
      >
        {firstLoad ? (
          <TableSkeleton label="Loading scholars" />
        ) : failedEmpty ? (
          <ErrorState title="Couldn't load scholars" message={error} onRetry={onRefresh} retrying={isLoading} />
        ) : filtered.length === 0 ? (
          filtersActive ? (
            <EmptyState
              icon={Users}
              title="No scholars match"
             
              action={<Button onClick={clearFilters}>Clear filters</Button>}
            />
          ) : (
            <EmptyState icon={Users} title="No scholars yet" />
          )
        ) : (
          <>
            <div className="hidden xl:block">
            <Table label="Scholars" minWidth="58rem">
              <thead>
                <tr>
                  <Th sticky={false}>Scholar</Th>
                  <Th sticky={false} className="w-24">College</Th>
                  <Th sticky={false} className="w-48">Program</Th>
                  <Th sticky={false} className="w-32">Cycles</Th>
                  <Th sticky={false} className="w-36">Applications</Th>
                  <Th sticky={false} className="w-40">Latest status</Th>
                  <Th sticky={false} className="w-12"><span className="sr-only">Open</span></Th>
                </tr>
              </thead>
              <tbody>
                {pager.pageItems.map(scholar => (
                  <Tr key={scholar.studentNumber} onClick={() => onSelectStudent(scholar.studentNumber)}>
                    <Td>
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={scholar.name} avatarUrl={scholar.avatarUrl} size="sm" />
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <RowLink onClick={() => onSelectStudent(scholar.studentNumber)}>{scholar.name}</RowLink>
                            {scholar.isReturning && <Badge tone="accent" className="h-5 shrink-0 px-1.5">Returning</Badge>}
                          </div>
                          <p className="text-xs text-ink-subtle tabular-nums">{scholar.studentNumber}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      {scholar.college ? (
                        <Tooltip content={collegeName(scholar.college)} asChild>
                          <span tabIndex={0} className="rounded-badge font-medium text-ink">{scholar.college}</span>
                        </Tooltip>
                      ) : <span className="text-ink-subtle">—</span>}
                    </Td>
                    <Td><Truncate>{scholar.program || 'Unspecified'}</Truncate></Td>
                    <Td>
                      <Truncate className="tabular-nums">{scholar.cycles.map(c => shortAcademicYear(c)).join(', ')}</Truncate>
                    </Td>
                    <Td>
                      <span className="tabular-nums">
                        <span className="font-medium text-ink">{scholar.totalApplications}</span>
                        <span className="text-ink-subtle"> · {scholar.approvedCount} approved</span>
                      </span>
                    </Td>
                    <Td><StatusBadge status={scholar.latestStatus} endReason={scholar.latestEndReason} /></Td>
                    <Td><ChevronRight className="size-4 text-ink-subtle group-hover:text-ink" aria-hidden /></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            </div>
            <MobileList>
              {pager.pageItems.map(scholar => (
                <li key={scholar.studentNumber}>
                  <button type="button" onClick={() => onSelectStudent(scholar.studentNumber)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-muted">
                    <Avatar name={scholar.name} avatarUrl={scholar.avatarUrl} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{scholar.name}</span>
                      <span className="block truncate text-xs text-ink-subtle">{[scholar.studentNumber, scholar.college, scholar.program].filter(Boolean).join(' · ')}</span>
                    </span>
                    <StatusBadge status={scholar.latestStatus} endReason={scholar.latestEndReason} />
                  </button>
                </li>
              ))}
            </MobileList>

            <Pagination page={pager.page} pageCount={pager.pageCount} total={pager.total} pageSize={pager.pageSize} onChange={pager.setPage} noun="scholars" />
          </>
        )}
      </Card>

      {pickerFor && (
        <ColumnPickerModal
          kind={pickerFor}
          selected={selectedColumns}
          rows={filtered}
          onChange={setSelectedColumns}
          onConfirm={runExport}
          onCancel={() => setPickerFor(null)}
        />
      )}
    </>
  );
}

// --- Detail: one scholar ------------------------------------------------------------

type HistoryView = 'By application' | 'All activity';
const HISTORY_VIEWS: readonly HistoryView[] = ['By application', 'All activity'];

const isActive = (status: AppStatus) => status === 'Under Evaluation' || status === 'Needs Revision';

function ScholarDetail({ scholar, getToken, onOpenApplication, onMessageStudent, exportError, onExportError, onDeleted }: {
  getToken: () => Promise<string | null>;
  scholar: ScholarSummary;
  onOpenApplication: (applicationId: string) => void;
  onMessageStudent?: (studentNumber: string) => void;
  exportError: string;
  onExportError: (message: string) => void;
  // After the student was deleted (moved to the Trash).
  onDeleted: () => void;
}) {
  const [view, setView] = useState<HistoryView>('By application');
  // The most recent application still in review starts open.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const active = scholar.applications.find(a => isActive(a.status));
    return new Set(active ? [active._id] : []);
  });
  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Applications grouped by cycle, newest cycle first; applications inside
  // each cycle are already newest first.
  const byCycle = useMemo(() => {
    const groups = new Map<string, AdminApplication[]>();
    scholar.applications.forEach(app => {
      const cycle = academicYearOf(app.createdAt);
      groups.set(cycle, [...(groups.get(cycle) ?? []), app]);
    });
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [scholar.applications]);

  const combined = useMemo(() => buildCombinedHistory(scholar.applications, scholar.name), [scholar.applications, scholar.name]);

  // What they hold now: approved and not ended. "Student Financial Aid
  // Grant (SFAG)" shows as "SFAG".
  const holding = scholar.applications.filter(a => a.status === 'Approved' && !a.endedAt);
  const shortName = (name: string) => name.match(/\(([^)]+)\)\s*$/)?.[1] ?? name;
  const manyApps = scholar.applications.length > 1;

  const print = () => {
    onExportError('');
    if (!printScholars([scholar], `${scholar.rawName} · Student No. ${scholar.studentNumber}`, DEFAULT_EXPORT_COLUMNS)) {
      onExportError(POPUP_BLOCKED);
    }
  };

  // AdSO: the student's full profile, for open change requests and editing
  // the details students can't change themselves.
  const canEdit = !!onMessageStudent;
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [profileNote, setProfileNote] = useState('');
  useEffect(() => {
    if (!canEdit) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/students/${encodeURIComponent(scholar.studentNumber)}/profile`, { headers: await authHeaders(getToken) });
        const body = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) setStudentProfile(body.student);
      } catch { /* the button just stays hidden */ }
    })();
    return () => { cancelled = true; };
  }, [canEdit, scholar.studentNumber, getToken]);
  const openRequests = (studentProfile?.correctionRequests ?? []).filter(r => r.status === 'open');

  // AdSO (the full profile loaded): delete the student with their records,
  // to the Trash for 30 days. The server refuses anyone with something
  // active (POST /api/students/delete).
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const deleteStudent = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/students/delete`, {
        method: 'POST',
        headers: await authHeaders(getToken, true),
        body: JSON.stringify({ studentNumbers: [scholar.studentNumber] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't delete the student.");
      if (body.skipped?.length) throw new Error(body.skipped[0].reason);
      setConfirmDelete(false);
      onDeleted();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Couldn't delete the student.");
    } finally {
      setDeleting(false);
    }
  };
  const saveProfile = async (changes: Record<string, unknown>) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/students/${encodeURIComponent(scholar.studentNumber)}/profile`, {
        method: 'PATCH', headers: await authHeaders(getToken, true), body: JSON.stringify(changes),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: body.error || 'Failed to save the profile.' };
      setStudentProfile(body.student);
      setProfileNote('Profile updated. Any open change requests were marked done.');
      return { ok: true };
    } catch {
      return { ok: false, error: 'Failed to save the profile.' };
    }
  };

  const copyable = (value: string, label: string) => (value
    ? <span className="flex min-w-0 items-center gap-1"><span className="truncate">{value}</span><CopyButton value={value} label={`Copy ${label}`} /></span>
    : '—');
  const profile: [string, React.ReactNode][] = [
    ['Program', scholar.program || '—'],
    ['Email', copyable(scholar.email, 'email')],
    ['Mobile', copyable(scholar.phone, 'mobile number')],
    ['First applied', formatDate(scholar.firstSubmission)]
  ];

  return (
    <>
      <PageHeader
        leading={<Avatar name={scholar.name} avatarUrl={scholar.avatarUrl} size="lg" />}
        title={scholar.name}
        description={
          <span className="tabular-nums">
            {[scholar.studentNumber, scholar.yearLevel].filter(Boolean).join(' · ')}
            {scholar.college && <> · <Tooltip content={collegeName(scholar.college)} asChild><span tabIndex={0} className="rounded-badge">{scholar.college}</span></Tooltip></>}
          </span>
        }
        meta={
          <>
            {holding.length > 0
              ? holding.map(a => <Badge key={a._id} tone="success" dot>Scholar · {shortName(a.scholarshipName)}</Badge>)
              : <StatusBadge status={scholar.latestStatus} endReason={scholar.latestEndReason} />}
            {scholar.isReturning && <Badge tone="accent">Returning</Badge>}
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            {onMessageStudent && <Button size="sm" icon={MessageSquare} onClick={() => onMessageStudent(scholar.studentNumber)}>Message student</Button>}
            {canEdit && studentProfile && <Button size="sm" icon={Pencil} onClick={() => setEditing(true)}>Edit profile</Button>}
            <DropdownMenu
              label="More actions"
              items={[
                {
                  key: 'files', label: 'Download all files (.zip)', icon: Download,
                  onSelect: () => { onExportError(''); downloadZip(`student/${encodeURIComponent(scholar.studentNumber)}`, getToken).catch(err => onExportError(err instanceof Error ? err.message : "Couldn't prepare the download.")); },
                },
                { key: 'csv', label: 'Export to Excel', icon: FileText, onSelect: () => exportScholarApplicationsToCSV(scholar) },
                { key: 'print', label: 'Print', icon: Printer, onSelect: print },
                ...(studentProfile ? [{ key: 'delete', label: 'Delete student', icon: Trash2, tone: 'danger' as const, onSelect: () => { setDeleteError(''); setConfirmDelete(true); } }] : []),
              ]}
            />
          </div>
        }
      />

      {profileNote && <Alert tone="success" onDismiss={() => setProfileNote('')}>{profileNote}</Alert>}
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${scholar.name}?`}
          confirmLabel="Delete"
          confirmIcon={Trash2}
          tone="danger"
          busy={deleting}
          error={deleteError}
          onConfirm={deleteStudent}
          onCancel={() => { if (!deleting) setConfirmDelete(false); }}
        >
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">
            <li>Their profile, applications, renewals, duty logs and messages move to the Trash.</li>
            <li>You can restore them from the Trash for 30 days. After that they and their uploaded files are deleted for good.</li>
            <li>Only students with nothing active can be deleted: no current scholarship, and no application or renewal being decided.</li>
          </ul>
        </ConfirmDialog>
      )}
      {openRequests.length > 0 && (
        <Alert
          tone="warning"
          title={`${openRequests.length === 1 ? 'A change request' : `${openRequests.length} change requests`} from the student`}
          action={<Button size="sm" onClick={() => setEditing(true)}>Edit profile</Button>}
        >
          <ul className="mt-1 space-y-1">
            {openRequests.map((r, i) => <li key={r._id ?? i}><span className="font-medium capitalize">{r.group}:</span> {r.message}</li>)}
          </ul>
        </Alert>
      )}
      {editing && studentProfile && (
        <EditProfileDialog
          student={studentProfile}
          adminMode
          initialSection={openRequests.some(r => r.group === 'personal') ? 'personal' : 'academic'}
          onClose={() => setEditing(false)}
          onSave={changes => saveProfile(changes as Record<string, unknown>)}
          onStudentUpdated={setStudentProfile}
        />
      )}
      {exportError && <Alert tone="danger" onDismiss={() => onExportError('')}>{exportError}</Alert>}

      <Card>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-5">
          {profile.map(([label, value]) => (
            <div key={label} className={`min-w-0 ${label === 'Program' ? 'sm:col-span-2' : ''}`}>
              <dt className="text-xs text-ink-subtle">{label}</dt>
              <dd className={`mt-0.5 text-sm text-ink ${label === 'Program' ? 'wrap-break-word' : 'min-w-0'}`}>{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card
        flush
        title={manyApps ? `Applications (${scholar.applications.length})` : 'Application'}
        actions={manyApps ? (
          <SegmentedControl<HistoryView>
            options={HISTORY_VIEWS}
            value={view}
            onChange={v => v && setView(v)}
            label="History view"
            className="w-auto"
          />
        ) : undefined}
      >
        {view === 'All activity' ? (
          <div className="px-5 py-1">
            <HistoryList events={combined} showScholarship empty="No recorded activity yet." label="All activity" />
          </div>
        ) : (
          byCycle.map(([cycle, apps]) => (
            <section key={cycle} aria-label={cycle}>
              {byCycle.length > 1 && (
                <h3 className="border-y border-line bg-surface-muted px-5 py-2 text-xs font-medium text-ink-muted first:border-t-0">
                  {cycle}
                </h3>
              )}
              <ul className="divide-y divide-line">
                {apps.map(app => (
                  <ApplicationRow
                    key={app._id}
                    app={app}
                    studentName={scholar.name}
                    open={expanded.has(app._id)}
                    onToggle={() => toggle(app._id)}
                    onOpenApplication={onOpenApplication}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </Card>
    </>
  );
}

function ApplicationRow({ app, studentName, open, onToggle, onOpenApplication }: {
  app: AdminApplication;
  studentName: string;
  open: boolean;
  onToggle: () => void;
  onOpenApplication: (applicationId: string) => void;
}) {
  const panelId = useId();
  const events = useMemo(() => (open ? buildApplicationHistory(app, studentName) : []), [open, app, studentName]);
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-muted focus-visible:-outline-offset-2"
      >
        <ChevronRight className={`size-4 shrink-0 text-ink-subtle transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink" title={app.scholarshipName}>{app.scholarshipName}</span>
        <span className="hidden shrink-0 text-xs text-ink-subtle tabular-nums sm:inline">Submitted {formatDate(app.createdAt)}</span>
        <span className="shrink-0"><StatusBadge status={app.status} endReason={app.endReason} /></span>
      </button>
      <div id={panelId} hidden={!open} className="pb-3 pl-12 pr-5">
        <p className="text-xs text-ink-subtle sm:hidden">Submitted {formatDate(app.createdAt)}</p>
        <HistoryList events={events} empty="No recorded history for this application." label={`History of ${app.scholarshipName}`} />
        <Button size="sm" variant="ghost" iconRight={ChevronRight} onClick={() => onOpenApplication(app._id)} className="-ml-3 mt-1">
          Open application
        </Button>
      </div>
    </li>
  );
}
