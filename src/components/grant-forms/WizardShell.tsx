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
      className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-500 hover:text-brand-green transition-colors focus:outline-hidden"
    >
      <ArrowLeft className="w-4 h-4" />
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
    <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h2 className="font-display font-black text-xl md:text-2xl text-slate-900 tracking-tight">
            {isResubmit ? 'Resubmit Application: ' : 'Application Form: '}<span className="text-brand-green">{scholarshipName}</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
        </div>
        {right}
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            {doneCount} of {total} sections complete
          </span>
          <span className="text-[11px] font-bold text-brand-green">{pct}%</span>
        </div>
        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <motion.div className="h-full bg-brand-green rounded-full" initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.3 }} />
        </div>
      </div>
    </div>
  );
}

export function RevisionNote({ note }: { note?: string }) {
  if (!note) return null;
  return (
    <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-xs text-sky-800 flex items-start gap-2.5">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
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
    <nav className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 shadow-xs p-3 lg:sticky lg:top-24">
      <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible scrollbar-none">
        {parts.map(part => {
          const partSections = sections.filter(s => s.part === part);
          const countable = partSections.filter(s => s.key !== 'review');
          const partDone = countable.filter(s => statusOf(s.key) === 'done').length;
          return (
            <div key={part} className="flex lg:flex-col gap-1 lg:mb-2 shrink-0">
              <p className="hidden lg:flex items-center justify-between px-2 pt-2 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <span>{partLabels[part] ?? part}</span>
                {countable.length > 0 && <span className={partDone === countable.length ? 'text-brand-green' : ''}>{partDone}/{countable.length}</span>}
              </p>
              {partSections.map(section => {
                const active = section.key === currentKey;
                const status = statusOf(section.key);
                return (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => onSelect(section.key)}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-left whitespace-nowrap lg:whitespace-normal transition-colors focus:outline-hidden ${
                      active ? 'bg-brand-green/10 text-brand-green' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {status === 'done' ? (
                      <CheckCircle className="w-4 h-4 text-brand-green shrink-0" />
                    ) : status === 'error' ? (
                      <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                    ) : (
                      <Circle className={`w-4 h-4 shrink-0 ${active ? 'text-brand-green' : 'text-slate-300'}`} />
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
    <div className="p-4 bg-rose-50 text-rose-800 rounded-xl border border-rose-100 text-xs font-bold flex items-start gap-2">
      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
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
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs">
      <div className="px-6 md:px-8 pt-6 pb-4 border-b border-slate-100">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{partLabel}</p>
        <h3 className="font-display font-bold text-lg text-slate-900">{title}</h3>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={sectionKey}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.18 }}
          className="p-6 md:p-8"
        >
          {children}
        </motion.div>
      </AnimatePresence>
      <div className="flex justify-between items-center gap-3 px-6 md:px-8 py-4 border-t border-slate-100">
        {footer}
      </div>
    </div>
  );
}

// Footer content for SectionPanel: previous-section / discard on the left,
// next / submit on the right.
export function WizardFooter({ prevLabel, onPrev, onDiscard, isLast, onNext, onSubmit, isSubmitting, submitLabel }: {
  prevLabel?: string;
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
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-brand-green bg-slate-50 hover:bg-slate-100 border border-slate-200 px-4 py-2.5 rounded-lg transition-colors focus:outline-hidden"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{prevLabel}</span>
          <span className="sm:hidden">Back</span>
        </button>
      ) : onDiscard ? (
        <button type="button" onClick={onDiscard} className="text-xs font-bold text-rose-500 hover:text-rose-600 transition-colors focus:outline-hidden">
          Discard draft and start over
        </button>
      ) : <span />}

      {!isLast ? (
        <button
          type="button"
          onClick={onNext}
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white bg-brand-green hover:bg-brand-green-dark px-5 py-2.5 rounded-lg transition-colors focus:outline-hidden"
        >
          <span>Next</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting}
          className="inline-flex items-center gap-1.5 font-display font-bold uppercase text-xs tracking-wider text-white bg-brand-green hover:bg-brand-green-dark px-6 py-3 rounded-xl transition-all shadow-md shadow-emerald-900/10 focus:outline-hidden disabled:opacity-50"
        >
          {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {isSubmitting ? 'Submitting…' : submitLabel}
        </button>
      )}
    </>
  );
}

export function PrivacyNote({ officeLabel }: { officeLabel: string }) {
  return (
    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-2.5">
      <ShieldAlert className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
      <p className="text-[10px] text-slate-500 leading-relaxed">
        <span className="font-bold">Privacy:</span> The {officeLabel} complies with the Philippine Data Privacy Act of 2012. Your information is kept confidential and used solely to evaluate your scholarship application.
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
      <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${status === 'offline' ? 'text-amber-600' : 'text-slate-400'}`}>
        {status === 'saving' ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : status === 'offline' ? <CloudOff className="w-3.5 h-3.5" />
          : savedAt ? <CheckCircle className="w-3.5 h-3.5 text-brand-green" /> : null}
        {label}
      </span>
      {onSave && (
        <button
          type="button"
          onClick={onSave}
          disabled={status === 'saving'}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-green hover:text-brand-green-dark bg-brand-green/5 hover:bg-brand-green/10 border border-brand-green/20 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50 focus:outline-hidden"
        >
          <Save className="w-3.5 h-3.5" />
          Save draft
        </button>
      )}
    </div>
  );
}

export function SubmittedScreen({ isResubmit, referenceCode, scholarshipName, officeLabel, submissionNote, onBack }: {
  isResubmit: boolean;
  referenceCode?: string;
  scholarshipName: string;
  officeLabel: string;
  submissionNote?: string;
  onBack: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white rounded-2xl border border-slate-200 p-8 md:p-12 text-center max-w-xl mx-auto space-y-6 shadow-xl my-8"
    >
      <div className="w-16 h-16 rounded-full bg-emerald-100 text-brand-green flex items-center justify-center mx-auto shadow-md">
        <CheckCircle className="w-10 h-10" />
      </div>
      <div className="space-y-2">
        <h2 className="font-display font-black text-2xl text-slate-900 tracking-tight">
          {isResubmit ? 'Application Resubmitted Successfully!' : 'Application Submitted Successfully!'}
        </h2>
        {referenceCode && (
          <p className="text-xs font-semibold text-brand-green uppercase tracking-wider">Reference Code: {referenceCode}</p>
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
        className="inline-flex items-center font-display font-bold uppercase text-xs tracking-wider text-white bg-brand-green hover:bg-brand-green-dark px-6 py-3.5 rounded-xl transition-all shadow-md shadow-emerald-900/10 focus:outline-hidden"
      >
        Back to Scholarship
      </button>
    </motion.div>
  );
}
