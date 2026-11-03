import React, { useEffect, useMemo, useState } from 'react';
import { Award, Clock, GraduationCap, Hourglass, Megaphone, RefreshCw, UserPlus } from 'lucide-react';
import { Scholarship, ScholarshipOverride } from '../../types';
import { acceptsOnlineApplications, applyScholarshipOverrides, scholarshipDefaults } from '../../data/scholarships';
import { DutySummary } from '../../utils/dutyHours';
import { API_BASE_URL, AdminApplication, AppStatus, applicantName, authHeaders, titleCaseName } from './adminData';
import { relativeTime } from './history';
import { MainView } from './AdminLayout';
import { Badge, Button, Card, EmptyState, KpiCard, KpiGrid, Skeleton, Tone } from './AdminUI';

// The admin console's home: the signed-in office at a glance. Built from what the console already loads (applications) plus the
// office's scholarships, renewal periods and, for the AdSO, this term's
// duty hours. Every tile and to-do opens the page that handles it.

type GetToken = () => Promise<string | null>;

interface AdminScholarshipRow { id: string; overrides: ScholarshipOverride; applications: { total: number; byStatus: Record<string, number> }; canEdit: boolean }
interface PeriodRow { _id: string; scholarshipName: string; academicYear: number; term: string; open: boolean; deadline?: string; counts: Record<string, number> }
interface DutyRow { officeAssigned: string; deadline: string | null; summary: DutySummary | null; sfaHolder: boolean }

const DAY = 86_400_000;
const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function greeting(): string {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const STATUS_TONE: Record<string, Tone> = { Open: 'success', 'Closing Soon': 'warning', Closed: 'neutral' };
const EVENT_TEXT: Partial<Record<string, string>> = {
  Submitted: 'applied for', Resubmitted: 'resubmitted', Approved: 'approved for', Rejected: 'not approved for', 'Needs Revision': 'asked to revise',
};

export default function AdminHome({ applications, isLoading, getToken, isAdso, adminName, officeLabel, messageCount, hasRenewals, onlyDirect, onNavigate, onOpenStatus, onOpenApplication, onAddScholar }: {
  applications: AdminApplication[];
  isLoading: boolean;
  getToken: GetToken;
  isAdso: boolean;
  adminName: string;
  officeLabel: string;
  messageCount: number;
  hasRenewals: boolean;
  // The office adds its scholars itself and has no applications (the SDO).
  onlyDirect: boolean;
  onNavigate: (view: MainView) => void;
  onOpenStatus: (status: AppStatus | 'All') => void;
  onOpenApplication: (id: string) => void;
  onAddScholar?: () => void;
}) {
  const [scholarships, setScholarships] = useState<(Scholarship & { counts: AdminScholarshipRow['applications'] })[] | null>(null);
  const [periods, setPeriods] = useState<PeriodRow[] | null>(null);
  const [duty, setDuty] = useState<DutyRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const get = async <T,>(path: string): Promise<T | null> => {
      try {
        const res = await fetch(`${API_BASE_URL}${path}`, { headers: await authHeaders(getToken) });
        return res.ok ? await res.json() : null;
      } catch { return null; }
    };
    (async () => {
      const [s, p, d] = await Promise.all([
        get<{ scholarships: AdminScholarshipRow[] }>('/api/scholarships/admin'),
        hasRenewals ? get<{ periods: PeriodRow[] }>('/api/renewals/admin/periods') : Promise.resolve(null),
        isAdso ? get<{ scholars: DutyRow[] }>('/api/duty-hours/admin') : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setScholarships((s?.scholarships ?? []).filter(r => r.canEdit).map(r => ({
        ...applyScholarshipOverrides([scholarshipDefaults(r.overrides)], [r.overrides])[0],
        counts: r.applications,
      })));
      setPeriods(p?.periods ?? []);
      setDuty(d?.scholars ?? null);
    })();
    return () => { cancelled = true; };
  }, [getToken, hasRenewals, isAdso]);

  const counts = useMemo(() => {
    const by = (s: AppStatus) => applications.filter(a => a.status === s);
    const waiting = by('Under Evaluation');
    const current = applications.filter(a => a.status === 'Approved' && !a.endedAt);
    return {
      waiting: waiting.length,
      revision: by('Needs Revision').length,
      scholars: new Set(current.map(a => a.studentNumber)).size,
    };
  }, [applications, isAdso]);

  const openPeriods = (periods ?? []).filter(p => p.open);
  const renewalsWaiting = openPeriods.reduce((n, p) => n + (p.counts['Under Evaluation'] ?? 0), 0);

  const dutyStats = useMemo(() => {
    if (!duty) return null;
    const today = todayIso();
    const holders = duty.filter(r => r.sfaHolder);
    return {
      total: holders.length,
      unassigned: holders.filter(r => !r.officeAssigned).length,
      done: holders.filter(r => r.summary?.remaining !== null && r.summary?.remaining !== undefined && r.summary.remaining <= 0).length,
      overdue: holders.filter(r => r.deadline && r.deadline < today && (r.summary?.remaining ?? 0) > 0).length,
    };
  }, [duty]);

  // The latest things that happened, across this office's applications.
  const activity = useMemo(() => applications
    .flatMap(a => (a.history ?? [])
      .filter(h => EVENT_TEXT[h.status])
      .map(h => ({ app: a, status: h.status, at: h.changedAt, by: h.changedBy === 'student' ? null : h.changedByName || h.changedBy })))
    .sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime())
    .slice(0, 8), [applications]);

  const loadingBits = isLoading || !scholarships;
  const today = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-muted">{today}</p>
          <h1 className="text-title font-semibold tracking-tight text-ink">{greeting()}, <span className="capitalize">{adminName}</span></h1>
          <p className="mt-1 text-sm text-ink-muted">{officeLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onAddScholar && <Button variant="primary" icon={UserPlus} onClick={onAddScholar}>Add scholar</Button>}
          <Button icon={Megaphone} onClick={() => onNavigate('announcements')}>Post an announcement</Button>
        </div>
      </div>

      <KpiGrid columns={4}>
        {onlyDirect ? (
          <KpiCard label="Current scholars" value={counts.scholars} icon={GraduationCap} onClick={() => onNavigate('lifecycle')} loading={isLoading} hint="Players you’ve added" />
        ) : (
          <>
            <KpiCard label="To review" value={counts.waiting} icon={Hourglass} tone={counts.waiting ? 'warning' : 'neutral'} onClick={() => onOpenStatus('Under Evaluation')} loading={isLoading} hint="New and resubmitted" />
            <KpiCard label="Waiting on students" value={counts.revision} icon={Clock} onClick={() => onOpenStatus('Needs Revision')} loading={isLoading} hint="Asked to revise" />
            <KpiCard label="Current scholars" value={counts.scholars} icon={GraduationCap} tone="success" onClick={() => onNavigate('lifecycle')} loading={isLoading} />
          </>
        )}
        {hasRenewals ? (
          <KpiCard label="Renewals to decide" value={renewalsWaiting} icon={RefreshCw} tone={renewalsWaiting ? 'warning' : 'neutral'} onClick={() => onNavigate('renewals')} loading={!periods} hint={openPeriods.length ? `${plural(openPeriods.length, 'period')} open` : 'No period open'} />
        ) : isAdso ? null : (
          <KpiCard label="Scholarships" value={scholarships?.length ?? 0} icon={Award} onClick={() => onNavigate('scholarships')} loading={!scholarships} hint="You manage" />
        )}
      </KpiGrid>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card title="Recent activity" className="lg:col-span-3" flush>
          {isLoading ? <div className="space-y-3 p-5">{[0, 1, 2].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
            : activity.length === 0 ? <EmptyState icon={Clock} title="Nothing yet" description="Applications and decisions show up here." />
            : (
              <ul className="divide-y divide-line">
                {activity.map((e, i) => (
                  <li key={`${e.app._id}-${i}`}>
                    <button type="button" onClick={() => onOpenApplication(e.app._id)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-surface-muted focus:outline-hidden focus-visible:bg-surface-muted">
                      <span className="min-w-0 flex-1 text-sm text-ink">
                        <span className="font-medium">{titleCaseName(applicantName(e.app))}</span>{' '}
                        <span className="text-ink-muted">{EVENT_TEXT[e.status]}</span>{' '}
                        {e.app.scholarshipName}
                        {e.by && <span className="text-ink-subtle"> · by {e.by}</span>}
                      </span>
                      <span className="shrink-0 text-xs text-ink-subtle">{relativeTime(e.at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </Card>

        <Card title="Your scholarships" className="lg:col-span-2" flush actions={<Button size="sm" variant="ghost" onClick={() => onNavigate('scholarships')}>Manage</Button>}>
          {!scholarships ? <div className="space-y-3 p-5">{[0, 1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
            : scholarships.length === 0 ? <EmptyState icon={Award} title="No scholarships yet" description="Create one from Scholarships." />
            : (
              <ul className="divide-y divide-line">
                {scholarships.map(s => {
                  const online = acceptsOnlineApplications(s);
                  const approved = s.counts.byStatus.Approved ?? 0;
                  return (
                    <li key={s.id} className="flex items-start justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{s.name}</p>
                        <p className="truncate text-xs text-ink-muted">
                          {online ? s.deadline : s.directAward ? 'Scholars added by your office' : 'No online application'}
                          {' · '}{online ? `${plural(s.counts.total, 'application')}, ${approved} approved` : plural(approved, 'scholar')}
                        </p>
                      </div>
                      {online && <Badge tone={STATUS_TONE[s.status] ?? 'neutral'} dot>{s.status}</Badge>}
                    </li>
                  );
                })}
              </ul>
            )}
        </Card>
      </div>

      {dutyStats && (
          <Card title="Duty hours this semester" actions={<Button size="sm" variant="ghost" onClick={() => onNavigate('dutyHours')}>Open</Button>}>
            <dl className="grid grid-cols-2 gap-4">
              {([
                ['SFAG scholars', dutyStats.total, 'text-ink'],
                ['Hours complete', dutyStats.done, 'text-success-fg'],
                ['No office yet', dutyStats.unassigned, dutyStats.unassigned ? 'text-warning-fg' : 'text-ink'],
                ['Past the deadline', dutyStats.overdue, dutyStats.overdue ? 'text-danger-fg' : 'text-ink'],
              ] as const).map(([label, value, color]) => (
                <div key={label} className="rounded-control bg-surface-muted p-3">
                  <dt className="text-xs text-ink-muted">{label}</dt>
                  <dd className={`text-xl font-semibold tabular-nums ${color}`}>{value}</dd>
                </div>
              ))}
            </dl>
            {dutyStats.total > 0 && (
              <div className="mt-4">
                <div className="h-2 overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={`${dutyStats.done} of ${dutyStats.total} done`}>
                  <div className="h-full rounded-full bg-success-solid" style={{ width: `${Math.round((dutyStats.done / dutyStats.total) * 100)}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-ink-muted">{Math.round((dutyStats.done / dutyStats.total) * 100)}% have finished their hours</p>
              </div>
            )}
          </Card>
        )}
    </div>
  );
}
