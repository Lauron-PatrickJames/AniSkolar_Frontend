import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip
} from 'recharts';
import { ArrowDown, ArrowUp, BarChart3, Download, Info, UserCheck, UserRound, Users } from 'lucide-react';
import { ScholarshipOffice } from '../../types';
import { OFFICE_LABELS, mockScholarships, officeOf } from '../../data/scholarships';
import { COLLEGES, YEAR_LEVELS, collegeName, findProgram } from '../../data/programs';
import { API_BASE_URL, AdminApplication, AppStatus, CYCLE_START_MONTH, STATUS_OPTIONS, authHeaders } from './adminData';
import {
  Alert, Button, Card, EmptyState, ErrorState, KpiCard, KpiGrid, PageHeader, STATUS_META, SegmentedControl, Select, Skeleton,
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
  // AdSO: loads sign-ups (GET /api/students) for the Students card.
  getToken?: () => Promise<string | null>;
  onOpenStudents?: () => void;
  id?: string;
}

interface SignUp { joinedAt: string | null; applications: number; lastAppliedAt: string | null; college: string | null; yearLevel: string | null; programCode: string | null }

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

// DLSU-D academic calendar, by month (0 = January): 1st semester Aug–Dec,
// 2nd semester Jan–May, midyear Jun–Jul. "This school year" follows the
// scholarship cycle (CYCLE_START_MONTH, June) rather than the August class
// start, so it includes the June application window for that year.
const SCHOOL_YEAR_START_MONTH = CYCLE_START_MONTH;
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

// The same number of days just before `range`, for "vs previous" changes.
function previousRange(range: DateRange): DateRange {
  const days = daysBetween(range.start, range.endExclusive);
  return { start: addDays(range.start, -days), endExclusive: range.start };
}

// "+3 vs previous 30 days", "no change vs …", or null when there's nothing to compare.
function deltaText(now: number, before: number, days: number, unit = ''): React.ReactNode {
  const span = `previous ${days} ${days === 1 ? 'day' : 'days'}`;
  if (now === 0 && before === 0) return null;
  const diff = Math.round((now - before) * 10) / 10;
  if (diff === 0) return <span>No change vs {span}</span>;
  const up = diff > 0;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex items-center font-medium ${up ? 'text-success-fg' : 'text-danger-fg'}`}>
        {up ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />}
        {Math.abs(diff)}{unit}
      </span>
      vs {span}
    </span>
  );
}

const gpaOf = (a: AdminApplication): number | null => {
  const n = Number(a.currentProfile?.gpa);
  return Number.isFinite(n) && n > 0 ? n : null;
};

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

interface Bucket { key: string; label: string; count: number; approved: number; rejected: number }

// A dated event for the chart; `kind` splits decisions into approved / rejected.
interface ChartEvent { at: string; kind?: 'approved' | 'rejected' }

function buildSeries(events: ChartEvent[], range: DateRange): { buckets: Bucket[]; unit: 'day' | 'week' } {
  const unit = daysBetween(range.start, range.endExclusive) > 14 ? 'week' : 'day';
  const buckets: Bucket[] = [];
  const byKey = new Map<string, Bucket>();
  let cursor = unit === 'week' ? startOfWeek(range.start) : range.start;
  while (cursor < range.endExclusive) {
    const next = addDays(cursor, unit === 'week' ? 7 : 1);
    const first = cursor < range.start ? range.start : cursor;
    const last = addDays(next > range.endExclusive ? range.endExclusive : next, -1);
    const bucket = { key: dayKey(cursor), label: bucketLabel(first, last), count: 0, approved: 0, rejected: 0 };
    buckets.push(bucket);
    byKey.set(bucket.key, bucket);
    cursor = next;
  }
  events.forEach(e => {
    const at = new Date(e.at);
    if (Number.isNaN(at.getTime()) || !inRange(e.at, range)) return;
    const bucket = byKey.get(dayKey(unit === 'week' ? startOfWeek(at) : startOfDay(at)));
    if (!bucket) return;
    bucket.count += 1;
    if (e.kind) bucket[e.kind] += 1;
  });
  return { buckets, unit };
}

// The date and outcome of an application's last final decision.
function finalDecision(app: AdminApplication): ChartEvent | null {
  const finals = (app.history ?? []).filter(h => h.status === 'Approved' || h.status === 'Rejected');
  const last = finals[finals.length - 1];
  return last ? { at: last.changedAt, kind: last.status === 'Approved' ? 'approved' : 'rejected' } : null;
}

type ChartMetric = 'Submissions' | 'Decisions' | 'Sign-ups';
const METRIC_TEXT: Record<ChartMetric, { one: string; many: string; about: string }> = {
  Submissions: { one: 'submission', many: 'submissions', about: 'Applications received' },
  Decisions: { one: 'decision', many: 'decisions', about: 'Approved and rejected, by the date of the decision' },
  'Sign-ups': { one: 'sign-up', many: 'sign-ups', about: 'Students who set up a profile' },
};

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

const formatDays = (days: number | null) => {
  if (days === null) return '—';
  if (days < 1) {
    const hours = Math.round(days * 24);
    return hours < 1 ? 'Under an hour' : `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  return `${days.toFixed(1)} ${days.toFixed(1) === '1.0' ? 'day' : 'days'}`;
};
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
  // Applicants' profile GPA (1st years without one are left out).
  avgGpa: number | null;
}

type SortKey = 'name' | 'office' | 'submissions' | 'approved' | 'rejected' | 'pending' | 'avgDecisionDays' | 'avgRevisionCycles' | 'avgGpa';

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
      avgRevisionCycles: average(group.map(revisionCycles)),
      avgGpa: average(group.map(gpaOf))
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
  const header = ['Scholarship', ...(includeOffice ? ['Office'] : []), 'Submissions', 'Approved', 'Rejected', 'Pending', 'Avg. decision time (days)', 'Avg. revision cycles', 'Avg. applicant GPA'];
  const cell = (v: string | number | null) => {
    const text = v === null ? '' : String(v);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = rows.map(r => [
    r.name,
    ...(includeOffice ? [OFFICE_LABELS[r.office]] : []),
    r.submissions, r.approved, r.rejected, r.pending,
    r.avgDecisionDays === null ? null : r.avgDecisionDays.toFixed(1),
    r.avgRevisionCycles === null ? null : r.avgRevisionCycles.toFixed(1),
    r.avgGpa === null ? null : r.avgGpa.toFixed(2)
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

// --- Breakdown ----------------------------------------------------------------------
// The chart's metric for the range, grouped by college, year level, program
// or scholarship. `part` is the outcome that matters: approved (of
// submissions or decisions) or applied (of sign-ups).

type Dimension = 'College' | 'Year level' | 'Program' | 'Scholarship';

interface Groupable { college?: string | null; yearLevel?: string | null; programCode?: string | null; scholarshipId?: string; scholarshipName?: string; part: boolean }
interface BreakdownRow { key: string; label: string; title?: string; total: number; part: number }

const NOT_SET = 'Not set';
const MAX_PROGRAM_ROWS = 10;

function groupOf(item: Groupable, by: Dimension): { key: string; label: string; title?: string } {
  if (by === 'College') return item.college ? { key: item.college, label: item.college, title: collegeName(item.college) } : { key: NOT_SET, label: NOT_SET };
  if (by === 'Year level') return { key: item.yearLevel || NOT_SET, label: item.yearLevel || NOT_SET };
  if (by === 'Program') {
    const program = findProgram(item.programCode);
    return program ? { key: program.code, label: program.code, title: program.name } : { key: NOT_SET, label: NOT_SET };
  }
  const name = item.scholarshipName ?? item.scholarshipId ?? NOT_SET;
  return { key: item.scholarshipId ?? name, label: name.match(/\(([^)]+)\)\s*$/)?.[1] ?? name, title: name };
}

function buildBreakdown(items: Groupable[], by: Dimension): BreakdownRow[] {
  const map = new Map<string, BreakdownRow>();
  for (const item of items) {
    const g = groupOf(item, by);
    const row = map.get(g.key) ?? { ...g, total: 0, part: 0 };
    row.total += 1;
    if (item.part) row.part += 1;
    map.set(g.key, row);
  }
  let rows = [...map.values()];
  if (by === 'Year level') {
    const order = (k: string) => (YEAR_LEVELS.indexOf(k) < 0 ? 99 : YEAR_LEVELS.indexOf(k));
    rows.sort((a, b) => order(a.key) - order(b.key));
  } else if (by === 'College') {
    const codes = Object.keys(COLLEGES);
    const order = (k: string) => (codes.indexOf(k) < 0 ? 99 : codes.indexOf(k));
    rows.sort((a, b) => b.total - a.total || order(a.key) - order(b.key));
  } else {
    rows.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  }
  if (by === 'Program' && rows.length > MAX_PROGRAM_ROWS) {
    const rest = rows.slice(MAX_PROGRAM_ROWS - 1);
    rows = [...rows.slice(0, MAX_PROGRAM_ROWS - 1), { key: 'others', label: `Others (${rest.length} programs)`, total: rest.reduce((n, r) => n + r.total, 0), part: rest.reduce((n, r) => n + r.part, 0) }];
  }
  return rows;
}

// --- Page ----------------------------------------------------------------------------

// Refetch on range change and window focus, at most this often.
const REFETCH_AFTER_MS = 30_000;

export default function AdminAnalytics({ applications, isLoading, error, onRefresh, ownOffice, onViewScholarship, getToken, onOpenStudents, id }: AdminAnalyticsProps) {
  // Sign-ups (AdSO), for the Students card.
  const [signUps, setSignUps] = useState<SignUp[] | null>(null);
  useEffect(() => {
    if (!getToken) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/students`, { headers: await authHeaders(getToken) });
        const body = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) setSignUps(body.students ?? []);
      } catch { /* the card just doesn't show */ }
    })();
    return () => { cancelled = true; };
  }, [getToken]);
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
  // Applications only: scholars an office added without an application
  // (the SDO's tryouts) aren't submissions and have no decision time.
  const inPeriod = useMemo(() => applications.filter(a => inRange(a.createdAt, range)), [applications, range]);
  const scoped = useMemo(() => inPeriod.filter(a => !a.awardedDirectly), [inPeriod]);
  const directAwards = inPeriod.length - scoped.length;
  // Approved, then declined by the student (they chose another scholarship).
  const declined = useMemo(() => scoped.filter(a => a.status === 'Approved' && a.endReason === 'Declined').length, [scoped]);
  const signUpStats = useMemo(() => {
    if (!signUps) return null;
    const joined = signUps.filter(s => s.joinedAt && inRange(s.joinedAt, range));
    const applied = joined.filter(s => s.applications > 0).length;
    return { joined: joined.length, applied, notApplied: joined.length - applied, total: signUps.length, totalNotApplied: signUps.filter(s => s.applications === 0).length };
  }, [signUps, range]);

  const counts = useMemo(() => countStatuses(scoped), [scoped]);

  // The same length of time just before, for the changes on the cards.
  const prev = useMemo(() => {
    const r = previousRange(range);
    const apps = applications.filter(a => !a.awardedDirectly && inRange(a.createdAt, r));
    const c = countStatuses(apps);
    const dec = c.Approved + c.Rejected;
    return { submissions: apps.length, decided: dec, rate: dec ? Math.round((c.Approved / dec) * 100) : null, days: daysBetween(r.start, r.endExclusive) };
  }, [applications, range]);

  // Approved SFAG scholars in the range, by grant percentage.
  const sfagLevels = useMemo(() => {
    const approved = scoped.filter(a => a.applicationFormType === 'sfag' && a.status === 'Approved');
    if (!approved.length) return null;
    const levels = [100, 75, 50, 25].map(pct => ({ pct, n: approved.filter(a => a.sfagPercentage === pct).length }));
    return { total: approved.length, levels, unset: approved.filter(a => ![100, 75, 50, 25].includes(Number(a.sfagPercentage))).length };
  }, [scoped]);
  const decided = counts.Approved + counts.Rejected;
  const avgDecision = useMemo(() => average(scoped.map(decisionDays)), [scoped]);
  const [metric, setMetric] = useState<ChartMetric>('Submissions');
  const metrics: ChartMetric[] = signUps ? ['Submissions', 'Decisions', 'Sign-ups'] : ['Submissions', 'Decisions'];
  const series = useMemo(() => {
    if (metric === 'Decisions') {
      return buildSeries(applications.filter(a => !a.awardedDirectly).map(finalDecision).filter((e): e is ChartEvent => !!e), range);
    }
    if (metric === 'Sign-ups') {
      return buildSeries((signUps ?? []).filter(s => s.joinedAt).map(s => ({ at: s.joinedAt! })), range);
    }
    return buildSeries(scoped.map(a => ({ at: a.createdAt })), range);
  }, [metric, applications, signUps, scoped, range]);

  const [dimension, setDimension] = useState<Dimension>('College');
  const dimensions: Dimension[] = metric === 'Sign-ups' ? ['College', 'Year level', 'Program'] : ['College', 'Year level', 'Program', 'Scholarship'];
  const shownDimension: Dimension = dimensions.includes(dimension) ? dimension : 'College';
  const breakdown = useMemo(() => {
    const fromApp = (a: AdminApplication, part: boolean): Groupable => ({
      college: a.currentProfile?.college ?? findProgram(a.currentProfile?.programCode)?.college ?? null,
      yearLevel: a.currentProfile?.yearLevel ?? null,
      programCode: a.currentProfile?.programCode ?? null,
      scholarshipId: a.scholarshipId,
      scholarshipName: a.scholarshipName,
      part,
    });
    let items: Groupable[];
    if (metric === 'Sign-ups') {
      items = (signUps ?? []).filter(s => s.joinedAt && inRange(s.joinedAt, range))
        .map(s => ({ college: s.college, yearLevel: s.yearLevel, programCode: s.programCode, part: s.applications > 0 }));
    } else if (metric === 'Decisions') {
      items = applications.filter(a => !a.awardedDirectly).flatMap(a => {
        const d = finalDecision(a);
        return d && inRange(d.at, range) ? [fromApp(a, d.kind === 'approved')] : [];
      });
    } else {
      items = scoped.map(a => fromApp(a, a.status === 'Approved'));
    }
    return buildBreakdown(items, shownDimension);
  }, [metric, signUps, applications, scoped, range, shownDimension]);
  const breakdownMax = Math.max(1, ...breakdown.map(r => r.total));
  const partLabel = metric === 'Sign-ups' ? { part: 'applied', rest: 'not applied yet' } : metric === 'Decisions' ? { part: 'approved', rest: 'rejected' } : { part: 'approved', rest: 'other' };

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

  const hasData = applications.some(a => !a.awardedDirectly);
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
          <KpiCard
            label="Submissions"
            value={scoped.length}
            hint={<>{deltaText(scoped.length, prev.submissions, prev.days) ?? rangeText}{directAwards ? <span className="block">Plus {directAwards} added directly by an office</span> : null}</>}
          />
          <KpiCard label="Decided" value={decided} hint={`approved ${counts.Approved} · rejected ${counts.Rejected}${declined ? ` · ${declined} declined by the student` : ''}`} />
          <KpiCard
            label="Approval rate"
            value={approvalRate === null ? '—' : (
              <>
                {approvalRate}%
                <span className="ml-2 text-sm font-normal tracking-normal text-ink-subtle">{counts.Approved} of {decided}</span>
              </>
            )}
            hint={decided === 0 ? 'No decisions yet' : (
              <>
                {approvalRate !== null && prev.rate !== null && deltaText(approvalRate, prev.rate, prev.days, ' pts')}
                {decided < SMALL_SAMPLE && <span className="block">Small sample — read with care</span>}
              </>
            )}
          />
          <KpiCard label="Avg. time to decision" value={formatDays(avgDecision)} />
        </KpiGrid>

        {sfagLevels && (
            <Card title="SFAG grant levels" description={`${sfagLevels.total} approved in this range · decides duty hours`}>
              <ul className="space-y-2.5">
                {sfagLevels.levels.map(({ pct, n }) => (
                  <li key={pct} className="grid grid-cols-[3.5rem_1fr_2rem] items-center gap-3 text-sm">
                    <span className="font-medium text-ink tabular-nums">{pct}%</span>
                    <span className="h-2.5 overflow-hidden rounded-full bg-neutral-bg" aria-hidden>
                      <span className="block h-full rounded-full" style={{ width: `${(n / sfagLevels.total) * 100}%`, backgroundColor: colors.accent }} />
                    </span>
                    <span className={`text-right tabular-nums ${n ? 'text-ink' : 'text-ink-subtle'}`}>{n}</span>
                  </li>
                ))}
              </ul>
              {sfagLevels.unset > 0 && <p className="mt-3 text-xs text-warning-fg">{sfagLevels.unset} approved without a grant percentage yet.</p>}
            </Card>
          )}

        {signUpStats && (
          <Card
            title="Students"
            description={`Signed up ${rangeText}`}
            actions={onOpenStudents && <Button size="sm" onClick={onOpenStudents}>Open Students</Button>}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                { icon: Users, label: 'Signed up', value: signUpStats.joined, hint: `${signUpStats.total} in all` },
                { icon: UserCheck, label: 'Applied', value: signUpStats.applied, hint: signUpStats.joined ? `${Math.round((signUpStats.applied / signUpStats.joined) * 100)}% of sign-ups` : '—' },
                { icon: UserRound, label: 'Not applied yet', value: signUpStats.notApplied, hint: `${signUpStats.totalNotApplied} in all` },
              ].map(({ icon: Icon, label, value, hint }) => (
                <div key={label} className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-neutral-bg text-ink-muted"><Icon className="size-4" aria-hidden /></span>
                  <div>
                    <p className="text-sm text-ink-muted">{label}</p>
                    <p className="text-xl font-semibold text-ink tabular-nums">{value}</p>
                    <p className="text-xs text-ink-subtle tabular-nums">{hint}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
          <Card
            title={metric}
            description={`${METRIC_TEXT[metric].about} · ${series.unit === 'week' ? 'per week (Monday to Sunday)' : 'per day'}`}
            className="lg:col-span-2"
            actions={
              <SegmentedControl
                options={metrics}
                value={metric}
                onChange={v => v && setMetric(v)}
                label="Show on the chart"
                className="w-auto"
              />
            }
          >
            <div className="h-64 sm:h-72" role="img" aria-label={`${metric} per ${series.unit}, ${rangeText}: ${series.buckets.map(b => `${b.label} ${b.count}`).join(', ')}`}>
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
                  <ChartTooltip cursor={{ fill: colors.hover }} content={<SeriesTooltip metric={metric} />} />
                  {metric === 'Decisions' ? (
                    <>
                      <Bar dataKey="approved" stackId="d" name="Approved" fill={colors.status.Approved} maxBarSize={40} isAnimationActive={false} />
                      <Bar dataKey="rejected" stackId="d" name="Rejected" fill={colors.status.Rejected} radius={[3, 3, 0, 0]} maxBarSize={40} isAnimationActive={false} />
                    </>
                  ) : (
                    <Bar dataKey="count" name={metric} fill={colors.accent} radius={[3, 3, 0, 0]} maxBarSize={40} isAnimationActive={false} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
            {metric === 'Decisions' && (
              <div className="mt-3 flex items-center gap-4 text-xs text-ink-muted">
                <span className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm" style={{ backgroundColor: colors.status.Approved }} />Approved</span>
                <span className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm" style={{ backgroundColor: colors.status.Rejected }} />Rejected</span>
              </div>
            )}
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
                if (status === 'Approved' && declined > 0) {
                  return (
                    <React.Fragment key={status}>
                      <li className="flex items-center justify-between gap-3 py-2 text-sm text-ink">
                        <span className="flex items-center gap-2">
                          <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: colors.status[status] }} />
                          {STATUS_LABELS[status]}
                        </span>
                        <span className="tabular-nums">
                          <span className="font-medium">{n}</span>
                          <span className="ml-2 inline-block w-9 text-right text-xs text-ink-subtle">{Math.round((n / scoped.length) * 100)}%</span>
                        </span>
                      </li>
                      <li className="flex items-center justify-between gap-3 py-2 pl-5 text-sm text-ink-muted">
                        <span>of which declined by the student</span>
                        <span className="tabular-nums"><span>{declined}</span><span className="ml-2 inline-block w-9" /></span>
                      </li>
                    </React.Fragment>
                  );
                }
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
          title="Breakdown"
          description={`${metric} in this range, by ${shownDimension.toLowerCase()}`}
          actions={
            <SegmentedControl
              options={dimensions}
              value={shownDimension}
              onChange={v => v && setDimension(v)}
              label="Break down by"
              className="w-auto"
            />
          }
        >
          {breakdown.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-subtle">No {METRIC_TEXT[metric].many} in this range.</p>
          ) : (
            <>
              <ul className="space-y-2.5">
                {breakdown.map(r => (
                  <li key={r.key} className="grid grid-cols-[minmax(4.5rem,9rem)_1fr_auto] items-center gap-3 text-sm">
                    <span className="truncate font-medium text-ink" title={r.title ?? r.label}>{r.label}</span>
                    <span className="flex h-2.5 overflow-hidden rounded-full bg-neutral-bg" aria-hidden>
                      <span style={{ width: `${(r.part / breakdownMax) * 100}%`, backgroundColor: metric === 'Decisions' ? colors.status.Approved : colors.accent }} />
                      <span style={{ width: `${((r.total - r.part) / breakdownMax) * 100}%`, backgroundColor: metric === 'Decisions' ? colors.status.Rejected : colors.accent, opacity: metric === 'Decisions' ? 1 : 0.35 }} />
                    </span>
                    <span className="w-28 text-right tabular-nums text-ink">
                      {r.total}
                      <span className="ml-1.5 text-xs text-ink-subtle">· {r.part} {partLabel.part}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-ink-muted">
                <span className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm" style={{ backgroundColor: metric === 'Decisions' ? colors.status.Approved : colors.accent }} />{partLabel.part[0].toUpperCase() + partLabel.part.slice(1)}</span>
                <span className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm" style={{ backgroundColor: metric === 'Decisions' ? colors.status.Rejected : colors.accent, opacity: metric === 'Decisions' ? 1 : 0.35 }} />{partLabel.rest[0].toUpperCase() + partLabel.rest.slice(1)}</span>
              </div>
            </>
          )}
        </Card>

        <Card
          flush
          title="By scholarship"
          actions={<Button size="sm" icon={Download} onClick={exportCsv}>Export CSV</Button>}
        >
          <Table label="Applications by scholarship" minWidth={showOffice ? '62rem' : '54rem'}>
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
                />
                <SortTh label="Avg. decision" sortKey="avgDecisionDays" sort={sort} onSort={toggleSort} numeric className="w-32" />
                <SortTh label="Avg. revisions" sortKey="avgRevisionCycles" sort={sort} onSort={toggleSort} numeric className="w-32" />
                <SortTh label="Avg. GPA" sortKey="avgGpa" sort={sort} onSort={toggleSort} numeric className="w-24" hint="Applicants' cumulative GPA from their profiles (incoming freshmen have none)." />
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
                  <Td numeric>{r.avgGpa === null ? '—' : r.avgGpa.toFixed(2)}</Td>
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

function SeriesTooltip({ active, payload, label, metric }: { active?: boolean; payload?: { payload?: Bucket }[]; label?: string; metric: ChartMetric }) {
  const b = payload?.[0]?.payload;
  if (!active || !b) return null;
  const words = METRIC_TEXT[metric];
  return (
    <div className="rounded-control bg-ink px-2.5 py-1.5 text-xs text-surface shadow-overlay">
      <p className="font-medium">{label}</p>
      <p className="tabular-nums">{b.count} {b.count === 1 ? words.one : words.many}</p>
      {metric === 'Decisions' && b.count > 0 && <p className="tabular-nums opacity-80">{b.approved} approved · {b.rejected} rejected</p>}
    </div>
  );
}
