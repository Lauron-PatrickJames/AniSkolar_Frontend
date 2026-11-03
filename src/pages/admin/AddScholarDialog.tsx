import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileImage, Search, UserPlus, X } from 'lucide-react';
import { Scholarship } from '../../types';
import { OfficeAnswers, OfficeForm } from '../../data/officeForms';
import { API_BASE_URL, authHeaders, titleCaseName } from './adminData';
import { Alert, Button, Checkbox, Field, Modal, Select, TextInput, Textarea } from './AdminUI';

// Scholarships without an application (directAward, e.g. the SDO's): the
// office adds each scholar it picked (from the varsity tryouts), with the
// coach's document and the Director's approval. They're approved at once.
// A player who hasn't signed in yet is added by student number, name and
// school email; it's theirs the first time they sign in, and they're
// emailed either way. Backend: POST /api/applications/direct-award.

interface FoundStudent { studentNumber: string; name: string; programCode?: string; college?: string; yearLevel?: string }
interface NewStudent { studentNumber: string; firstName: string; lastName: string; email: string }

const DISCOUNTS = [100, 75, 50, 25];

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? 'bg-success-bg text-success-fg' : 'bg-surface-muted text-ink-muted ring-1 ring-line'}`}>
          {done ? <CheckCircle2 className="size-4" aria-hidden /> : n}
        </span>
        {title}
      </h3>
      <div className="pl-8">{children}</div>
    </section>
  );
}

function ChoiceCards({ options, value, onChange, disabled }: {
  options: { value: string; label: string; hint?: string }[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
      {options.map(o => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={`rounded-control px-3.5 py-3 text-left ring-1 ring-inset transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent ${active ? 'bg-accent-subtle ring-accent' : 'ring-line hover:bg-surface-muted'}`}
          >
            <span className={`block text-sm font-medium ${active ? 'text-accent' : 'text-ink'}`}>{o.label}</span>
            {o.hint && <span className="mt-0.5 block text-xs text-ink-muted">{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

export default function AddScholarDialog({ scholarship, form, getToken, onClose, onAdded }: {
  scholarship: Scholarship;
  form: OfficeForm;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onAdded: (name: string, pendingAccount: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<FoundStudent[] | null>(null);
  const [student, setStudent] = useState<FoundStudent | null>(null);
  const [newStudent, setNewStudent] = useState<NewStudent | null>(null);
  const [answers, setAnswers] = useState<OfficeAnswers>({});
  const [discount, setDiscount] = useState<number | null>(null);
  const [otherDiscount, setOtherDiscount] = useState(false);
  const [extras, setExtras] = useState<OfficeAnswers>({});
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [holds, setHolds] = useState<string[] | null>(null);
  const [attempted, setAttempted] = useState(false);

  // Student search, a moment after typing.
  useEffect(() => {
    if (student || newStudent || query.trim().length < 2) { setFound(null); return; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/applications/direct-award/students?q=${encodeURIComponent(query.trim())}`, { headers: await authHeaders(getToken) });
        const body = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) setFound(body.students ?? []);
      } catch {
        // keep the last results
      }
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, student, newStudent, getToken]);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const questions = form.questions;
  const typeQ = questions.find(q => q.type === 'choice');
  const otherQs = questions.filter(q => q !== typeQ);
  const docLabel = form.documents?.(answers)[0];
  const grant: OfficeAnswers = { ...extras, tuitionDiscount: discount ?? undefined };
  const result = form.result(grant, answers);

  const newStudentValid = !!newStudent && /^\d{9}$/.test(newStudent.studentNumber) && !!newStudent.firstName.trim() && !!newStudent.lastName.trim() && /^[^\s@]+@dlsud\.edu\.ph$/i.test(newStudent.email.trim());
  const playerDone = !!student || newStudentValid;
  const detailsDone = questions.every(q => answers[q.key] !== undefined && String(answers[q.key]).trim() !== '');
  const missing = useMemo(() => [
    !playerDone && (newStudent ? 'the player’s student number, name and DLSU-D email' : 'the player'),
    !detailsDone && 'the varsity details',
    !file && (docLabel ? `the ${docLabel.toLowerCase()}` : 'the coach’s document'),
    discount === null && 'the tuition discount',
    !approved && `the ${form.approver}’s approval`,
  ].filter(Boolean) as string[], [playerDone, newStudent, detailsDone, file, docLabel, discount, approved, form.approver]);

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    if (!(f.type === 'image/jpeg' || /\.jpe?g$/i.test(f.name))) { setError('The document must be a JPG.'); return; }
    if (f.size > 10 * 1024 * 1024) { setError('The file must be under 10MB.'); return; }
    setError('');
    setFile(f);
  };

  const startNew = () => {
    const q = query.trim();
    setNewStudent({ studentNumber: /^\d+$/.test(q) ? q.slice(0, 9) : '', firstName: '', lastName: '', email: '' });
    setFound(null);
  };

  const submit = async (acknowledge = false) => {
    setAttempted(true);
    if (missing.length || busy) return;
    setBusy(true);
    setError('');
    try {
      const data = new FormData();
      data.append('scholarshipId', scholarship.id);
      if (student) data.append('studentNumber', student.studentNumber);
      else if (newStudent) {
        data.append('studentNumber', newStudent.studentNumber.trim());
        data.append('firstName', newStudent.firstName.trim());
        data.append('lastName', newStudent.lastName.trim());
        data.append('email', newStudent.email.trim());
      }
      data.append('officeAnswers', JSON.stringify(answers));
      data.append('assessment', JSON.stringify(grant));
      data.append('directorApproved', 'true');
      data.append('note', note.trim());
      if (acknowledge) data.append('acknowledgeOtherScholarship', 'true');
      data.append('documents', file!, file!.name);
      const res = await fetch(`${API_BASE_URL}/api/applications/direct-award`, { method: 'POST', headers: await authHeaders(getToken), body: data });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body.code === 'holds_other_scholarship') { setHolds(body.held ?? []); return; }
      if (!res.ok) throw new Error(body.error || 'Failed to add the scholar.');
      onAdded(student ? titleCaseName(student.name) : `${newStudent!.firstName.trim()} ${newStudent!.lastName.trim()}`, !!body.pendingAccount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add the scholar.');
    } finally {
      setBusy(false);
    }
  };

  const setNew = (patch: Partial<NewStudent>) => setNewStudent(s => (s ? { ...s, ...patch } : s));

  return (
    <Modal
      size="lg"
      title="Add a scholar"
      description={`${scholarship.name} · a player picked from the varsity tryouts. They’re a scholar as soon as you add them, and they’re emailed.`}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {attempted && missing.length > 0 && <span className="mr-auto text-sm text-danger-fg">Still needed: {missing.join(', ')}.</span>}
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" icon={UserPlus} onClick={() => submit()} loading={busy}>Add scholar</Button>
        </div>
      }
    >
      <div className="space-y-7">
        {error && <Alert tone="danger">{error}</Alert>}
        {holds && (
          <Alert tone="warning" title={`Already holds the ${holds.join(' and the ')}`} action={<Button size="sm" variant="primary" onClick={() => { setHolds(null); submit(true); }} loading={busy}>Add anyway</Button>}>
            Only one internally funded scholarship can be credited. If you add this one, the student chooses which to keep.
          </Alert>
        )}

        <Step n={1} title="Player" done={playerDone}>
          {student ? (
            <div className="flex items-center justify-between gap-3 rounded-control bg-surface-muted px-3.5 py-3 ring-1 ring-line">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{titleCaseName(student.name)}</p>
                <p className="text-xs text-ink-muted">{[student.studentNumber, student.programCode, student.yearLevel].filter(Boolean).join(' · ')}</p>
              </div>
              <Button size="sm" variant="ghost" icon={X} onClick={() => { setStudent(null); setQuery(''); }} disabled={busy}>Change</Button>
            </div>
          ) : newStudent ? (
            <div className="space-y-3 rounded-control p-3.5 ring-1 ring-line">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-ink-muted">Not in AniSkolar yet. The scholarship is theirs the first time they sign in with their DLSU-D account, and we’ll email them.</p>
                <Button size="sm" variant="ghost" icon={X} onClick={() => setNewStudent(null)} disabled={busy}>Search instead</Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Student number" error={attempted && !/^\d{9}$/.test(newStudent.studentNumber) ? '9 digits' : undefined}>
                  <TextInput inputMode="numeric" maxLength={9} value={newStudent.studentNumber} onChange={e => setNew({ studentNumber: e.target.value.replace(/\D/g, '') })} placeholder="202312345" disabled={busy} />
                </Field>
                <Field label="DLSU-D email" error={attempted && !/^[^\s@]+@dlsud\.edu\.ph$/i.test(newStudent.email.trim()) ? 'Use their @dlsud.edu.ph email' : undefined}>
                  <TextInput type="email" value={newStudent.email} onChange={e => setNew({ email: e.target.value })} placeholder="abc1234@dlsud.edu.ph" disabled={busy} />
                </Field>
                <Field label="First name"><TextInput value={newStudent.firstName} onChange={e => setNew({ firstName: e.target.value })} maxLength={100} disabled={busy} /></Field>
                <Field label="Last name"><TextInput value={newStudent.lastName} onChange={e => setNew({ lastName: e.target.value })} maxLength={100} disabled={busy} /></Field>
              </div>
              <p className="text-xs text-ink-subtle">Check the student number: whoever signs in with it gets the scholarship.</p>
            </div>
          ) : (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-ink-subtle" aria-hidden />
              <TextInput value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or student no." aria-label="Search students" className="pl-9" />
              {found && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-control bg-surface shadow-overlay ring-1 ring-line">
                  <ul className="max-h-56 overflow-y-auto">
                    {found.map(s => (
                      <li key={s.studentNumber}>
                        <button type="button" onClick={() => { setStudent(s); setFound(null); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-muted">
                          <span className="font-medium text-ink">{titleCaseName(s.name)}</span>
                          <span className="block text-xs text-ink-subtle">{[s.studentNumber, s.programCode, s.yearLevel].filter(Boolean).join(' · ')}</span>
                        </button>
                      </li>
                    ))}
                    {found.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">No student found.</li>}
                  </ul>
                  <button type="button" onClick={startNew} className="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-sm font-medium text-accent hover:bg-surface-muted">
                    <UserPlus className="size-4" aria-hidden /> Not in AniSkolar yet? Add by student number
                  </button>
                </div>
              )}
              {!found && <button type="button" onClick={startNew} className="mt-1.5 text-xs font-medium text-accent hover:underline">Player not in AniSkolar yet?</button>}
            </div>
          )}
        </Step>

        <Step n={2} title="Varsity" done={detailsDone}>
          <div className="space-y-4">
            {typeQ && (
              <ChoiceCards
                options={typeQ.options!.map(o => ({ ...o, label: o.value === 'incoming' ? 'Incoming player' : 'Current varsity member', hint: o.value === 'incoming' ? 'Recruited or picked at the tryouts' : 'Already on a DLSU-D team' }))}
                value={String(answers[typeQ.key] ?? '')}
                onChange={v => { setAnswers(a => ({ ...a, [typeQ.key]: v })); setFile(null); }}
                disabled={busy}
              />
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {otherQs.map(q => q.type === 'select' ? (
                <Field key={q.key} label={q.label}>
                  <Select value={String(answers[q.key] ?? '')} onChange={v => setAnswers(a => ({ ...a, [q.key]: v || undefined }))} disabled={busy}>
                    <option value="">Select…</option>
                    {q.options!.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </Field>
              ) : (
                <Field key={q.key} label={q.key === 'coach' ? 'Coach' : q.label}>
                  <TextInput value={String(answers[q.key] ?? '')} onChange={e => setAnswers(a => ({ ...a, [q.key]: e.target.value }))} maxLength={100} placeholder={q.placeholder} disabled={busy} />
                </Field>
              ))}
            </div>
          </div>
        </Step>

        <Step n={3} title={docLabel ?? 'Coach’s document'} done={!!file}>
          {!docLabel ? (
            <p className="text-sm text-ink-muted">Pick incoming or current member above: it decides which document the coach gives.</p>
          ) : file ? (
            <div className="flex items-center gap-3 rounded-control p-2.5 ring-1 ring-line">
              {preview ? <img src={preview} alt="" className="size-14 shrink-0 rounded-sm object-cover ring-1 ring-line" /> : <FileImage className="size-6 text-ink-subtle" aria-hidden />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{file.name}</p>
                <p className="text-xs text-ink-muted">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <Button size="sm" variant="ghost" icon={X} onClick={() => setFile(null)} disabled={busy}>Remove</Button>
            </div>
          ) : (
            <label
              className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-control border-2 border-dashed border-line px-4 py-6 text-center hover:bg-surface-muted"
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0]); }}
            >
              <FileImage className="size-6 text-ink-subtle" aria-hidden />
              <span className="text-sm font-medium text-ink">Choose or drop the signed document</span>
              <span className="text-xs text-ink-muted">One JPG, up to 10 MB</span>
              <input type="file" accept=".jpg,.jpeg,image/jpeg" className="sr-only" onChange={e => pickFile(e.target.files?.[0])} disabled={busy} />
            </label>
          )}
        </Step>

        <Step n={4} title="Grant" done={discount !== null}>
          <div className="space-y-4">
            <Field label="Tuition fee discount">
              <div className="flex flex-wrap items-center gap-2">
                {DISCOUNTS.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { setDiscount(p); setOtherDiscount(false); }}
                    disabled={busy}
                    className={`rounded-control px-3.5 py-1.5 text-sm font-medium ring-1 ring-inset ${discount === p && !otherDiscount ? 'bg-accent-subtle text-accent ring-accent' : 'text-ink ring-line hover:bg-surface-muted'}`}
                  >
                    {p}%
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { setOtherDiscount(true); setDiscount(null); }}
                  disabled={busy}
                  className={`rounded-control px-3.5 py-1.5 text-sm font-medium ring-1 ring-inset ${otherDiscount ? 'bg-accent-subtle text-accent ring-accent' : 'text-ink ring-line hover:bg-surface-muted'}`}
                >
                  Other
                </button>
                {otherDiscount && (
                  <span className="inline-flex items-center gap-1.5">
                    <TextInput type="number" inputMode="numeric" min={1} max={100} className="w-20" autoFocus value={discount ?? ''} onChange={e => setDiscount(e.target.value === '' ? null : Math.min(100, Math.max(0, Number(e.target.value))))} aria-label="Discount percent" />
                    <span className="text-sm text-ink-muted">%</span>
                  </span>
                )}
              </div>
            </Field>
            <div className="grid gap-2 sm:grid-cols-2">
              {form.assessment.filter(f => f.type === 'bool').map(f => (
                <Checkbox key={f.key} checked={extras[f.key] === true} onChange={v => setExtras(x => ({ ...x, [f.key]: v }))} label={f.label} disabled={busy} />
              ))}
            </div>
            {result && <p className="text-sm text-ink-muted">The scholar gets: <span className="font-medium text-ink">{result.headline}{result.lines.length ? `, ${result.lines.join(', ').replace(/^Plus /, 'plus ')}` : ''}</span></p>}
          </div>
        </Step>

        <Step n={5} title="Approval" done={approved}>
          <div className="space-y-4">
            <div className={`rounded-control p-3.5 ring-1 ring-inset ${approved ? 'bg-success-bg ring-success-fg/30' : attempted ? 'ring-danger-fg/40' : 'ring-line'}`}>
              <Checkbox checked={approved} onChange={setApproved} label={`Approved by the ${form.approver}`} description="Tick once the Director has signed off on this scholarship." disabled={busy} />
            </div>
            <Field label="Message to the player" optional helper="In their email and with their scholarship, e.g. when the discount starts.">
              <Textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={2000} disabled={busy} placeholder="e.g. Welcome to the team! Your discount starts this semester." />
            </Field>
          </div>
        </Step>
      </div>
    </Modal>
  );
}
