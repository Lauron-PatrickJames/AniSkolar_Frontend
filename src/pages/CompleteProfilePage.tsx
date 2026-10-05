import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth, useClerk, useUser } from '@clerk/react';
import { ArrowLeft, ArrowRight, Check, LogOut } from 'lucide-react';
import { StudentProfile } from '../types';
import logo from '../assets/logo.png';
import { Alert, Button, Field, TextInput } from './admin/AdminUI';
import { AcademicFields, ContactFields, FamilyFields, PersonalFields } from '../components/profile/ProfileFormSections';
import {
  DraftErrors, DraftField, ProfileDraft, SECTION_FIELDS, draftToPayload, emptyDraft, validateDraft
} from '../components/profile/profileForm';
import { nameInitials, titleCaseName } from '../utils/names';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

// First sign-in: the student links their student number and fills in their
// profile in three short steps. Only the first step is required; the rest
// can be skipped and added later from Profile. Name and email come from the
// university account and are shown, not asked for.

interface CompleteProfilePageProps {
  onComplete: (student: StudentProfile) => void;
}

type FieldKey = DraftField | 'studentNumber';

const STEPS: { title: string; description: string; fields: FieldKey[] }[] = [
  {
    title: 'Your studies',
    description: 'Links your account to your student record and decides which scholarships you’re shown.',
    fields: ['studentNumber', ...SECTION_FIELDS.academic],
  },
  {
    title: 'About you',
    description: 'Used to fill in your scholarship applications for you. You can skip this and add it later.',
    fields: [...SECTION_FIELDS.personal, ...SECTION_FIELDS.contact],
  },
  {
    title: 'Parents and guardian',
    description: 'Asked by most scholarship applications. You can skip this and add it later.',
    fields: SECTION_FIELDS.family,
  },
];

const stepOf = (field: FieldKey) => STEPS.findIndex(s => s.fields.includes(field));

// DLSU-D student numbers are 9 digits, e.g. 202330864.
function studentNumberError(value: string): string | undefined {
  const v = value.trim();
  if (!v) return 'Enter your student number.';
  if (!/^\d{9}$/.test(v)) return 'Student numbers have 9 digits, like 202312345.';
  return undefined;
}

// The in-progress form survives a refresh (this browser tab only).
interface SavedSetup { studentNumber: string; draft: ProfileDraft; step: number }
const storageKey = (userId?: string) => `aniskolar_profile_setup_${userId ?? 'anon'}`;
function loadSaved(userId?: string): SavedSetup | null {
  try {
    const raw = sessionStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedSetup;
    return { studentNumber: parsed.studentNumber ?? '', draft: { ...emptyDraft(), ...parsed.draft }, step: Math.min(Math.max(parsed.step ?? 0, 0), STEPS.length - 1) };
  } catch {
    return null;
  }
}

export default function CompleteProfilePage({ onComplete }: CompleteProfilePageProps) {
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const { user } = useUser();

  const saved = useMemo(() => loadSaved(user?.id), [user?.id]);
  const [studentNumber, setStudentNumber] = useState(saved?.studentNumber ?? '');
  const [draft, setDraft] = useState<ProfileDraft>(saved?.draft ?? emptyDraft());
  const [step, setStep] = useState(saved?.step ?? 0);
  const [touched, setTouched] = useState<Set<FieldKey>>(new Set());
  // Steps the student tried to leave: show all of their errors.
  const [attempted, setAttempted] = useState<Set<number>>(new Set());
  const [serverError, setServerError] = useState('');
  const [studentNumberTaken, setStudentNumberTaken] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey(user?.id), JSON.stringify({ studentNumber, draft, step } satisfies SavedSetup));
    } catch {
      // Storage unavailable (private mode): the form still works.
    }
  }, [studentNumber, draft, step, user?.id]);

  // Move focus to the new step's heading, so screen readers announce it.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    headingRef.current?.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  const errors: DraftErrors & { studentNumber?: string } = {
    ...validateDraft(draft, { requireAcademic: true }),
    studentNumber: studentNumberTaken || studentNumberError(studentNumber),
  };
  const errorFor = (field: FieldKey) =>
    touched.has(field) || attempted.has(stepOf(field)) ? errors[field] : undefined;
  const touch = (field: FieldKey) => setTouched(prev => (prev.has(field) ? prev : new Set(prev).add(field)));
  const update = (patch: Partial<ProfileDraft>) => setDraft(prev => ({ ...prev, ...patch }));

  // The first step (from `from`) that has an error, or -1.
  const firstStepWithErrors = (from = 0) =>
    STEPS.findIndex((s, i) => i >= from && s.fields.some(f => errors[f]));

  const focusFirstError = (stepIndex: number) => {
    requestAnimationFrame(() => {
      const field = STEPS[stepIndex].fields.find(f => errors[f]);
      const el = field && formRef.current?.querySelector<HTMLElement>(`[data-field="${field}"] input:not([disabled]), [data-field="${field}"] button, [data-field="${field}"] select`);
      el?.focus();
    });
  };

  const goTo = (target: number) => {
    setServerError('');
    setStep(target);
  };

  const submit = async () => {
    // Everything entered so far must be valid, even in skipped steps.
    const bad = firstStepWithErrors();
    if (bad >= 0) {
      setAttempted(prev => new Set(prev).add(bad));
      goTo(bad);
      focusFirstError(bad);
      return;
    }
    setSubmitting(true);
    setServerError('');
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/api/students/complete-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ studentNumber: studentNumber.trim(), ...draftToPayload(draft) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && /student number/i.test(data.error ?? '')) {
          setStudentNumberTaken(data.error);
          setAttempted(prev => new Set(prev).add(0));
          goTo(0);
          focusFirstError(0);
        } else {
          setServerError(data.error || 'Your profile couldn’t be saved. Please try again.');
        }
        setSubmitting(false);
        return;
      }
      try { sessionStorage.removeItem(storageKey(user?.id)); } catch { /* ignore */ }
      onComplete(data.student);
    } catch {
      setServerError('Couldn’t reach the server. Check your connection and try again.');
      setSubmitting(false);
    }
  };

  // Continue: this step must be valid first.
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(prev => new Set(prev).add(step));
    if (STEPS[step].fields.some(f => errors[f])) {
      focusFirstError(step);
      return;
    }
    if (step < STEPS.length - 1) goTo(step + 1);
    else submit();
  };

  const accountFirst = user?.firstName?.trim() ?? '';
  const accountLast = user?.lastName?.trim() ?? '';
  const accountName = titleCaseName([accountFirst, accountLast].filter(Boolean).join(' ')) || 'Student';
  const email = user?.primaryEmailAddress?.emailAddress ?? '';
  const isLast = step === STEPS.length - 1;

  return (
    <div data-admin className="min-h-dvh bg-canvas text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="" className="size-8 object-contain" />
            <span className="font-display text-base font-bold text-brand-green">AniSkolar</span>
          </div>
          <Button variant="ghost" size="sm" icon={LogOut} onClick={() => signOut()}>Sign out</Button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 py-6 sm:py-10">
        <div className="space-y-1">
          <h1 className="text-title font-semibold text-ink">Set up your profile</h1>
          <p className="text-sm text-ink-muted">A few details before you continue to the scholarship portal.</p>
        </div>

        {/* Who's signing up: from the university account, not editable here. */}
        <section aria-label="Your account" className="flex items-center gap-3 rounded-card bg-surface p-4 shadow-card ring-1 ring-line">
          {user?.imageUrl ? (
            <img src={user.imageUrl} alt="" className="size-11 shrink-0 rounded-full object-cover ring-1 ring-line" />
          ) : (
            <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-sm font-semibold text-accent">{nameInitials(accountName)}</span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink" title={accountName}>{accountName}</p>
            <p className="truncate text-sm text-ink-muted" title={email}>{email}</p>
          </div>
          <p className="hidden text-xs text-ink-subtle sm:block">From your university account</p>
        </section>

        <form ref={formRef} onSubmit={onSubmit} noValidate className="rounded-card bg-surface shadow-card ring-1 ring-line">
          <div className="border-b border-line px-5 pb-5 pt-4 sm:px-6">
            <ol className="mb-4 grid grid-cols-3 gap-2" aria-label="Progress">
              {STEPS.map((s, i) => {
                const done = i < step;
                const current = i === step;
                return (
                  <li key={s.title} aria-current={current ? 'step' : undefined}>
                    <button
                      type="button"
                      onClick={() => (i < step ? goTo(i) : undefined)}
                      disabled={i > step}
                      className="group block w-full text-left disabled:cursor-default"
                    >
                      <span className={`block h-1.5 rounded-full transition-colors ${done || current ? 'bg-accent' : 'bg-line'}`} />
                      <span className={`mt-2 hidden items-center gap-1 text-xs sm:flex ${current ? 'font-medium text-ink' : done ? 'text-ink-muted group-hover:text-ink' : 'text-ink-subtle'}`}>
                        {done && <Check className="size-3.5 text-accent" aria-hidden />}
                        {s.title}
                        <span className="sr-only">{done ? ' (done)' : current ? ' (current step)' : ''}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <p className="text-xs text-ink-subtle">Step {step + 1} of {STEPS.length}</p>
            <h2 ref={headingRef} tabIndex={-1} className="mt-0.5 text-lg font-semibold text-ink outline-none">{STEPS[step].title}</h2>
            <p className="mt-0.5 text-sm text-ink-muted">{STEPS[step].description}</p>
          </div>

          <div className="space-y-6 px-5 py-5 sm:px-6">
            {serverError && <Alert tone="danger" onDismiss={() => setServerError('')}>{serverError}</Alert>}

            {step === 0 && (
              <AcademicFields
                draft={draft}
                update={update}
                errorFor={errorFor}
                touch={touch}
                extra={
                  <div data-field="studentNumber" className="sm:max-w-[calc(50%-0.625rem)]">
                    <Field label="Student number" error={errorFor('studentNumber')}>
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
                }
              />
            )}

            {step === 1 && (
              <>
                <section aria-labelledby="setup-personal" className="space-y-5">
                  <h3 id="setup-personal" className="text-sm font-semibold text-ink">Personal details</h3>
                  <PersonalFields draft={draft} update={update} errorFor={errorFor} touch={touch} accountName={{ firstName: titleCaseName(accountFirst), lastName: titleCaseName(accountLast) }} />
                </section>
                <section aria-labelledby="setup-contact" className="space-y-5 border-t border-line pt-6">
                  <h3 id="setup-contact" className="text-sm font-semibold text-ink">Contact</h3>
                  <ContactFields draft={draft} update={update} errorFor={errorFor} touch={touch} />
                </section>
              </>
            )}

            {step === 2 && <FamilyFields draft={draft} update={update} errorFor={errorFor} touch={touch} />}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-line bg-surface-muted px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:rounded-b-card sm:px-6">
            <div>
              {step > 0 && <Button icon={ArrowLeft} onClick={() => goTo(step - 1)} disabled={submitting} className="w-full sm:w-auto">Back</Button>}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
              {step > 0 && (
                <Button variant="ghost" onClick={submit} disabled={submitting} className="w-full sm:w-auto">
                  Skip for now
                </Button>
              )}
              <Button type="submit" variant="primary" loading={submitting} iconRight={isLast ? undefined : ArrowRight} className="w-full sm:w-auto">
                {isLast ? 'Finish and go to portal' : 'Continue'}
              </Button>
            </div>
          </div>
        </form>

        <p className="text-center text-xs text-ink-subtle">
          You can change any of this later from your Profile.
        </p>
      </main>
    </div>
  );
}
