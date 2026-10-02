import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip
} from 'recharts';
import { ArrowDown, ArrowUp, BarChart3, Download, Info } from 'lucide-react';
import { ScholarshipOffice } from '../../types';
import { OFFICE_LABELS, mockScholarships, officeOf } from '../../data/scholarships';
import { AdminApplication, AppStatus, STATUS_OPTIONS } from './adminData';
import {
  Alert, Button, Card, EmptyState, ErrorState, KpiCard, KpiGrid, PageHeader, STATUS_META, Select, Skeleton,
  Table, Td, TextInput, Th, Tooltip, Tr, RowLink, tokenColor
} from './AdminUI';

interface AdminAnalyticsProps {
  applications: AdminApplication[];
  isLoading?: boolean;
  error?: string;
  onRefresh?: () => void;
  // The signed-in admin's office; the table names other offices only.
  ownOffice: ScholarshipOffice;
  // Opens the Applications list filtered to one scholarship.
  onViewScholarship: (scholarshipId: string) => void;
  id?: string;
}

// --- Dates -----------------------------------------------------------------------
// All bucketing uses LOCAL calendar days. Keys are built from local date
// parts, never toISOString(), which converts to UTC and shifts dates.

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

// Monday of the week containing `d` (weeks start on Monday).
function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  return addDays(day, -((day.getDay() + 6) % 7));
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDayKey(key: string): Date | null {
  const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

// Calendar days between two local midnights (DST-safe).
function daysBetween(a: Date, b: Date): number {
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY_MS);
}

const fmtDay = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtDayYear = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// "Sep 22–28", "Sep 29–Oct 5", or "Oct 1" for a one-day bucket.
function bucketLabel(first: Date, last: Date): string {
  if (dayKey(first) === dayKey(last)) return fmtDay(first);
  if (first.getMonth() === last.getMonth()) return `${fmtDay(first)}–${last.getDate()}`;
  return `${fmtDay(first)}–${fmtDay(last)}`;
}

// --- Ranges ----------------------------------------------------------------------

type RangeKey = '7d' | '30d' | 'semester' | 'schoolYear' | 'custom';

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'semester', label: 'This semester' },
  { key: 'schoolYear', label: 'This school year' },
  { key: 'custom', label: 'Custom' }
];

// DLSU-D academic calendar, by month (0 = January). The school year starts
// in August: 1st semester Aug–Dec, 2nd semester Jan–May, midyear Jun–Jul.
const SCHOOL_YEAR_START_MONTH = 7;
const TERMS: { startMonth: number; endMonth: number }[] = [
  { startMonth: 7, endMonth: 11 },
  { startMonth: 0, endMonth: 4 },
  { startMonth: 5, endMonth: 6 }
];

// A range is [start, endExclusive) in local time.
interface DateRange { start: Date; endExclusive: Date }

function resolveRange(key: RangeKey, custom: { from: string; to: string }, now = new Date()): DateRange {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  switch (key) {
    case '7d':
      return { start: addDays(today, -6), endExclusive: tomorrow };
    case '30d':
      return { start: addDays(today, -29), endExclusive: tomorrow };
    case 'semester': {
      const month = today.getMonth();
      const term = TERMS.find(t => month >= t.startMonth && month <= t.endMonth) ?? TERMS[0];
      return { start: new Date(today.getFullYear(), term.startMonth, 1), endExclusive: tomorrow };
    }
    case 'schoolYear': {
      const year = today.getMonth() >= SCHOOL_YEAR_START_MONTH ? today.getFullYear() : today.getFullYear() - 1;
      return { start: new Date(year, SCHOOL_YEAR_START_MONTH, 1), endExclusive: tomorrow };
    }
    case 'custom': {
      const from = parseDayKey(custom.from) ?? addDays(today, -29);
      const to = parseDayKey(custom.to) ?? today;
      const [a, b] = from <= to ? [from, to] : [to, from];
      return { start: a, endExclusive: addDays(b, 1) };
    }
  }
}

function describeRange(range: DateRange): string {
  const last = addDays(range.endExclusive, -1);
  if (dayKey(range.start) === dayKey(last)) return fmtDayYear(last);
  return range.start.getFullYear() === last.getFullYear()
    ? `${fmtDay(range.start)} – ${fmtDayYear(last)}`
    : `${fmtDayYear(range.start)} – ${fmtDayYear(last)}`;
}

function inRange(iso: string, range: DateRange): boolean {
  const t = new Date(iso).getTime();
  return t >= range.start.getTime() && t < range.endExclusive.getTime();
}

// --- Submissions series ------------------------------------------------------------
// Ranges over 14 days are bucketed by week (Monday start), shorter ones by
// day. Every bucket in the range is created up front so empty weeks/days
// show as zero, and edge weeks are clipped to the range (their label says so).

interface Bucket { key: string; label: string; count: number }

function buildSubmissionSeries(apps: AdminApplication[], range: DateRange): { buckets: Bucket[]; unit: 'day' | 'week' } {
  const unit = daysBetween(range.start, range.endExclusive) > 14 ? 'week' : 'day';
  const buckets: Bucket[] = [];
  const byKey = new Map<string, Bucket>();
  let cursor = unit === 'week' ? startOfWeek(range.start) : range.start;
  while (cursor < range.endExclusive) {
    const next = addDays(cursor, unit === 'week' ? 7 : 1);
    const first = cursor < range.start ? range.start : cursor;
    const last = addDays(next > range.endExclusive ? range.endExclusive : next, -1);
    const bucket = { key: dayKey(cursor), label: bucketLabel(first, last), count: 0 };
    buckets.push(bucket);
    byKey.set(bucket.key, bucket);
    cursor = next;
  }
  apps.forEach(app => {
    const created = new Date(app.createdAt);
    if (Number.isNaN(created.getTime())) return;
    const key = dayKey(unit === 'week' ? startOfWeek(created) : startOfDay(created));
    const bucket = byKey.get(key);
    if (bucket) bucket.count += 1;
  });
  return { buckets, unit };
}

// --- Metrics -----------------------------------------------------------------------

const isDecided = (s: AppStatus) => s === 'Approved' || s === 'Rejected';

// Days from submission to the LAST final decision (Approved / Rejected) in
// the history, so revision loops before the decision count toward it.
function decisionDays(app: AdminApplication): number | null {
  const finals = (app.history ?? []).filter(h => isDecided(h.status as AppStatus));
  const decision = finals[finals.length - 1];
  if (!decision) return null;
  const start = new Date(app.createdAt).getTime();
  const end = new Date(decision.changedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return (end - start) / DAY_MS;
}

// Revision requests before the final decision, for decided applications.
function revisionCycles(app: AdminApplication): number | null {
  const history = app.history ?? [];
  if (!history.some(h => isDecided(h.status as AppStatus))) return null;
  return history.filter(h => h.status === 'Needs Revision').length;
}

const average = (values: (number | null)[]): number | null => {
  const nums = values.filter((v): v is number => v !== null);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
};

function countStatuses(apps: AdminApplication[]): Record<AppStatus, number> {
  const counts = Object.fromEntries(STATUS_OPTIONS.map(s => [s, 0])) as Record<AppStatus, number>;
  apps.forEach(a => { if (a.status in counts) counts[a.status] += 1; });
  return counts;
}

const SMALL_SAMPLE = 10;

const STATUS_LABELS: Record<AppStatus, string> = {
  'Under Evaluation': 'Under evaluation',
  'Needs Revision': 'Needs revision',
  'Approved': 'Approved',
  'Rejected': 'Rejected'
};

const formatDays = (days: number | null) => (days === null ? '—' : `${days.toFixed(1)} ${days.toFixed(1) === '1.0' ? 'day' : 'days'}`);
const formatCycles = (n: number | null) => (n === null ? '—' : n.toFixed(1));

// --- Per-scholarship table ------------------------------------------------------------

interface ScholarshipRow {
  id: string;
  name: string;
  office: ScholarshipOffice;
  submissions: number;
  approved: number;
  rejected: number;
  // Not decided yet: under evaluation or needs revision.
  pending: number;
  avgDecisionDays: number | null;
  avgRevisionCycles: number | null;
}

type SortKey = 'name' | 'office' | 'submissions' | 'approved' | 'rejected' | 'pending' | 'avgDecisionDays' | 'avgRevisionCycles';

function buildScholarshipRows(apps: AdminApplication[]): ScholarshipRow[] {
  const groups = new Map<string, AdminApplication[]>();
  apps.forEach(a => groups.set(a.scholarshipId, [...(groups.get(a.scholarshipId) ?? []), a]));
  return Array.from(groups.entries()).map(([id, group]) => {
    const registry = mockScholarships.find(s => s.id === id);
    const counts = countStatuses(group);
    return {
      id,
      name: registry?.name ?? group[0].scholarshipName,
      office: registry ? officeOf(registry) : ((group[0].office as ScholarshipOffice | undefined) ?? 'LSO'),
      submissions: group.length,
      approved: counts.Approved,
      rejected: counts.Rejected,
      pending: counts['Under Evaluation'] + counts['Needs Revision'],
      avgDecisionDays: average(group.map(decisionDays)),
      avgRevisionCycles: average(group.map(revisionCycles))
    };
  });
}

function sortRows(rows: ScholarshipRow[], key: SortKey, dir: 'asc' | 'desc'): ScholarshipRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = key === 'office' ? OFFICE_LABELS[a.office] : a[key];
    const vb = key === 'office' ? OFFICE_LABELS[b.office] : b[key];
    // Missing averages always sort last.
    if (va === null && vb !== null) return 1;
    if (vb === null && va !== null) return -1;
    if (typeof va === 'string' && typeof vb === 'string') return sign * va.localeCompare(vb) || a.name.localeCompare(b.name);
    return sign * (((va as number) ?? 0) - ((vb as number) ?? 0)) || a.name.localeCompare(b.name);
  });
}

function toCsv(rows: ScholarshipRow[], includeOffice: boolean): string {
  const header = ['Scholarship', ...(includeOffice ? ['Office'] : []), 'Submissions', 'Approved', 'Rejected', 'Pending', 'Avg. decision time (days)', 'Avg. revision cycles'];
  const cell = (v: string | number | null) => {
    const text = v === null ? '' : String(v);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = rows.map(r => [
    r.name,
    ...(includeOffice ? [OFFICE_LABELS[r.office]] : []),
    r.submissions, r.approved, r.rejected, r.pending,
    r.avgDecisionDays === null ? null : r.avgDecisionDays.toFixed(1),
    r.avgRevisionCycles === null ? null : r.avgRevisionCycles.toFixed(1)
  ].map(cell).join(','));
  return [header.map(cell).join(','), ...lines].join('\r\n');
}

function downloadCsv(filename: string, csv: string) {
  // BOM so Excel opens UTF-8 (ñ, en dashes) correctly.
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// --- Page ----------------------------------------------------------------------------

// Refetch on range change and window focus, at most this often.
const REFETCH_AFTER_MS = 30_000;

export default function AdminAnalytics({ applications, isLoading, error, onRefresh, ownOffice, onViewScholarship, id }: AdminAnalyticsProps) {
  const [rangeKey, setRangeKey] = useState<RangeKey>('30d');
  const [custom, setCustom] = useState(() => {
    const today = startOfDay(new Date());
    return { from: dayKey(addDays(today, -29)), to: dayKey(today) };
  });
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'submissions', dir: 'desc' });

  // The applications are loaded by the dashboard; ask it for fresh data when
  // the range changes or the admin returns to the tab.
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

  const changeRange = (key: RangeKey) => {
    setRangeKey(key);
    refreshIfStale();
  };

  const range = useMemo(() => resolveRange(rangeKey, custom), [rangeKey, custom]);
  const scoped = useMemo(() => applications.filter(a => inRange(a.createdAt, range)), [applications, range]);

  const counts = useMemo(() => countStatuses(scoped), [scoped]);
  const decided = counts.Approved + counts.Rejected;
  const avgDecision = useMemo(() => average(scoped.map(decisionDays)), [scoped]);
  const series = useMemo(() => buildSubmissionSeries(scoped, range), [scoped, range]);

  const rows = useMemo(() => buildScholarshipRows(scoped), [scoped]);
  const sortedRows = useMemo(() => sortRows(rows, sort.key, sort.dir), [rows, sort]);
  const showOffice = rows.some(r => r.office !== ownOffice);

  const colors = useMemo(() => ({
    accent: tokenColor('accent', '#006937'),
    grid: tokenColor('line', '#e2e8f0'),
    axis: tokenColor('ink-subtle', '#64748b'),
    hover: tokenColor('surface-muted', '#f8fafc'),
    status: Object.fromEntries(STATUS_OPTIONS.map(s => [s, tokenColor(STATUS_META[s].token, '#94a3b8')])) as Record<AppStatus, string>
  }), []);

  const hasData = applications.length > 0;
  const firstLoad = !!isLoading && !hasData;
  const failedEmpty = !!error && !hasData && !isLoading;
  const rangeText = describeRange(range);

  const exportCsv = () => {
    const last = addDays(range.endExclusive, -1);
    downloadCsv(`scholarship-statistics_${dayKey(range.start)}_to_${dayKey(last)}.csv`, toCsv(sortedRows, showOffice));
  };

  const toggleSort = (key: SortKey) => {
    setSort(prev => (prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      // Text sorts A→Z first; numbers biggest first.
      : { key, dir: key === 'name' || key === 'office' ? 'asc' : 'desc' }));
  };

  const header = (
    <PageHeader
      title="Statistics"
      description="Submissions, outcomes and review times for the applications your office handles."
      meta={!firstLoad && <span className="text-xs text-ink-subtle">Showing {rangeText}</span>}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {rangeKey === 'custom' && (
            <>
              <TextInput
                type="date"
                aria-label="From"
                value={custom.from}
                max={custom.to}
                onChange={e => e.target.value && setCustom(c => ({ ...c, from: e.target.value }))}
                className="w-40"
              />
              <span className="text-sm text-ink-subtle" aria-hidden>to</span>
              <TextInput
                type="date"
                aria-label="To"
                value={custom.to}
                min={custom.from}
                onChange={e => e.target.value && setCustom(c => ({ ...c, to: e.target.value }))}
                className="w-40"
              />
            </>
          )}
          <Select value={rangeKey} onChange={v => changeRange(v as RangeKey)} className="w-44" label="Date range" disabled={firstLoad}>
            {RANGE_OPTIONS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </Select>
        </div>
      }
    />
  );

  let body: React.ReactNode;
  if (firstLoad) {
    body = (
      <div role="status" aria-label="Loading statistics" className="space-y-6">
        <KpiGrid>
          {['Submissions', 'Decided', 'Approval rate', 'Avg. time to decision'].map(label => (
            <KpiCard key={label} label={label} value="" loading />
          ))}
        </KpiGrid>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
          <Card className="lg:col-span-2"><Skeleton className="h-64 w-full" /></Card>
          <Card><Skeleton className="h-40 w-full" /></Card>
        </div>
      </div>
    );
  } else if (failedEmpty) {
    body = <Card flush><ErrorState title="Couldn't load statistics" message={error} onRetry={onRefresh} retrying={isLoading} /></Card>;
  } else if (scoped.length === 0) {
    body = (
      <Card flush>
        <EmptyState
          icon={BarChart3}
          title={hasData ? 'No submissions in this range' : 'No applications yet'}
          description={hasData ? `No applications were submitted in this range (${rangeText}). Try a longer range.` : 'Statistics appear once students start applying.'}
          action={hasData && rangeKey !== 'schoolYear'
            ? <Button onClick={() => changeRange('schoolYear')}>Show this school year</Button>
            : undefined}
        />
      </Card>
    );
  } else {
    const approvalRate = decided > 0 ? Math.round((counts.Approved / decided) * 100) : null;
    const maxCount = Math.max(...series.buckets.map(b => b.count));
    body = (
      <>
        <KpiGrid>
          <KpiCard label="Submissions" value={scoped.length} hint={rangeText} />
          <KpiCard label="Decided" value={decided} hint={`approved ${counts.Approved} · rejected ${counts.Rejected}`} />
          <KpiCard
            label="Approval rate"
            value={approvalRate === null ? '—' : (
              <>
                {approvalRate}%
                <span className="ml-2 text-sm font-normal tracking-normal text-ink-subtle">{counts.Approved} of {decided}</span>
              </>
            )}
            hint={decided === 0 ? 'No decisions yet' : decided < SMALL_SAMPLE ? 'Small sample — read with care' : 'Of decided applications'}
          />
          <KpiCard label="Avg. time to decision" value={formatDays(avgDecision)} hint="Submission to final decision" />
        </KpiGrid>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
          <Card
            title="Submissions"
            description={series.unit === 'week' ? 'Per week (Monday to Sunday)' : 'Per day'}
            className="lg:col-span-2"
          >
            <div className="h-64 sm:h-72" role="img" aria-label={`Submissions per ${series.unit}, ${rangeText}: ${series.buckets.map(b => `${b.label} ${b.count}`).join(', ')}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series.buckets} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barCategoryGap="20%">
                  <CartesianGrid stroke={colors.grid} strokeOpacity={0.7} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: colors.axis }} axisLine={false} tickLine={false} minTickGap={12} interval="preserveStartEnd" />
                  <YAxis
                    tick={{ fontSize: 12, fill: colors.axis }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    domain={[0, Math.max(4, maxCount)]}
                  />
                  <ChartTooltip cursor={{ fill: colors.hover }} content={<SubmissionsTooltip />} />
                  <Bar dataKey="count" name="Submissions" fill={colors.accent} radius={[3, 3, 0, 0]} maxBarSize={40} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Status" description={`${scoped.length} ${scoped.length === 1 ? 'application' : 'applications'}`}>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-neutral-bg" aria-hidden>
              {STATUS_OPTIONS.map(status => counts[status] > 0 && (
                <div key={status} style={{ width: `${(counts[status] / scoped.length) * 100}%`, backgroundColor: colors.status[status] }} />
              ))}
            </div>
            <ul className="mt-4 divide-y divide-line">
              {STATUS_OPTIONS.map(status => {
                const n = counts[status];
                return (
                  <li key={status} className={`flex items-center justify-between gap-3 py-2 text-sm ${n === 0 ? 'text-ink-subtle' : 'text-ink'}`}>
                    <span className="flex items-center gap-2">
                      <span aria-hidden className={`size-2.5 shrink-0 rounded-sm ${n === 0 ? 'opacity-40' : ''}`} style={{ backgroundColor: colors.status[status] }} />
                      {STATUS_LABELS[status]}
                    </span>
                    <span className="tabular-nums">
                      <span className={n === 0 ? '' : 'font-medium'}>{n}</span>
                      <span className="ml-2 inline-block w-9 text-right text-xs text-ink-subtle">{Math.round((n / scoped.length) * 100)}%</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        <Card
          flush
          title="By scholarship"
          description="Applications submitted in this range. Select a scholarship to see its applications."
          actions={<Button size="sm" icon={Download} onClick={exportCsv}>Export CSV</Button>}
        >
          <Table label="Applications by scholarship" minWidth={showOffice ? '56rem' : '48rem'}>
            <thead>
              <tr>
                <SortTh label="Scholarship" sortKey="name" sort={sort} onSort={toggleSort} />
                {showOffice && <SortTh label="Office" sortKey="office" sort={sort} onSort={toggleSort} className="w-32" />}
                <SortTh label="Submissions" sortKey="submissions" sort={sort} onSort={toggleSort} numeric className="w-28" />
                <SortTh label="Approved" sortKey="approved" sort={sort} onSort={toggleSort} numeric className="w-24" />
                <SortTh label="Rejected" sortKey="rejected" sort={sort} onSort={toggleSort} numeric className="w-24" />
                <SortTh
                  label="Pending"
                  sortKey="pending"
                  sort={sort}
                  onSort={toggleSort}
                  numeric
                  className="w-24"
                  hint="Under evaluation or needs revision"
                />
                <SortTh label="Avg. decision" sortKey="avgDecisionDays" sort={sort} onSort={toggleSort} numeric className="w-32" />
                <SortTh label="Avg. revisions" sortKey="avgRevisionCycles" sort={sort} onSort={toggleSort} numeric className="w-32" />
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(r => (
                <Tr key={r.id} onClick={() => onViewScholarship(r.id)}>
                  <Td><RowLink onClick={() => onViewScholarship(r.id)}>{r.name}</RowLink></Td>
                  {showOffice && (
                    <Td><span className="block truncate">{r.office === ownOffice ? '' : OFFICE_LABELS[r.office]}</span></Td>
                  )}
                  <Td numeric><span className="font-medium text-ink">{r.submissions}</span></Td>
                  <Td numeric><Count n={r.approved} /></Td>
                  <Td numeric><Count n={r.rejected} /></Td>
                  <Td numeric><Count n={r.pending} /></Td>
                  <Td numeric>{formatDays(r.avgDecisionDays)}</Td>
                  <Td numeric>{formatCycles(r.avgRevisionCycles)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </>
    );
  }

  return (
    <div id={id} className="space-y-6">
      {header}
      {error && hasData && (
        <Alert tone="danger" title="Couldn't refresh statistics" action={onRefresh && <Button size="sm" onClick={onRefresh}>Try again</Button>}>
          {error} Showing the last loaded data.
        </Alert>
      )}
      {body}
    </div>
  );
}

// Zero counts are muted so the numbers that matter stand out.
function Count({ n }: { n: number }) {
  return <span className={n === 0 ? 'text-ink-subtle' : 'text-ink'}>{n}</span>;
}

function SortTh({ label, sortKey, sort, onSort, numeric, className = '', hint }: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  onSort: (key: SortKey) => void;
  numeric?: boolean;
  className?: string;
  hint?: string;
}) {
  const active = sort.key === sortKey;
  const Arrow = sort.dir === 'asc' ? ArrowUp : ArrowDown;
  const button = (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-1 rounded-badge font-medium hover:text-ink ${active ? 'text-ink' : ''} ${numeric ? 'flex-row-reverse' : ''}`}
    >
      {label}
      <Arrow className={`size-3 shrink-0 ${active ? '' : 'invisible'}`} aria-hidden />
    </button>
  );
  return (
    <Th sticky={false} numeric={numeric} className={className} sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      {hint ? <span className="inline-flex items-center gap-1">{button}<Tooltip content={hint} className="text-ink-subtle"><Info className="size-3.5" aria-hidden /><span className="sr-only">{hint}</span></Tooltip></span> : button}
    </Th>
  );
}

function SubmissionsTooltip({ active, payload, label }: { active?: boolean; payload?: { value?: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const n = Number(payload[0].value ?? 0);
  return (
    <div className="rounded-control bg-ink px-2.5 py-1.5 text-xs text-surface shadow-overlay">
      <p className="font-medium">{label}</p>
      <p className="tabular-nums">{n} {n === 1 ? 'submission' : 'submissions'}</p>
    </div>
  );
}
