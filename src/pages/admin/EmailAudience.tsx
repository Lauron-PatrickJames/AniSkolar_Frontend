import React, { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { mockScholarships, acceptsOnlineApplications } from '../../data/scholarships';
import { COLLEGES, YEAR_LEVELS } from '../../data/programs';
import { API_BASE_URL, authHeaders, titleCaseName } from './adminData';
import { Alert, Button, Field, Select, TextInput, Textarea } from './AdminUI';

// "Email to" for an announcement (backend utils/emailTarget.js): all
// students, applicants or current scholars of chosen scholarships, or
// specific students — each narrowed by college and year level — with a
// live count of who it reaches.

export interface EmailTarget {
  mode: 'all' | 'applicants' | 'scholars' | 'students';
  scholarshipIds: string[];
  statuses: string[];
  colleges: string[];
  yearLevels: string[];
  studentNumbers: string[];
}

export const DEFAULT_EMAIL_TARGET: EmailTarget = { mode: 'all', scholarshipIds: [], statuses: [], colleges: [], yearLevels: [], studentNumbers: [] };

const MODES: { value: EmailTarget['mode']; label: string }[] = [
  { value: 'all', label: 'All students' },
  { value: 'applicants', label: 'Applicants' },
  { value: 'scholars', label: 'Current scholars' },
  { value: 'students', label: 'Specific students' },
];
const STATUSES: { value: string; label: string }[] = [
  { value: 'Under Evaluation', label: 'Under evaluation' },
  { value: 'Needs Revision', label: 'Needs revision' },
  { value: 'Approved', label: 'Approved' },
  { value: 'Rejected', label: 'Rejected' },
];

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

// A compact row of toggle chips.
function Chips({ options, selected, onChange, disabled, label }: {
  options: { value: string; label: string; title?: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map(o => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            title={o.title}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(toggle(selected, o.value))}
            className={`rounded-badge px-2 py-1 text-xs font-medium ring-1 ring-inset transition-colors disabled:opacity-50 ${on ? 'bg-accent text-white ring-accent' : 'bg-surface text-ink-muted ring-line hover:text-ink'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// A summary in words, e.g. for an email that already went out.
export function describeTarget(t: EmailTarget): string {
  const names = (ids: string[]) => ids.map(id => mockScholarships.find(s => s.id === id)?.name ?? id).join(', ');
  let who = t.mode === 'all' ? 'All students'
    : t.mode === 'students' ? `${t.studentNumbers.length} chosen student${t.studentNumbers.length === 1 ? '' : 's'}`
      : `${t.mode === 'applicants' ? 'Applicants' : 'Current scholars'} of ${t.scholarshipIds.length ? names(t.scholarshipIds) : 'any scholarship'}`;
  if (t.mode === 'applicants' && t.statuses.length) who += ` (${t.statuses.join(', ').toLowerCase()})`;
  const narrow = [t.colleges.join(', '), t.yearLevels.join(', ')].filter(Boolean).join('; ');
  return narrow ? `${who} — ${narrow}` : who;
}

interface Found { studentNumber: string; name: string; programCode?: string; college?: string; yearLevel?: string }

export default function EmailAudience({ value, onChange, relatedScholarshipId, getToken, disabled }: {
  value: EmailTarget;
  onChange: (next: EmailTarget) => void;
  relatedScholarshipId: string;
  getToken: () => Promise<string | null>;
  disabled?: boolean;
}) {
  const set = (patch: Partial<EmailTarget>) => onChange({ ...value, ...patch });
  const [preview, setPreview] = useState<{ count: number; sample: string[]; unknown: string[] } | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Found[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [paste, setPaste] = useState('');
  const narrowed = value.colleges.length > 0 || value.yearLevels.length > 0;
  const [showNarrow, setShowNarrow] = useState(narrowed);

  const scholarships = mockScholarships.filter(s => acceptsOnlineApplications(s));

  // Live count, a moment after the last change.
  const key = JSON.stringify(value);
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/announcements/email/preview`, {
          method: 'POST',
          headers: await authHeaders(getToken, true),
          body: JSON.stringify({ emailTarget: value }),
        });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) { setPreview(null); setPreviewError(body.error || "Couldn't count the recipients."); return; }
        setPreview(body);
        setPreviewError('');
      } catch {
        if (!cancelled) setPreviewError("Couldn't count the recipients.");
      }
    }, 400);
    return () => { cancelled = true; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, getToken]);

  // Student search for "Specific students".
  useEffect(() => {
    if (value.mode !== 'students' || query.trim().length < 2) { setFound([]); return; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/announcements/email/students?q=${encodeURIComponent(query.trim())}`, { headers: await authHeaders(getToken) });
        const body = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) setFound(body.students ?? []);
      } catch {
        // keep the last results
      }
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, value.mode, getToken]);

  const changeMode = (mode: EmailTarget['mode']) => {
    // Applicants / scholars start with the related scholarship ticked.
    const scholarshipIds = (mode === 'applicants' || mode === 'scholars') && !value.scholarshipIds.length && relatedScholarshipId
      ? [relatedScholarshipId] : value.scholarshipIds;
    set({ mode, scholarshipIds });
  };
  const addStudent = (s: Found) => {
    setNames(n => ({ ...n, [s.studentNumber]: s.name }));
    if (!value.studentNumbers.includes(s.studentNumber)) set({ studentNumbers: [...value.studentNumbers, s.studentNumber] });
    setQuery('');
    setFound([]);
  };
  const addPasted = () => {
    const numbers = (paste.match(/\d{9}/g) ?? []).filter(n => !value.studentNumbers.includes(n));
    if (numbers.length) set({ studentNumbers: [...value.studentNumbers, ...numbers] });
    setPaste('');
  };

  return (
    <div className="space-y-3">
      <Field label="Email to">
        <Select value={value.mode} onChange={v => changeMode(v as EmailTarget['mode'])} disabled={disabled}>
          {MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </Select>
      </Field>

      {(value.mode === 'applicants' || value.mode === 'scholars') && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-ink-muted">Scholarships <span className="font-normal text-ink-subtle">— none picked = any scholarship</span></p>
          <Chips label="Scholarships" disabled={disabled} selected={value.scholarshipIds} onChange={ids => set({ scholarshipIds: ids })}
            options={scholarships.map(s => ({ value: s.id, label: s.referenceCode ?? s.name, title: s.name }))} />
        </div>
      )}

      {value.mode === 'applicants' && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-ink-muted">Application status <span className="font-normal text-ink-subtle">— none picked = any</span></p>
          <Chips label="Application status" disabled={disabled} selected={value.statuses} onChange={s => set({ statuses: s })} options={STATUSES} />
        </div>
      )}

      {value.mode === 'students' && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-ink-subtle" aria-hidden />
            <TextInput value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or student no." aria-label="Search students" className="pl-8" disabled={disabled} />
            {found.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-control bg-surface shadow-overlay ring-1 ring-line">
                {found.map(s => (
                  <li key={s.studentNumber}>
                    <button type="button" onClick={() => addStudent(s)} className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-muted">
                      <span className="font-medium text-ink">{titleCaseName(s.name)}</span>
                      <span className="block text-xs text-ink-subtle">{[s.studentNumber, s.college, s.programCode, s.yearLevel].filter(Boolean).join(' · ')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex gap-2">
            <Textarea value={paste} onChange={e => setPaste(e.target.value)} rows={2} placeholder="Or paste student numbers (any separator)" aria-label="Paste student numbers" disabled={disabled} className="flex-1" />
            <Button size="sm" onClick={addPasted} disabled={disabled || !/\d{9}/.test(paste)}>Add</Button>
          </div>
          {value.studentNumbers.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Chosen students">
              {value.studentNumbers.map(n => (
                <li key={n} className="flex items-center gap-1 rounded-badge bg-surface px-2 py-1 text-xs ring-1 ring-line">
                  <span className="tabular-nums">{n}</span>{names[n] && <span className="text-ink-subtle">· {titleCaseName(names[n])}</span>}
                  <button type="button" onClick={() => set({ studentNumbers: value.studentNumbers.filter(x => x !== n) })} aria-label={`Remove ${n}`} className="text-ink-subtle hover:text-danger-fg" disabled={disabled}>
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div>
        <button type="button" onClick={() => setShowNarrow(v => !v)} className="text-xs font-medium text-accent hover:underline" aria-expanded={showNarrow}>
          {showNarrow ? 'Hide' : 'Narrow by'} college / year level{narrowed ? ` (${value.colleges.length + value.yearLevels.length} picked)` : ''}
        </button>
        {showNarrow && (
          <div className="mt-2 space-y-2">
            <Chips label="Colleges" disabled={disabled} selected={value.colleges} onChange={c => set({ colleges: c })}
              options={Object.entries(COLLEGES).map(([code, name]) => ({ value: code, label: code, title: name }))} />
            <Chips label="Year levels" disabled={disabled} selected={value.yearLevels} onChange={y => set({ yearLevels: y })}
              options={YEAR_LEVELS.map(y => ({ value: y, label: y }))} />
          </div>
        )}
      </div>

      {previewError ? <Alert tone="danger">{previewError}</Alert> : preview && (
        <p className="text-xs text-ink-muted" aria-live="polite">
          <b className="text-ink">Will email {preview.count} student{preview.count === 1 ? '' : 's'}</b>
          {preview.sample.length > 0 && `: ${preview.sample.map(titleCaseName).join(', ')}${preview.count > preview.sample.length ? '…' : ''}`}
          {preview.unknown.length > 0 && <span className="block text-warning-fg">Not found: {preview.unknown.join(', ')}</span>}
        </p>
      )}
    </div>
  );
}
