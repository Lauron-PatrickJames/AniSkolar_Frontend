import React, { useState } from 'react';
import { useAuth } from '@clerk/react';
import { AlertCircle, Award, CalendarCheck, CheckCircle2, Clock, FileText, Hash, Percent, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { Application, Scholarship } from '../../types';
import { Holdings, SFAG_ID } from '../../utils/eligibility';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

// Scholars only: the scholarship(s) the student holds, with what it takes to
// keep it and shortcuts to Renewal and Duty Hours. Replaces Explore Grants in
// the sidebar once the student is a scholar. When two scholarships are
// approved at once, the student picks the one to keep here (only one
// internally funded scholarship can be credited); the other is declined
// (POST /api/students/me/holdings/choose).

const OFFICE_NAMES: Record<string, string> = {
  LSO: 'Admissions and Scholarship Office',
  POLCA: 'POLCA Office',
  ALUMNI: 'Alumni Office',
};

const formatDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' }) : '—');

export default function MyScholarship({ holdings, scholarships, applications, onNavigate, onViewScholarship, onChosen }: {
  holdings: Holdings | null;
  scholarships: Scholarship[];
  applications: Application[];
  onNavigate: (page: string) => void;
  onViewScholarship: (id: string) => void;
  // After choosing between two: refresh holdings and applications.
  onChosen: () => void;
}) {
  const held = holdings?.held ?? [];
  const mustChoose = held.length > 1;

  if (!holdings) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-slate-400" role="status">Loading your scholarship…</div>
    );
  }
  if (!held.length) {
    return (
      <div className="mx-auto max-w-lg space-y-3 rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <Award className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="font-display text-lg font-bold text-slate-900">No active scholarship</h2>
        <p className="text-sm text-slate-500">Once an application is approved, your scholarship shows here.</p>
        <button type="button" onClick={() => onNavigate('explore')} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-green px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-green-dark">
          <Search className="h-4 w-4" /> Explore scholarships
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {mustChoose && <ChoosePanel holdings={holdings} scholarships={scholarships} onChosen={onChosen} />}

      {!mustChoose && held.map(h => {
        const s = scholarships.find(x => x.id === h.scholarshipId);
        const d = holdings.details?.find(x => x.scholarshipId === h.scholarshipId);
        const isSfag = h.scholarshipId === SFAG_ID;
        const keep = s?.retentionConditions ?? [];
        return (
          <section key={h.scholarshipId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="bg-linear-to-br from-brand-green to-emerald-700 p-6 text-white">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold ring-1 ring-white/25">
                <ShieldCheck className="h-3.5 w-3.5" /> Active scholar
              </span>
              <h2 className="mt-3 font-display text-2xl font-bold leading-tight">{h.scholarshipName}</h2>
              <p className="mt-1 text-sm text-emerald-50">{OFFICE_NAMES[s?.office ?? 'LSO'] ?? s?.provider?.office ?? ''}</p>
            </div>

            <dl className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <Stat icon={Percent} label="Grant" value={d?.grantPercentage != null ? `${d.grantPercentage}%` : isSfag ? 'Set by the office' : '—'} />
              <Stat icon={CalendarCheck} label="Approved on" value={formatDate(d?.approvedAt)} />
              <Stat icon={Hash} label="Reference" value={d?.referenceCode ?? '—'} mono />
            </dl>

            <div className="grid gap-6 border-t border-slate-100 p-6 md:grid-cols-2">
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-900">To keep your scholarship</h3>
                {keep.length ? (
                  <ul className="space-y-2">
                    {keep.map(k => (
                      <li key={k} className="flex items-start gap-2 text-sm text-slate-600">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" /> {k}
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-slate-500">Follow the office’s announcements for what’s needed each semester.</p>}
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-900">Shortcuts</h3>
                <div className="grid gap-2">
                  {!s?.noRenewal && <Shortcut icon={RefreshCw} label="Renew for next semester" hint="Submit your grades each semester" onClick={() => onNavigate('renewals')} />}
                  {isSfag && <Shortcut icon={Clock} label="Duty hours" hint="Log your duties and see your progress" onClick={() => onNavigate('duty-hours')} />}
                  <Shortcut icon={FileText} label="My applications" hint={`${applications.length} submitted`} onClick={() => onNavigate('applications')} />
                  <Shortcut icon={Award} label="Scholarship details" hint="Benefits, requirements and contacts" onClick={() => onViewScholarship(h.scholarshipId)} />
                </div>
              </div>
            </div>
          </section>
        );
      })}

      {!mustChoose && (
        <p className="text-center text-xs text-slate-400">
          Only one internally funded scholarship can be credited at a time. To look at other scholarships, use{' '}
          <button type="button" onClick={() => onNavigate('explore')} className="font-semibold text-brand-green underline hover:text-brand-green-dark">Explore scholarships</button>.
        </p>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, mono }: { icon: React.ElementType; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-3 p-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-brand-green"><Icon className="h-5 w-5" /></span>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-slate-500">{label}</dt>
        <dd className={`truncate text-sm font-bold text-slate-900 ${mono ? 'font-mono' : ''}`}>{value}</dd>
      </div>
    </div>
  );
}

function Shortcut({ icon: Icon, label, hint, onClick }: { icon: React.ElementType; label: string; hint: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition-colors hover:border-brand-green/40 hover:bg-emerald-50/40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green">
      <Icon className="h-5 w-5 shrink-0 text-brand-green" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        <span className="block truncate text-xs text-slate-500">{hint}</span>
      </span>
    </button>
  );
}

// Two (or more) approved at once: pick the one to keep.
function ChoosePanel({ holdings, scholarships, onChosen }: { holdings: Holdings; scholarships: Scholarship[]; onChosen: () => void }) {
  const { getToken } = useAuth();
  const [picked, setPicked] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pickedName = holdings.held.find(h => h.scholarshipId === picked)?.scholarshipName;
  const others = holdings.held.filter(h => h.scholarshipId !== picked).map(h => h.scholarshipName);

  const submit = async () => {
    if (!picked) return;
    setBusy(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/api/students/me/holdings/choose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ keepScholarshipId: picked }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Your choice couldn’t be saved.');
      onChosen();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your choice couldn’t be saved.');
      setBusy(false);
    }
  };

  return (
    <section className="space-y-5 rounded-2xl border border-amber-200 bg-amber-50/60 p-6">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900">Congratulations — you were approved for {holdings.held.length} scholarships</h2>
          <p className="mt-1 text-sm text-slate-600">
            Only one internally funded scholarship can be credited at a time, so choose the one to keep. Most students keep the bigger grant.
            The other is declined and its slot goes to another student. <span className="font-semibold">This can’t be undone.</span>
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Scholarship to keep">
        {holdings.held.map(h => {
          const s = scholarships.find(x => x.id === h.scholarshipId);
          const d = holdings.details?.find(x => x.scholarshipId === h.scholarshipId);
          const active = picked === h.scholarshipId;
          return (
            <button
              key={h.scholarshipId}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => { setPicked(h.scholarshipId); setConfirming(false); }}
              className={`rounded-xl border-2 bg-white p-4 text-left transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green ${active ? 'border-brand-green' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="font-display text-sm font-bold text-slate-900">{h.scholarshipName}</span>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${active ? 'border-brand-green bg-brand-green text-white' : 'border-slate-300'}`}>
                  {active && <CheckCircle2 className="h-4 w-4" />}
                </span>
              </span>
              <span className="mt-2 block text-xs text-slate-500">{d?.grantPercentage != null ? `${d.grantPercentage}% grant · ` : ''}{OFFICE_NAMES[s?.office ?? 'LSO']}</span>
              {s?.benefits?.[0] && <span className="mt-2 block text-xs text-slate-600 line-clamp-2">{s.benefits[0]}</span>}
            </button>
          );
        })}
      </div>

      {error && <p role="alert" className="text-sm font-semibold text-rose-600">{error}</p>}

      {confirming && picked ? (
        <div className="space-y-3 rounded-xl bg-white p-4 ring-1 ring-amber-200" role="alert">
          <p className="text-sm text-slate-700">Keep the <span className="font-bold">{pickedName}</span> and decline the <span className="font-bold">{others.join(' and the ')}</span>? The office is notified.</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Go back</button>
            <button type="button" onClick={submit} disabled={busy} className="rounded-xl bg-brand-green px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-green-dark disabled:opacity-60">{busy ? 'Saving…' : `Yes, keep ${pickedName}`}</button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <button type="button" onClick={() => setConfirming(true)} disabled={!picked} className="rounded-xl bg-brand-green px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-green-dark disabled:cursor-not-allowed disabled:opacity-50">
            Keep this scholarship
          </button>
        </div>
      )}
    </section>
  );
}
