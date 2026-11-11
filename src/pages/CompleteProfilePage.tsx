import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth, useClerk, useUser } from '@clerk/react';
import { ArrowLeft, ArrowRight, Check, ClipboardList, LogOut, Pencil, Save, ShieldCheck } from 'lucide-react';
import { StudentProfile } from '../types';
import logo from '../assets/logo.png';
import { Alert, Button, Checkbox, Field, TextInput } from './admin/AdminUI';
import { AcademicFields, ContactFields, FamilyFields, PersonalFields } from '../components/profile/ProfileFormSections';
import {
  DraftErrors, DraftField, ProfileDraft, SECTION_FIELDS, draftToPayload, emptyDraft, validateDraft
} from '../components/profile/profileForm';
import { nameInitials, splitDirectoryName, titleCaseName } from '../utils/names';
import { collegeName, findProgram } from '../data/programs';
import { formatLongDate } from '../utils/profile';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

// First sign-in: the student links their student number and fills in their
// profile in three steps, then reviews it and agrees that it's accurate.
// Everything is required except the telephone and the name suffix (and a
// 1st year's GPA). Name and email come from the university account. After
// this, identity details (name, birth details, nationality, civil status,
// program) can only be changed by the AdSO; see Profile.

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
    description: 'Used to fill in your scholarship applications for you, so enter it exactly as on your birth certificate.',
    fields: [...SECTION_FIELDS.personal, ...SECTION_FIELDS.contact],
  },
  {
    title: 'Parents and guardian',
    description: 'Asked by every scholarship application.',
    fields: SECTION_FIELDS.family,
  },
  {
    title: 'Review and confirm',
    description: 'Check your details before you finish. Some of them can’t be changed by you afterwards.',
    fields: [],
  },
];
const REVIEW_STEP = STEPS.length - 1;

// What to have at hand for each step, shown above its fields so nobody has
// to stop halfway to look something up.
const HAVE_READY: string[][] = [
  ['Student number', 'Program', 'Year level and section', 'Latest cumulative GPA'],
  ['Birth certificate', 'Mobile number', 'Home address and ZIP code'],
  ['Parents’ full names', 'Parents’ contact numbers', 'Guardian’s details'],
  [],
];

const stepOf = (field: FieldKey) => STEPS.findIndex(s => s.fields.includes(field));

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
  // First and last name start from the university (Microsoft) account,
  // re-split where the directory put given names into the surname
  // ("Juan" + "Miguel Santos"); the student confirms or corrects them here.
  const accountNames = (u: typeof user) => {
    const { firstName, lastName } = splitDirectoryName(u?.firstName ?? '', u?.lastName ?? '', u?.primaryEmailAddress?.emailAddress ?? '');
    return { firstName: titleCaseName(firstName), lastName: titleCaseName(lastName) };
  };
  const [draft, setDraft] = useState<ProfileDraft>(() => {
    const d = saved?.draft ?? emptyDraft();
    const names = accountNames(user);
    return {
      ...d,
      firstName: d.firstName || names.firstName,
      lastName: d.lastName || names.lastName,
    };
  });
  const [step, setStep] = useState(saved?.step ?? 0);
  const [touched, setTouched] = useState<Set<FieldKey>>(new Set());
  // Steps the student tried to leave: show all of their errors.
  const [attempted, setAttempted] = useState<Set<number>>(new Set());
  const [serverError, setServerError] = useState('');
  const [studentNumberTaken, setStudentNumberTaken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // The review step's agreement.
  const [agreed, setAgreed] = useState(false);
  const [agreeError, setAgreeError] = useState(false);

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

  // The account may load after the first render: prefill the names then.
  useEffect(() => {
    if (!user) return;
    setDraft(prev => (prev.firstName || prev.lastName ? prev : { ...prev, ...accountNames(user) }));
  }, [user]);

  // On every step (including the first load), put the cursor straight in
  // the first field that still needs an answer, so the student can start
  // typing at once. A finished step (or the review) focuses its heading
  // instead; the live region announces the step either way.
  useEffect(() => {
    const initial = firstRender.current;
    firstRender.current = false;
    if (!initial) window.scrollTo({ top: 0, behavior: 'smooth' });
    requestAnimationFrame(() => {
      const el = step === REVIEW_STEP ? null : firstFieldNeedingInput();
      (el ?? headingRef.current)?.focus({ preventScroll: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // The first field on screen (in reading order, not list order) that is
  // empty or invalid.
  function firstFieldNeedingInput(): HTMLElement | null {
    const slots = formRef.current ? Array.from(formRef.current.querySelectorAll<HTMLElement>('[data-field]')) : [];
    for (const slot of slots) {
      const name = slot.dataset.field as FieldKey;
      if (!errors[name]) continue;
      const el = slot.querySelector<HTMLElement>('input:not([disabled]):not([type="hidden"]), select:not([disabled]), button:not([disabled])');
      if (el) return el;
    }
    return null;
  }

  const focusFirstError = (_stepIndex: number) => {
    requestAnimationFrame(() => firstFieldNeedingInput()?.focus());
  };

  // How many answers each step still needs (empty or invalid fields).
  const leftIn = (i: number) => STEPS[i].fields.filter(f => errors[f]).length;
  // A step can be opened from the progress list once every step before it is complete.
  const canOpen = (i: number) => i <= step || STEPS.slice(0, i).every((_, j) => leftIn(j) === 0);

  const goTo = (target: number) => {
    setServerError('');
    setStep(target);
  };

  const submit = async () => {
    // Every step must be valid.
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
        body: JSON.stringify({ studentNumber: studentNumber.trim(), ...draftToPayload(draft), agreed }),
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
    if (step < REVIEW_STEP) { goTo(step + 1); return; }
    if (!agreed) { setAgreeError(true); return; }
    submit();
  };

  const accountName = (() => { const n = accountNames(user); return [n.firstName, n.lastName].filter(Boolean).join(' '); })() || 'Student';
  const email = user?.primaryEmailAddress?.emailAddress ?? '';
  const isLast = step === STEPS.length - 1;
  const left = step === REVIEW_STEP ? 0 : leftIn(step);
  const totalFields = STEPS.slice(0, REVIEW_STEP).reduce((n, s) => n + s.fields.length, 0);
  const totalLeft = STEPS.slice(0, REVIEW_STEP).reduce((n, _, i) => n + leftIn(i), 0);
  const percent = Math.round(((totalFields - totalLeft) / totalFields) * 100);

  const avatar = (size: string) => user?.imageUrl ? (
    <img src={user.imageUrl} alt="" className={`${size} shrink-0 rounded-full object-cover ring-1 ring-line`} />
  ) : (
    <span aria-hidden className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-accent-subtle text-xs font-semibold text-accent`}>{nameInitials(accountName)}</span>
  );

  return (
    <div data-admin className="min-h-dvh bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="" className="size-8 object-contain" />
            <span className="font-display text-base font-bold text-brand-green">AniSkolar</span>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            {/* Who's signing up: from the university account, not editable here. */}
            <div className="flex min-w-0 items-center gap-2 lg:hidden" title={`${accountName} · ${email}`}>
              {avatar('size-7')}
              <span className="hidden max-w-[14rem] truncate text-sm text-ink-muted sm:block">{email}</span>
            </div>
            <Button variant="ghost" size="sm" icon={LogOut} onClick={() => signOut()}>Sign out</Button>
          </div>
        </div>
        {/* Overall progress, always in view. */}
        <div className="h-0.5 bg-line" aria-hidden>
          <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${step === REVIEW_STEP ? 100 : percent}%` }} />
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-5 sm:px-6 sm:py-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
        {/* Desktop: the account, every step at a glance, and what's left. */}
        <aside className="hidden lg:block">
          <div className="sticky top-[calc(var(--spacing-topbar)+2rem)] space-y-6">
            <div>
              <h1 className="text-title font-semibold text-ink">Set up your profile</h1>
              <p className="mt-1 text-sm text-ink-muted">A few details before you continue to the scholarship portal.</p>
            </div>

            <section aria-label="Your account" className="flex items-center gap-3 rounded-card bg-surface p-3 shadow-card ring-1 ring-line">
              {avatar('size-10')}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink" title={accountName}>{accountName}</p>
                <p className="truncate text-xs text-ink-muted" title={email}>{email}</p>
                <p className="mt-0.5 text-[11px] text-ink-subtle">From your university account</p>
              </div>
            </section>

            <nav aria-label="Progress">
              <ol className="relative space-y-1">
                {STEPS.map((s, i) => {
                  const current = i === step;
                  const n = i === REVIEW_STEP ? 0 : leftIn(i);
                  const done = i !== step && i !== REVIEW_STEP && n === 0 && canOpen(i);
                  const open = canOpen(i);
                  return (
                    <li key={s.title} aria-current={current ? 'step' : undefined}>
                      <button
                        type="button"
                        onClick={() => (open && !current ? goTo(i) : undefined)}
                        disabled={!open}
                        className={`flex w-full items-center gap-3 rounded-control px-2.5 py-2 text-left transition-colors disabled:cursor-default ${current ? 'bg-surface shadow-card ring-1 ring-line' : open ? 'hover:bg-surface' : ''}`}
                      >
                        <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors ${
                          done ? 'bg-accent text-white' : current ? 'bg-accent-subtle text-accent ring-2 ring-accent' : 'bg-surface text-ink-subtle ring-1 ring-line-strong'}`}>
                          {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm ${current ? 'font-semibold text-ink' : open ? 'font-medium text-ink' : 'text-ink-muted'}`}>{s.title}</span>
                          <span className="block text-xs text-ink-subtle">
                            {i === REVIEW_STEP ? 'Check and finish' : n === 0 ? 'Complete' : `${n} ${n === 1 ? 'field' : 'fields'} to fill`}
                          </span>
                        </span>
                        <span className="sr-only">{done ? ' (done)' : current ? ' (current step)' : ''}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>

            <p className="flex items-start gap-2 text-xs text-ink-subtle">
              <Save className="mt-px size-3.5 shrink-0" aria-hidden />
              Your progress is kept if you refresh this page.
            </p>
          </div>
        </aside>

        <main className="min-w-0 space-y-4">
          {/* Phones and tablets: a compact title and step strip. */}
          <div className="space-y-3 lg:hidden">
            <h1 className="text-xl font-semibold text-ink">Set up your profile</h1>
            <ol className="grid grid-cols-4 gap-1.5" aria-label="Progress">
              {STEPS.map((s, i) => {
                const current = i === step;
                const open = canOpen(i);
                return (
                  <li key={s.title} aria-current={current ? 'step' : undefined}>
                    <button
                      type="button"
                      onClick={() => (open && !current ? goTo(i) : undefined)}
                      disabled={!open}
                      aria-label={`${s.title}${current ? ' (current step)' : ''}`}
                      className="block w-full py-1.5 disabled:cursor-default"
                    >
                      <span className={`block h-1.5 rounded-full transition-colors ${i <= step ? 'bg-accent' : open ? 'bg-accent/40' : 'bg-line'}`} />
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          <form ref={formRef} onSubmit={onSubmit} noValidate className="rounded-card bg-surface shadow-card ring-1 ring-line">
            <p className="sr-only" aria-live="polite">Step {step + 1} of {STEPS.length}: {STEPS[step].title}</p>
            <div className="border-b border-line px-5 py-4 sm:px-7">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-accent lg:hidden">Step {step + 1} of {STEPS.length}</p>
                  <h2 ref={headingRef} tabIndex={-1} className="mt-1 text-lg font-semibold text-ink outline-none sm:text-xl lg:mt-0">{STEPS[step].title}</h2>
                  <p className="mt-0.5 text-sm text-ink-muted">{STEPS[step].description}</p>
                </div>
                <div className="mt-0.5 hidden shrink-0 items-center gap-2 sm:flex">
                  <span className="hidden text-xs font-medium text-ink-subtle lg:inline">Step {step + 1} of {STEPS.length}</span>
                  {step !== REVIEW_STEP && (
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${left === 0 ? 'bg-success-bg text-success-fg' : 'bg-neutral-bg text-neutral-fg'}`}>
                      {left === 0 ? 'All filled in' : `${left} to fill`}
                    </span>
                  )}
                </div>
              </div>

              {HAVE_READY[step].length > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="mr-0.5 inline-flex items-center gap-1 text-xs font-medium text-ink-muted">
                    <ClipboardList className="size-3.5" aria-hidden />Have ready:
                  </span>
                  {HAVE_READY[step].map(item => (
                    <span key={item} className="rounded-badge bg-surface-muted px-2 py-0.5 text-xs text-ink-muted ring-1 ring-inset ring-line">{item}</span>
                  ))}
                </div>
              )}
            </div>

            <div className="@container space-y-6 px-5 py-5 sm:px-7 sm:py-6 @2xl:space-y-5">
              {serverError && <Alert tone="danger" onDismiss={() => setServerError('')}>{serverError}</Alert>}

              {step === 0 && (
                <AcademicFields
                  draft={draft}
                  update={update}
                  errorFor={errorFor}
                  touch={touch}
                  extra={
                    <div data-field="studentNumber" className="sm:max-w-[calc(50%-0.625rem)] @2xl:max-w-none">
                      <Field label="Student number" error={errorFor('studentNumber')} labelAside={studentNumber ? `${studentNumber.length}/9` : undefined}>
                        <TextInput
                          value={studentNumber}
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={9}
                          placeholder="e.g. 202312345"
                          className="tabular-nums tracking-wide"
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
                  <section aria-labelledby="setup-personal" className="space-y-4">
                    <SectionHeading id="setup-personal">Personal details</SectionHeading>
                    <PersonalFields draft={draft} update={update} errorFor={errorFor} touch={touch} nameHint="Filled in from your university account. Check that your first and last name are split correctly — you can’t change them yourself later." />
                  </section>
                  <section aria-labelledby="setup-contact" className="space-y-4 border-t border-line pt-5">
                    <SectionHeading id="setup-contact">Contact</SectionHeading>
                    <ContactFields draft={draft} update={update} errorFor={errorFor} touch={touch} />
                  </section>
                </>
              )}

              {step === 2 && <FamilyFields draft={draft} update={update} errorFor={errorFor} touch={touch} />}

              {step === REVIEW_STEP && (
                <ReviewStep
                  studentNumber={studentNumber}
                  draft={draft}
                  email={email}
                  onEdit={goTo}
                  agreed={agreed}
                  onAgree={v => { setAgreed(v); if (v) setAgreeError(false); }}
                  agreeError={agreeError}
                />
              )}
            </div>

            {/* Always within reach, however long the step is. */}
            <div className="sticky bottom-0 z-10 flex items-center gap-3 rounded-b-card border-t border-line bg-surface/95 px-5 py-3 backdrop-blur sm:px-7">
              {step > 0 && (
                <Button icon={ArrowLeft} onClick={() => goTo(step - 1)} disabled={submitting} aria-label="Back">
                  <span className="hidden sm:inline">Back</span>
                </Button>
              )}
              <p className="hidden min-w-0 flex-1 truncate text-xs text-ink-subtle sm:block" aria-hidden>
                {step === REVIEW_STEP
                  ? (agreed ? 'Ready to finish.' : 'Tick the box above to finish.')
                  : left > 0
                    ? `${left} ${left === 1 ? 'field' : 'fields'} left in this step`
                    : <>All set. Press <kbd className="rounded border border-line-strong bg-surface-muted px-1 font-sans text-[11px] text-ink-muted">Enter</kbd> to continue.</>}
              </p>
              <Button type="submit" variant="primary" loading={submitting} icon={isLast ? ShieldCheck : undefined} iconRight={isLast ? undefined : ArrowRight} className="ml-auto flex-1 sm:flex-none">
                {isLast ? 'Confirm and finish' : step === REVIEW_STEP - 1 ? 'Review my details' : 'Continue'}
              </Button>
            </div>
          </form>

          <p className="text-center text-xs text-ink-subtle lg:hidden">
            Signed in as {email || accountName}. Your progress is kept if you refresh this page.
          </p>
        </main>
      </div>
    </div>
  );
}

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="flex items-center gap-3 text-sm font-semibold text-ink">
      {children}
      <span className="h-px flex-1 bg-line" aria-hidden />
    </h3>
  );
}

// The last step: everything entered, grouped, with "Edit" back to its step,
// and the agreement that it's accurate and permanent.
function ReviewStep({ studentNumber, draft, email, onEdit, agreed, onAgree, agreeError }: {
  studentNumber: string;
  draft: ProfileDraft;
  email: string;
  onEdit: (step: number) => void;
  agreed: boolean;
  onAgree: (value: boolean) => void;
  agreeError: boolean;
}) {
  const program = findProgram(draft.programCode);
  const ph = draft.country === 'Philippines';
  const fullName = [draft.firstName, draft.middleName, draft.lastName, draft.nameSuffix].map(p => p.trim()).filter(Boolean).join(' ');
  const parentLine = (name: string, contact: string, deceased: boolean) => (deceased ? `${name} (deceased)` : [name, contact].filter(Boolean).join(' · '));
  const guardian = draft.guardianType === 'father' ? 'Same as father'
    : draft.guardianType === 'mother' ? 'Same as mother'
      : [draft.guardianName, draft.guardianRelationship, draft.guardianContactNo].filter(Boolean).join(' · ');
  const groups: { title: string; step: number; rows: [string, string][] }[] = [
    {
      title: 'Your studies', step: 0, rows: [
        ['Student number', studentNumber],
        ['Program', program ? `${program.name} (${program.code})` : ''],
        ['Department', program ? collegeName(program.college) : ''],
        ['Year level and section', [draft.yearLevel, draft.section.toUpperCase()].filter(Boolean).join(' · ')],
        ['Cumulative GPA', draft.gpa || 'None yet'],
      ],
    },
    {
      title: 'About you', step: 1, rows: [
        ['Name', fullName],
        ['First name · Middle name · Last name', [draft.firstName, draft.middleName, draft.lastName].map(p => p.trim() || '—').join(' · ')],
        ['Date and place of birth', [formatLongDate(draft.dateOfBirth), draft.placeOfBirth].filter(Boolean).join(' · ')],
        ['Nationality and civil status', [draft.nationality, draft.civilStatus].filter(Boolean).join(' · ')],
        ['Email', email],
        ['Mobile', [draft.mobileNumber, draft.telephoneNumber].filter(Boolean).join(' · ')],
        ['Home address', [draft.homeAddress, draft.cityMunicipality, [draft.province, draft.zipCode].filter(Boolean).join(' '), ph ? '' : draft.country].filter(Boolean).join(', ')],
      ],
    },
    {
      title: 'Parents and guardian', step: 2, rows: [
        ['Father', parentLine(draft.fatherName, draft.fatherContactNo, draft.fatherDeceased)],
        ['Mother', parentLine(draft.motherName, draft.motherContactNo, draft.motherDeceased)],
        ['Guardian', guardian],
      ],
    },
  ];
  return (
    <div className="space-y-5">
      {groups.map(g => (
        <section key={g.title} className="rounded-control ring-1 ring-line">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
            <h3 className="text-sm font-semibold text-ink">{g.title}</h3>
            <Button size="sm" variant="ghost" icon={Pencil} onClick={() => onEdit(g.step)}>Edit</Button>
          </div>
          <dl className="divide-y divide-line">
            {g.rows.map(([label, value]) => (
              <div key={label} className="grid grid-cols-1 gap-0.5 px-4 py-2 sm:grid-cols-[12rem_1fr] sm:gap-3">
                <dt className="text-xs text-ink-subtle sm:text-sm">{label}</dt>
                <dd className="text-sm text-ink">{value || <span className="font-medium text-danger">Missing</span>}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <section className={`space-y-3 rounded-control p-4 ring-1 ${agreeError ? 'bg-danger-bg ring-danger' : 'bg-surface-muted ring-line'}`}>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><ShieldCheck className="size-4 text-accent" aria-hidden />Before you finish</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">
          <li>Your scholarship applications are filled in from these details, and the office checks them against your documents.</li>
          <li><span className="font-medium text-ink">Your name, birth details, nationality, civil status and program are permanent once you finish.</span> To correct them later, send a request to the Admissions and Scholarship Office (Profile → Request a change).</li>
          <li>You can still update your year level, section, GPA, contact details and family details from your Profile.</li>
          <li>Giving false information can lead to your application being rejected or your scholarship being revoked.</li>
        </ul>
        <Checkbox
          checked={agreed}
          onChange={onAgree}
          label="I confirm that these details are true, complete and mine, and I agree to the terms above."
        />
        {agreeError && <p role="alert" className="text-xs font-medium text-danger">Tick the box to confirm before you finish.</p>}
      </section>
    </div>
  );
}
