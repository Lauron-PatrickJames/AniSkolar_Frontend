import React, { useEffect, useRef, useState } from 'react';
import { useAuth, useClerk, useUser } from '@clerk/react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, LogOut } from 'lucide-react';
import { StudentProfile } from '../types';
import logo from '../assets/logo.png';
import CampusBackdrop from '../components/CampusBackdrop';
import { Alert, Button, Field, TextInput } from './admin/AdminUI';
import { AcademicFields, ContactFields, FamilyFields, LockedValue, PersonalFields } from '../components/profile/ProfileFormSections';
import { DraftField, DraftSection, ProfileDraft, SECTION_FIELDS, draftFromStudent, draftToPayload, emptyDraft, validateDraft } from '../components/profile/profileForm';
import { nameInitials, splitDirectoryName, titleCaseName } from '../utils/names';
import { programDetails } from '../utils/profile';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

// Onboarding after the first sign-in: only the core the portal can't work
// without (the backend's utils/profileCompletion.js): student number,
// program, year level and GPA. Eligibility filtering depends on these, so
// the dashboard waits for them. Everything else (section, personal,
// contact, parents) fills in later from the Profile page, or is saved from
// the student's first application, or right away: "Complete my full
// profile" saves the essentials and then walks through the rest
// (MoreDetailsSteps), each step saved as it goes and skippable.
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
  // Which button sent the form: the essentials only, or then the rest.
  const wantsFull = useRef(false);
  // Saved essentials, while the student completes the rest.
  const [completing, setCompleting] = useState<StudentProfile | null>(null);

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
      if (wantsFull.current) { setCompleting(data.student); setSubmitting(false); return; }
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

      <main className="pb-10">
        {completing ? <MoreDetailsSteps student={completing} onDone={onComplete} /> : (
        <>
          <Hero
            title={existing ? 'A few details are missing' : `Welcome${firstName ? `, ${firstName}` : ''}`}
            description={existing
              ? 'We need these to show you the scholarships you can apply for.'
              : 'We need four details to show you the scholarships you can apply for.'}
          />
          <motion.div
            className="relative z-10 mx-auto -mt-12 max-w-3xl px-4 sm:-mt-14 sm:px-6"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut', delay: 0.05 }}
          >
          <form ref={formRef} onSubmit={submit} noValidate className="overflow-hidden rounded-xl border border-line bg-surface shadow-card @container">
            <div className="space-y-4 px-5 py-5 sm:px-7 sm:py-6">
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
                  <Field label="Student number" error={errorFor('studentNumber')} helper={!errorFor('studentNumber') ? 'The 9 digits on your student ID.' : undefined}>
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
              )}
            />
            </div>

            <div className="flex flex-col gap-4 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
              <p className="text-xs leading-relaxed text-ink-subtle sm:max-w-xs">
                The rest of your profile can be filled in any time.
                {!existing?.programCode && ' Check your program: only the Admissions and Scholarship Office can change it later.'}
              </p>
              {/* "Continue" comes first so Enter in a field means Continue;
                  shown on the right on wider screens. */}
              <div className="flex flex-col gap-2 sm:flex-row-reverse">
                <Button type="submit" variant="primary" loading={submitting && !wantsFull.current} disabled={submitting} iconRight={ArrowRight} onClick={() => { wantsFull.current = false; }}>
                  Continue to portal
                </Button>
                <Button type="submit" loading={submitting && wantsFull.current} disabled={submitting} onClick={() => { wantsFull.current = true; }}>
                  Fill in full profile now
                </Button>
              </div>
            </div>
          </form>
          </motion.div>
        </>
        )}
      </main>
    </div>
  );
}

// Green campus band at the top of both setup views; the form card overlaps
// its bottom edge.
function Hero({ eyebrow, title, description, wide, children }: { eyebrow?: string; title: string; description: string; wide?: boolean; children?: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  return (
    <section className="relative overflow-hidden bg-[#06301b]">
      <CampusBackdrop tint="linear-gradient(160deg, rgba(0, 48, 26, 0.86), rgba(0, 72, 38, 0.93))" />
      <motion.div
        className={`relative z-10 mx-auto px-4 pt-7 pb-20 sm:px-6 sm:pt-9 sm:pb-22 ${wide ? 'max-w-5xl' : 'max-w-3xl'}`}
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        {eyebrow && <p className="text-sm text-emerald-100/80">{eyebrow}</p>}
        <h1 className="mt-0.5 font-display text-2xl font-bold tracking-tight text-balance text-white sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-pretty text-emerald-50/85">{description}</p>
        {children}
      </motion.div>
    </section>
  );
}

// --- "Complete my full profile" ------------------------------------------------
// After the essentials, the rest of the profile in three short steps, each
// saved on its own (PATCH /me takes partial updates), so stopping halfway
// keeps what's done. "Skip the rest" goes to the dashboard at any point.

const MORE_STEPS: { title: string; description: string; sections: DraftSection[]; fields: DraftField[] }[] = [
  {
    title: 'About you',
    description: 'Your section, and your details exactly as on your birth certificate.',
    sections: ['academic', 'personal'],
    fields: ['section', ...SECTION_FIELDS.personal],
  },
  {
    title: 'Contact information',
    description: 'Where the office can reach you.',
    sections: ['contact'],
    fields: SECTION_FIELDS.contact,
  },
  {
    title: 'Parents and guardian',
    description: 'Asked by every scholarship application.',
    sections: ['family'],
    fields: SECTION_FIELDS.family,
  },
];

function MoreDetailsSteps({ student, onDone }: { student: StudentProfile; onDone: (student: StudentProfile) => void }) {
  const { getToken } = useAuth();
  const reduceMotion = useReducedMotion();
  const [latest, setLatest] = useState(student);
  const [draft, setDraft] = useState<ProfileDraft>(() => draftFromStudent(student));
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState<Set<DraftField>>(new Set());
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const current = MORE_STEPS[step];
  const isLast = step === MORE_STEPS.length - 1;

  const all = validateDraft(draft, { sections: current.sections });
  const errors = Object.fromEntries(current.fields.filter(f => all[f]).map(f => [f, all[f]])) as Partial<Record<DraftField, string>>;
  const errorFor = (f: DraftField) => (attempted || touched.has(f) ? errors[f] : undefined);
  const touch = (f: DraftField) => setTouched(prev => (prev.has(f) ? prev : new Set(prev).add(f)));
  const update = (patch: Partial<ProfileDraft>) => { setDraft(prev => ({ ...prev, ...patch })); setServerError(''); };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('input:not([disabled]), select, button[role="combobox"]')?.focus({ preventScroll: true }));
  }, [step, reduceMotion]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    const bad = current.fields.find(f => errors[f]);
    if (bad) {
      panelRef.current?.querySelector<HTMLElement>(`[data-field="${bad}"] input, [data-field="${bad}"] button, [data-field="${bad}"] select`)?.focus();
      return;
    }
    // This step's fields only.
    const full = draftToPayload(draft, current.sections) as Record<string, unknown>;
    const payload = Object.fromEntries(current.fields.filter(f => f in full).map(f => [f, full[f]]));
    setSaving(true);
    setServerError('');
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/api/students/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setServerError(data.error || 'These details couldn’t be saved. Please try again.'); return; }
      setLatest(data.student);
      if (isLast) { onDone(data.student); return; }
      setStep(step + 1);
      setAttempted(false);
      setTouched(new Set());
    } catch {
      setServerError('Couldn’t reach the server. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Hero
      wide
      eyebrow={`Step ${step + 1} of ${MORE_STEPS.length}`}
      title={current.title}
      description={`${current.description} Saved as you go.`}
    >
      <ol className="mt-4 grid max-w-2xl grid-cols-3 gap-2" aria-label="Steps">
        {MORE_STEPS.map((s, i) => (
          <li key={s.title} className="space-y-1.5">
            <span aria-hidden className={`block h-1 rounded-full transition-colors duration-300 ${i <= step ? 'bg-white' : 'bg-white/20'}`} />
            <span className={`hidden text-xs sm:block ${i === step ? 'font-medium text-white' : 'text-emerald-100/60'}`}>
              {s.title}<span className="sr-only">{i < step ? ' (saved)' : i === step ? ' (current)' : ''}</span>
            </span>
          </li>
        ))}
      </ol>
    </Hero>
    <motion.div
      key={step}
      className="relative z-10 mx-auto -mt-14 max-w-5xl px-4 sm:-mt-16 sm:px-6"
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <form onSubmit={save} noValidate className="overflow-hidden rounded-xl border border-line bg-surface shadow-card @container">
        <div ref={panelRef} className="space-y-5 px-5 py-6 sm:px-7 sm:py-7">
          {serverError && <Alert tone="danger" onDismiss={() => setServerError('')}>{serverError}</Alert>}
          {step === 0 && (
            <>
              <div data-field="section" className="max-w-xs">
                <Field label="Section" error={errorFor('section')}>
                  <TextInput value={draft.section} onChange={e => update({ section: e.target.value })} onBlur={() => touch('section')} placeholder="e.g. BIT44" maxLength={20} autoCapitalize="characters" />
                </Field>
              </div>
              <PersonalFields
                draft={draft} update={update} errorFor={errorFor} touch={touch}
                nameHint="Check that your name matches your birth certificate. Once saved, only the Admissions and Scholarship Office can change these details."
              />
            </>
          )}
          {step === 1 && <ContactFields draft={draft} update={update} errorFor={errorFor} touch={touch} email={latest.email} />}
          {step === 2 && <FamilyFields draft={draft} update={update} errorFor={errorFor} touch={touch} />}
        </div>
        <div className="flex flex-col-reverse items-stretch gap-3 border-t border-line bg-surface-muted/60 px-5 py-4 sm:flex-row sm:items-center sm:px-7">
          <div className="flex items-center justify-between gap-2 sm:justify-start">
            {step > 0 && (
              <Button variant="ghost" icon={ArrowLeft} disabled={saving} onClick={() => { setStep(step - 1); setAttempted(false); setTouched(new Set()); }}>
                Back
              </Button>
            )}
            <Button variant="ghost" disabled={saving} onClick={() => onDone(latest)} title="Steps you’ve already saved are kept.">
              Skip, go to the portal
            </Button>
          </div>
          <Button type="submit" variant="primary" className="sm:ml-auto" loading={saving} iconRight={isLast ? Check : ArrowRight}>
            {isLast ? 'Save and go to the portal' : `Save, next: ${MORE_STEPS[step + 1].title}`}
          </Button>
        </div>
      </form>
    </motion.div>
    </>
  );
}
