import React, { useEffect, useMemo, useState } from 'react';
import { Check, FileImage, UserPlus, X } from 'lucide-react';
import { Scholarship } from '../../types';
import { API_BASE_URL, authHeaders, titleCaseName } from './adminData';
import { Alert, Button, Checkbox, Modal, Select, Textarea } from './AdminUI';
import { FoundStudent, NewStudent, StudentPicker, isNewStudentValid } from './AddScholarDialog';

// "Add scholar" for scholarships students normally apply for: someone the
// office awarded outside AniSkolar (a paper application, a late approval).
// The office picks the scholarship and the student, says why, confirms it
// was approved, and can attach a supporting document; the SFAG also needs
// the grant percentage. They're approved at once. The SDO and the ROTC
// Office, whose scholarships have no application, use AddScholarDialog.
// Backend: POST /api/applications/direct-award.

const SFAG_PERCENTAGES = [100, 75, 50, 25];

// A numbered step that turns into a check once it's filled in.
function Step({ n, title, done, invalid, children }: { n: number; title: string; done: boolean; invalid?: boolean; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
          done ? 'bg-accent text-white' : invalid ? 'bg-danger-bg text-danger-fg ring-1 ring-danger/30' : 'bg-surface-muted text-ink-muted ring-1 ring-line'
        }`}>
          {done ? <Check className="size-3.5" strokeWidth={3} aria-label="Done" /> : n}
        </span>
        {title}
      </h3>
      <div className="min-w-0 pl-8">{children}</div>
    </section>
  );
}

// The AdSO's approval chain (utils/approvalChain.js on the backend): who
// adds the scholar takes their own step, and it goes on from there.
const CHAIN_STEP = {
  associate: { confirm: 'I checked this and endorse it to the Head of the Recruitment and Scholarship Unit', next: 'The Head recommends it, then the Director gives the final approval. Until then it waits in Applications.', button: 'Add and endorse' },
  head: { confirm: 'I recommend approving this scholar', next: 'The Director gives the final approval. Until then it waits in Applications.', button: 'Add and recommend' },
  director: { confirm: 'I approve this scholarship', next: 'They’re a scholar right away and we email them.', button: 'Add scholar' },
} as const;

export default function ManualScholarDialog({ scholarships, getToken, onClose, onAdded, adsoRole }: {
  // The office's scholarships it can add scholars to.
  scholarships: Scholarship[];
  getToken: () => Promise<string | null>;
  onClose: () => void;
  // awaiting: the approval step it went to (the AdSO's chain), if not approved yet.
  onAdded: (name: string, pendingAccount: boolean, awaiting?: 'head' | 'director') => void;
  // The AdSO account's role: its scholarships follow the approval chain.
  adsoRole?: 'associate' | 'head' | 'director';
}) {
  const chain = adsoRole ? CHAIN_STEP[adsoRole] : null;
  const [scholarshipId, setScholarshipId] = useState(scholarships.length === 1 ? scholarships[0].id : '');
  const [student, setStudent] = useState<FoundStudent | null>(null);
  const [newStudent, setNewStudent] = useState<NewStudent | null>(null);
  const [percentage, setPercentage] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [approved, setApproved] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [holds, setHolds] = useState<string[] | null>(null);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const scholarship = scholarships.find(s => s.id === scholarshipId);
  const isSfag = scholarship?.applicationFormType === 'sfag';
  const studentDone = !!student || isNewStudentValid(newStudent);
  const missing = useMemo(() => [
    !scholarship && 'the scholarship',
    !studentDone && (newStudent ? 'the student’s number, name and DLSU-D email' : 'the student'),
    isSfag && percentage === null && 'the grant percentage',
    note.trim().length < 5 && 'why they’re being added',
    !approved && 'the approval',
  ].filter(Boolean) as string[], [scholarship, studentDone, newStudent, isSfag, percentage, note, approved]);

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    if (!(f.type === 'image/jpeg' || /\.jpe?g$/i.test(f.name))) { setError('The document must be a JPG.'); return; }
    if (f.size > 10 * 1024 * 1024) { setError('The file must be under 10MB.'); return; }
    setError('');
    setFile(f);
  };

  const submit = async (acknowledge = false) => {
    setAttempted(true);
    if (missing.length || busy || !scholarship) return;
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
      if (isSfag && percentage !== null) data.append('sfagPercentage', String(percentage));
      data.append('note', note.trim());
      data.append('directorApproved', 'true');
      if (acknowledge) data.append('acknowledgeOtherScholarship', 'true');
      if (file) data.append('documents', file, file.name);
      const res = await fetch(`${API_BASE_URL}/api/applications/direct-award`, { method: 'POST', headers: await authHeaders(getToken), body: data });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body.code === 'holds_other_scholarship') { setHolds(body.held ?? []); return; }
      if (!res.ok) throw new Error(body.error || 'Failed to add the scholar.');
      onAdded(student ? titleCaseName(student.name) : `${newStudent!.firstName.trim()} ${newStudent!.lastName.trim()}`, !!body.pendingAccount, body.awaiting);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add the scholar.');
    } finally {
      setBusy(false);
    }
  };

  const reasonDone = note.trim().length >= 5;
  const steps = [!!scholarship && (!isSfag || percentage !== null), studentDone, reasonDone, approved];
  const doneCount = steps.filter(Boolean).length;
  const who = student ? titleCaseName(student.name) : newStudent && isNewStudentValid(newStudent) ? `${newStudent.firstName.trim()} ${newStudent.lastName.trim()}` : null;

  return (
    <Modal
      size="xl"
      title="Add a scholar"
      description={chain && adsoRole !== 'director'
        ? 'For someone awarded outside AniSkolar, like on a paper application. It goes through the approval chain like an application.'
        : 'For someone awarded outside AniSkolar, like on a paper application. They’re a scholar right away and we email them.'}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-x-3 gap-y-2">
          <p className={`mr-auto min-w-0 text-sm ${attempted && missing.length ? 'text-danger-fg' : 'text-ink-muted'}`}>
            {attempted && missing.length
              ? `Still needed: ${missing.join(', ')}.`
              : missing.length === 0 && who && scholarship
                ? <>Adding <span className="font-medium text-ink">{who}</span> to the {scholarship.name}{isSfag && percentage ? ` (${percentage}%)` : ''}.</>
                : <span className="tabular-nums">{doneCount} of 4 steps done</span>}
          </p>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" icon={UserPlus} onClick={() => submit()} loading={busy}>{chain?.button ?? 'Add scholar'}</Button>
        </div>
      }
    >
      <div className="space-y-5">
        {error && <Alert tone="danger">{error}</Alert>}
        {holds && (
          <Alert tone="warning" title={`Already holds the ${holds.join(' and the ')}`} action={<Button size="sm" variant="primary" onClick={() => { setHolds(null); submit(true); }} loading={busy}>Add anyway</Button>}>
            Only one internally funded scholarship can be credited. If you add this one, the student chooses which to keep.
          </Alert>
        )}

        <div className="space-y-6">
            <Step n={1} title="Scholarship" done={steps[0]} invalid={attempted && !steps[0]}>
              {scholarships.length <= 6 ? (
                <div role="radiogroup" aria-label="Scholarship" className="grid gap-2 sm:grid-cols-2">
                  {scholarships.map(s => {
                    const active = s.id === scholarshipId;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={busy}
                        onClick={() => { setScholarshipId(s.id); setPercentage(null); }}
                        className={`flex w-full items-center gap-2.5 rounded-control px-3.5 py-2.5 text-left text-sm ring-1 ring-inset transition-colors focus-visible:outline-2 focus-visible:outline-accent ${active ? 'bg-accent-subtle font-medium text-accent ring-accent' : 'text-ink ring-line hover:bg-surface-muted'}`}
                      >
                        <span aria-hidden className={`flex size-4 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ${active ? 'bg-accent ring-accent' : 'ring-line-strong'}`}>
                          {active && <span className="size-1.5 rounded-full bg-white" />}
                        </span>
                        <span className="min-w-0">{s.name}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <Select value={scholarshipId} onChange={v => { setScholarshipId(v); setPercentage(null); }} disabled={busy} label="Scholarship">
                  <option value="">Choose a scholarship…</option>
                  {scholarships.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              )}
              {isSfag && (
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <p className="text-sm font-medium text-ink">Grant percentage</p>
                  <div role="radiogroup" aria-label="Grant percentage" className="inline-flex rounded-control bg-surface-muted p-0.5 ring-1 ring-inset ring-line">
                    {SFAG_PERCENTAGES.map(p => (
                      <button
                        key={p}
                        type="button"
                        role="radio"
                        aria-checked={percentage === p}
                        onClick={() => setPercentage(p)}
                        disabled={busy}
                        className={`min-w-14 rounded-[calc(var(--radius-control)-2px)] px-3 py-1.5 text-sm font-medium tabular-nums transition-colors ${percentage === p ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-ink-subtle hover:text-ink'}`}
                      >
                        {p}%
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Step>

            <Step n={2} title="Student" done={steps[1]} invalid={attempted && !steps[1]}>
              <StudentPicker who="student" student={student} newStudent={newStudent} onStudent={setStudent} onNewStudent={setNewStudent} attempted={attempted} busy={busy} getToken={getToken} />
            </Step>

          <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-2">
            <div className="min-w-0">
            <Step n={3} title="Why they’re being added" done={reasonDone} invalid={attempted && !reasonDone}>
                <Textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  disabled={busy}
                  aria-label="Why they’re being added"
                  placeholder="e.g. Approved on a paper application, 1st semester AY 2026–2027."
                />
                <p className="mt-1.5 text-xs text-ink-subtle">Shown in their history and in the email we send them.</p>
              </Step>
            </div>
            <div className="min-w-0 space-y-6">
              <section className="space-y-2.5">
              <div>
                <p className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-ink"><span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-ink-subtle ring-1 ring-line"><FileImage className="size-3.5" /></span>Supporting document <span className="font-normal text-ink-subtle">(optional)</span></p>
                <div className="pl-8">
                {file ? (
                  <div className="flex items-center gap-3 rounded-control p-2 ring-1 ring-line">
                    {preview ? <img src={preview} alt="" className="size-10 shrink-0 rounded-sm object-cover ring-1 ring-line" /> : <FileImage className="size-5 text-ink-subtle" aria-hidden />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{file.name}</p>
                      <p className="text-xs text-ink-muted">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <Button size="sm" variant="ghost" icon={X} onClick={() => setFile(null)} disabled={busy}>Remove</Button>
                  </div>
                ) : (
                  <label
                    className="flex cursor-pointer items-center gap-3 rounded-control border border-dashed border-line-strong px-3 py-2.5 transition-colors hover:border-accent/50 hover:bg-accent-subtle/40 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0]); }}
                  >
                    <FileImage className="size-5 shrink-0 text-ink-subtle" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">Attach the approval or paper form</span>
                      <span className="block text-xs text-ink-muted">One JPG, up to 10 MB. Click or drop it here.</span>
                    </span>
                    <input type="file" accept=".jpg,.jpeg,image/jpeg" className="sr-only" onChange={e => pickFile(e.target.files?.[0])} disabled={busy} />
                  </label>
                )}
                </div>
              </div>
              </section>
            <Step n={4} title="Approval" done={approved} invalid={attempted && !approved}>
                <div className={`rounded-control p-3 ring-1 ring-inset transition-colors ${approved ? 'bg-success-bg ring-success-fg/30' : attempted ? 'ring-danger-fg/40' : 'ring-line'}`}>
                  <Checkbox checked={approved} onChange={setApproved} label={chain?.confirm ?? 'The office head approved this scholarship'} disabled={busy} />
                </div>
                {chain && <p className="mt-2 text-xs text-ink-muted">{chain.next}</p>}
              </Step>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
