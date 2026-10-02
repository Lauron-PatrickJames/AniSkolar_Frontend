import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronRight, Download, FileText, Printer, Users } from 'lucide-react';
import {
  AdminApplication, AppStatus, academicCycles, academicYearOf, applicantEmail, applicantName, applicantPhone,
  applicantProgram, applicantYearLevel, formatDate, isReturningScholar, plural, shortAcademicYear, titleCaseName
} from './adminData';
import {
  Alert, Avatar, Badge, Button, Card, Checkbox, DropdownMenu, EmptyState, ErrorState, Menu, Modal, PageHeader,
  Pagination, RowLink, SearchInput, SegmentedControl, Select, StatusBadge, STATUS_META, Table, TableSkeleton, Td, Th,
  Toolbar, Tr, Truncate, usePagination
} from './AdminUI';
import HistoryList from './HistoryList';
import { buildApplicationHistory, buildCombinedHistory } from './history';

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
  applications: AdminApplication[];   // newest first
  cycles: string[];                   // distinct academic years, oldest first
  totalApplications: number;
  approvedCount: number;
  rejectedCount: number;
  latestApplication: AdminApplication;
  latestStatus: AppStatus;
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
      applications: sorted,
      cycles: academicCycles(apps),
      totalApplications: apps.length,
      approvedCount: apps.filter(a => a.status === 'Approved').length,
      rejectedCount: apps.filter(a => a.status === 'Rejected').length,
      latestApplication: latest,
      latestStatus: latest.status,
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
  { key: 'latestStatus', label: 'Current Status', getValue: s => s.latestStatus },
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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Server-backed CSV export (GET /api/applications/export/scholars) with the
// current search/renewal/sort state and the chosen columns. Downloaded via
// Blob because the endpoint needs a Bearer token.
async function exportScholarsToCSV(params: {
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
    const blob = await response.blob();
    const match = (response.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/);
    downloadBlob(blob, match ? match[1] : `scholars-export-${new Date().toISOString().slice(0, 10)}.csv`);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to export scholars.' };
  }
}

function csvField(value: string | number): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

// Client-side CSV of one scholar's own applications (detail view); the data
// is already loaded, and it always exports the full breakdown.
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
  const csv = '﻿' + [headers.map(csvField).join(','), ...rows].join('\r\n');
  const stamp = new Date().toISOString().slice(0, 10);
  const safeName = scholar.studentNumber.replace(/[^a-z0-9-]/gi, '');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `scholar-${safeName}-applications-${stamp}.csv`);
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

function ColumnPickerModal({ kind, selected, onChange, onConfirm, onCancel }: {
  kind: ExportKind;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const action = kind === 'print' ? 'Print' : 'Export CSV';
  const toggle = (key: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(key); else next.delete(key);
    onChange(next);
  };
  return (
    <Modal
      size="sm"
      title="Choose columns"
      description={`Pick what to include in the ${kind === 'print' ? 'printout' : 'CSV file'}.`}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" icon={kind === 'print' ? Printer : Download} disabled={selected.size === 0} onClick={onConfirm}>
            {action} ({selected.size})
          </Button>
        </>
      }
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-ink-subtle tabular-nums">{selected.size} of {EXPORT_COLUMNS.length} selected</p>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => onChange(new Set(EXPORT_COLUMNS.map(c => c.key)))}>Select all</Button>
          <Button size="sm" variant="ghost" onClick={() => onChange(new Set())}>Clear</Button>
        </div>
      </div>
      <fieldset className="space-y-3">
        <legend className="sr-only">Columns</legend>
        {EXPORT_COLUMNS.map(col => (
          <Checkbox key={col.key} label={col.label} checked={selected.has(col.key)} onChange={on => toggle(col.key, on)} />
        ))}
      </fieldset>
      {selected.size === 0 && <p className="mt-4 text-xs font-medium text-danger">Select at least one column.</p>}
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
  applications, isLoading, error, getToken, apiBaseUrl, onRefresh, selectedStudentNumber, onSelectStudent, onOpenApplication
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
        s.program.toLowerCase().includes(q)
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
    const { error: err } = await exportScholarsToCSV({ getToken, apiBaseUrl, search, renewalFilter, approvedFilter, sort, columns });
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
        onOpenApplication={onOpenApplication}
        exportError={exportError}
        onExportError={setExportError}
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
        description="Every student who has applied, with their applications and outcomes across cycles."
        actions={
          <Menu
            label={isExporting ? 'Exporting…' : 'Export'}
            icon={Download}
            loading={isExporting}
            disabled={!hasData}
            items={[
              { key: 'csv', label: 'Export as CSV (Excel)', icon: FileText, onSelect: () => setPickerFor('csv') },
              { key: 'print', label: 'Print / save as PDF', icon: Printer, onSelect: () => setPickerFor('print') }
            ]}
          />
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
            <SearchInput value={search} onChange={setSearch} label="Search scholars" placeholder="Search name, student no. or program…" className="min-w-56 flex-1" />
            <SegmentedControl<ScholarSegment>
              options={SEGMENTS}
              value={segment}
              onChange={v => v && setSegment(v)}
              label="Show scholars"
              className="md:w-auto"
              renderLabel={(option, active) => (
                <>
                  {option}
                  {!firstLoad && <> <span className={`tabular-nums ${active ? 'text-ink-muted' : 'text-ink-subtle'}`}>{counts[option]}</span></>}
                </>
              )}
            />
            <Select value={approvedFilter} onChange={v => setApprovedFilter(v as ApprovedFilter)} className="md:w-56" label="Filter by approval">
              <option value="any">Any status</option>
              <option value="yes">Has approved application</option>
              <option value="no">No approved application</option>
            </Select>
            <Select value={sort} onChange={v => setSort(v as SortOption)} className="md:w-48" label="Sort scholars">
              <option value="recent">Most recent activity</option>
              <option value="most_applications">Most applications</option>
              <option value="name">Name (A–Z)</option>
            </Select>
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
              description="Try a different search or filter."
              action={<Button onClick={clearFilters}>Clear filters</Button>}
            />
          ) : (
            <EmptyState icon={Users} title="No scholars yet" description="Students appear here once they submit an application." />
          )
        ) : (
          <>
            <Table label="Scholars" minWidth="60rem">
              <thead>
                <tr>
                  <Th sticky={false}>Scholar</Th>
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
                    <Td><StatusBadge status={scholar.latestStatus} /></Td>
                    <Td><ChevronRight className="size-4 text-ink-subtle group-hover:text-ink" aria-hidden /></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>

            <Pagination page={pager.page} pageCount={pager.pageCount} total={pager.total} pageSize={pager.pageSize} onChange={pager.setPage} noun="scholars" />
          </>
        )}
      </Card>

      {pickerFor && (
        <ColumnPickerModal
          kind={pickerFor}
          selected={selectedColumns}
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

function ScholarDetail({ scholar, onOpenApplication, exportError, onExportError }: {
  scholar: ScholarSummary;
  onOpenApplication: (applicationId: string) => void;
  exportError: string;
  onExportError: (message: string) => void;
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

  const summary = [
    plural(scholar.totalApplications, 'application'),
    `${scholar.approvedCount} approved`,
    `${scholar.rejectedCount} rejected`,
    plural(scholar.cycles.length, 'cycle')
  ].join(' · ');

  const print = () => {
    onExportError('');
    if (!printScholars([scholar], `${scholar.rawName} · Student No. ${scholar.studentNumber}`, DEFAULT_EXPORT_COLUMNS)) {
      onExportError(POPUP_BLOCKED);
    }
  };

  const profile: [string, React.ReactNode][] = [
    ['Email', scholar.email || '—'],
    ['Mobile', scholar.phone || '—'],
    ['First submission', formatDate(scholar.firstSubmission)]
  ];

  return (
    <>
      <PageHeader
        leading={<Avatar name={scholar.name} avatarUrl={scholar.avatarUrl} size="lg" />}
        title={scholar.name}
        description={[scholar.studentNumber, [scholar.program, scholar.yearLevel].filter(Boolean).join(' · ')].filter(Boolean).join(' · ')}
        meta={
          <>
            <span className="text-xs text-ink-subtle tabular-nums">{summary}</span>
            <Badge tone={STATUS_META[scholar.latestStatus]?.tone} dot>Latest: {scholar.latestStatus}</Badge>
            {scholar.isReturning && <Badge tone="accent">Returning</Badge>}
          </>
        }
        actions={
          <DropdownMenu
            label="More actions"
            items={[
              { key: 'csv', label: 'Export CSV', icon: FileText, onSelect: () => exportScholarApplicationsToCSV(scholar) },
              { key: 'print', label: 'Print', icon: Printer, onSelect: print }
            ]}
          />
        }
      />

      {exportError && <Alert tone="danger" onDismiss={() => onExportError('')}>{exportError}</Alert>}

      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 border-y border-line py-4 sm:grid-cols-3">
        {profile.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-ink-subtle">{label}</dt>
            <dd className="mt-0.5 truncate text-sm text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      <Card
        flush
        title="Applications"
        description={view === 'By application' ? 'Grouped by cycle, newest first. Open one to see its history.' : 'Every event across all applications, newest first.'}
        actions={
          <SegmentedControl<HistoryView>
            options={HISTORY_VIEWS}
            value={view}
            onChange={v => v && setView(v)}
            label="History view"
            className="w-auto"
          />
        }
      >
        {view === 'All activity' ? (
          <div className="px-5 py-1">
            <HistoryList events={combined} showScholarship empty="No recorded activity yet." label="All activity" />
          </div>
        ) : (
          byCycle.map(([cycle, apps]) => (
            <section key={cycle} aria-label={cycle}>
              <h3 className="border-y border-line bg-surface-muted px-5 py-2 text-xs font-medium text-ink-muted first:border-t-0">
                {cycle} <span className="font-normal text-ink-subtle">· {plural(apps.length, 'application')}</span>
              </h3>
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
        <span className="shrink-0"><StatusBadge status={app.status} /></span>
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
