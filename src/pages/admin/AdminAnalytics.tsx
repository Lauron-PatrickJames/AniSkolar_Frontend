import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';
import { BarChart3, Clock, Percent, RefreshCw, Timer, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { AdminApplication, AppStatus, STATUS_OPTIONS, applicantProgram } from './adminData';
import {
  Alert, Button, Card, EmptyState, ErrorState, KpiCard, KpiGrid, PageHeader, STATUS_META, Select, Skeleton, Tone, tokenColor
} from './AdminUI';

interface AdminAnalyticsProps {
  applications: AdminApplication[];
  isLoading?: boolean;
  error?: string;
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

const DAY_MS = 24 * 60 * 60 * 1000;

function withinRange(iso: string, days: number | null): boolean {
  if (days === null) return true;
  return new Date(iso).getTime() >= Date.now() - days * DAY_MS;
}

// Picks a sensible default range for offices whose submissions arrive in a
// short burst (e.g. one active month a year): if the busiest 30-day window
// in the last 12 months holds most submissions, open on the smallest range
// that contains it; otherwise default to 90 days.
function pickDefaultRange(applications: AdminApplication[]): RangeOption {
  const timestamps = applications.map(a => new Date(a.createdAt).getTime()).filter(t => !Number.isNaN(t));
  if (timestamps.length === 0) return '90d';

  const oneYearAgo = Date.now() - 365 * DAY_MS;
  const recent = timestamps.filter(t => t >= oneYearAgo);
  const sorted = [...(recent.length > 0 ? recent : timestamps)].sort((a, b) => a - b);

  // Slide a 30-day window and find the one with the most submissions.
  let bestCount = 0;
  let bestStart = sorted[0];
  let left = 0;
  for (let right = 0; right < sorted.length; right++) {
    while (sorted[right] - sorted[left] > 30 * DAY_MS) left++;
    if (right - left + 1 > bestCount) {
      bestCount = right - left + 1;
      bestStart = sorted[left];
    }
  }

  if (bestCount / timestamps.length < 0.7) return '90d';
  const ageDays = (Date.now() - bestStart) / DAY_MS;
  if (ageDays <= 30) return '30d';
  if (ageDays <= 90) return '90d';
  if (ageDays <= 182) return '6m';
  return '1y';
}

// Weekly buckets (last 16): submissions, plus each review outcome reached
// that week from history (falling back to the current status when there's
// no history, so pre-migration records still count).
function buildWeeklyTrend(applications: AdminApplication[]) {
  const buckets = new Map<string, { week: string; submitted: number; approved: number; rejected: number; revision: number }>();
  const bucketFor = (iso: string) => {
    const d = new Date(iso);
    // Snap to the Monday of that week for a stable label.
    const monday = new Date(d);
    monday.setDate(d.getDate() + ((d.getDay() === 0 ? -6 : 1) - d.getDay()));
    const key = monday.toISOString().slice(0, 10);
    if (!buckets.has(key)) buckets.set(key, { week: key, submitted: 0, approved: 0, rejected: 0, revision: 0 });
    return buckets.get(key)!;
  };

  applications.forEach(app => { bucketFor(app.createdAt).submitted += 1; });

  applications.forEach(app => {
    const decisions = (app.history ?? []).filter(h => h.status === 'Approved' || h.status === 'Rejected' || h.status === 'Needs Revision');
    if (decisions.length === 0 && app.status !== 'Under Evaluation') decisions.push({ status: app.status, changedAt: app.createdAt });
    decisions.forEach(h => {
      const bucket = bucketFor(h.changedAt);
      if (h.status === 'Approved') bucket.approved += 1;
      else if (h.status === 'Rejected') bucket.rejected += 1;
      else if (h.status === 'Needs Revision') bucket.revision += 1;
    });
  });

  return Array.from(buckets.values())
    .sort((a, b) => a.week.localeCompare(b.week))
    .slice(-16)
    .map(b => ({ ...b, label: new Date(b.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }));
}

// Average days from submission to the LAST terminal decision (Approved /
// Rejected), so revision loops before a final decision are counted.
function computeAvgProcessingDays(applications: AdminApplication[]): number | null {
  const durations: number[] = [];
  applications.forEach(app => {
    const terminal = (app.history ?? []).filter(h => h.status === 'Approved' || h.status === 'Rejected');
    const decision = terminal[terminal.length - 1];
    if (!decision) return;
    const start = new Date(app.createdAt).getTime();
    const end = new Date(decision.changedAt).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return;
    durations.push((end - start) / DAY_MS);
  });
  return durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
}

// Average number of revision requests before a resolved application's
// final decision.
function computeAvgRevisionCycles(applications: AdminApplication[]): number | null {
  const counts: number[] = [];
  applications.forEach(app => {
    const history = app.history ?? [];
    if (!history.some(h => h.status === 'Approved' || h.status === 'Rejected')) return;
    counts.push(history.filter(h => h.status === 'Needs Revision').length);
  });
  return counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : null;
}

type Trend = { direction: 'up' | 'down' | 'flat'; text: string };

function buildTrend(current: number | null, previous: number | null, suffix = ''): Trend | undefined {
  if (current === null || previous === null || previous === 0) return undefined;
  const delta = ((current - previous) / previous) * 100;
  return {
    direction: delta > 0.5 ? 'up' : delta < -0.5 ? 'down' : 'flat',
    text: `${delta >= 0 ? '+' : ''}${delta.toFixed(0)}%${suffix} vs previous period`
  };
}

function computeStats(set: AdminApplication[]) {
  const count = (s: AppStatus) => set.filter(a => a.status === s).length;
  const approved = count('Approved');
  const rejected = count('Rejected');
  const decided = approved + rejected;
  return {
    total: set.length,
    approved,
    rejected,
    pending: count('Under Evaluation'),
    revision: count('Needs Revision'),
    approvalRate: decided > 0 ? (approved / decided) * 100 : null
  };
}

// KPI tile with a "vs previous period" line. `goodDirection` decides
// whether a rise reads as good (green) or bad (red).
function MetricTile({ label, value, sub, icon, tone, trend, goodDirection = 'up' }: {
  label: string; value: string; sub?: string; icon: React.ElementType; tone: Tone;
  trend?: Trend; goodDirection?: 'up' | 'down';
}) {
  const good = trend?.direction === goodDirection;
  const bad = !!trend && trend.direction !== 'flat' && !good;
  const TrendIcon = trend?.direction === 'up' ? TrendingUp : trend?.direction === 'down' ? TrendingDown : null;
  return (
    <KpiCard
      label={label}
      value={value}
      hint={sub}
      icon={icon}
      tone={tone}
      footer={trend && (
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${good ? 'text-success-fg' : bad ? 'text-danger' : 'text-ink-subtle'}`}>
          {TrendIcon && <TrendIcon className="size-3.5" aria-hidden />}
          {trend.text}
        </span>
      )}
    />
  );
}

// Ranked horizontal bars as plain HTML: full labels, right-aligned counts,
// and a bar for the share of the top row.
function RankedBars({ rows, total }: { rows: { name: string; count: number }[]; total: number }) {
  if (rows.length === 0) return <p className="text-sm text-ink-muted">No data for this period.</p>;
  const max = Math.max(...rows.map(r => r.count));
  return (
    <ol className="space-y-3.5">
      {rows.map((row, i) => (
        <li key={row.name}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 text-ink"><span className="mr-2 text-ink-subtle tabular-nums">{i + 1}</span>{row.name}</span>
            <span className="shrink-0 font-medium text-ink tabular-nums">
              {row.count}<span className="ml-1.5 text-xs font-normal text-ink-subtle">{total ? Math.round((row.count / total) * 100) : 0}%</span>
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-bg">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(row.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function ChartSkeleton({ className = '' }: { className?: string }) {
  return (
    <Card className={className}>
      <Skeleton className="h-3.5 w-36" />
      <Skeleton className="mt-2 h-3 w-56" />
      <Skeleton className="mt-6 h-56 w-full" />
    </Card>
  );
}

export default function AdminAnalytics({ applications, isLoading, error, onRefresh, id }: AdminAnalyticsProps) {
  // null = automatic default from the data (see pickDefaultRange).
  const [range, setRange] = useState<RangeOption | null>(null);
  const effectiveRange: RangeOption = range ?? pickDefaultRange(applications);
  const rangeConfig = RANGE_OPTIONS.find(r => r.key === effectiveRange)!;
  const usedSmartDefault = range === null;

  // Chart colours come from the design tokens in index.css.
  const colors = useMemo(() => ({
    accent: tokenColor('accent', '#006937'),
    grid: tokenColor('line', '#e2e8f0'),
    axis: tokenColor('ink-subtle', '#64748b'),
    ink: tokenColor('ink', '#0f172a'),
    hover: tokenColor('surface-muted', '#f8fafc'),
    status: Object.fromEntries(STATUS_OPTIONS.map(s => [s, tokenColor(STATUS_META[s].token, '#94a3b8')])) as Record<AppStatus, string>
  }), []);

  const scoped = useMemo(() => applications.filter(a => withinRange(a.createdAt, rangeConfig.days)), [applications, rangeConfig.days]);

  // The previous period of equal length, for trend comparisons ('all time'
  // has none).
  const previousScoped = useMemo(() => {
    if (rangeConfig.days === null) return null;
    const start = Date.now() - rangeConfig.days * DAY_MS;
    const prevStart = start - rangeConfig.days * DAY_MS;
    return applications.filter(a => {
      const t = new Date(a.createdAt).getTime();
      return t >= prevStart && t < start;
    });
  }, [applications, rangeConfig.days]);

  const stats = useMemo(() => computeStats(scoped), [scoped]);
  const previousStats = useMemo(() => (previousScoped ? computeStats(previousScoped) : null), [previousScoped]);
  const avgProcessingDays = useMemo(() => computeAvgProcessingDays(scoped), [scoped]);
  const prevAvgProcessingDays = useMemo(() => (previousScoped ? computeAvgProcessingDays(previousScoped) : null), [previousScoped]);
  const avgRevisionCycles = useMemo(() => computeAvgRevisionCycles(scoped), [scoped]);
  const trendData = useMemo(() => buildWeeklyTrend(scoped), [scoped]);

  const statusBreakdown = STATUS_OPTIONS
    .map(status => ({ name: status, value: scoped.filter(a => a.status === status).length, color: colors.status[status] }))
    .filter(d => d.value > 0);

  const breakdownBy = (key: (a: AdminApplication) => string) => {
    const map = new Map<string, number>();
    scoped.forEach(a => { const k = key(a); map.set(k, (map.get(k) ?? 0) + 1); });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  };
  const scholarshipBreakdown = useMemo(() => breakdownBy(a => a.scholarshipName), [scoped]); // eslint-disable-line react-hooks/exhaustive-deps
  const programBreakdown = useMemo(() => breakdownBy(a => applicantProgram(a) || 'Unspecified'), [scoped]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasData = applications.length > 0;
  const firstLoad = !!isLoading && !hasData;
  const failedEmpty = !!error && !hasData && !isLoading;

  const tooltipStyle = { borderRadius: 8, border: `1px solid ${colors.grid}`, fontSize: 12, boxShadow: '0 8px 24px -8px rgb(15 23 42 / 0.15)' };
  const axisTick = { fontSize: 12, fill: colors.axis };

  let body: React.ReactNode;
  if (firstLoad) {
    body = (
      <div role="status" aria-label="Loading statistics" className="space-y-6">
        <KpiGrid>
          {['Submissions', 'Approval rate', 'Avg. time to decision', 'Still open'].map(label => (
            <KpiCard key={label} label={label} value="" loading />
          ))}
        </KpiGrid>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <ChartSkeleton className="lg:col-span-2" />
          <ChartSkeleton />
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
          title={hasData ? 'No applications in this period' : 'No applications yet'}
          description={hasData ? `Nothing was submitted in the ${rangeConfig.label.toLowerCase()}. Try a longer range.` : 'Statistics appear once students start applying.'}
          action={hasData && effectiveRange !== 'all'
            ? <Button variant="primary" onClick={() => setRange('all')}>Show all time</Button>
            : onRefresh && <Button icon={RefreshCw} onClick={onRefresh}>Refresh</Button>}
        />
      </Card>
    );
  } else {
    body = (
      <>
        <KpiGrid>
          <MetricTile
            label="Submissions"
            value={String(stats.total)}
            sub={rangeConfig.label}
            icon={Users}
            tone="neutral"
            trend={previousScoped ? buildTrend(stats.total, previousScoped.length) : undefined}
          />
          <MetricTile
            label="Approval rate"
            value={stats.approvalRate !== null ? `${stats.approvalRate.toFixed(0)}%` : '—'}
            sub={`${stats.approved} approved of ${stats.approved + stats.rejected} decided`}
            icon={Percent}
            tone="success"
            trend={previousStats ? buildTrend(stats.approvalRate, previousStats.approvalRate, ' pts') : undefined}
          />
          <MetricTile
            label="Avg. time to decision"
            value={avgProcessingDays !== null ? `${avgProcessingDays.toFixed(1)} days` : '—'}
            sub={avgRevisionCycles !== null && avgRevisionCycles > 0 ? `${avgRevisionCycles.toFixed(1)} revision cycles on average` : 'Submission to final decision'}
            icon={Timer}
            tone="info"
            trend={prevAvgProcessingDays !== null ? buildTrend(avgProcessingDays, prevAvgProcessingDays) : undefined}
            goodDirection="down"
          />
          <MetricTile
            label="Still open"
            value={String(stats.pending + stats.revision)}
            sub={`${stats.pending} under evaluation · ${stats.revision} needs revision`}
            icon={Clock}
            tone="warning"
            trend={previousStats ? buildTrend(stats.pending + stats.revision, previousStats.pending + previousStats.revision) : undefined}
            goodDirection="down"
          />
        </KpiGrid>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card title="Weekly submissions" description="New applications received each week" className="lg:col-span-2">
            <div className="h-64 sm:h-72" role="img" aria-label={`Weekly submissions chart, ${trendData.length} weeks`}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke={colors.grid} vertical={false} />
                  <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} minTickGap={16} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ fontWeight: 600, color: colors.ink }} />
                  <Area type="monotone" dataKey="submitted" name="Submitted" stroke={colors.accent} strokeWidth={2} fill={colors.accent} fillOpacity={0.08} dot={false} activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Status breakdown" description={`${stats.total} applications in this period`}>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-neutral-bg" aria-hidden>
              {statusBreakdown.map(entry => (
                <div key={entry.name} style={{ width: `${(entry.value / stats.total) * 100}%`, backgroundColor: entry.color }} />
              ))}
            </div>
            <ul className="mt-5 divide-y divide-line">
              {statusBreakdown.map(entry => (
                <li key={entry.name} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="flex items-center gap-2 text-ink">
                    <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: entry.color }} />
                    {entry.name}
                  </span>
                  <span className="font-medium text-ink tabular-nums">
                    {entry.value}
                    <span className="ml-1.5 text-xs font-normal text-ink-subtle">{Math.round((entry.value / stats.total) * 100)}%</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card title="Weekly decisions" description="Approvals, rejections and revision requests recorded each week">
          <div className="h-64 sm:h-72" role="img" aria-label="Weekly decisions chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid stroke={colors.grid} vertical={false} />
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} minTickGap={16} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ fontWeight: 600, color: colors.ink }} cursor={{ fill: colors.hover }} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="square" iconSize={10} />
                <Bar dataKey="approved" name="Approved" stackId="d" fill={colors.status.Approved} />
                <Bar dataKey="revision" name="Needs revision" stackId="d" fill={colors.status['Needs Revision']} />
                <Bar dataKey="rejected" name="Rejected" stackId="d" fill={colors.status.Rejected} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card title="Applications by scholarship"><RankedBars rows={scholarshipBreakdown} total={stats.total} /></Card>
          <Card title="Applications by program"><RankedBars rows={programBreakdown} total={stats.total} /></Card>
        </div>
      </>
    );
  }

  return (
    <div id={id} className="space-y-6">
      <PageHeader
        title="Statistics"
        description="Application volume, outcomes, and processing performance across every scholarship."
        actions={
          <>
            <Select value={effectiveRange} onChange={v => setRange(v as RangeOption)} className="w-48" label="Date range" disabled={firstLoad}>
              {RANGE_OPTIONS.map(r => <option key={r.key} value={r.key}>{r.label}{usedSmartDefault && r.key === effectiveRange ? ' (auto)' : ''}</option>)}
            </Select>
            {onRefresh && <Button icon={RefreshCw} loading={isLoading} onClick={onRefresh}>Refresh</Button>}
          </>
        }
      />
      {error && hasData && (
        <Alert tone="danger" title="Couldn't refresh statistics" action={onRefresh && <Button size="sm" onClick={onRefresh}>Try again</Button>}>
          {error} Showing the last loaded data.
        </Alert>
      )}
      {body}
    </div>
  );
}
