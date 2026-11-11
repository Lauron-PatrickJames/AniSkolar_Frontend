import React, { useEffect, useRef, useState } from 'react';
import { useAuth, useClerk, useUser } from '@clerk/react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, LogOut } from 'lucide-react';
import { StudentProfile } from '../types';
import logo from '../assets/logo.png';
import { Alert, Button, Field, TextInput } from './admin/AdminUI';
import { AcademicFields, LockedValue } from '../components/profile/ProfileFormSections';
import { DraftField, ProfileDraft, draftFromStudent, draftToPayload, emptyDraft, validateDraft } from '../components/profile/profileForm';
import { nameInitials, splitDirectoryName, titleCaseName } from '../utils/names';
import { programDetails } from '../utils/profile';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

// Onboarding after the first sign-in: only the core the portal can't work
// without (the backend's utils/profileCompletion.js): student number,
// program, year level and GPA. Eligibility filtering depends on these, so
// the dashboard waits for them. Everything else (section, personal,
// contact, parents) fills in later from the Profile page, or is saved from
// the student's first application.
//
// `existing`: an older account that has a record but is missing part of
// the core; only what's missing is asked for, saved with PATCH /me.

interface CompleteProfilePageProps {
  existing?: StudentProfile;
  onComplete: (student: StudentProfile) => void;
}

type FieldKey = DraftField | 'studentNumber';
const CORE: FieldKey[] = ['studentNumber', 'programCode', 'yearLevel', 'gpa'];

// DLSU-D student numbers are 9 digits: the year the student first enrolled
// at DLSU-D (possibly in high school, kept into college), then
// 5 digits, e.g. 202312345 (entered 2023). Same rule as the backend
// (routes/students.js).
function studentNumberError(value: string): string | undefined {
  const v = value.trim();
  if (!v) return 'Enter your student number.';
  if (!/^\d{9}$/.test(v)) return 'Student numbers have 9 digits, like 202312345.';
  const year = Number(v.slice(0, 4));
  if (year < 1990 || year > new Date().getFullYear() + 1) {
    return 'Student numbers start with the year you entered, like 2023 in 202312345.';
  }
  return undefined;
}

export default function CompleteProfilePage({ existing, onComplete }: CompleteProfilePageProps) {
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const { user } = useUser();
  const reduceMotion = useReducedMotion();

  const [studentNumber, setStudentNumber] = useState(existing?.studentNumber ?? '');
  const [draft, setDraft] = useState<ProfileDraft>(() => (existing ? draftFromStudent(existing) : emptyDraft()));
  const [touched, setTouched] = useState<Set<FieldKey>>(new Set());
  const [attempted, setAttempted] = useState(false);
  const [studentNumberTaken, setStudentNumberTaken] = useState('');
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Program and section live together in the academic section; onboarding
  // asks for the program, year level and GPA only (the section comes later).
  const academic = validateDraft(draft, { sections: ['academic'] });
  const errors: Partial<Record<FieldKey, string>> = {
    programCode: academic.programCode,
    yearLevel: academic.yearLevel,
    gpa: academic.gpa,
    studentNumber: existing ? undefined : studentNumberTaken || studentNumberError(studentNumber),
  };
  const errorFor = (f: FieldKey) => (attempted || touched.has(f) ? errors[f] : undefined);
  const touch = (f: FieldKey) => setTouched(prev => (prev.has(f) ? prev : new Set(prev).add(f)));
  const update = (patch: Partial<ProfileDraft>) => setDraft(prev => ({ ...prev, ...patch }));

  // Cursor straight in the first field, so the student can start typing.
  useEffect(() => {
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('input:not([disabled]), button[role="combobox"]')?.focus());
  }, []);

  const focusFirstError = () => requestAnimationFrame(() => {
    const bad = CORE.find(f => errors[f]);
    formRef.current?.querySelector<HTMLElement>(`[data-field="${bad}"] input, [data-field="${bad}"] button, [data-field="${bad}"] select`)?.focus();
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (CORE.some(f => errors[f])) { focusFirstError(); return; }
    setSubmitting(true);
    setServerError('');
    // The core only; the section is left for the Profile page.
    const { programCode, yearLevel, gpa } = draftToPayload(draft, ['academic']);
    const core = existing?.programCode ? { yearLevel, gpa } : { programCode, yearLevel, gpa };
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/api/students/${existing ? 'me' : 'complete-profile'}`, {
        method: existing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(existing ? core : { studentNumber: studentNumber.trim(), ...core }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && /student number/i.test(data.error ?? '')) {
          setStudentNumberTaken(data.error);
          focusFirstError();
        } else {
          setServerError(data.error || 'Your details couldn’t be saved. Please try again.');
        }
        setSubmitting(false);
        return;
      }
      onComplete(data.student);
    } catch {
      setServerError('Couldn’t reach the server. Check your connection and try again.');
      setSubmitting(false);
    }
  };

  const names = splitDirectoryName(user?.firstName ?? '', user?.lastName ?? '', user?.primaryEmailAddress?.emailAddress ?? '');
  const accountName = [names.firstName, names.lastName].filter(Boolean).map(titleCaseName).join(' ') || 'Student';
  const firstName = titleCaseName(names.firstName.split(' ')[0] ?? '');
  const email = user?.primaryEmailAddress?.emailAddress ?? '';

  return (
    <div data-admin className="min-h-dvh bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="" className="size-8 object-contain" />
            <span className="font-display text-base font-bold text-brand-green">AniSkolar</span>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex min-w-0 items-center gap-2" title={`${accountName} · ${email}`}>
              {user?.imageUrl ? (
                <img src={user.imageUrl} alt="" className="size-7 shrink-0 rounded-full object-cover ring-1 ring-line" />
              ) : (
                <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-xs font-semibold text-accent">{nameInitials(accountName)}</span>
              )}
              <span className="hidden max-w-[16rem] truncate text-sm text-ink-muted sm:block">{email}</span>
            </div>
            <Button variant="ghost" size="sm" icon={LogOut} onClick={() => signOut()}>Sign out</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
            {existing ? 'A few details are missing' : `Welcome${firstName ? `, ${firstName}` : ''}`}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            {existing
              ? 'We need these to show you the scholarships you can apply for.'
              : 'Four details to get you started: they decide which scholarships you’re shown. The rest of your profile can wait. Fill it in from your Profile any time, or save it from your first application.'}
          </p>

          <form ref={formRef} onSubmit={submit} noValidate className="mt-6 space-y-5 rounded-card bg-surface p-5 shadow-card ring-1 ring-line sm:p-6 @container">
            {serverError && <Alert tone="danger" onDismiss={() => setServerError('')}>{serverError}</Alert>}
            <AcademicFields
              draft={draft}
              update={patch => { update(patch); setServerError(''); }}
              errorFor={f => errorFor(f)}
              touch={f => touch(f)}
              withSection={false}
              locked={existing?.programCode ? {
                program: <LockedValue label="Program" value={programDetails(existing).name} note="Only the Admissions and Scholarship Office can change your program." />,
              } : undefined}
              extra={existing ? undefined : (
                <div data-field="studentNumber">
                  <Field label="Student number" error={errorFor('studentNumber')} helper={!errorFor('studentNumber') ? 'The 9 digits on your student ID, e.g. 202312345.' : undefined}>
                    <TextInput
                      value={studentNumber}
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={9}
                      placeholder="e.g. 202312345"
                      onChange={e => { setStudentNumber(e.target.value.replace(/\D/g, '')); setStudentNumberTaken(''); }}
                      onBlur={() => touch('studentNumber')}
                    />
                  </Field>
                </div>
              )}
            />
            <div className="flex flex-col-reverse items-stretch gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-ink-subtle">Your program can only be changed by the Admissions and Scholarship Office afterwards.</p>
              <Button type="submit" variant="primary" loading={submitting} iconRight={ArrowRight} className="shrink-0">
                Continue
              </Button>
            </div>
          </form>
        </motion.div>
      </main>
    </div>
  );
}
