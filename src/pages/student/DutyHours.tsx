import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/react';
import { AlertCircle, Building2, CalendarDays, Clock, Loader2, Plus, Printer, RefreshCw, Trash2, Check, Lock, Target } from 'lucide-react';
import { StudentProfile } from '../../types';
import {
  ClaimStatus, CreditedEvent, DUTY_TERMS, DutyEntry, DutyLog, DutyRule, DutySummary, DutyTerm, EventClaim, entryHours, format12h, formatDutyDate, formatHours, yearGroupLabel, dutyRuleError, DUTY_RULES_TEXT, dutyTimeOptions,
  isTimeRange, sortEntries, summarize, termLabel, todayInManila, weekday, weeklyTotals
} from '../../utils/dutyHours';
import { StatsTableSkeleton } from '../../components/Skeletons';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

// Duty hours for SFAG scholars, replacing the office's "SFAG Duty
// Calculator" sheet: the AdSO assigns the office and sets the term's
// deadline; the scholar enters each duty (date, time in, time out, in
// 30-minute steps), and
// claims the credited events they attended; the day,
// hours, totals and weekly breakdown are worked out here. Saved to
// /api/duty-hours/mine so the AdSO can monitor it.

interface TermKey { academicYear: number; term: DutyTerm }
const termKey = (t: TermKey) => `${t.academicYear}|${t.term}`;

// Weekday colours, as on the office's sheet.
const DAY_COLORS: Record<string, string> = {
  Mon: 'bg-rose-400', Tue: 'bg-orange-400', Wed: 'bg-amber-400', Thu: 'bg-emerald-400', Fri: 'bg-sky-400', Sat: 'bg-violet-400', Sun: 'bg-slate-400',
};

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base sm:text-sm focus:border-brand-green focus:outline-hidden focus:ring-2 focus:ring-brand-green/20';
const labelClass = 'text-xs font-bold text-slate-700';

export default function DutyHours({ student }: { student: StudentProfile }) {
  const { getToken } = useAuth();
  const [term, setTerm] = useState<TermKey | null>(null);
  const [current, setCurrent] = useState<TermKey | null>(null);
  const [knownTerms, setKnownTerms] = useState<TermKey[]>([]);
  const [log, setLog] = useState<DutyLog | null>(null);
  const [rule, setRule] = useState<DutyRule>({ percentage: null, yearGroup: null, requiredHours: null });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [saveError, setSaveError] = useState('');
  const [events, setEvents] = useState<CreditedEvent[]>([]);
  const [claims, setClaims] = useState<EventClaim[]>([]);
  const [claimBusy, setClaimBusy] = useState<string | null>(null);
  // The office has a head in AniSkolar: only duties they confirm count.
  const [confirmationRequired, setConfirmationRequired] = useState(false);
  // The office head has evaluated this term (scores aren't shown).
  const [evaluated, setEvaluated] = useState(false);

  const load = useCallback(async (t: TermKey | null) => {
    setLoading(true);
    setLoadError('');
    try {
      const token = await getToken();
      const qs = t ? `?academicYear=${t.academicYear}&term=${encodeURIComponent(t.term)}` : '';
      const res = await fetch(`${API_BASE_URL}/api/duty-hours/mine${qs}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to load your duty hours.');
      setCurrent(body.current);
      setKnownTerms(body.terms ?? []);
      setLog(body.log);
      setConfirmationRequired(!!body.summary?.confirmationRequired);
      setEvaluated(!!body.evaluated);
      if (body.rule) setRule(body.rule);
      setEvents(body.events ?? []);
      setClaims(body.claims ?? []);
      setTerm({ academicYear: body.log.academicYear, term: body.log.term });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load your duty hours.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { load(null); }, [load]);

  // Saves the whole log; on failure the screen goes back to what's saved.
  const save = async (next: DutyLog) => {
    const previous = log;
    setLog(next);
    setSaveState('saving');
    setSaveError('');
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/api/duty-hours/mine`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(next),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to save your duty hours.');
      setLog(body.log);
      setConfirmationRequired(!!body.summary?.confirmationRequired);
      if (body.rule) setRule(body.rule);
      if (body.claims) setClaims(body.claims);
      setSaveState('saved');
      if (term && !knownTerms.some(k => termKey(k) === termKey(term))) setKnownTerms(prev => [term, ...prev]);
    } catch (err) {
      setLog(previous);
      setSaveState('idle');
      setSaveError(err instanceof Error ? err.message : 'Failed to save your duty hours.');
    }
  };

  // Claims (POST) or withdraws (DELETE) an event; the response is the log.
  const claimEvent = async (eventId: string, withdraw: boolean) => {
    setClaimBusy(eventId);
    setSaveError('');
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/api/duty-hours/mine/claims${withdraw ? `/${eventId}` : ''}`, {
        method: withdraw ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: withdraw ? undefined : JSON.stringify({ eventId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to update your claim.');
      setLog(body.log);
      setClaims(body.claims ?? []);
      if (term && !knownTerms.some(k => termKey(k) === termKey(term))) setKnownTerms(prev => [term, ...prev]);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to update your claim.');
    } finally {
      setClaimBusy(null);
    }
  };

  // Terms to choose from: the current one, the one before, and any with a log.
  const termOptions = useMemo(() => {
    const list: TermKey[] = [];
    const add = (t: TermKey) => { if (!list.some(x => termKey(x) === termKey(t))) list.push(t); };
    if (current) {
      add(current);
      add(current.term === '2nd Semester'
        ? { academicYear: current.academicYear, term: '1st Semester' }
        : { academicYear: current.academicYear - 1, term: '2nd Semester' });
    }
    knownTerms.forEach(add);
    return list.sort((a, b) => b.academicYear - a.academicYear || DUTY_TERMS.indexOf(b.term) - DUTY_TERMS.indexOf(a.term));
  }, [current, knownTerms]);

  const summary = useMemo(() => (log ? summarize(log, undefined, { confirmationRequired }) : null), [log, confirmationRequired]);

  if (loading && !log) {
    return <StatsTableSkeleton label="Loading duty hours" />;
  }
  if (loadError && !log) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center space-y-3">
        <p className="text-sm font-semibold text-rose-900">{loadError}</p>
        <button type="button" onClick={() => load(term)} className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-800 hover:text-rose-950">
          <RefreshCw className="w-3.5 h-3.5" /> Try again
        </button>
      </div>
    );
  }
  if (!log || !summary || !term) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900">Duty Hours</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
            Log each duty with its time in and time out. Your hours, weekly totals and what's left are worked out for you, and the scholarship office can see your progress.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Term"
            value={termKey(term)}
            onChange={e => { const [y, t] = e.target.value.split('|'); load({ academicYear: Number(y), term: t as DutyTerm }); }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 focus:border-brand-green focus:outline-hidden"
          >
            {termOptions.map(t => <option key={termKey(t)} value={termKey(t)}>{termLabel(t)}</option>)}
          </select>
          <button
            type="button"
            onClick={() => printReport(student, log, summary)}
            disabled={log.entries.length === 0 && log.specialEvents.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>
      </div>

      {saveError && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-900">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" aria-hidden />{saveError}
        </p>
      )}

      {summary.required !== null && summary.completed >= summary.required && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5">
          <Check className="w-5 h-5 shrink-0 mt-0.5 text-brand-green" aria-hidden />
          <div className="text-sm text-emerald-900 leading-relaxed">
            <p className="font-bold">You’ve completed your duty hours for this semester.</p>
            <p>
              {evaluated
                ? `${log.officeAssigned || 'Your office'} has evaluated you. It goes into your renewal for next semester.`
                : `${log.officeAssigned ? `The head of ${log.officeAssigned}` : 'Your office'} has been asked to evaluate you; it goes into your renewal for next semester. There’s nothing else you need to do for duty hours this semester.`}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <DetailsCard log={log} rule={rule} onSave={save} saveState={saveState} />
        <SummaryCard summary={summary} />
      </div>

      {/* Duty is rendered in the office the AdSO assigns, so logging opens
          once there is one (the server refuses new duties before that). */}
      {log.officeAssigned ? <AddDutyForm log={log} onSave={save} /> : <AwaitingOfficeCard />}

      {(log.officeAssigned || log.entries.length > 0) && (
        <RegularDutyTable log={log} onSave={save} confirmationRequired={confirmationRequired} />
      )}

      <div className={`grid grid-cols-1 gap-6 ${log.entries.length > 0 ? 'lg:grid-cols-2' : ''}`}>
        <EventsCard events={events} claims={claims} busyId={claimBusy} onClaim={id => claimEvent(id, false)} onWithdraw={id => claimEvent(id, true)} />
        {log.entries.length > 0 && <WeeklyCard entries={log.entries} />}
      </div>
    </div>
  );
}

// --- Details & summary -------------------------------------------------------------

function DetailsCard({ log, rule, onSave, saveState }: {
  log: DutyLog; rule: DutyRule; onSave: (log: DutyLog) => void; saveState: 'idle' | 'saving' | 'saved';
}) {
  // Set by the AdSO for the scholar's grant percentage: shown, not edited.
  const hoursFromAdso = rule.requiredHours !== null;
  const [required, setRequired] = useState(log.requiredHours !== undefined ? String(log.requiredHours) : '');
  useEffect(() => {
    setRequired(log.requiredHours !== undefined ? String(log.requiredHours) : '');
  }, [log.academicYear, log.term, log.requiredHours]);

  const commit = () => {
    const req = required.trim() === '' ? undefined : Number(required);
    if (req !== undefined && (!Number.isFinite(req) || req < 0)) return;
    if (hoursFromAdso || req === log.requiredHours) return;
    onSave({ ...log, requiredHours: req });
  };

  return (
    <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-base text-slate-900">Details</h3>
        {saveState === 'saving' && <span className="text-[11px] text-slate-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving</span>}
        {saveState === 'saved' && <span className="text-[11px] text-brand-green font-semibold flex items-center gap-1"><Check className="w-3 h-3" /> Saved</span>}
      </div>
      <div>
        <span className={labelClass}>Office assigned</span>
        <div className="mt-1.5 flex items-start gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5">
          <Building2 className="mt-0.5 w-4 h-4 shrink-0 text-slate-400" aria-hidden />
          {log.officeAssigned ? (
            <p className="text-sm font-semibold text-slate-900">{log.officeAssigned}</p>
          ) : (
            <p className="text-sm text-slate-500">Not assigned yet. The scholarship office will assign where you render your duty.</p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
        <div>
          <span className={labelClass}>Deadline</span>
          <p className="mt-1.5 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-900">
            <Lock className="w-3.5 h-3.5 shrink-0 text-slate-400" aria-hidden />
            {log.deadline ? formatDutyDate(log.deadline, true) : <span className="font-normal text-slate-500">Not set yet</span>}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">Set by the scholarship office for everyone.</p>
        </div>
        {hoursFromAdso ? (
          <div>
            <span className={labelClass}>Required hours</span>
            <p className="mt-1.5 rounded-xl bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-900">{formatHours(rule.requiredHours)}</p>
          </div>
        ) : (
          <label className="block">
            <span className={labelClass}>Required hours</span>
            <input type="number" inputMode="decimal" min={0} step="0.5" value={required} onChange={e => setRequired(e.target.value)} onBlur={commit} placeholder="e.g. 136" className={`mt-1.5 ${inputClass}`} />
          </label>
        )}
      </div>
      {rule.percentage !== null && (
        <p className="text-[11px] text-slate-500">
          {rule.percentage}% grant{rule.yearGroup ? `, ${yearGroupLabel(rule.yearGroup)}` : ''}
          {hoursFromAdso
            ? `: ${formatHours(rule.requiredHours)} hours a term, set by the scholarship office.`
            : rule.yearGroup
              ? '. Enter the hours the scholarship office gave you.'
              : ". Add your year level to your profile so the office's hours apply, or enter the hours you were given."}
        </p>
      )}
    </div>
  );
}

function SummaryCard({ summary }: { summary: DutySummary }) {
  const pct = summary.required ? Math.min(100, (summary.completed / summary.required) * 100) : null;
  const done = summary.remaining !== null && summary.remaining <= 0;
  const stats = [
    {
      label: summary.confirmationRequired ? 'Hours confirmed' : 'Hours completed',
      value: formatHours(summary.completed),
      hint: [
        summary.specialHours ? `incl. ${formatHours(summary.specialHours)} from events` : '',
        summary.waitingHours ? `${formatHours(summary.waitingHours)} waiting for your office to confirm` : '',
        summary.flaggedCount ? `${summary.flaggedCount} flagged by your office` : '',
      ].filter(Boolean).join(' · ') || undefined,
    },
    { label: 'Hours remaining', value: summary.remaining === null ? '—' : formatHours(Math.max(0, summary.remaining)), hint: summary.remaining !== null && summary.remaining < 0 ? `${formatHours(-summary.remaining)} over the requirement` : summary.required === null ? 'Enter the required hours' : undefined },
    { label: 'Weekly hours needed', value: formatHours(summary.weeklyNeeded), hint: summary.weeklyNeeded === null ? (summary.required === null ? undefined : 'Shown once the office sets the deadline') : 'to finish by the deadline' },
  ];
  return (
    <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-5">
      <h3 className="flex items-center gap-2 font-display font-bold text-base text-slate-900"><Target className="w-4 h-4 text-brand-green" aria-hidden />Your progress</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map(s => (
          <div key={s.label}>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{s.label}</p>
            <p className="font-display font-black text-3xl text-slate-900 mt-1">{s.value}</p>
            {s.hint && <p className="text-[11px] text-slate-400 mt-0.5">{s.hint}</p>}
          </div>
        ))}
      </div>
      {pct !== null && (
        <div>
          <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Progress toward required hours">
            <div className={`h-full rounded-full ${done ? 'bg-brand-green' : 'bg-emerald-400'}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] font-semibold text-slate-500">
            {done ? 'Requirement completed' : `${Math.round(pct)}% of ${formatHours(summary.required)} hours`}
          </p>
        </div>
      )}
    </div>
  );
}

// --- Regular duty ------------------------------------------------------------------

function AwaitingOfficeCard() {
  return (
    <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-6 sm:p-8 text-center space-y-2">
      <Building2 className="w-8 h-8 text-slate-300 mx-auto" aria-hidden />
      <h3 className="font-display font-bold text-base text-slate-900">Waiting for your office assignment</h3>
      <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
        You can log duties once the scholarship office assigns where you'll render them. You'll see the office under Details. Credited events below can be claimed anytime.
      </p>
    </div>
  );
}

function AddDutyForm({ log, onSave }: { log: DutyLog; onSave: (log: DutyLog) => void }) {
  const [date, setDate] = useState(todayInManila());
  const [timeIn, setTimeIn] = useState('');
  const [timeOut, setTimeOut] = useState('');
  const [error, setError] = useState('');

  const valid = date && isTimeRange(timeIn, timeOut);
  const hours = valid ? entryHours({ timeIn, timeOut }) : null;
  const { starts, ends } = dutyTimeOptions(date, timeIn);
  const weekend = date ? ['Sat', 'Sun'].includes(weekday(date)) : false;

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) { setError('Choose the date.'); return; }
    if (!timeIn || !timeOut) { setError('Enter the time in and time out.'); return; }
    if (!isTimeRange(timeIn, timeOut)) { setError('Time out must be after time in.'); return; }
    const ruleError = dutyRuleError({ date, timeIn, timeOut });
    if (ruleError) { setError(ruleError); return; }
    const overlap = log.entries.find(x => x.date === date && timeIn < x.timeOut && x.timeIn < timeOut);
    if (overlap) { setError(`This overlaps your ${format12h(overlap.timeIn)}–${format12h(overlap.timeOut)} duty that day.`); return; }
    setError('');
    onSave({ ...log, entries: sortEntries([...log.entries, { date, timeIn, timeOut }]) });
    setTimeIn('');
    setTimeOut('');
  };

  return (
    <form onSubmit={add} className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4" noValidate>
      <h3 className="font-display font-bold text-base text-slate-900">Add a duty</h3>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <label className="block">
          <span className={labelClass}>Date</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={`mt-1.5 ${inputClass}`} />
        </label>
        <label className="block">
          <span className={labelClass}>Time in</span>
          <select
            value={timeIn}
            disabled={weekend}
            onChange={e => { setTimeIn(e.target.value); if (timeOut && !dutyTimeOptions(date, e.target.value).ends.includes(timeOut)) setTimeOut(''); }}
            className={`mt-1.5 ${inputClass} disabled:bg-slate-50 disabled:text-slate-400`}
          >
            <option value="" disabled>Select</option>
            {starts.map(t => <option key={t} value={t}>{format12h(t)}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>Time out</span>
          <select
            value={timeOut}
            disabled={!timeIn || weekend}
            onChange={e => setTimeOut(e.target.value)}
            className={`mt-1.5 ${inputClass} disabled:bg-slate-50 disabled:text-slate-400`}
          >
            <option value="" disabled>{timeIn ? 'Select' : 'Pick time in first'}</option>
            {ends.map(t => <option key={t} value={t}>{format12h(t)} ({formatHours(entryHours({ timeIn, timeOut: t }))} h)</option>)}
          </select>
        </label>
        <button type="submit" className="inline-flex items-center justify-center gap-1.5 font-display font-bold uppercase text-xs tracking-wider text-white bg-brand-green hover:bg-brand-green-dark px-5 py-3 rounded-xl transition-colors">
          <Plus className="w-4 h-4" /> Add duty
        </button>
      </div>
      <p className="text-xs text-slate-500 flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5 text-slate-400" aria-hidden />
        {date ? `${weekday(date)}, ${formatDutyDate(date, true)}` : 'Choose a date'}
        {weekend && <span className="font-semibold text-amber-700"> · No duty on weekends</span>}
        {hours !== null && <> · <span className="font-bold text-slate-700">{formatHours(hours)} hours</span></>}
      </p>
      <p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500"><span className="font-semibold text-slate-700">Duty rules:</span> {DUTY_RULES_TEXT} Only times that fit these rules are listed.</p>
      {error && <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p>}
    </form>
  );
}

function RegularDutyTable({ log, onSave, confirmationRequired = false }: { log: DutyLog; onSave: (log: DutyLog) => void; confirmationRequired?: boolean }) {
  const entries = sortEntries(log.entries);
  const remove = (entry: DutyEntry) => {
    const i = log.entries.indexOf(entry);
    onSave({ ...log, entries: log.entries.filter((_, j) => j !== i) });
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-display font-bold text-base text-slate-900">Regular duty</h3>
        <span className="text-xs font-semibold text-slate-500">{entries.length} {entries.length === 1 ? 'duty' : 'duties'}</span>
      </div>
      {entries.length === 0 ? (
        <p className="px-6 py-8 text-center text-xs text-slate-400">No duty logged for this term yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 sm:px-6 py-2.5 text-left">Date</th>
                <th className="px-3 py-2.5 text-left">Day</th>
                <th className="px-3 py-2.5 text-left">Time in</th>
                <th className="px-3 py-2.5 text-left">Time out</th>
                <th className="px-3 py-2.5 text-right">Duty hours</th>
                {confirmationRequired && <th className="px-3 py-2.5 text-left">Office</th>}
                <th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map(entry => {
                const day = weekday(entry.date);
                return (
                  <tr key={entry._id ?? `${entry.date}-${entry.timeIn}`} className="hover:bg-slate-50/60">
                    <td className="px-5 sm:px-6 py-2.5 text-slate-700">{formatDutyDate(entry.date)}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-slate-600"><span className={`w-2 h-2 rounded-full ${DAY_COLORS[day]}`} aria-hidden />{day}</span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{format12h(entry.timeIn)}</td>
                    <td className="px-3 py-2.5 text-slate-600">{format12h(entry.timeOut)}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-800">{formatHours(entryHours(entry))}</td>
                    {confirmationRequired && (
                      <td className="px-3 py-2.5">
                        {entry.status === 'confirmed' ? <span className="text-[11px] font-bold text-emerald-700">Confirmed</span>
                          : entry.status === 'flagged' ? <span className="text-[11px] font-bold text-rose-700" title={entry.note ?? ''}>Flagged{entry.note ? `: ${entry.note}` : ''}</span>
                            : <span className="text-[11px] font-bold text-amber-700">Waiting</span>}
                      </td>
                    )}
                    <td className="pr-4 text-right">
                      <button type="button" onClick={() => remove(entry)} aria-label={`Delete duty on ${formatDutyDate(entry.date)} ${format12h(entry.timeIn)}`} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// --- Special events & weekly -------------------------------------------------------

// Credited events of the term: the scholar claims the ones they attended
// and the scholarship office approves each claim before its hours count.
const CLAIM_BADGE: Record<ClaimStatus, string> = {
  Pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  Approved: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  Rejected: 'bg-rose-50 text-rose-800 ring-rose-200',
};

function EventsCard({ events, claims, busyId, onClaim, onWithdraw }: {
  events: CreditedEvent[];
  claims: EventClaim[];
  busyId: string | null;
  onClaim: (eventId: string) => void;
  onWithdraw: (eventId: string) => void;
}) {
  const today = todayInManila();
  const claimOf = new Map(claims.map(c => [c.eventId, c]));
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="px-5 sm:px-6 py-4 border-b border-slate-100">
        <h3 className="font-display font-bold text-base text-slate-900">Events</h3>
        <p className="text-[11px] text-slate-400 mt-0.5">Events credited by the scholarship office (including COSA events). Claim the ones you attended; the hours count once the office approves.</p>
      </div>
      {events.length === 0 ? (
        <p className="px-5 sm:px-6 py-6 text-sm text-slate-500">No credited events this term yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {events.map(event => {
            const claim = claimOf.get(event._id);
            const upcoming = event.date > today;
            const busy = busyId === event._id;
            return (
              <li key={event._id} className="px-5 sm:px-6 py-3 flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800">{event.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {weekday(event.date)}, {formatDutyDate(event.date, true)} · {event.organizer} · <span className="font-bold text-slate-700">{formatHours(event.creditHours)} hours credit</span>
                  </p>
                  {claim?.status === 'Rejected' && claim.note && <p className="mt-1 text-[11px] text-rose-700">{claim.note}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {claim ? (
                    <>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${CLAIM_BADGE[claim.status]}`}>
                        {claim.status === 'Pending' ? 'Waiting for approval' : claim.status}
                      </span>
                      {claim.status === 'Pending' && (
                        <button type="button" onClick={() => onWithdraw(event._id)} disabled={busy} className="text-[11px] font-bold text-slate-500 hover:text-rose-600 disabled:opacity-50">
                          Withdraw
                        </button>
                      )}
                    </>
                  ) : upcoming ? (
                    <span className="text-[11px] text-slate-400">Upcoming</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onClaim(event._id)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} I attended
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function WeeklyCard({ entries }: { entries: DutyEntry[] }) {
  const weeks = weeklyTotals(entries);
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-brand-green" aria-hidden />
        <h3 className="font-display font-bold text-base text-slate-900">Weekly duty hours</h3>
      </div>
      {weeks.length === 0 ? (
        <p className="px-6 py-8 text-center text-xs text-slate-400">Weekly totals appear once you log a duty.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {weeks.map(w => (
            <li key={w.start} className="px-5 sm:px-6 py-2.5 flex items-center justify-between text-sm">
              <span className="text-slate-600">{formatDutyDate(w.start)} – {formatDutyDate(w.end)}</span>
              <span className="font-bold text-slate-800">{formatHours(w.hours)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- Print ---------------------------------------------------------------------------

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function printReport(student: StudentProfile, log: DutyLog, summary: DutySummary) {
  const win = window.open('', '_blank');
  if (!win) return;
  const rows = sortEntries(log.entries).map(e =>
    `<tr><td>${formatDutyDate(e.date, true)}</td><td>${weekday(e.date)}</td><td>${format12h(e.timeIn)}</td><td>${format12h(e.timeOut)}</td><td class="n">${formatHours(entryHours(e))}</td></tr>`).join('');
  const events = log.specialEvents.map(e => `<tr><td>${escapeHtml(e.name)}</td><td class="n">${formatHours(e.hours)}</td></tr>`).join('');
  const weeks = weeklyTotals(log.entries).map(w => `<tr><td>${formatDutyDate(w.start)} – ${formatDutyDate(w.end)}</td><td class="n">${formatHours(w.hours)}</td></tr>`).join('');
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Duty Hours Report</title><style>
    body{font-family:Arial,sans-serif;color:#111;margin:32px;font-size:12px}h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:20px 0 6px}
    p{margin:2px 0}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:5px 8px;text-align:left}th{background:#eee}.n{text-align:right}
  </style></head><body>
    <h1>Duty Hours Report</h1>
    <p>Name: ${escapeHtml(student.name || '')} (${escapeHtml(student.studentNumber || '')})</p>
    <p>Term: ${termLabel(log)}</p>
    <p>Office assigned: ${escapeHtml(log.officeAssigned || '—')}</p>
    <p>Deadline: ${log.deadline ? formatDutyDate(log.deadline, true) : '—'} · Required hours: ${formatHours(summary.required)}</p>
    <p>Total hours completed: <b>${formatHours(summary.completed)}</b> · Hours remaining: ${summary.remaining === null ? '—' : formatHours(summary.remaining)}</p>
    <h2>Regular duty</h2>
    <table><thead><tr><th>Date</th><th>Day</th><th>Time in</th><th>Time out</th><th class="n">Duty hours</th></tr></thead><tbody>${rows || '<tr><td colspan="5">None</td></tr>'}</tbody></table>
    ${events ? `<h2>Special events</h2><table><thead><tr><th>Event name</th><th class="n">Equivalent hours</th></tr></thead><tbody>${events}</tbody></table>` : ''}
    ${weeks ? `<h2>Weekly duty hours</h2><table><thead><tr><th>Week</th><th class="n">Total hours</th></tr></thead><tbody>${weeks}</tbody></table>` : ''}
  </body></html>`);
  win.document.close();
  win.focus();
  win.print();
}
