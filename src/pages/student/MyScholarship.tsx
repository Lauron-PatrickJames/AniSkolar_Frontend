import React, { useState } from 'react';
import { OFFICE_LABELS } from '../../data/scholarships';
import { useAuth } from '@clerk/react';
import { AlertCircle, ArrowRight, Award, Check, CheckCircle2, Info, Search } from 'lucide-react';
import { Application, Scholarship } from '../../types';
import { Holdings, SFAG_ID } from '../../utils/eligibility';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

// Scholars only: the scholarship(s) the student holds, with what it takes to
// keep it and shortcuts to Renewal and Duty Hours. Replaces Explore Grants in
// the sidebar once the student is a scholar. When two scholarships are
// approved at once, the student picks the one to keep here (only one
// internally funded scholarship can be credited); the other is declined
// (POST /api/students/me/holdings/choose).

const OFFICE_NAMES: Record<string, string> = { ...OFFICE_LABELS, LSO: 'Admissions and Scholarship Office' };

// "3 weeks", "2 months": how long the student has been a scholar.
function scholarFor(iso?: string | null): string {
  if (!iso) return '—';
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  if (days < 1) return 'Since today';
  if (days < 14) return `${days} day${days === 1 ? '' : 's'}`;
  if (days < 60) return `${Math.floor(days / 7)} weeks`;
  if (days < 730) return `${Math.floor(days / 30)} months`;
  return `${Math.floor(days / 365)} years`;
}

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
    <div className="space-y-4">
      {mustChoose && <ChoosePanel holdings={holdings} scholarships={scholarships} onChosen={onChosen} />}

      {!mustChoose && held.map(h => {
        const s = scholarships.find(x => x.id === h.scholarshipId);
        const d = holdings.details?.find(x => x.scholarshipId === h.scholarshipId);
        const isSfag = h.scholarshipId === SFAG_ID;
        const keep = [...(s?.retentionConditions ?? []), ...(isSfag ? ['Complete your duty hours'] : [])];
        const grant = d?.grantPercentage != null ? `${d.grantPercentage}%` : null;
        return (
          <section key={h.scholarshipId} className="rounded-2xl border border-slate-200 bg-white">
            {/* Name, office and the grant */}
            <div className="flex flex-wrap items-start justify-between gap-6 px-5 pt-6 pb-5 sm:px-8 sm:pt-8">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs font-medium text-slate-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-green" aria-hidden /> Active scholar
                </p>
                <h2 className="mt-2 font-display text-2xl font-bold leading-tight text-slate-900 sm:text-[1.75rem]">{h.scholarshipName}</h2>
                <p className="mt-1 text-sm text-slate-500">{OFFICE_NAMES[s?.office ?? 'LSO'] ?? s?.provider?.office ?? ''}</p>
              </div>
              <div className="sm:text-right">
                <p className="font-display text-3xl font-bold leading-none tabular-nums text-slate-900 sm:text-4xl">{grant ?? '—'}</p>
                <p className="mt-1.5 text-xs text-slate-500">{grant ? 'tuition discount' : isSfag ? 'grant set by the office' : 'grant'}</p>
              </div>
            </div>

            <dl className="mx-5 grid grid-cols-2 gap-y-4 border-y border-slate-100 py-4 sm:mx-8 sm:grid-cols-3">
              <Fact label="Approved" value={formatDate(d?.approvedAt)} />
              <Fact label="Scholar for" value={scholarFor(d?.approvedAt)} />
              <Fact label="Reference" value={d?.referenceCode ?? '—'} mono />
            </dl>

            <div className="px-5 py-6 sm:px-8">
              {/* What it takes to keep it */}
              <div>
                <h3 className="text-sm font-semibold text-slate-900">To keep your scholarship</h3>
                <p className="mt-0.5 text-xs text-slate-500">Checked each semester when you renew.</p>
                {keep.length ? (
                  <ul className="mt-4 space-y-2.5">
                    {keep.map(k => (
                      <li key={k} className="flex items-start gap-2.5 text-sm text-slate-700">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                        {k}
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-4 text-sm text-slate-500">Follow the office’s announcements for what’s needed each semester.</p>}
                {!s?.noRenewal && (
                  <button
                    type="button"
                    onClick={() => onNavigate('renewals')}
                    className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-green-dark focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
                  >
                    Go to renewal <ArrowRight className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>

            </div>
          </section>
        );
      })}

      {/* The one-scholarship rule, where it can't be missed. */}
      {!mustChoose && (
        <aside className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:px-8" aria-label="Good to know">
          <Info className="hidden h-5 w-5 shrink-0 text-slate-400 sm:block" aria-hidden />
          <p className="min-w-0 flex-1 text-sm leading-relaxed text-slate-600">
            <span className="font-semibold text-slate-900">One scholarship at a time.</span>{' '}
            Only one internally funded scholarship can be credited at a time. You can still browse the others.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('explore')}
            className="inline-flex shrink-0 items-center gap-1 self-start text-sm font-semibold text-brand-green hover:text-brand-green-dark hover:underline focus:outline-hidden focus-visible:underline sm:self-auto"
          >
            Explore scholarships <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </aside>
      )}
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 pr-4">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-0.5 truncate text-sm font-semibold text-slate-900 ${mono ? 'font-mono text-[13px]' : ''}`}>{value}</dd>
    </div>
  );
}

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
