import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle, ArrowLeft, ArrowRight, CheckCircle, Circle, CloudOff, Loader2, Save, ShieldAlert
} from 'lucide-react';

// Layout shared by every application wizard (POLCA / Alumni in
// GrantApplication.tsx, SFAG / Entrance in ApplyScholarship.tsx): header
// with overall progress, a section navigator grouped by part, the current
// section's card with back/next/submit footer, and the success screen.
// Each wizard owns its own state and validation; this file is layout only.

export interface WizardSection {
  key: string;
  label: string;
  part: string;
}

export type SectionStatus = 'done' | 'error' | 'todo';

export function BackLink({ label = 'Back to Scholarship Details', onClick }: { label?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-control text-sm font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
    >
      <ArrowLeft className="size-4" aria-hidden />
      <span>{label}</span>
    </button>
  );
}

export function WizardHeader({ scholarshipName, isResubmit, subtitle, right, doneCount, total }: {
  scholarshipName: string;
  isResubmit: boolean;
  subtitle: React.ReactNode;
  right?: React.ReactNode;
  doneCount: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  return (
    <div className="space-y-4 rounded-card bg-surface p-5 shadow-card ring-1 ring-line md:px-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink-subtle">{isResubmit ? 'Resubmit application' : 'Application form'}</p>
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink md:text-2xl">{scholarshipName}</h2>
          <p className="mt-0.5 text-xs text-ink-subtle">{subtitle}</p>
        </div>
        {right}
      </div>
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
          <motion.div className="h-full rounded-full bg-accent" initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.3 }} />
        </div>
        <span className="shrink-0 text-xs tabular-nums text-ink-subtle">{doneCount} of {total} sections done</span>
      </div>
    </div>
  );
}

export function RevisionNote({ note }: { note?: string }) {
  if (!note) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-card bg-sky-50 p-4 text-sm text-sky-900 ring-1 ring-inset ring-sky-200">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span><strong>Requested changes:</strong> {note}</span>
    </div>
  );
}

export function SectionNav({ sections, currentKey, statusOf, onSelect, partLabels }: {
  sections: WizardSection[];
  currentKey: string;
  statusOf: (key: string) => SectionStatus;
  onSelect: (key: string) => void;
  partLabels: Record<string, string>;
}) {
  const parts = Array.from(new Set(sections.map(s => s.part)));
  return (
    <nav className="rounded-card bg-surface p-2 shadow-card ring-1 ring-line lg:sticky lg:top-24 lg:col-span-1 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
      <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible scrollbar-none">
        {parts.map(part => {
          const partSections = sections.filter(s => s.part === part);
          const countable = partSections.filter(s => s.key !== 'review');
          const partDone = countable.filter(s => statusOf(s.key) === 'done').length;
          return (
            <div key={part} className="flex lg:flex-col gap-1 lg:mb-2 shrink-0">
              <p className="hidden items-center justify-between px-2.5 pb-1 pt-2 text-xs font-medium text-ink-subtle lg:flex">
                <span>{partLabels[part] ?? part}</span>
                {countable.length > 0 && <span className={`tabular-nums ${partDone === countable.length ? 'text-accent' : ''}`}>{partDone}/{countable.length}</span>}
              </p>
              {partSections.map(section => {
                const active = section.key === currentKey;
                const status = statusOf(section.key);
                return (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => onSelect(section.key)}
                    aria-current={active ? 'step' : undefined}
                    className={`flex items-center gap-2 whitespace-nowrap rounded-control px-2.5 py-1.5 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent lg:whitespace-normal ${
                      active ? 'bg-accent-subtle font-medium text-accent' : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
                    }`}
                  >
                    {status === 'done' ? (
                      <CheckCircle className="size-4 shrink-0 text-accent" aria-label="Done" />
                    ) : status === 'error' ? (
                      <AlertCircle className="size-4 shrink-0 text-danger" aria-label="Needs attention" />
                    ) : (
                      <Circle className={`size-4 shrink-0 ${active ? 'text-accent' : 'text-line-strong'}`} aria-hidden />
                    )}
                    <span>{section.label}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

export function FormBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-card bg-danger-bg p-4 text-sm font-medium text-danger-fg ring-1 ring-inset ring-danger/20">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}

// The current section's card. `sectionKey` drives the slide transition.
export function SectionPanel({ partLabel, title, sectionKey, footer, children }: {
  partLabel: string;
  title: string;
  sectionKey: string;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-card bg-surface shadow-card ring-1 ring-line">
      <div className="border-b border-line px-5 pb-4 pt-5 md:px-6">
        <p className="text-xs font-medium text-ink-subtle">{partLabel}</p>
        <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={sectionKey}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.18 }}
          className="p-5 md:p-6"
        >
          {children}
        </motion.div>
      </AnimatePresence>
      {/* Stays in view at the bottom of the screen on long sections. */}
      <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 rounded-b-card border-t border-line bg-surface/95 px-5 py-3 backdrop-blur-sm md:px-6">
        {footer}
      </div>
    </div>
  );
}

// Footer content for SectionPanel: previous-section / discard on the left,
// next / submit on the right.
export function WizardFooter({ prevLabel, nextLabel, onPrev, onDiscard, isLast, onNext, onSubmit, isSubmitting, submitLabel }: {
  prevLabel?: string;
  // The next section's name, shown on the Next button.
  nextLabel?: string;
  onPrev?: () => void;
  onDiscard?: () => void;
  isLast: boolean;
  onNext: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  submitLabel: string;
}) {
  return (
    <>
      {onPrev && prevLabel ? (
        <button
          type="button"
          onClick={onPrev}
          className="inline-flex h-9 items-center gap-1.5 rounded-control bg-surface px-3 text-sm font-medium text-ink ring-1 ring-inset ring-line-strong transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-accent"
        >
          <ArrowLeft className="size-4 text-ink-subtle" aria-hidden />
          <span className="hidden sm:inline">{prevLabel}</span>
          <span className="sm:hidden">Back</span>
        </button>
      ) : onDiscard ? (
        <button type="button" onClick={onDiscard} className="rounded-control text-sm font-medium text-ink-subtle transition-colors hover:text-danger focus-visible:outline-2 focus-visible:outline-accent">
          Discard draft and start over
        </button>
      ) : <span />}

      {!isLast ? (
        <button
          type="button"
          onClick={onNext}
          className="inline-flex h-9 items-center gap-1.5 rounded-control bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="sm:hidden">Next</span>
          <span className="hidden max-w-[22rem] truncate sm:inline">{nextLabel ? `Next: ${nextLabel}` : 'Next'}</span>
          <ArrowRight className="size-4" aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting}
          className="inline-flex h-9 items-center gap-1.5 rounded-control bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
        >
          {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {isSubmitting ? 'Submitting…' : submitLabel}
        </button>
      )}
    </>
  );
}

export function PrivacyNote({ officeLabel }: { officeLabel: string }) {
  return (
    <div className="flex items-start gap-2.5 px-1">
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
      <p className="text-xs leading-relaxed text-ink-subtle">
        <span className="font-medium text-ink-muted">Privacy:</span> The {officeLabel} complies with the Philippine Data Privacy Act of 2012. Your information is kept confidential and used solely to evaluate your scholarship application.
      </p>
    </div>
  );
}

export type DraftStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'offline';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// `localOnly` = drafts that only ever live in this browser (no server copy).
export function DraftIndicator({ status, savedAt, onSave, localOnly }: {
  status: DraftStatus;
  savedAt: string | null;
  onSave?: () => void;
  localOnly?: boolean;
}) {
  const label =
    status === 'saving' ? 'Saving draft…'
    : status === 'offline' ? 'Saved on this device only'
    : savedAt ? `Draft saved${localOnly ? ' on this device' : ''} · ${formatTime(savedAt)}`
    : 'Not saved yet';
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className={`inline-flex items-center gap-1.5 text-xs ${status === 'offline' ? 'text-amber-700' : 'text-ink-subtle'}`}>
        {status === 'saving' ? <Loader2 className="size-3.5 animate-spin" aria-hidden />
          : status === 'offline' ? <CloudOff className="size-3.5" aria-hidden />
          : savedAt ? <CheckCircle className="size-3.5 text-accent" aria-hidden /> : null}
        {label}
      </span>
      {onSave && (
        <button
          type="button"
          onClick={onSave}
          disabled={status === 'saving'}
          className="inline-flex h-8 items-center gap-1.5 rounded-control bg-surface px-2.5 text-sm font-medium text-ink ring-1 ring-inset ring-line-strong transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
        >
          <Save className="size-3.5 text-ink-subtle" aria-hidden />
          Save draft
        </button>
      )}
    </div>
  );
}

export function SubmittedScreen({ isResubmit, referenceCode, scholarshipName, officeLabel, submissionNote, onBack, after }: {
  isResubmit: boolean;
  referenceCode?: string;
  scholarshipName: string;
  officeLabel: string;
  submissionNote?: string;
  onBack: () => void;
  // Under the confirmation, e.g. "Save these details to your profile?".
  after?: React.ReactNode;
}) {
  return (
    <div className="max-w-xl mx-auto my-8 space-y-4">
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white rounded-2xl border border-slate-200 p-8 md:p-12 text-center space-y-6 shadow-xl"
    >
      <div className="w-16 h-16 rounded-full bg-emerald-100 text-brand-green flex items-center justify-center mx-auto shadow-md">
        <CheckCircle className="w-10 h-10" />
      </div>
      <div className="space-y-2">
        <h2 className="font-display font-black text-2xl text-slate-900 tracking-tight">
          {isResubmit ? 'Application Resubmitted Successfully!' : 'Application Submitted Successfully!'}
        </h2>
        {referenceCode && (
          <p className="text-sm font-semibold text-brand-green">Reference Code: {referenceCode}</p>
        )}
      </div>
      <p className="text-sm text-slate-500 leading-relaxed max-w-sm mx-auto">
        {isResubmit
          ? <>Your updated application for the <strong>{scholarshipName}</strong> has been sent back to the {officeLabel} for another review.</>
          : <>Your application for the <strong>{scholarshipName}</strong> has been sent to the {officeLabel} for evaluation.</>}
      </p>
      {submissionNote && (
        <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 text-xs text-amber-800 font-semibold text-left flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{submissionNote}</span>
        </div>
      )}
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-left text-xs text-slate-500 space-y-2">
        <p><strong>What happens next?</strong></p>
        <p>1. The {officeLabel} will verify your answers and uploaded documents.</p>
        <p>2. Keep an eye on your email and the Portal notifications for updates.</p>
        <p>3. Don’t resubmit unless the office asks you to.</p>
      </div>
      <button
        onClick={onBack}
        className="inline-flex items-center text-sm font-semibold text-white bg-brand-green hover:bg-brand-green-dark px-6 py-3.5 rounded-xl transition-all shadow-md shadow-emerald-900/10 focus:outline-hidden"
      >
        Back to Scholarship
      </button>
    </motion.div>
    {after}
    </div>
  );
}
