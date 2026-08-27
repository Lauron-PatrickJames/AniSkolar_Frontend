import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';
import {
  TrendingUp, TrendingDown, Users, CheckCircle, XCircle, Clock, AlertCircle,
  Percent, Timer, ChevronDown
} from 'lucide-react';

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
  applicationFormType: 'standard' | 'sfag';
  status: AppStatus;
  createdAt: string;
  history?: HistoryEntry[];
  standardInfo?: { program: string; yearLevel: string };
  personalInfo?: { course: string; yearLevel: string };
}

interface AdminAnalyticsProps {
  applications: AdminApplication[];
  isLoading?: boolean;
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
  return app.applicationFormType === 'sfag' ? app.personalInfo?.course ?? 'Unspecified' : app.standardInfo?.program ?? 'Unspecified';
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
  label, value, sub, icon: Icon, accent, trend, trendGoodDirection = 'up'
}: {
  label: string; value: string; sub?: string; icon: React.ElementType; accent: string;
  trend?: Trend;
  trendGoodDirection?: 'up' | 'down';
}) {
  const isGood = trend && (trend.direction === trendGoodDirection);
  const isBad = trend && trend.direction !== 'flat' && trend.direction !== trendGoodDirection;
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
      className="p-4 sm:p-5 rounded-xl border border-slate-100 bg-white card-shadow min-w-0 flex flex-col justify-between"
    >
      <div className="flex justify-between items-start gap-2 mb-2.5">
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{label}</p>
          <h3 className="text-2xl sm:text-3xl font-display font-extrabold text-brand-green mt-1">{value}</h3>
        </div>
        <div className={`p-2.5 rounded-lg shrink-0 ${accent}`}>
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
      </div>
      {sub && <p className="text-[11px] sm:text-xs text-slate-500 font-medium">{sub}</p>}
      {trend && (
        <span className={`inline-flex items-center gap-1 mt-2 text-[11px] font-bold ${
          isGood ? 'text-brand-green' : isBad ? 'text-rose-500' : 'text-slate-400'
        }`}>
          {trend.direction === 'up' ? <TrendingUp className="w-3.5 h-3.5" /> : trend.direction === 'down' ? <TrendingDown className="w-3.5 h-3.5" /> : null}
          {trend.text}
        </span>
      )}
    </motion.div>
  );
}

export default function AdminAnalytics({ applications, isLoading, id }: AdminAnalyticsProps) {
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
    <div id={id} className="space-y-5 sm:space-y-6">
      {/* Header + range selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display font-black text-lg sm:text-xl md:text-2xl text-slate-900 tracking-tight">Statistics & Trends</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">Overall application volume, outcomes, and processing performance.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {usedSmartDefault && (
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden sm:inline">
              Auto-selected
            </span>
          )}
          <div className="relative">
            <select
              value={effectiveRange}
              onChange={e => setRange(e.target.value as RangeOption)}
              className="w-full sm:w-auto appearance-none pl-3.5 pr-9 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold bg-white hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all"
            >
              {RANGE_OPTIONS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-xs text-slate-400 font-semibold bg-white rounded-xl border border-slate-100 card-shadow">
          Loading statistics...
        </div>
      ) : scoped.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-100 card-shadow">
          <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-xs font-semibold text-slate-400">No applications submitted in this period.</p>
        </div>
      ) : (
        <>
          {/* Key metric tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <MetricTile
              label="Total Submissions"
              value={String(stats.total)}
              sub={rangeConfig.label}
              icon={Users}
              accent="bg-slate-50 text-slate-500"
              trend={submissionTrend}
            />
            <MetricTile
              label="Approval Rate"
              value={stats.approvalRate !== null ? `${stats.approvalRate.toFixed(0)}%` : '—'}
              sub={`${stats.approved} approved of ${stats.approved + stats.rejected} decided`}
              icon={Percent}
              accent="bg-emerald-50 text-brand-green"
              trend={approvalRateTrend}
            />
            <MetricTile
              label="Avg. Processing Time"
              value={avgProcessingDays !== null ? `${avgProcessingDays.toFixed(1)}d` : '—'}
              sub={avgRevisionCycles !== null && avgRevisionCycles > 0
                ? `Submission to final decision · ${avgRevisionCycles.toFixed(1)} revision cycles avg`
                : 'Submission to final decision'}
              icon={Timer}
              accent="bg-sky-50 text-sky-600"
              trend={processingTimeTrend}
              trendGoodDirection="down"
            />
            <MetricTile
              label="Still Pending"
              value={String(stats.pending + stats.revision)}
              sub={`${stats.pending} evaluating · ${stats.revision} needs revision`}
              icon={Clock}
              accent="bg-amber-50 text-amber-600"
              trend={pendingTrend}
              trendGoodDirection="down"
            />
          </div>

          {/* Submission trend + status breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100 card-shadow p-4 sm:p-6 min-w-0">
              <h3 className="font-display font-bold text-sm text-slate-900 uppercase tracking-wider mb-4">Weekly Submission Volume</h3>
              <div className="h-64 sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="submittedGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#059669" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#059669" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                      labelStyle={{ fontWeight: 700, color: '#0f172a' }}
                    />
                    <Area type="monotone" dataKey="submitted" name="Submitted" stroke="#059669" strokeWidth={2} fill="url(#submittedGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-100 card-shadow p-4 sm:p-6 min-w-0">
              <h3 className="font-display font-bold text-sm text-slate-900 uppercase tracking-wider mb-4">Status Breakdown</h3>
              <div className="h-52 sm:h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusBreakdown}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="55%"
                      outerRadius="85%"
                      paddingAngle={2}
                    >
                      {statusBreakdown.map(entry => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 mt-2">
                {statusBreakdown.map(entry => (
                  <div key={entry.name} className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5 text-slate-600 font-medium min-w-0 truncate">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                      {entry.name}
                    </span>
                    <span className="font-bold text-slate-800 shrink-0">{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Decision outcomes over time */}
          <div className="bg-white rounded-xl border border-slate-100 card-shadow p-4 sm:p-6 min-w-0">
            <h3 className="font-display font-bold text-sm text-slate-900 uppercase tracking-wider mb-4">Weekly Decisions</h3>
            <div className="h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} labelStyle={{ fontWeight: 700, color: '#0f172a' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                  <Bar dataKey="approved" name="Approved" fill={STATUS_COLORS.Approved} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="rejected" name="Rejected" fill={STATUS_COLORS.Rejected} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="revision" name="Needs Revision" fill={STATUS_COLORS['Needs Revision']} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Scholarship + program breakdowns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
            <div className="bg-white rounded-xl border border-slate-100 card-shadow p-4 sm:p-6 min-w-0">
              <h3 className="font-display font-bold text-sm text-slate-900 uppercase tracking-wider mb-4">Top Scholarships by Volume</h3>
              <div className="h-64 sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={scholarshipBreakdown} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={120}
                      tick={{ fontSize: 10, fill: '#475569' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 18)}…` : v)}
                    />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    <Bar dataKey="count" name="Applications" fill="#059669" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-100 card-shadow p-4 sm:p-6 min-w-0">
              <h3 className="font-display font-bold text-sm text-slate-900 uppercase tracking-wider mb-4">Top Programs / Courses</h3>
              <div className="h-64 sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={programBreakdown} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={120}
                      tick={{ fontSize: 10, fill: '#475569' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 18)}…` : v)}
                    />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    <Bar dataKey="count" name="Applications" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}