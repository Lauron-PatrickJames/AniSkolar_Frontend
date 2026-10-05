import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import { GraduationCap, MapPin, User, Users } from 'lucide-react';
import { ProfileChanges, SaveResult, StudentProfile, VerificationGroup } from '../../types';
import { Alert, Button, Field, Modal, Textarea } from '../../pages/admin/AdminUI';
import { AcademicFields, ContactFields, FamilyFields, LockedValue, PersonalFields } from './ProfileFormSections';
import {
  DraftField, DraftSection, ProfileDraft, SECTION_FIELDS, draftFromStudent, draftToPayload, validateDraft
} from './profileForm';
import { formatGpa, formatLongDate, openCorrectionRequest, programDetails, verificationOf, verificationText } from '../../utils/profile';
import { titleCaseName } from '../../utils/names';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

// Edit profile: one dialog with a tab per section and a single "Save
// changes" for all of them. Opening from a section's Edit button selects
// that tab (and `focusField` focuses a field, e.g. from an "Add" link).
// Verified academic details are read-only with "Request correction".

export const SECTIONS: { key: DraftSection; label: string; icon: React.ElementType }[] = [
  { key: 'academic', label: 'Academic', icon: GraduationCap },
  { key: 'personal', label: 'Personal', icon: User },
  { key: 'contact', label: 'Contact', icon: MapPin },
  { key: 'family', label: 'Parents & guardian', icon: Users },
];

// Draft fields per verification group (locked when verified).
const GROUP_FIELDS: Record<VerificationGroup, DraftField[]> = {
  program: ['programCode'],
  enrollment: ['yearLevel', 'section'],
  gpa: ['gpa'],
};

const sectionOf = (field: DraftField) => (Object.keys(SECTION_FIELDS) as DraftSection[]).find(s => SECTION_FIELDS[s].includes(field));

export default function EditProfileDialog({ student, initialSection = 'academic', focusField, onClose, onSave, onStudentUpdated }: {
  student: StudentProfile;
  initialSection?: DraftSection;
  focusField?: DraftField;
  onClose: (saved: boolean) => void;
  onSave: (changes: ProfileChanges) => Promise<SaveResult>;
  // A correction request returns the updated profile.
  onStudentUpdated: (student: StudentProfile) => void;
}) {
  const initial = useMemo(() => draftFromStudent(student), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState<ProfileDraft>(initial);
  const [section, setSection] = useState<DraftSection>(initialSection);
  const [touched, setTouched] = useState<Set<DraftField>>(new Set());
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const lockedGroups = (Object.keys(GROUP_FIELDS) as VerificationGroup[]).filter(g => verificationOf(student, g));
  const lockedFields = new Set(lockedGroups.flatMap(g => GROUP_FIELDS[g]));

  const allErrors = validateDraft(draft, { requireAcademic: true });
  const errors = Object.fromEntries(Object.entries(allErrors).filter(([f]) => !lockedFields.has(f as DraftField))) as typeof allErrors;
  const errorFor = (f: DraftField) => (attempted || touched.has(f) ? errors[f] : undefined);
  const touch = (f: DraftField) => setTouched(prev => (prev.has(f) ? prev : new Set(prev).add(f)));
  const update = (patch: Partial<ProfileDraft>) => { setDraft(prev => ({ ...prev, ...patch })); setConfirmDiscard(false); };
  const sectionHasError = (s: DraftSection) => SECTION_FIELDS[s].some(f => errorFor(f));

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const focusField_ = (field: DraftField) => {
    requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>(
        `[data-field="${field}"] input:not([disabled]), [data-field="${field}"] button, [data-field="${field}"] select`
      )?.focus();
    });
  };

  useEffect(() => { if (focusField) focusField_(focusField); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const requestClose = () => {
    if (saving) return;
    if (dirty && !confirmDiscard) { setConfirmDiscard(true); return; }
    onClose(false);
  };

  const save = async () => {
    setAttempted(true);
    setServerError('');
    const firstBad = (Object.keys(errors) as DraftField[])
      .sort((a, b) => SECTIONS.findIndex(s => s.key === sectionOf(a)) - SECTIONS.findIndex(s => s.key === sectionOf(b)))[0];
    if (firstBad) {
      const s = sectionOf(firstBad);
      if (s) setSection(s);
      focusField_(firstBad);
      return;
    }
    // Everything except verified groups (those can't change here).
    const payload: ProfileChanges = { ...draftToPayload(draft) };
    for (const f of lockedFields) delete payload[f];
    setSaving(true);
    const result = await onSave(payload);
    setSaving(false);
    if (result.ok) onClose(true);
    else setServerError(result.error ?? 'Your changes couldn’t be saved.');
  };

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const n = SECTIONS.length;
    const next = ['ArrowDown', 'ArrowRight'].includes(e.key) ? (i + 1) % n
      : ['ArrowUp', 'ArrowLeft'].includes(e.key) ? (i - 1 + n) % n
      : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    setSection(SECTIONS[next].key);
    tabRefs.current[next]?.focus();
  };

  // Verified groups: read-only, with a correction request.
  const details = programDetails(student);
  const locked: Partial<Record<VerificationGroup, React.ReactNode>> = {};
  if (verificationOf(student, 'program')) {
    locked.program = <LockedGroup student={student} group="program" label="Program" value={<>{details.name}{details.college ? <span className="block text-ink-muted">{details.college}</span> : null}</>} onStudentUpdated={onStudentUpdated} />;
  }
  if (verificationOf(student, 'enrollment')) {
    locked.enrollment = <LockedGroup student={student} group="enrollment" label="Year level and section" value={[student.yearLevel, student.section].filter(Boolean).join(' · ') || 'Not provided'} onStudentUpdated={onStudentUpdated} />;
  }
  if (verificationOf(student, 'gpa')) {
    locked.gpa = <LockedGroup student={student} group="gpa" label="Cumulative GPA" value={formatGpa(student.gpa) || 'Not provided'} onStudentUpdated={onStudentUpdated} />;
  }

  const current = SECTIONS.find(s => s.key === section)!;
  return (
    <Modal
      sheet
      size="lg"
      title="Edit profile"
      onClose={requestClose}
      dismissible={!saving}
      bodyClassName="flex min-h-0 flex-col p-0 sm:flex-row overflow-hidden!"
      footer={
        confirmDiscard ? (
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between" role="alert">
            <p className="text-sm text-ink">Discard your unsaved changes?</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button onClick={() => setConfirmDiscard(false)}>Keep editing</Button>
              <Button variant="danger" onClick={() => onClose(false)}>Discard changes</Button>
            </div>
          </div>
        ) : (
          <>
            <Button onClick={requestClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={saving} disabled={!dirty}>Save changes</Button>
          </>
        )
      }
    >
      <div
        role="tablist"
        aria-label="Profile sections"
        aria-orientation="vertical"
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-3 py-2 sm:w-52 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r sm:px-2 sm:py-3"
      >
        {SECTIONS.map((s, i) => {
          const active = s.key === section;
          const Icon = s.icon;
          const hasError = sectionHasError(s.key);
          return (
            <button
              key={s.key}
              ref={el => { tabRefs.current[i] = el; }}
              type="button"
              role="tab"
              id={`profile-tab-${s.key}`}
              aria-selected={active}
              aria-controls="profile-tabpanel"
              tabIndex={active ? 0 : -1}
              onClick={() => setSection(s.key)}
              onKeyDown={e => onTabKey(e, i)}
              className={`flex shrink-0 items-center gap-2 rounded-control px-3 py-2 text-left text-sm font-medium transition-colors ${
                active ? 'bg-accent-subtle text-accent-hover' : 'text-ink-muted hover:bg-neutral-bg hover:text-ink'
              }`}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="whitespace-nowrap">{s.label}</span>
              {hasError && (
                <span className="ml-auto size-2 shrink-0 rounded-full bg-danger-solid" aria-hidden />
              )}
              {hasError && <span className="sr-only"> (has errors)</span>}
            </button>
          );
        })}
      </div>

      <div
        ref={panelRef}
        id="profile-tabpanel"
        role="tabpanel"
        aria-labelledby={`profile-tab-${section}`}
        className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6"
      >
        <h3 className="sr-only">{current.label}</h3>
        {serverError && <div className="mb-5"><Alert tone="danger" onDismiss={() => setServerError('')}>{serverError}</Alert></div>}
        {section === 'academic' && <AcademicFields draft={draft} update={update} errorFor={errorFor} touch={touch} locked={locked} />}
        {section === 'personal' && (
          <PersonalFields
            draft={draft} update={update} errorFor={errorFor} touch={touch}
            accountName={{ firstName: titleCaseName(student.firstName ?? ''), lastName: titleCaseName(student.lastName ?? '') }}
          />
        )}
        {section === 'contact' && <ContactFields draft={draft} update={update} errorFor={errorFor} touch={touch} email={student.email} />}
        {section === 'family' && <FamilyFields draft={draft} update={update} errorFor={errorFor} touch={touch} />}
      </div>
    </Modal>
  );
}

// A verified group: its value, who verified it, and a way to ask for a
// correction (POST /api/students/me/correction-requests).
function LockedGroup({ student, group, label, value, onStudentUpdated }: {
  student: StudentProfile;
  group: VerificationGroup;
  label: string;
  value: React.ReactNode;
  onStudentUpdated: (student: StudentProfile) => void;
}) {
  const { getToken } = useAuth();
  const open = openCorrectionRequest(student, group);
  const [writing, setWriting] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    if (!message.trim()) { setError('Tell the office what should be corrected.'); return; }
    setSending(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/api/students/me/correction-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ group, message: message.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'The request couldn’t be sent.');
      onStudentUpdated(data.student);
      setWriting(false);
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The request couldn’t be sent.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div data-field={GROUP_FIELDS[group][0]} className="space-y-3">
      <LockedValue
        label={label}
        value={value}
        note={`${verificationText(student, group)}. You can’t change it here.`}
        action={!open && !writing && <Button size="sm" variant="ghost" onClick={() => setWriting(true)}>Request correction</Button>}
      />
      {open && (
        <p className="text-xs text-ink-muted">Correction requested on {formatLongDate(open.createdAt)}. The office will update it if it’s confirmed.</p>
      )}
      {writing && (
        <div className="space-y-3 rounded-control p-3 ring-1 ring-line">
          <Field label="What should be corrected?" error={error} helper={!error ? 'The office checks this against university records.' : undefined}>
            <Textarea rows={3} maxLength={1000} value={message} onChange={e => setMessage(e.target.value)} placeholder="e.g. I’m now in 3rd year, section BIT34." />
          </Field>
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => { setWriting(false); setError(''); }} disabled={sending}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={send} loading={sending}>Send request</Button>
          </div>
        </div>
      )}
    </div>
  );
}
