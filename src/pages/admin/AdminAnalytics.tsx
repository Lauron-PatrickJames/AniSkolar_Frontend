import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';
import { TrendingUp, TrendingDown, Users, Clock, Percent, Timer, RefreshCw, BarChart3 } from 'lucide-react';
import { Button, EmptyState, KpiCard, PageHeader, Panel, SelectInput, SkeletonRows, Tone } from './AdminUI';

// --- Types (mirror AdminDashboard.tsx) -------------------------------------

type AppStatus = 'Under Evaluation' | 'Approved' | 'Rejected' | 'Needs Revision';

interface HistoryEntry {
  status: AppStatus | 'Submitted' | 'Resubmitted';
  note?: string;
  changedBy?: string;
  changedAt: string;
}

interface AdminApplication {
  _id: string;
  studentNumber: string;
  scholarshipId: string;
  scholarshipName: string;
  applicationFormType: 'standard' | 'sfag' | 'polca' | 'alumni';
  status: AppStatus;
  createdAt: string;
  history?: HistoryEntry[];
  standardInfo?: { program: string; yearLevel: string };
  personalInfo?: { course: string; yearLevel: string };
}

interface AdminAnalyticsProps {
  applications: AdminApplication[];
  isLoading?: boolean;
  onRefresh?: () => void;
  id?: string;
}

type RangeOption = '30d' | '90d' | '6m' | '1y' | 'all';

const RANGE_OPTIONS: { key: RangeOption; label: string; days: number | null }[] = [
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
  { key: '6m', label: 'Last 6 months', days: 182 },
  { key: '1y', label: 'Last year', days: 365 },
  { key: 'all', label: 'All time', days: null }
];

const STATUS_COLORS: Record<AppStatus, string> = {
  'Under Evaluation': '#f59e0b',
  'Approved': '#10b981',
  'Rejected': '#f43f5e',
  'Needs Revision': '#0ea5e9'
};

function applicantProgram(app: AdminApplication): string {
  return app.applicationFormType !== 'standard' ? app.personalInfo?.course ?? 'Unspecified' : app.standardInfo?.program ?? 'Unspecified';
}

function withinRange(iso: string, days: number | null): boolean {
  if (days === null) return true;
  const d = new Date(iso).getTime();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return d >= cutoff;
}

// Picks a sensible default range for orgs whose submissions arrive in a
// short burst (e.g. one active month a year) rather than continuously.
// Strategy: find the 30-day window containing the most submissions in the
// last 12 months. If that window holds a large majority of all-time
// submissions, default to the range option that most tightly contains it
// (so the dashboard opens already showing the real activity instead of a
// mostly-empty "last 90 days" or an over-diluted "all time"). Otherwise
// fall back to the previous static default of 90 days.
function pickDefaultRange(applications: AdminApplication[]): RangeOption {
  if (applications.length === 0) return '90d';

  const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
  const timestamps = applications
    .map(a => new Date(a.createdAt).getTime())
    .filter(t => !Number.isNaN(t));
  if (timestamps.length === 0) return '90d';

  const recentTimestamps = timestamps.filter(t => t >= oneYearAgo);
  const pool = recentTimestamps.length > 0 ? recentTimestamps : timestamps;
  const sorted = [...pool].sort((a, b) => a - b);

  // Slide a 30-day window and find the one with the most submissions.
  const windowMs = 30 * 24 * 60 * 60 * 1000;
  let bestCount = 0;
  let bestStart = sorted[0];
  let left = 0;
  for (let right = 0; right < sorted.length; right++) {
    while (sorted[right] - sorted[left] > windowMs) left++;
    const count = right - left + 1;
    if (count > bestCount) {
      bestCount = count;
      bestStart = sorted[left];
    }
  }

  const burstShare = bestCount / timestamps.length;
  if (burstShare < 0.7) return '90d'; // activity isn't clustered enough to bother

  const ageOfBurstDays = (Date.now() - bestStart) / (24 * 60 * 60 * 1000);
  if (ageOfBurstDays <= 30) return '30d';
  if (ageOfBurstDays <= 90) return '90d';
  if (ageOfBurstDays <= 182) return '6m';
  return '1y';
}

// Groups a set of applications into weekly buckets (last N points), each
// bucket counting submissions and each of the four review outcomes reached
// that week (derived from history, falling back to current status if there's
// no history yet — keeps older pre-migration records from disappearing).
function buildWeeklyTrend(applications: AdminApplication[]) {
  const buckets = new Map<string, { week: string; submitted: number; approved: number; rejected: number; revision: number }>();

  const bucketKey = (iso: string) => {
    const d = new Date(iso);
    // Snap to the Monday of that week for a stable, readable label.
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    return monday.toISOString().slice(0, 10);
  };

  applications.forEach(app => {
    const key = bucketKey(app.createdAt);
    if (!buckets.has(key)) buckets.set(key, { week: key, submitted: 0, approved: 0, rejected: 0, revision: 0 });
    buckets.get(key)!.submitted += 1;
  });

  applications.forEach(app => {
    const decisions = (app.history ?? []).filter(h =>
      h.status === 'Approved' || h.status === 'Rejected' || h.status === 'Needs Revision'
    );
    if (decisions.length === 0 && app.status !== 'Under Evaluation') {
      decisions.push({ status: app.status, changedAt: app.createdAt });
    }
    decisions.forEach(h => {
      const key = bucketKey(h.changedAt);
      if (!buckets.has(key)) buckets.set(key, { week: key, submitted: 0, approved: 0, rejected: 0, revision: 0 });
      const bucket = buckets.get(key)!;
      if (h.status === 'Approved') bucket.approved += 1;
      else if (h.status === 'Rejected') bucket.rejected += 1;
      else if (h.status === 'Needs Revision') bucket.revision += 1;
    });
  });

  return Array.from(buckets.values())
    .sort((a, b) => a.week.localeCompare(b.week))
    .slice(-16)
    .map(b => ({
      ...b,
      label: new Date(b.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }));
}

// Average days between an application's createdAt and its FINAL terminal
// decision (Approved/Rejected) — i.e. time to resolution, including however
// many Needs Revision loops happened along the way. Previously this used
// the *first* Approved/Rejected history entry, which is usually also the
// last one, but undercounts cases that bounced through revision more than
// once before landing on a final decision (find() would still grab the
// first terminal entry, which is correct for "first decision" but not for
// "how long did this applicant actually wait" if a revision cycle preceded
// it — so here we deliberately take the LAST terminal entry instead).
function computeAvgProcessingDays(applications: AdminApplication[]): number | null {
  const durations: number[] = [];
  applications.forEach(app => {
    const terminalEntries = (app.history ?? []).filter(h => h.status === 'Approved' || h.status === 'Rejected');
    const decision = terminalEntries[terminalEntries.length - 1];
    if (!decision) return;
    const start = new Date(app.createdAt).getTime();
    const end = new Date(decision.changedAt).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return;
    durations.push((end - start) / (1000 * 60 * 60 * 24));
  });
  if (durations.length === 0) return null;
  return durations.reduce((a, b) => a + b, 0) / durations.length;
}

// How many times, on average, a resolved application was sent back for
// revision before reaching a final decision. Surfaces the revision-loop
// cost that avg processing time alone hides.
function computeAvgRevisionCycles(applications: AdminApplication[]): number | null {
  const counts: number[] = [];
  applications.forEach(app => {
    const hasTerminal = (app.history ?? []).some(h => h.status === 'Approved' || h.status === 'Rejected');
    if (!hasTerminal) return;
    const revisions = (app.history ?? []).filter(h => h.status === 'Needs Revision').length;
    counts.push(revisions);
  });
  if (counts.length === 0) return null;
  return counts.reduce((a, b) => a + b, 0) / counts.length;
}

type Trend = { direction: 'up' | 'down' | 'flat'; text: string };

// Generic percent-delta trend builder shared by every tile, so "vs previous
// period" isn't special-cased to just the Total Submissions tile anymore.
// `higherIsBetter` only affects which arrow color reads as good/bad — the
// arrow direction itself always reflects the actual sign of the change.
function buildTrend(current: number | null, previous: number | null, opts?: { suffix?: string; higherIsBetter?: boolean }): Trend | undefined {
  if (current === null || previous === null || previous === 0) return undefined;
  const delta = ((current - previous) / previous) * 100;
  const direction = delta > 0.5 ? 'up' : delta < -0.5 ? 'down' : 'flat';
  const suffix = opts?.suffix ?? '';
  return {
    direction,
    text: `${delta >= 0 ? '+' : ''}${delta.toFixed(0)}%${suffix} vs previous period`
  };
}

function MetricTile({
  label, value, sub, icon, tone, trend, trendGoodDirection = 'up'
}: {
  label: string; value: string; sub?: string; icon: React.ElementType; tone: Tone;
  trend?: Trend;
  trendGoodDirection?: 'up' | 'down';
}) {
  const isGood = trend && trend.direction === trendGoodDirection;
  const isBad = trend && trend.direction !== 'flat' && trend.direction !== trendGoodDirection;
  return (
    <KpiCard
      label={label}
      value={value}
      hint={sub}
      icon={icon}
      tone={tone}
      footer={trend && (
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${isGood ? 'text-emerald-700' : isBad ? 'text-rose-600' : 'text-slate-500'}`}>
          {trend.direction === 'up' ? <TrendingUp className="w-3.5 h-3.5" /> : trend.direction === 'down' ? <TrendingDown className="w-3.5 h-3.5" /> : null}
          {trend.text}
        </span>
      )}
    />
  );
}

// Ranked horizontal bars as plain HTML: full labels (no axis truncation),
// right-aligned counts, and a share-of-total bar.
function RankedBars({ rows, color, total }: { rows: { name: string; count: number }[]; color: string; total: number }) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">No data for this period.</p>;
  const max = Math.max(...rows.map(r => r.count));
  return (
    <ol className="space-y-3.5">
      {rows.map((row, i) => (
        <li key={row.name}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-slate-700 min-w-0"><span className="text-slate-400 tabular-nums mr-2">{i + 1}</span>{row.name}</span>
            <span className="shrink-0 tabular-nums font-medium text-slate-900">
              {row.count}<span className="text-slate-400 font-normal ml-1.5 text-xs">{total ? Math.round((row.count / total) * 100) : 0}%</span>
            </span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(row.count / max) * 100}%`, backgroundColor: color }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

const TOOLTIP_STYLE = { borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(15,23,42,0.08)' };
const AXIS_TICK = { fontSize: 11, fill: '#94a3b8' };

export default function AdminAnalytics({ applications, isLoading, onRefresh, id }: AdminAnalyticsProps) {
  // Default range now adapts to the data: if submissions cluster into a
  // short burst (e.g. a single active month), open on the window that
  // actually contains that burst instead of a static 90-day default that
  // could land mostly empty or, for 'all time', overly diluted.
  const [range, setRange] = useState<RangeOption | null>(null);
  const effectiveRange: RangeOption = range ?? pickDefaultRange(applications);
  const rangeConfig = RANGE_OPTIONS.find(r => r.key === effectiveRange)!;
  const usedSmartDefault = range === null;

  const scoped = useMemo(
    () => applications.filter(a => withinRange(a.createdAt, rangeConfig.days)),
    [applications, rangeConfig.days]
  );

  // Previous period of equal length, for trend comparisons across every
  // tile (submissions, approval rate, processing time, pending). Skipped
  // ('all time' has no meaningful "previous").
  const previousScoped = useMemo(() => {
    if (rangeConfig.days === null) return null;
    const now = Date.now();
    const start = now - rangeConfig.days * 24 * 60 * 60 * 1000;
    const prevStart = start - rangeConfig.days * 24 * 60 * 60 * 1000;
    return applications.filter(a => {
      const t = new Date(a.createdAt).getTime();
      return t >= prevStart && t < start;
    });
  }, [applications, rangeConfig.days]);

  const computeStats = (set: AdminApplication[]) => {
    const total = set.length;
    const approved = set.filter(a => a.status === 'Approved').length;
    const rejected = set.filter(a => a.status === 'Rejected').length;
    const pending = set.filter(a => a.status === 'Under Evaluation').length;
    const revision = set.filter(a => a.status === 'Needs Revision').length;
    const decided = approved + rejected;
    const approvalRate = decided > 0 ? (approved / decided) * 100 : null;
    return { total, approved, rejected, pending, revision, approvalRate };
  };

  const stats = useMemo(() => computeStats(scoped), [scoped]);
  const previousStats = useMemo(() => (previousScoped ? computeStats(previousScoped) : null), [previousScoped]);

  const avgProcessingDays = useMemo(() => computeAvgProcessingDays(scoped), [scoped]);
  const prevAvgProcessingDays = useMemo(() => (previousScoped ? computeAvgProcessingDays(previousScoped) : null), [previousScoped]);

  const avgRevisionCycles = useMemo(() => computeAvgRevisionCycles(scoped), [scoped]);

  const submissionTrend = useMemo(
    () => (previousScoped ? buildTrend(stats.total, previousScoped.length) : undefined),
    [previousScoped, stats.total]
  );
  const approvalRateTrend = useMemo(
    () => (previousStats ? buildTrend(stats.approvalRate, previousStats.approvalRate, { suffix: ' pts' }) : undefined),
    [previousStats, stats.approvalRate]
  );
  const processingTimeTrend = useMemo(
    () => (prevAvgProcessingDays !== null ? buildTrend(avgProcessingDays, prevAvgProcessingDays) : undefined),
    [avgProcessingDays, prevAvgProcessingDays]
  );
  const pendingTrend = useMemo(
    () => (previousStats ? buildTrend(stats.pending + stats.revision, previousStats.pending + previousStats.revision) : undefined),
    [previousStats, stats.pending, stats.revision]
  );

  const trendData = useMemo(() => buildWeeklyTrend(scoped), [scoped]);

  const statusBreakdown = useMemo(() => {
    const order: AppStatus[] = ['Under Evaluation', 'Approved', 'Rejected', 'Needs Revision'];
    return order
      .map(status => ({ name: status, value: scoped.filter(a => a.status === status).length, color: STATUS_COLORS[status] }))
      .filter(d => d.value > 0);
  }, [scoped]);

  const scholarshipBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    scoped.forEach(a => map.set(a.scholarshipName, (map.get(a.scholarshipName) ?? 0) + 1));
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [scoped]);

  const programBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    scoped.forEach(a => {
      const p = applicantProgram(a);
      map.set(p, (map.get(p) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [scoped]);

  return (
    <div id={id} className="space-y-6">
      <PageHeader
        title="Statistics"
        description="Application volume, outcomes, and processing performance across every scholarship."
        actions={
          <>
            <SelectInput value={effectiveRange} onChange={v => setRange(v as RangeOption)} className="w-52" ariaLabel="Date range">
              {RANGE_OPTIONS.map(r => <option key={r.key} value={r.key}>{r.label}{usedSmartDefault && r.key === effectiveRange ? ' (auto)' : ''}</option>)}
            </SelectInput>
            {onRefresh && <Button icon={RefreshCw} onClick={onRefresh} disabled={isLoading}>Refresh</Button>}
          </>
        }
      />

      {isLoading ? (
        <Panel><SkeletonRows rows={4} /></Panel>
      ) : scoped.length === 0 ? (
        <Panel bodyClassName="p-0">
          <EmptyState icon={BarChart3} title="No applications in this period" description="Try a longer date range." />
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricTile label="Submissions" value={String(stats.total)} sub={rangeConfig.label} icon={Users} tone="slate" trend={submissionTrend} />
            <MetricTile
              label="Approval rate"
              value={stats.approvalRate !== null ? `${stats.approvalRate.toFixed(0)}%` : '—'}
              sub={`${stats.approved} approved of ${stats.approved + stats.rejected} decided`}
              icon={Percent}
              tone="green"
              trend={approvalRateTrend}
            />
            <MetricTile
              label="Avg. time to decision"
              value={avgProcessingDays !== null ? `${avgProcessingDays.toFixed(1)} days` : '—'}
              sub={avgRevisionCycles !== null && avgRevisionCycles > 0 ? `${avgRevisionCycles.toFixed(1)} revision cycles on average` : 'Submission to final decision'}
              icon={Timer}
              tone="sky"
              trend={processingTimeTrend}
              trendGoodDirection="down"
            />
            <MetricTile
              label="Still open"
              value={String(stats.pending + stats.revision)}
              sub={`${stats.pending} awaiting review · ${stats.revision} needs revision`}
              icon={Clock}
              tone="amber"
              trend={pendingTrend}
              trendGoodDirection="down"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Panel title="Weekly submissions" description="New applications received each week" className="lg:col-span-2">
              <div className="h-64 sm:h-72 -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="submittedGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#047857" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="#047857" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={16} />
                    <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ fontWeight: 600, color: '#0f172a' }} />
                    <Area type="monotone" dataKey="submitted" name="Submitted" stroke="#047857" strokeWidth={2} fill="url(#submittedGradient)" dot={false} activeDot={{ r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Status breakdown" description={`${stats.total} applications in this period`}>
              <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100">
                {statusBreakdown.map(entry => (
                  <div key={entry.name} style={{ width: `${(entry.value / stats.total) * 100}%`, backgroundColor: entry.color }} title={`${entry.name}: ${entry.value}`} />
                ))}
              </div>
              <ul className="mt-5 divide-y divide-slate-100">
                {statusBreakdown.map(entry => (
                  <li key={entry.name} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="flex items-center gap-2 text-slate-700">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
                      {entry.name}
                    </span>
                    <span className="tabular-nums font-medium text-slate-900">
                      {entry.value}
                      <span className="text-slate-400 font-normal text-xs ml-1.5">{Math.round((entry.value / stats.total) * 100)}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <Panel title="Weekly decisions" description="Approvals, rejections and revision requests recorded each week">
            <div className="h-64 sm:h-72 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="30%">
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={16} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ fontWeight: 600, color: '#0f172a' }} cursor={{ fill: '#f8fafc' }} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="square" iconSize={10} />
                  <Bar dataKey="approved" name="Approved" stackId="d" fill={STATUS_COLORS.Approved} />
                  <Bar dataKey="revision" name="Needs revision" stackId="d" fill={STATUS_COLORS['Needs Revision']} />
                  <Bar dataKey="rejected" name="Rejected" stackId="d" fill={STATUS_COLORS.Rejected} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Panel title="Applications by scholarship">
              <RankedBars rows={scholarshipBreakdown} color="#047857" total={stats.total} />
            </Panel>
            <Panel title="Applications by program">
              <RankedBars rows={programBreakdown} color="#0284c7" total={stats.total} />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
