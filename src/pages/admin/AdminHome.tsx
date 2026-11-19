import React, { useEffect, useMemo, useState } from 'react';
import { Award, ChevronRight, Clock, GraduationCap, Hourglass, Megaphone, RefreshCw } from 'lucide-react';
import { Scholarship, ScholarshipOverride } from '../../types';
import { acceptsOnlineApplications, applyScholarshipOverrides, scholarshipDefaults } from '../../data/scholarships';
import { DutySummary } from '../../utils/dutyHours';
import { API_BASE_URL, AdminApplication, AppStatus, applicantName, authHeaders, titleCaseName } from './adminData';
import { relativeTime } from './history';
import { MainView } from './AdminLayout';
import { Avatar, Badge, Button, Card, EmptyState, Skeleton, Tone } from './AdminUI';

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
// How each event shows in Recent activity.
const EVENT_BADGE: Record<string, { label: string; tone: Tone }> = {
  Submitted: { label: 'Applied', tone: 'info' },
  Resubmitted: { label: 'Resubmitted', tone: 'info' },
  Approved: { label: 'Approved', tone: 'success' },
  Rejected: { label: 'Rejected', tone: 'danger' },
  'Needs Revision': { label: 'Revise', tone: 'warning' },
  Declined: { label: 'Declined', tone: 'neutral' },
  Graduated: { label: 'Graduated', tone: 'neutral' },
  Stopped: { label: 'Stopped', tone: 'neutral' },
};
// "Student Financial Aid Grant (SFAG)" → "SFAG".
const shortName = (name: string) => name.match(/\(([^)]+)\)\s*$/)?.[1] ?? name;

export default function AdminHome({ applications, isLoading, getToken, isAdso, adminName, officeLabel, messageCount, hasRenewals, onlyDirect, onNavigate, onOpenStatus, onOpenApplication }: {
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
      .map(h => ({ app: a, status: h.status as string, at: h.changedAt, by: h.changedBy === 'student' ? null : h.changedByName || h.changedBy }))
      // An approved scholarship the student declined (or that ended).
      .concat(a.status === 'Approved' && a.endedAt && a.endReason
        ? [{ app: a, status: a.endReason, at: a.endedAt, by: a.endReason === 'Declined' ? null : a.endedBy ?? null }]
        : []))
    .sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime())
    .slice(0, 8), [applications]);

  const loadingBits = isLoading || !scholarships;
  const today = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-ink-subtle">{today}</p>
          <h1 className="mt-1 text-title font-semibold tracking-tight text-ink">{greeting()}, <span className="capitalize">{adminName}</span></h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={Megaphone} onClick={() => onNavigate('announcements')}>Post an announcement</Button>
        </div>
      </div>

      {/* What needs doing, as links: no count cards here, the numbers
          live on Statistics (panel, Nov 2026). */}
      {!isLoading && (() => {
        const todos = [
          !onlyDirect && counts.waiting > 0 && { key: 'review', icon: Hourglass, text: `${plural(counts.waiting, 'application')} to review`, go: () => onOpenStatus('Under Evaluation') },
          !onlyDirect && counts.revision > 0 && { key: 'revision', icon: Clock, text: `${plural(counts.revision, 'application')} waiting on students`, go: () => onOpenStatus('Needs Revision') },
          hasRenewals && renewalsWaiting > 0 && { key: 'renewals', icon: RefreshCw, text: `${plural(renewalsWaiting, 'renewal')} to decide`, go: () => onNavigate('renewals') },
          dutyStats && dutyStats.unassigned > 0 && { key: 'duty', icon: GraduationCap, text: `${plural(dutyStats.unassigned, 'SFAG scholar')} without a duty office`, go: () => onNavigate('dutyHours') },
        ].filter(Boolean) as { key: string; icon: React.ElementType; text: string; go: () => void }[];
        return (
          <Card title="To do" flush>
            {todos.length === 0 ? (
              <p className="px-5 py-4 text-sm text-ink-muted">Nothing is waiting for you.</p>
            ) : (
              <ul className="divide-y divide-line">
                {todos.map(t => (
                  <li key={t.key}>
                    <button type="button" onClick={t.go} className="flex w-full items-center gap-3 px-5 py-3 text-left text-sm text-ink hover:bg-surface-muted focus:outline-hidden focus-visible:bg-surface-muted">
                      <t.icon className="size-4 shrink-0 text-ink-subtle" aria-hidden />
                      <span className="min-w-0 flex-1">{t.text}</span>
                      <ChevronRight className="size-4 shrink-0 text-ink-subtle" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })()}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card title="Recent activity" className="lg:col-span-3" flush>
          {isLoading ? <div className="space-y-3 p-5">{[0, 1, 2].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
            : activity.length === 0 ? <EmptyState icon={Clock} title="Nothing yet" />
            : (
              <ul className="divide-y divide-line">
                {activity.map((e, i) => (
                  <li key={`${e.app._id}-${i}`}>
                    <button type="button" onClick={() => onOpenApplication(e.app._id)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-surface-muted focus:outline-hidden focus-visible:bg-surface-muted">
                      <Avatar name={titleCaseName(applicantName(e.app))} avatarUrl={e.app.avatarUrl} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{titleCaseName(applicantName(e.app))}</span>
                        <span className="block truncate text-xs text-ink-muted" title={e.app.scholarshipName}>
                          {shortName(e.app.scholarshipName)}{e.by ? ` · ${e.by}` : ''}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <Badge tone={EVENT_BADGE[e.status]?.tone ?? 'neutral'}>{EVENT_BADGE[e.status]?.label ?? e.status}</Badge>
                        <span className="text-xs text-ink-subtle">{relativeTime(e.at)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </Card>

        <Card title="Your scholarships" className="lg:col-span-2" flush actions={<Button size="sm" variant="ghost" onClick={() => onNavigate('scholarships')}>Manage</Button>}>
          {!scholarships ? <div className="space-y-3 p-5">{[0, 1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
            : scholarships.length === 0 ? <EmptyState icon={Award} title="No scholarships yet" />
            : (
              <ul className="divide-y divide-line">
                {scholarships.map(s => {
                  const online = acceptsOnlineApplications(s);
                  const approved = s.counts.byStatus.Approved ?? 0;
                  // Current scholars: approved and not declined, graduated or stopped.
                  const current = new Set(applications.filter(a => a.scholarshipId === s.id && a.status === 'Approved' && !a.endedAt).map(a => a.studentNumber)).size;
                  return (
                    <li key={s.id} className="space-y-2 px-5 py-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink" title={s.name}>{s.name}</p>
                          <p className="truncate text-xs text-ink-muted">{online ? s.deadline : s.directAward ? 'Added by your office' : 'No online application'}</p>
                        </div>
                        {online && <Badge tone={STATUS_TONE[s.status] ?? 'neutral'} dot>{s.status}</Badge>}
                      </div>
                      {online && s.counts.total > 0 ? (
                        <div className="flex items-center gap-3">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={`${approved} of ${s.counts.total} approved`}>
                            <div className="h-full rounded-full bg-success-solid" style={{ width: `${Math.round((approved / s.counts.total) * 100)}%` }} />
                          </div>
                          <span className="shrink-0 text-xs tabular-nums text-ink-muted">{approved}/{s.counts.total} approved</span>
                        </div>
                      ) : (
                        <p className="text-xs text-ink-subtle">{online ? 'No applications yet' : plural(current, 'scholar')}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
        </Card>
      </div>

    </div>
  );
}
