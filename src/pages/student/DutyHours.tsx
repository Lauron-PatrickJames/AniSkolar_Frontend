import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/react';
import { AlertCircle, CalendarDays, Clock, Loader2, Plus, Printer, RefreshCw, Trash2, Check } from 'lucide-react';
import { StudentProfile } from '../../types';
import {
  DUTY_TERMS, DutyEntry, DutyLog, DutySummary, DutyTerm, SpecialEvent, entryHours, format12h, formatDutyDate, formatHours,
  isTimeRange, sortEntries, summarize, termLabel, todayInManila, weekday, weeklyTotals
} from '../../utils/dutyHours';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

// Duty hours for internal scholars, replacing the office's "SFAG Duty
// Calculator" sheet: the scholar enters their office, deadline, required
// hours, each duty (date, time in, time out) and special events; the day,
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [saveError, setSaveError] = useState('');

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
      setSaveState('saved');
      if (term && !knownTerms.some(k => termKey(k) === termKey(term))) setKnownTerms(prev => [term, ...prev]);
    } catch (err) {
      setLog(previous);
      setSaveState('idle');
      setSaveError(err instanceof Error ? err.message : 'Failed to save your duty hours.');
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

  const summary = useMemo(() => (log ? summarize(log) : null), [log]);

  if (loading && !log) {
    return <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="w-6 h-6 animate-spin" aria-label="Loading duty hours" /></div>;
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <DetailsCard log={log} onSave={save} saveState={saveState} />
        <SummaryCard summary={summary} />
      </div>

      <AddDutyForm log={log} onSave={save} />

      <RegularDutyTable log={log} onSave={save} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SpecialEventsCard log={log} onSave={save} />
        <WeeklyCard entries={log.entries} />
      </div>
    </div>
  );
}

// --- Details & summary -------------------------------------------------------------

function DetailsCard({ log, onSave, saveState }: {
  log: DutyLog; onSave: (log: DutyLog) => void; saveState: 'idle' | 'saving' | 'saved';
}) {
  const [office, setOffice] = useState(log.officeAssigned ?? '');
  const [deadline, setDeadline] = useState(log.deadline ?? '');
  const [required, setRequired] = useState(log.requiredHours !== undefined ? String(log.requiredHours) : '');
  useEffect(() => {
    setOffice(log.officeAssigned ?? '');
    setDeadline(log.deadline ?? '');
    setRequired(log.requiredHours !== undefined ? String(log.requiredHours) : '');
  }, [log.academicYear, log.term, log.officeAssigned, log.deadline, log.requiredHours]);

  const commit = () => {
    const req = required.trim() === '' ? undefined : Number(required);
    if (req !== undefined && (!Number.isFinite(req) || req < 0)) return;
    if (office.trim() === (log.officeAssigned ?? '') && deadline === (log.deadline ?? '') && req === log.requiredHours) return;
    onSave({ ...log, officeAssigned: office.trim(), deadline: deadline || undefined, requiredHours: req });
  };

  return (
    <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-base text-slate-900">Details</h3>
        {saveState === 'saving' && <span className="text-[11px] text-slate-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving</span>}
        {saveState === 'saved' && <span className="text-[11px] text-brand-green font-semibold flex items-center gap-1"><Check className="w-3 h-3" /> Saved</span>}
      </div>
      <label className="block">
        <span className={labelClass}>Office assigned</span>
        <input value={office} onChange={e => setOffice(e.target.value)} onBlur={commit} maxLength={200} placeholder="e.g. University Library" className={`mt-1.5 ${inputClass}`} />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
        <label className="block">
          <span className={labelClass}>Deadline</span>
          <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} onBlur={commit} className={`mt-1.5 ${inputClass}`} />
        </label>
        <label className="block">
          <span className={labelClass}>Required hours</span>
          <input type="number" inputMode="decimal" min={0} step="0.5" value={required} onChange={e => setRequired(e.target.value)} onBlur={commit} placeholder="e.g. 136" className={`mt-1.5 ${inputClass}`} />
        </label>
      </div>
    </div>
  );
}

function SummaryCard({ summary }: { summary: DutySummary }) {
  const pct = summary.required ? Math.min(100, (summary.completed / summary.required) * 100) : null;
  const done = summary.remaining !== null && summary.remaining <= 0;
  const stats = [
    { label: 'Hours completed', value: formatHours(summary.completed), hint: summary.specialHours ? `incl. ${formatHours(summary.specialHours)} from special events` : undefined },
    { label: 'Hours remaining', value: summary.remaining === null ? '—' : formatHours(Math.max(0, summary.remaining)), hint: summary.remaining !== null && summary.remaining < 0 ? `${formatHours(-summary.remaining)} over the requirement` : summary.required === null ? 'Enter the required hours' : undefined },
    { label: 'Weekly hours needed', value: formatHours(summary.weeklyNeeded), hint: summary.weeklyNeeded === null ? (summary.required === null ? undefined : 'Enter the deadline') : 'to finish by the deadline' },
  ];
  return (
    <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-5">
      <h3 className="font-display font-bold text-base text-slate-900">Duty hours</h3>
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

function AddDutyForm({ log, onSave }: { log: DutyLog; onSave: (log: DutyLog) => void }) {
  const [date, setDate] = useState(todayInManila());
  const [timeIn, setTimeIn] = useState('');
  const [timeOut, setTimeOut] = useState('');
  const [error, setError] = useState('');

  const valid = date && isTimeRange(timeIn, timeOut);
  const hours = valid ? entryHours({ timeIn, timeOut }) : null;

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) { setError('Choose the date.'); return; }
    if (!timeIn || !timeOut) { setError('Enter the time in and time out.'); return; }
    if (!isTimeRange(timeIn, timeOut)) { setError('Time out must be after time in.'); return; }
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
          <input type="time" value={timeIn} onChange={e => setTimeIn(e.target.value)} className={`mt-1.5 ${inputClass}`} />
        </label>
        <label className="block">
          <span className={labelClass}>Time out</span>
          <input type="time" value={timeOut} onChange={e => setTimeOut(e.target.value)} className={`mt-1.5 ${inputClass}`} />
        </label>
        <button type="submit" className="inline-flex items-center justify-center gap-1.5 font-display font-bold uppercase text-xs tracking-wider text-white bg-brand-green hover:bg-brand-green-dark px-5 py-3 rounded-xl transition-colors">
          <Plus className="w-4 h-4" /> Add duty
        </button>
      </div>
      <p className="text-xs text-slate-500 flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5 text-slate-400" aria-hidden />
        {date ? `${weekday(date)}, ${formatDutyDate(date, true)}` : 'Choose a date'}
        {hours !== null && <> · <span className="font-bold text-slate-700">{formatHours(hours)} hours</span></>}
      </p>
      {error && <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p>}
    </form>
  );
}

function RegularDutyTable({ log, onSave }: { log: DutyLog; onSave: (log: DutyLog) => void }) {
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

function SpecialEventsCard({ log, onSave }: { log: DutyLog; onSave: (log: DutyLog) => void }) {
  const [name, setName] = useState('');
  const [hours, setHours] = useState('');
  const [error, setError] = useState('');
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(hours);
    if (!name.trim()) { setError('Enter the event name.'); return; }
    if (!Number.isFinite(n) || n <= 0 || n > 100) { setError('Enter the equivalent hours.'); return; }
    setError('');
    onSave({ ...log, specialEvents: [...log.specialEvents, { name: name.trim(), hours: n }] });
    setName('');
    setHours('');
  };
  const remove = (event: SpecialEvent) => {
    const i = log.specialEvents.indexOf(event);
    onSave({ ...log, specialEvents: log.specialEvents.filter((_, j) => j !== i) });
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="px-5 sm:px-6 py-4 border-b border-slate-100">
        <h3 className="font-display font-bold text-base text-slate-900">Special events</h3>
        <p className="text-[11px] text-slate-400 mt-0.5">Events credited as duty, e.g. an orientation or a donation drive.</p>
      </div>
      {log.specialEvents.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {log.specialEvents.map((event, i) => (
            <li key={event._id ?? i} className="px-5 sm:px-6 py-2.5 flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-slate-700">{event.name}</span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="font-bold text-slate-800">{formatHours(event.hours)}</span>
                <button type="button" onClick={() => remove(event)} aria-label={`Delete ${event.name}`} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="px-5 sm:px-6 py-4 bg-slate-50 border-t border-slate-100 space-y-2" noValidate>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Event name" maxLength={200} aria-label="Event name" className={inputClass} />
          <input type="number" inputMode="decimal" min={0} step="0.5" value={hours} onChange={e => setHours(e.target.value)} placeholder="Hours" aria-label="Equivalent hours" className={`${inputClass} sm:w-28`} />
          <button type="submit" className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-100">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
        {error && <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p>}
      </form>
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
