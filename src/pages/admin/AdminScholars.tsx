import React, { useMemo, useState } from 'react';
import { Award, CheckCircle2, ChevronRight, Clock, Download, FileText, Printer, RefreshCw, Repeat, Users, XCircle } from 'lucide-react';
import {
  AdminApplication, AppStatus, HistoryEntry, academicYearOf, applicantEmail, applicantName, applicantPhone,
  applicantProgram, applicantYearLevel, formatDate, formatDateTime, plural
} from './adminData';
import {
  Alert, Avatar, Badge, Button, Card, DetailField, EmptyState, ErrorState, KpiCard, KpiGrid, Menu, MobileList, Modal,
  PageHeader, Pagination, Quote, RowLink, SearchInput, Select, StatusBadge, Table, TableSkeleton, Td, Th, Timeline,
  TimelineEntry, Toolbar, Tr, Truncate, Checkbox, usePagination
} from './AdminUI';

interface AdminScholarsProps {
  applications: AdminApplication[];
  isLoading?: boolean;
  error?: string;
  getToken: () => Promise<string | null>;
  apiBaseUrl: string;
  onRefresh?: () => void;
  selectedStudentNumber: string | null;
  onSelectStudent: (studentNumber: string | null) => void;
}

// --- Scholar aggregation (client-side; used for the list/detail views and
// the Print/PDF export) -------------------------------------------------------

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
    const latest = sorted[0];
    const oldest = sorted[sorted.length - 1];
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

// Every history entry from all of a scholar's applications in one
// chronological record, tagged with the scholarship and cycle it belongs to.
function buildMergedHistory(applications: AdminApplication[]): (TimelineEntry & { scholarshipName: string; cycle: string })[] {
  const entries: (TimelineEntry & { scholarshipName: string; cycle: string })[] = [];
  applications.forEach(app => {
    const appEntries: HistoryEntry[] = app.history && app.history.length > 0
      ? app.history
      : [{ status: app.status, changedAt: app.createdAt }];
    appEntries.forEach((h, i) => {
      entries.push({ ...h, key: `${app._id}-${i}`, scholarshipName: app.scholarshipName, cycle: academicYearOf(app.createdAt) });
    });
  });
  return entries.sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime());
}

// --- Export column registry ----------------------------------------------------

// Shared by the CSV export (sent to the backend as ?columns=) and the
// Print/PDF table (rendered client-side). Keys MUST match the backend's
// COLUMN_REGISTRY in routes/applications.js exactly.
const EXPORT_COLUMNS: { key: string; label: string; numeric?: boolean; getValue: (s: ScholarSummary) => string | number }[] = [
  { key: 'studentNumber', label: 'Student Number', getValue: s => s.studentNumber },
  { key: 'name', label: 'Name', getValue: s => s.name },
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
  { key: 'isRenewing', label: 'Renewing', getValue: s => (s.isRenewing ? 'Yes' : 'No') },
  { key: 'firstSubmission', label: 'First Submission', getValue: s => formatDate(s.firstSubmission) }
];
const DEFAULT_EXPORT_COLUMNS = [
  'studentNumber', 'name', 'email', 'phone', 'program', 'yearLevel',
  'totalApplications', 'approvedCount', 'rejectedCount', 'latestStatus',
  'isRenewing', 'firstSubmission'
];

type SortOption = 'recent' | 'most_applications' | 'name';
type RenewalFilter = 'all' | 'renewing' | 'first_time';
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
  sort: SortOption;
  columns: string[];
}): Promise<{ error?: string }> {
  try {
    const token = await params.getToken();
    const qs = new URLSearchParams({
      search: params.search,
      renewal: params.renewalFilter,
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

export default function AdminScholars({
  applications, isLoading, error, getToken, apiBaseUrl, onRefresh, selectedStudentNumber, onSelectStudent
}: AdminScholarsProps) {
  const [search, setSearch] = useState('');
  const [renewalFilter, setRenewalFilter] = useState<RenewalFilter>('all');
  const [sort, setSort] = useState<SortOption>('recent');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set(DEFAULT_EXPORT_COLUMNS));
  const [pickerFor, setPickerFor] = useState<ExportKind | null>(null);

  const scholars = useMemo(() => buildScholarSummaries(applications), [applications]);
  const renewingCount = useMemo(() => scholars.filter(s => s.isRenewing).length, [scholars]);

  const filtered = useMemo(() => {
    let list = scholars;
    if (renewalFilter === 'renewing') list = list.filter(s => s.isRenewing);
    if (renewalFilter === 'first_time') list = list.filter(s => !s.isRenewing);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.studentNumber.toLowerCase().includes(q) ||
        s.program.toLowerCase().includes(q)
      );
    }
    const sorted = [...list];
    if (sort === 'most_applications') sorted.sort((a, b) => b.totalApplications - a.totalApplications);
    else if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    // 'recent' is already the order from buildScholarSummaries.
    return sorted;
  }, [scholars, search, renewalFilter, sort]);

  const pager = usePagination(filtered, 15, `${search}|${renewalFilter}|${sort}`);

  const selected = selectedStudentNumber ? scholars.find(s => s.studentNumber === selectedStudentNumber) ?? null : null;
  const mergedHistory = useMemo(() => (selected ? buildMergedHistory(selected.applications) : []), [selected]);

  // Human-readable filter state, embedded in exports so the file explains
  // what it was scoped to.
  const filterSubtitle = [
    renewalFilter === 'renewing' ? 'Returning only' : renewalFilter === 'first_time' ? 'First-time only' : 'All scholars',
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
    const { error: err } = await exportScholarsToCSV({ getToken, apiBaseUrl, search, renewalFilter, sort, columns });
    if (err) setExportError(err);
    setIsExporting(false);
  };

  const hasData = applications.length > 0;
  const firstLoad = !!isLoading && !hasData;
  const failedEmpty = !!error && !hasData && !isLoading;

  // === Detail: one scholar's full record =======================================
  if (selected) {
    const details: [string, React.ReactNode][] = [
      ['Student no.', <span className="tabular-nums">{selected.studentNumber}</span>],
      ['Program', [selected.program, selected.yearLevel].filter(Boolean).join(' · ')],
      ['Email', selected.email],
      ['Mobile', selected.phone],
      ['First submission', formatDate(selected.firstSubmission)],
      ['Active cycles', selected.cycles.join(', ')]
    ];
    return (
      <>
        <PageHeader
          back={{ label: 'All scholars', onClick: () => onSelectStudent(null) }}
          title={selected.name}
          meta={
            <>
              <StatusBadge status={selected.latestStatus} />
              {selected.isRenewing && <Badge tone="accent" icon={Repeat}>Returning scholar</Badge>}
            </>
          }
          actions={
            <>
              <Button icon={FileText} onClick={() => exportScholarApplicationsToCSV(selected)}>Export CSV</Button>
              <Button
                icon={Printer}
                onClick={() => {
                  setExportError('');
                  if (!printScholars([selected], `${selected.name} · Student No. ${selected.studentNumber}`, DEFAULT_EXPORT_COLUMNS)) {
                    setExportError(POPUP_BLOCKED);
                  }
                }}
              >
                Print
              </Button>
            </>
          }
        />

        {exportError && <Alert tone="danger" onDismiss={() => setExportError('')}>{exportError}</Alert>}

        <Card title="Scholar">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <Avatar name={selected.name} avatarUrl={selected.avatarUrl} size="lg" />
            <dl className="grid flex-1 grid-cols-1 gap-x-6 gap-y-4 min-[480px]:grid-cols-2 xl:grid-cols-3">
              {details.map(([label, value]) => <DetailField key={label} label={label} value={value} />)}
            </dl>
          </div>
        </Card>

        <KpiGrid>
          <KpiCard label="Applications" value={selected.totalApplications} icon={FileText} />
          <KpiCard label="Approved" value={selected.approvedCount} icon={CheckCircle2} tone="success" />
          <KpiCard label="Rejected" value={selected.rejectedCount} icon={XCircle} tone="danger" />
          <KpiCard label="Cycles" value={selected.cycles.length} icon={Clock} />
        </KpiGrid>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
          <Card title="Applications" description="Every application this student has submitted, newest first" className="lg:col-span-2" flush>
            <ul className="divide-y divide-line">
              {selected.applications.map(app => (
                <li key={app._id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{app.scholarshipName}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-subtle">
                        <Badge>{academicYearOf(app.createdAt)}</Badge>
                        <span>Submitted {formatDate(app.createdAt)}</span>
                      </div>
                    </div>
                    <StatusBadge status={app.status} />
                  </div>
                  {app.reviewNote && <Quote className="mt-3">{app.reviewNote}</Quote>}
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Full timeline">
            <Timeline
              entries={mergedHistory.map(entry => ({
                ...entry,
                context: (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-xs text-ink-muted">{entry.scholarshipName}</span>
                    <Badge>{entry.cycle}</Badge>
                  </div>
                )
              }))}
              empty="No recorded history for this scholar yet."
              formatTime={formatDateTime}
            />
          </Card>
        </div>
      </>
    );
  }

  // === List: all scholars =========================================================
  const filtersActive = search.trim() !== '' || renewalFilter !== 'all';
  const kpiValue = (n: number) => (failedEmpty ? '—' : n);

  return (
    <>
      <PageHeader
        title="Scholars"
        description="Every student's applications and outcomes across all scholarship cycles."
        actions={
          <>
            {onRefresh && <Button icon={RefreshCw} loading={isLoading} onClick={onRefresh}>Refresh</Button>}
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
          </>
        }
      />

      {exportError && <Alert tone="danger" onDismiss={() => setExportError('')}>{exportError}</Alert>}
      {error && hasData && (
        <Alert tone="danger" title="Couldn't refresh scholars" action={onRefresh && <Button size="sm" onClick={onRefresh}>Try again</Button>}>
          {error} Showing the last loaded list.
        </Alert>
      )}

      <KpiGrid columns={3}>
        <KpiCard label="Total scholars" value={kpiValue(scholars.length)} hint="Students with at least one application" icon={Users} loading={firstLoad} />
        <KpiCard label="Returning" value={kpiValue(renewingCount)} hint="Applied in more than one cycle" icon={Repeat} tone="accent" loading={firstLoad} />
        <KpiCard label="First-time" value={kpiValue(scholars.length - renewingCount)} hint="Single application on file" icon={Award} tone="info" loading={firstLoad} />
      </KpiGrid>

      <Card
        flush
        headerSlot={
          <Toolbar>
            <SearchInput value={search} onChange={setSearch} label="Search scholars" placeholder="Search name, student no. or program…" className="flex-1" />
            <Select value={renewalFilter} onChange={v => setRenewalFilter(v as RenewalFilter)} className="md:w-44" label="Filter scholars">
              <option value="all">All scholars</option>
              <option value="renewing">Returning only</option>
              <option value="first_time">First-time only</option>
            </Select>
            <Select value={sort} onChange={v => setSort(v as SortOption)} className="md:w-52" label="Sort scholars">
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
              title="No scholars match your filters"
              description="Try a different search term or filter."
              action={<Button onClick={() => { setSearch(''); setRenewalFilter('all'); }}>Clear filters</Button>}
            />
          ) : (
            <EmptyState
              icon={Users}
              title="No scholars yet"
              description="Students appear here once they submit an application."
              action={onRefresh && <Button variant="primary" icon={RefreshCw} loading={isLoading} onClick={onRefresh}>Refresh</Button>}
            />
          )
        ) : (
          <>
            <div className="hidden md:block">
              <Table label="Scholars">
                <thead>
                  <tr>
                    <Th>Scholar</Th>
                    <Th>Program</Th>
                    <Th className="hidden w-48 lg:table-cell">Cycles</Th>
                    <Th numeric className="w-32">Applications</Th>
                    <Th className="w-44">Latest status</Th>
                    <Th className="w-12"><span className="sr-only">Open</span></Th>
                  </tr>
                </thead>
                <tbody>
                  {pager.pageItems.map(scholar => (
                    <Tr key={scholar.studentNumber} onClick={() => onSelectStudent(scholar.studentNumber)}>
                      <Td>
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar name={scholar.name} avatarUrl={scholar.avatarUrl} size="sm" />
                          <div className="min-w-0">
                            <RowLink onClick={() => onSelectStudent(scholar.studentNumber)}>{scholar.name}</RowLink>
                            <p className="flex items-center gap-1.5 text-xs text-ink-subtle">
                              <span className="tabular-nums">{scholar.studentNumber}</span>
                              {scholar.isRenewing && (
                                <span className="inline-flex items-center gap-1 font-medium text-accent">
                                  <Repeat className="size-3" aria-hidden />Returning
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      </Td>
                      <Td><Truncate className="text-ink">{scholar.program || 'Unspecified'}</Truncate></Td>
                      <Td className="hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">{scholar.cycles.map(c => <Badge key={c}>{c}</Badge>)}</div>
                      </Td>
                      <Td numeric>
                        <span className="font-medium text-ink">{scholar.totalApplications}</span>
                        <span className="block text-xs text-ink-subtle">{scholar.approvedCount} approved</span>
                      </Td>
                      <Td><StatusBadge status={scholar.latestStatus} /></Td>
                      <Td><ChevronRight className="size-4 text-ink-subtle group-hover:text-ink" aria-hidden /></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>

            <MobileList>
              {pager.pageItems.map(scholar => (
                <li key={scholar.studentNumber}>
                  <button type="button" onClick={() => onSelectStudent(scholar.studentNumber)} className="flex w-full items-start gap-3 p-4 text-left hover:bg-surface-muted focus-visible:-outline-offset-2">
                    <Avatar name={scholar.name} avatarUrl={scholar.avatarUrl} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-medium text-ink">{scholar.name}</p>
                        <StatusBadge status={scholar.latestStatus} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-ink-muted">{scholar.program || 'Unspecified'}</p>
                      <p className="mt-0.5 text-xs text-ink-subtle">{plural(scholar.totalApplications, 'application')} · {scholar.cycles.join(', ')}</p>
                    </div>
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
          onChange={setSelectedColumns}
          onConfirm={runExport}
          onCancel={() => setPickerFor(null)}
        />
      )}
    </>
  );
}
