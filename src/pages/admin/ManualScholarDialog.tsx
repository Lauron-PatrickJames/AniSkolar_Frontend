import React, { useEffect, useMemo, useState } from 'react';
import { FileImage, UserPlus, X } from 'lucide-react';
import { Scholarship } from '../../types';
import { API_BASE_URL, authHeaders, titleCaseName } from './adminData';
import { Alert, Button, Checkbox, Field, Modal, Select, Textarea } from './AdminUI';
import { FoundStudent, NewStudent, StudentPicker, isNewStudentValid } from './AddScholarDialog';

// "Add scholar" for scholarships students normally apply for: someone the
// office awarded outside AniSkolar (a paper application, a late approval).
// The office picks the scholarship and the student, says why, confirms it
// was approved, and can attach a supporting document; the SFAG also needs
// the grant percentage. They're approved at once. The SDO and the ROTC
// Office, whose scholarships have no application, use AddScholarDialog.
// Backend: POST /api/applications/direct-award.

const SFAG_PERCENTAGES = [100, 75, 50, 25];

export default function ManualScholarDialog({ scholarships, getToken, onClose, onAdded }: {
  // The office's scholarships it can add scholars to.
  scholarships: Scholarship[];
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onAdded: (name: string, pendingAccount: boolean) => void;
}) {
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
      onAdded(student ? titleCaseName(student.name) : `${newStudent!.firstName.trim()} ${newStudent!.lastName.trim()}`, !!body.pendingAccount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add the scholar.');
    } finally {
      setBusy(false);
    }
  };

  const sectionTitle = 'text-sm font-semibold text-ink';

  return (
    <Modal
      size="lg"
      title="Add a scholar"
      description="For someone awarded outside AniSkolar, like on a paper application. They’re a scholar right away and we email them."
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
      <div className="space-y-6">
        {error && <Alert tone="danger">{error}</Alert>}
        {holds && (
          <Alert tone="warning" title={`Already holds the ${holds.join(' and the ')}`} action={<Button size="sm" variant="primary" onClick={() => { setHolds(null); submit(true); }} loading={busy}>Add anyway</Button>}>
            Only one internally funded scholarship can be credited. If you add this one, the student chooses which to keep.
          </Alert>
        )}

        {scholarships.length > 1 && (
          <Field label="Scholarship" error={attempted && !scholarship ? 'Choose the scholarship' : undefined}>
            <Select value={scholarshipId} onChange={v => { setScholarshipId(v); setPercentage(null); }} disabled={busy}>
              <option value="">Choose a scholarship…</option>
              {scholarships.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
        )}
        {scholarships.length === 1 && <p className="text-sm text-ink-muted">Scholarship: <span className="font-medium text-ink">{scholarships[0].name}</span></p>}

        <section className="space-y-2">
          <h3 className={sectionTitle}>Student</h3>
          <StudentPicker who="student" student={student} newStudent={newStudent} onStudent={setStudent} onNewStudent={setNewStudent} attempted={attempted} busy={busy} getToken={getToken} />
        </section>

        {isSfag && (
          <Field label="Grant percentage" error={attempted && percentage === null ? 'Choose the percentage' : undefined}>
            <div role="radiogroup" aria-label="Grant percentage" className="flex flex-wrap gap-2">
              {SFAG_PERCENTAGES.map(p => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={percentage === p}
                  onClick={() => setPercentage(p)}
                  disabled={busy}
                  className={`rounded-control px-3.5 py-1.5 text-sm font-medium ring-1 ring-inset ${percentage === p ? 'bg-accent-subtle text-accent ring-accent' : 'text-ink ring-line hover:bg-surface-muted'}`}
                >
                  {p}%
                </button>
              ))}
            </div>
          </Field>
        )}

        <Field
          label="Why they’re being added"
          helper="Shown in the scholar’s history and in the email to them."
          error={attempted && note.trim().length < 5 ? 'Add a short reason' : undefined}
        >
          <Textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={2000} disabled={busy} placeholder="e.g. Approved on a paper application, 1st semester AY 2026–2027." />
        </Field>

        <section className="space-y-2">
          <h3 className={sectionTitle}>Supporting document <span className="font-normal text-ink-subtle">(optional)</span></h3>
          {file ? (
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
              className="flex cursor-pointer items-center justify-center gap-2 rounded-control border border-dashed border-line-strong px-4 py-4 text-sm hover:bg-surface-muted has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0]); }}
            >
              <FileImage className="size-5 text-ink-subtle" aria-hidden />
              <span className="font-medium text-ink">Choose or drop the approval or paper form</span>
              <span className="text-xs text-ink-muted">One JPG, up to 10 MB</span>
              <input type="file" accept=".jpg,.jpeg,image/jpeg" className="sr-only" onChange={e => pickFile(e.target.files?.[0])} disabled={busy} />
            </label>
          )}
        </section>

        <div className={`rounded-control p-3.5 ring-1 ring-inset ${approved ? 'bg-success-bg ring-success-fg/30' : attempted ? 'ring-danger-fg/40' : 'ring-line'}`}>
          <Checkbox checked={approved} onChange={setApproved} label="This scholarship was approved by the office head" disabled={busy} />
        </div>
      </div>
    </Modal>
  );
}
