import React, { useMemo, useState } from 'react';
import {
  Search, ChevronDown, ArrowLeft, Users, Repeat, Award, Clock,
  CheckCircle, XCircle, AlertCircle, FileText, RefreshCw, GraduationCap,
  Mail, Phone, History
} from 'lucide-react';

// --- Types (mirror AdminDashboard.tsx) -------------------------------------

type AppStatus = 'Under Evaluation' | 'Approved' | 'Rejected' | 'Needs Revision';
type HistoryStatus = AppStatus | 'Submitted' | 'Resubmitted';

interface HistoryEntry {
  status: HistoryStatus;
  note?: string;
  changedBy?: string;
  changedAt: string;
}

interface AdminApplication {
  _id: string;
  studentNumber: string;
  avatarUrl?: string;
  scholarshipId: string;
  scholarshipName: string;
  applicationFormType: 'standard' | 'sfag';
  status: AppStatus;
  createdAt: string;
  history?: HistoryEntry[];
  reviewNote?: string;
  standardInfo?: { firstName: string; lastName: string; email: string; phone: string; program: string; yearLevel: string; gpa: string };
  personalInfo?: { firstName: string; lastName: string; course: string; yearLevel: string };
  contactSchool?: { email: string; mobileNo: string };
}
interface AdminScholarsProps {
  applications: AdminApplication[];
  isLoading?: boolean;
}

const STATUS_STYLES: Record<AppStatus, { badge: string; dot: string }> = {
  'Under Evaluation': { badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  'Approved': { badge: 'bg-emerald-50 text-brand-green border-emerald-200', dot: 'bg-brand-green' },
  'Rejected': { badge: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
  'Needs Revision': { badge: 'bg-sky-50 text-sky-700 border-sky-200', dot: 'bg-sky-500' }
};

const TIMELINE_STYLES: Record<HistoryStatus, { dot: string; icon: React.ElementType }> = {
  'Submitted': { dot: 'bg-slate-400', icon: FileText },
  'Resubmitted': { dot: 'bg-slate-400', icon: RefreshCw },
  'Under Evaluation': { dot: 'bg-amber-500', icon: Clock },
  'Approved': { dot: 'bg-brand-green', icon: CheckCircle },
  'Rejected': { dot: 'bg-rose-500', icon: XCircle },
  'Needs Revision': { dot: 'bg-sky-500', icon: AlertCircle }
};

// --- Derived helpers (same shape as AdminDashboard.tsx) --------------------

function applicantName(app: AdminApplication): string {
  if (app.applicationFormType === 'sfag' && app.personalInfo) {
    return `${app.personalInfo.firstName} ${app.personalInfo.lastName}`;
  }
  if (app.standardInfo) return `${app.standardInfo.firstName} ${app.standardInfo.lastName}`;
  return 'Unknown Applicant';
}

function applicantEmail(app: AdminApplication): string {
  return app.applicationFormType === 'sfag' ? app.contactSchool?.email ?? '' : app.standardInfo?.email ?? '';
}

function applicantPhone(app: AdminApplication): string {
  return app.applicationFormType === 'sfag' ? app.contactSchool?.mobileNo ?? '' : app.standardInfo?.phone ?? '';
}

function applicantProgram(app: AdminApplication): string {
  return app.applicationFormType === 'sfag' ? app.personalInfo?.course ?? '' : app.standardInfo?.program ?? '';
}

function applicantYearLevel(app: AdminApplication): string {
  return app.applicationFormType === 'sfag' ? app.personalInfo?.yearLevel ?? '' : app.standardInfo?.yearLevel ?? '';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Philippine academic-year convention: June through May. A submission in
// March 2026 falls in AY 2025–2026; a submission in September 2026 falls
// in AY 2026–2027. This is derived purely from createdAt — there's no
// separate "cycle"/"term" field on Application, so this is the best
// available proxy for "which scholarship cycle was this."
function academicYearOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-indexed, so 5 = June
  const startYear = month >= 5 ? year : year - 1;
  return `AY ${startYear}\u2013${startYear + 1}`;
}

// --- Scholar aggregation -----------------------------------------------

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
    const oldest = [...apps].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
    const latest = sorted[0];
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

// Flattens history entries from every one of a scholar's applications into
// one chronological longitudinal record, tagging each entry with which
// scholarship/cycle it belongs to so a merged timeline still reads clearly
// even when it's stitched together from several separate applications.
interface MergedHistoryEntry extends HistoryEntry {
  scholarshipName: string;
  applicationId: string;
  cycle: string;
}

function buildMergedHistory(applications: AdminApplication[]): MergedHistoryEntry[] {
  const entries: MergedHistoryEntry[] = [];
  applications.forEach(app => {
    const appEntries = app.history && app.history.length > 0
      ? app.history
      : [{ status: app.status, changedAt: app.createdAt } as HistoryEntry];
    appEntries.forEach(h => {
      entries.push({
        ...h,
        scholarshipName: app.scholarshipName,
        applicationId: app._id,
        cycle: academicYearOf(app.createdAt)
      });
    });
  });
  return entries.sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime());
}

// --- Presentational pieces ---------------------------------------------

function Avatar({ name, avatarUrl, size = 'md' }: { name: string; avatarUrl?: string; size?: 'sm' | 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false);
  const dims = size === 'lg' ? 'w-14 h-14 sm:w-16 sm:h-16 text-base sm:text-lg' : size === 'sm' ? 'w-8 h-8 text-[10px]' : 'w-9 h-9 sm:w-10 sm:h-10 text-[11px] sm:text-xs';

  if (avatarUrl && !failed) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        onError={() => setFailed(true)}
        className={`${dims} rounded-full object-cover shrink-0 shadow-inner border border-emerald-100`}
      />
    );
  }

  return (
    <div className={`${dims} rounded-full bg-brand-green text-white font-display font-bold flex items-center justify-center shrink-0 shadow-inner border border-emerald-100`}>
      {initials(name)}
    </div>
  );
}

function StatusBadge({ status }: { status: AppStatus }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES['Under Evaluation'];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold whitespace-nowrap ${style.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
      {status}
    </span>
  );
}

function CycleBadge({ cycle }: { cycle: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">
      {cycle}
    </span>
  );
}

function StatTile({ label, value, icon: Icon, accent }: { label: string; value: string | number; icon: React.ElementType; accent: string }) {
  return (
    <div className="p-3.5 sm:p-4 rounded-xl border border-slate-100 bg-white card-shadow min-w-0">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{label}</p>
        <div className={`p-1.5 rounded-md shrink-0 ${accent}`}><Icon className="w-3.5 h-3.5" /></div>
      </div>
      <h3 className="text-xl sm:text-2xl font-display font-extrabold text-brand-green">{value}</h3>
    </div>
  );
}

function MergedTimeline({ entries }: { entries: MergedHistoryEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-xs text-slate-400">No recorded history for this scholar yet.</p>;
  }
  return (
    <div className="relative pl-6">
      <div className="absolute left-[7px] top-1.5 bottom-1.5 w-px bg-slate-200" />
      <div className="space-y-6">
        {entries.map((entry, idx) => {
          const style = TIMELINE_STYLES[entry.status] ?? TIMELINE_STYLES['Under Evaluation'];
          const Icon = style.icon;
          return (
            <div key={`${entry.applicationId}-${idx}`} className="relative flex gap-3 min-w-0">
              <div className={`absolute -left-6 top-0.5 w-3.5 h-3.5 rounded-full ring-4 ring-white flex items-center justify-center shrink-0 ${style.dot}`} />
              <Icon className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <p className="text-sm font-bold text-slate-800">{entry.status}</p>
                  <span className="text-[11px] text-slate-400">{formatDateTime(entry.changedAt)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  <span className="text-[11px] text-slate-500 font-medium truncate">{entry.scholarshipName}</span>
                  <CycleBadge cycle={entry.cycle} />
                </div>
                {entry.changedBy && (
                  <p className="text-[11px] text-slate-400 mt-0.5">by {entry.changedBy === 'student' ? 'Student' : entry.changedBy}</p>
                )}
                {entry.note && (
                  <p className="text-xs text-slate-600 mt-1.5 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 leading-relaxed break-words">
                    {entry.note}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type SortOption = 'recent' | 'most_applications' | 'name';

export default function AdminScholars({ applications, isLoading }: AdminScholarsProps) {
  const [search, setSearch] = useState('');
  const [renewalFilter, setRenewalFilter] = useState<'all' | 'renewing' | 'first_time'>('all');
  const [sort, setSort] = useState<SortOption>('recent');
  const [selectedStudentNumber, setSelectedStudentNumber] = useState<string | null>(null);

  const scholars = useMemo(() => buildScholarSummaries(applications), [applications]);

  const filtered = useMemo(() => {
    let list = scholars;
    if (renewalFilter === 'renewing') list = list.filter(s => s.isRenewing);
    if (renewalFilter === 'first_time') list = list.filter(s => !s.isRenewing);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.studentNumber.toLowerCase().includes(q) ||
        s.program.toLowerCase().includes(q)
      );
    }
    const sorted = [...list];
    if (sort === 'most_applications') sorted.sort((a, b) => b.totalApplications - a.totalApplications);
    else if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    // 'recent' is already the default order from buildScholarSummaries
    return sorted;
  }, [scholars, search, renewalFilter, sort]);

  const renewingCount = useMemo(() => scholars.filter(s => s.isRenewing).length, [scholars]);

  const selected = selectedStudentNumber ? scholars.find(s => s.studentNumber === selectedStudentNumber) ?? null : null;
  const mergedHistory = useMemo(() => (selected ? buildMergedHistory(selected.applications) : []), [selected]);

  // === Detail view: one scholar's full longitudinal record ================
  if (selected) {
    return (
      <div className="space-y-5 sm:space-y-6">
        <button
          onClick={() => setSelectedStudentNumber(null)}
          className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-500 hover:text-brand-green transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Scholars</span>
        </button>

        <div className="bg-white rounded-xl border border-slate-100 p-5 sm:p-6 md:p-8 card-shadow">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="flex items-center gap-4 sm:contents">
              <Avatar name={selected.name} avatarUrl={selected.avatarUrl} size="lg" />
              <div className="flex-1 min-w-0 sm:hidden">
                <h2 className="font-display font-black text-lg text-slate-900 tracking-tight truncate">{selected.name}</h2>
                {selected.isRenewing && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-brand-green">
                    <Repeat className="w-3 h-3" /> Returning Scholar
                  </span>
                )}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="hidden sm:flex flex-wrap items-center gap-2.5">
                <h2 className="font-display font-black text-xl md:text-2xl text-slate-900 tracking-tight truncate">{selected.name}</h2>
                {selected.isRenewing && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-brand-green border border-emerald-200">
                    <Repeat className="w-3 h-3" /> Returning Scholar
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-2 sm:mt-1.5">Student No. {selected.studentNumber}</p>
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-[11px] text-slate-400 font-semibold">
                <span>First submission {formatDate(selected.firstSubmission)}</span>
                <span>{selected.cycles.length} cycle{selected.cycles.length !== 1 ? 's' : ''} active: {selected.cycles.join(', ')}</span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:flex sm:flex-col gap-2 sm:gap-1.5 sm:text-right shrink-0 pt-4 sm:pt-0 border-t sm:border-t-0 border-slate-100">
              <div className="flex items-center gap-1.5 text-xs text-slate-600 sm:justify-end min-w-0">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{selected.email || '—'}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-600 sm:justify-end min-w-0">
                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{selected.phone || '—'}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-600 sm:justify-end min-w-0">
                <GraduationCap className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{selected.program || '—'} &middot; {selected.yearLevel || '—'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatTile label="Total Applications" value={selected.totalApplications} icon={FileText} accent="bg-slate-50 text-slate-500" />
          <StatTile label="Approved" value={selected.approvedCount} icon={CheckCircle} accent="bg-emerald-50 text-brand-green" />
          <StatTile label="Rejected" value={selected.rejectedCount} icon={XCircle} accent="bg-rose-50 text-rose-600" />
          <StatTile label="Current Status" value={selected.latestStatus} icon={Clock} accent="bg-amber-50 text-amber-600" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6 items-start">
          {/* Application-by-application list */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100 card-shadow p-4 sm:p-6">
            <h3 className="font-display font-bold text-sm text-slate-900 uppercase tracking-wider mb-4">Applications by Cycle</h3>
            <div className="space-y-3">
              {selected.applications.map(app => (
                <div key={app._id} className="p-3.5 sm:p-4 rounded-xl border border-slate-100 bg-slate-50/40">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <p className="text-sm font-bold text-slate-800 truncate">{app.scholarshipName}</p>
                    <StatusBadge status={app.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 font-semibold">
                    <CycleBadge cycle={academicYearOf(app.createdAt)} />
                    <span>Submitted {formatDate(app.createdAt)}</span>
                    <span className="capitalize">{app.applicationFormType}</span>
                  </div>
                  {app.reviewNote && (
                    <p className="text-xs text-slate-600 mt-2 bg-white border border-slate-100 rounded-lg px-3 py-2 leading-relaxed break-words">
                      {app.reviewNote}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Merged longitudinal timeline */}
          <div className="bg-white rounded-xl border border-slate-100 card-shadow p-4 sm:p-6 lg:sticky lg:top-24">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-bold text-sm text-slate-900 uppercase tracking-wider">Full Timeline</h3>
              <History className="w-4 h-4 text-slate-300 shrink-0" />
            </div>
            <MergedTimeline entries={mergedHistory} />
          </div>
        </div>
      </div>
    );
  }

  // === List view: all scholars ============================================
  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h2 className="font-display font-black text-lg sm:text-xl md:text-2xl text-slate-900 tracking-tight">Scholar Lifecycle</h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">Track each student's applications and outcomes across every cycle.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatTile label="Total Scholars" value={scholars.length} icon={Users} accent="bg-slate-50 text-slate-500" />
        <StatTile label="Returning Scholars" value={renewingCount} icon={Repeat} accent="bg-emerald-50 text-brand-green" />
        <StatTile label="First-Time Applicants" value={scholars.length - renewingCount} icon={Award} accent="bg-sky-50 text-sky-600" />
      </div>

      <div className="bg-white rounded-xl border border-slate-100 card-shadow">
        <div className="p-4 md:p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name, student no., or program..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all placeholder:text-slate-300"
            />
          </div>
          <div className="flex gap-3">
            <div className="relative flex-1 md:flex-none">
              <select
                value={renewalFilter}
                onChange={e => setRenewalFilter(e.target.value as typeof renewalFilter)}
                className="w-full appearance-none pl-3.5 pr-9 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all"
              >
                <option value="all">All Scholars</option>
                <option value="renewing">Returning Only</option>
                <option value="first_time">First-Time Only</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            <div className="relative flex-1 md:flex-none">
              <select
                value={sort}
                onChange={e => setSort(e.target.value as SortOption)}
                className="w-full appearance-none pl-3.5 pr-9 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all"
              >
                <option value="recent">Most Recent Activity</option>
                <option value="most_applications">Most Applications</option>
                <option value="name">Name (A–Z)</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-xs text-slate-400 font-semibold">Loading scholars...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-400">No scholars match your filters.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map(scholar => (
              <button
                key={scholar.studentNumber}
                onClick={() => setSelectedStudentNumber(scholar.studentNumber)}
                className="w-full flex items-center gap-3 sm:gap-4 p-3.5 sm:p-4 md:p-5 hover:bg-slate-50/60 transition-colors text-left group"
              >
                <Avatar name={scholar.name} avatarUrl={scholar.avatarUrl} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-slate-800 truncate">{scholar.name}</p>
                    {scholar.isRenewing && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-brand-green shrink-0">
                        <Repeat className="w-3 h-3" /> Returning
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    Student No. {scholar.studentNumber} &middot; {scholar.program || 'Unspecified'}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    {scholar.cycles.map(cycle => <CycleBadge key={cycle} cycle={cycle} />)}
                  </div>
                </div>
                <div className="hidden md:flex flex-col items-end text-right shrink-0 gap-1">
                  <span className="text-xs font-bold text-slate-700">{scholar.totalApplications} application{scholar.totalApplications !== 1 ? 's' : ''}</span>
                  <span className="text-[11px] text-slate-400">{scholar.approvedCount} approved</span>
                </div>
                <div className="shrink-0"><StatusBadge status={scholar.latestStatus} /></div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}