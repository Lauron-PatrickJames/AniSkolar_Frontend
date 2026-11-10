import React, { useEffect, useState } from 'react';
import { useAuth } from '@clerk/react';
import {
  ArrowRight, Award, Bell, Calculator, Calendar, ChevronRight, Clock, Compass,
  FileText, GraduationCap, Hash, MessageSquare, RefreshCw, ShieldCheck, UserCheck
} from 'lucide-react';
import { Scholarship, Announcement, Application, StudentProfile } from '../../types';
import { Holdings, getAvailableScholarships, isSfagScholar } from '../../utils/eligibility';
import { DutySummary, formatDutyDate } from '../../utils/dutyHours';
import { Renewal, RenewalPeriod, deadlineLabel, periodLabel } from '../../utils/renewals';
import { titleCaseName } from '../../utils/names';
import { useUnreadMessages } from '../../layouts/StudentLayout';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

// The student's home: where they stand (their scholarship, duty hours and
// renewal, or their applications), then announcements beside quick
// actions.

interface DashboardProps {
  scholarships: Scholarship[];
  announcements: Announcement[];
  applications: Application[];
  student: StudentProfile;
  // What the student holds now (GET /api/students/me/holdings).
  holdings?: Holdings | null;
  onNavigate: (page: string) => void;
  onViewScholarship: (id: string) => void;
  id?: string;
}

interface DutyView { log: { officeAssigned?: string | null; term: string; academicYear: number; deadline?: string | null }; summary: DutySummary; evaluated?: boolean }
interface RenewalsView { available: RenewalPeriod[]; renewals: (Renewal & { period?: RenewalPeriod | null })[] }

const hrs = (n: number | null | undefined) => (n === null || n === undefined ? '—' : String(Math.round(n * 100) / 100));
const STATUS_STYLE: Record<string, string> = {
  'Under Evaluation': 'bg-sky-50 text-sky-700 ring-sky-200',
  'Needs Revision': 'bg-amber-50 text-amber-800 ring-amber-200',
  Approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
};
const STATUS_LABEL: Record<string, string> = { 'Under Evaluation': 'Under evaluation', 'Needs Revision': 'Needs revision', Approved: 'Approved', Rejected: 'Not approved' };

function HeroChip({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 ring-1 ring-white/15">
      <Icon className="h-3.5 w-3.5 shrink-0 text-emerald-100" aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  );
}

function greeting(): string {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', hour12: false }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Dashboard({
  scholarships,
  announcements,
  applications,
  student,
  holdings = null,
  onNavigate,
  onViewScholarship,
  id
}: DashboardProps) {
  const { getToken } = useAuth();
  const unread = useUnreadMessages('dashboard');
  const needsRevision = applications.filter(a => a.status === 'Needs Revision').length;
  const held = holdings?.held ?? [];
  const isScholar = applications.some(a => a.status === 'Approved');
  const sfag = isSfagScholar(applications);
  const [duty, setDuty] = useState<DutyView | null>(null);
  const [renewals, setRenewals] = useState<RenewalsView | null>(null);

  // Duty hours (SFAG) and renewals (scholars), for the cards and to-dos.
  useEffect(() => {
    let cancelled = false;
    const get = async <T,>(path: string): Promise<T | null> => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_BASE_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
        return res.ok ? await res.json() : null;
      } catch {
        return null;
      }
    };
    if (sfag) get<DutyView>('/api/duty-hours/mine').then(d => { if (!cancelled) setDuty(d); });
    if (isScholar) get<RenewalsView>('/api/renewals/mine').then(r => { if (!cancelled) setRenewals(r); });
    return () => { cancelled = true; };
  }, [sfag, isScholar, getToken]);

  const firstName = titleCaseName(student.firstName || student.name.split(' ')[0] || '');
  const gpa = student.gpa !== undefined && student.gpa !== null && String(student.gpa).trim() !== '' && Number.isFinite(Number(student.gpa)) ? Number(student.gpa).toFixed(2) : null;
  const openToMe = getAvailableScholarships(scholarships, student).filter(s => s.status !== 'Closed');
  const appliedIds = new Set(applications.map(a => a.scholarshipId));

  const latestRenewal = renewals?.renewals?.[0];
  const sfagDetail = holdings?.details?.find(d => d.scholarshipId === 's1');
  const dutyPct = duty?.summary.required ? Math.min(100, (duty.summary.completed / duty.summary.required) * 100) : null;
  const dutyDone = duty?.summary.required ? duty.summary.completed >= duty.summary.required : false;

  return (
    <div id={id} className="space-y-6">
      {/* Greeting */}
      <section className="relative overflow-hidden rounded-2xl bg-linear-to-br from-brand-green via-emerald-700 to-emerald-800 px-5 py-5 text-white sm:px-8 sm:py-6">
        {/* Soft shapes behind, like My Scholarship's header. */}
        <div className="pointer-events-none absolute -top-20 -right-16 h-64 w-64 rounded-full bg-white/[0.06]" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 right-40 hidden h-48 w-48 rounded-full bg-white/[0.04] sm:block" aria-hidden />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
          <div className="min-w-0">
            <div className="min-w-0">
              <p className="text-sm text-emerald-100">{greeting()},</p>
              <h2 className="truncate font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{firstName || 'there'}</h2>
              {/* Phones: one quiet line. Wider: chips. */}
              <p className="truncate text-xs text-emerald-100 tabular-nums sm:hidden">
                {[student.yearLevel, student.studentNumber, gpa && `GPA ${gpa}`].filter(Boolean).join(' · ')}
              </p>
              <div className="mt-2.5 hidden flex-wrap gap-1.5 text-xs font-medium tabular-nums sm:flex">
                {student.course && <HeroChip icon={GraduationCap}>{student.course}</HeroChip>}
                {student.yearLevel && <HeroChip icon={Calendar}>{student.yearLevel}</HeroChip>}
                {student.studentNumber && <HeroChip icon={Hash}>{student.studentNumber}</HeroChip>}
                {gpa && <HeroChip icon={Award}>GPA {gpa}</HeroChip>}
              </div>
            </div>
          </div>
          {held.length === 1 ? (
            <button type="button" onClick={() => onNavigate('my-scholarship')} className="group flex w-full shrink-0 items-center justify-between gap-3 rounded-xl bg-white/10 px-4 py-2.5 text-left ring-1 ring-white/20 backdrop-blur-sm transition-colors hover:bg-white/20 sm:block sm:w-auto sm:rounded-2xl sm:px-5 sm:py-3 sm:text-right">
              <span className="flex items-center gap-1.5 text-sm font-semibold sm:justify-end sm:text-xs sm:text-emerald-100">
                <ShieldCheck className="h-4 w-4 sm:h-3.5 sm:w-3.5" aria-hidden />
                <span className="sm:hidden">
                  {held[0].scholarshipName.match(/\(([^)]+)\)\s*$/)?.[1] ?? held[0].scholarshipName} scholar
                  {sfagDetail?.grantPercentage ? <span className="text-emerald-100"> · {sfagDetail.grantPercentage}%</span> : null}
                </span>
                <span className="hidden sm:inline">Active scholar</span>
              </span>
              <span className="mt-0.5 hidden font-display text-xl font-bold leading-tight sm:block">
                {held[0].scholarshipName.match(/\(([^)]+)\)\s*$/)?.[1] ?? held[0].scholarshipName}
                {sfagDetail?.grantPercentage ? <span className="text-emerald-100"> · {sfagDetail.grantPercentage}%</span> : null}
              </span>
              <span className="flex shrink-0 items-center gap-1 text-xs text-emerald-100 sm:mt-0.5 sm:justify-end">
                <span className="sm:hidden">View</span><span className="hidden sm:inline">View my scholarship</span>
                <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          ) : held.length === 0 ? (
            <button type="button" onClick={() => onNavigate('explore')} className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-brand-green hover:bg-emerald-50 sm:self-auto">
              <Compass className="h-4 w-4" aria-hidden /> Explore scholarships
            </button>
          ) : null}
        </div>
      </section>

      {/* Where they stand */}
      {held.length > 0 || isScholar ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Scholarship */}
          <button type="button" onClick={() => onNavigate('my-scholarship')} className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-xs transition-colors hover:border-brand-green/40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-500"><Award className="h-4 w-4" aria-hidden />My scholarship</p>
            <p className="mt-3 font-display text-lg font-bold leading-snug text-slate-900">{held[0]?.scholarshipName ?? 'Scholarship'}</p>
            <p className="mt-1 text-sm text-slate-600">
              {[sfagDetail?.grantPercentage && `${sfagDetail.grantPercentage}% tuition discount`, sfagDetail?.approvedAt && `since ${new Date(sfagDetail.approvedAt).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}`].filter(Boolean).join(' · ') || 'Approved'}
            </p>
            <p className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-green">View details <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden /></p>
          </button>

          {/* Duty hours */}
          {sfag && (
            <button type="button" onClick={() => onNavigate('duty-hours')} className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-xs transition-colors hover:border-brand-green/40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-500"><Clock className="h-4 w-4" aria-hidden />Duty hours</p>
              {!duty ? <div className="mt-3 h-14 animate-pulse rounded-lg bg-slate-100" /> : (
                <>
                  <p className="mt-3 text-sm text-slate-500">
                    <span className="font-display text-2xl font-extrabold text-slate-900 tabular-nums">{hrs(duty.summary.completed)}</span>
                    {duty.summary.required ? ` of ${hrs(duty.summary.required)} h` : ' h'}
                  </p>
                  {dutyPct !== null && (
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                      <div className={`h-full rounded-full ${dutyDone ? 'bg-brand-green' : 'bg-emerald-400'}`} style={{ width: `${dutyPct}%` }} />
                    </div>
                  )}
                  <p className="mt-2 text-sm text-slate-600">
                    {!duty.log.officeAssigned ? 'Waiting for your office assignment'
                      : duty.evaluated ? `Done · ${duty.log.officeAssigned} evaluated you`
                        : dutyDone ? `Done · waiting for ${duty.log.officeAssigned}’s evaluation`
                          : [duty.log.officeAssigned, duty.summary.weeklyNeeded ? `about ${hrs(duty.summary.weeklyNeeded)} h a week` : null, duty.log.deadline ? `due ${formatDutyDate(duty.log.deadline)}` : null].filter(Boolean).join(' · ')}
                  </p>
                </>
              )}
            </button>
          )}

          {/* Renewal */}
          <button type="button" onClick={() => onNavigate('renewals')} className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-xs transition-colors hover:border-brand-green/40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-500"><RefreshCw className="h-4 w-4" aria-hidden />Renewal</p>
            {!renewals ? <div className="mt-3 h-14 animate-pulse rounded-lg bg-slate-100" /> : renewals.available.length > 0 ? (
              <>
                <p className="mt-3 font-display text-lg font-bold text-slate-900">Open now</p>
                <p className="mt-1 text-sm text-slate-600">{periodLabel(renewals.available[0])}{renewals.available[0].deadline ? ` · due ${deadlineLabel(renewals.available[0].deadline)}` : ''}</p>
              </>
            ) : latestRenewal ? (
              <>
                <p className="mt-3 font-display text-lg font-bold text-slate-900">{latestRenewal.status === 'Renewed' ? 'Renewed' : latestRenewal.status}</p>
                <p className="mt-1 text-sm text-slate-600">{periodLabel(latestRenewal)}</p>
              </>
            ) : (
              <>
                <p className="mt-3 font-display text-lg font-bold text-slate-900">Not open yet</p>
                <p className="mt-1 text-sm text-slate-600">You’ll renew with your grades when the office opens it.</p>
              </>
            )}
            <p className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-green">Go to Renewal <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden /></p>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Applications */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h3 className="font-display text-base font-bold text-slate-900">My applications</h3>
              <button type="button" onClick={() => onNavigate('applications')} className="text-sm font-semibold text-brand-green hover:text-brand-green-dark">See all</button>
            </div>
            {applications.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-slate-500">You haven’t applied yet. Scholarships open to you are on the right.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {applications.slice(0, 4).map(a => (
                  <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{a.scholarshipName}</span>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLE[a.status] ?? 'bg-slate-50 text-slate-600 ring-slate-200'}`}>{STATUS_LABEL[a.status] ?? a.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Open to them */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h3 className="font-display text-base font-bold text-slate-900">Open to you <span className="text-slate-500 font-semibold tabular-nums">({openToMe.length})</span></h3>
              <button type="button" onClick={() => onNavigate('explore')} className="text-sm font-semibold text-brand-green hover:text-brand-green-dark">Explore</button>
            </div>
            <ul className="divide-y divide-slate-100">
              {openToMe.slice(0, 4).map(s => (
                <li key={s.id}>
                  <button type="button" onClick={() => onViewScholarship(s.id)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">{s.name}</span>
                      {s.deadline && <span className="block truncate text-xs text-slate-500">{s.deadline.replace(/^Applications open\s+/i, '')}</span>}
                    </span>
                    {appliedIds.has(s.id)
                      ? <span className="shrink-0 text-xs font-semibold text-slate-500">Applied</span>
                      : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />}
                  </button>
                </li>
              ))}
              {openToMe.length === 0 && <li className="px-5 py-6 text-center text-sm text-slate-500">No scholarships are open to you right now.</li>}
            </ul>
          </section>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Announcements */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-xs lg:col-span-2">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="font-display text-base font-bold text-slate-900">Latest from the scholarship office</h3>
          <button type="button" onClick={() => onNavigate('announcements')} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-green hover:text-brand-green-dark">All announcements <ArrowRight className="h-3.5 w-3.5" aria-hidden /></button>
        </div>
        {announcements.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-slate-500">No announcements yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {announcements.slice(0, 3).map(a => (
              <li key={a.id}>
                <button type="button" onClick={() => onNavigate('announcements')} className="flex w-full items-start gap-3 px-5 py-3.5 text-left hover:bg-slate-50 focus:outline-hidden focus-visible:bg-slate-50">
                  {a.imageUrls?.[0]
                    ? <img src={a.imageUrls[0]} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-slate-200" />
                    : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-brand-green"><Bell className="h-5 w-5" aria-hidden /></span>}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-semibold text-brand-green">{a.category}</span>
                      <span className="inline-flex items-center gap-1 tabular-nums"><Calendar className="h-3.5 w-3.5" aria-hidden />{a.date}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-sm font-semibold text-slate-900">{a.title}</span>
                    <span className="block truncate text-sm text-slate-600">{a.description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Quick actions */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-xs self-start">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="font-display text-base font-bold text-slate-900">Quick actions</h3>
        </div>
        <ul className="space-y-1 p-2">
          {[
            ...(sfag ? [{ key: 'duty', icon: Clock, label: 'Log a duty', page: 'duty-hours' }] : []),
            ...(isScholar ? [{ key: 'renew', icon: RefreshCw, label: 'Renew my scholarship', page: 'renewals' }] : []),
            ...(held.length === 0 ? [{ key: 'explore', icon: Compass, label: 'Browse scholarships', page: 'explore' }] : []),
            { key: 'apps', icon: FileText, label: 'My applications', page: 'applications', count: needsRevision },
            { key: 'msg', icon: MessageSquare, label: 'Message the scholarship office', page: 'messages', count: unread },
            { key: 'gpa', icon: Calculator, label: 'GPA calculator', page: 'gpa-calculator' },
            { key: 'profile', icon: UserCheck, label: 'Update my profile', page: 'profile' },
          ].map(a => (
            <li key={a.key}>
              <button type="button" onClick={() => onNavigate(a.page)} className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-brand-green"><a.icon className="h-4 w-4" aria-hidden /></span>
                <span className="min-w-0 flex-1 truncate">{a.label}</span>
                {'count' in a && a.count ? <span className="rounded-full bg-amber-500 px-1.5 py-px text-xs font-bold text-white tabular-nums">{a.count > 9 ? '9+' : a.count}</span> : null}
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-600" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </section>
      </div>

    </div>
  );
}
