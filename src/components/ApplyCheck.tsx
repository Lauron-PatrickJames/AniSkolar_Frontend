import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, CheckCircle2, HelpCircle, Sparkles, X } from 'lucide-react';

// The question a student answers before applying for a scholarship that is
// only for some students (panel, Nov 2026):
//   EBPSP           is a parent or guardian a DLSU-D / DLSMHSI employee?
//                   Yes continues to the application.
//   SDO, ROTC,      are they a varsity player / member? These have no
//   Vicissitude,    application: the office adds its members itself, so Yes
//   Heraldo         explains that, and No encourages them to join.
export interface ApplyCheck {
  question: string;
  // Yes opens the application (true) or explains how members get it.
  yesApplies: boolean;
  yesTitle?: string;
  yesText?: string;
  noTitle: string;
  noText: string;
  // A No that's an invitation (join us), not a dead end.
  encourage?: boolean;
  // Members only (no application): the button says how to get it instead
  // of "Apply" (panel, Nov 2026).
  joinLabel?: string;
}

export const APPLY_CHECKS: Record<string, ApplyCheck> = {
  s6: {
    question: 'Is your parent or legal guardian an employee of DLSU-D or DLSMHSI?',
    yesApplies: true,
    noTitle: 'This scholarship isn’t for you',
    noText: 'The EBPSP is only for the legal dependents (children) of DLSU-D and De La Salle Medical and Health Sciences Institute employees. Have a look at the other scholarships you can apply for.',
  },
  s7: {
    question: 'Are you a varsity player of DLSU-D?',
    joinLabel: 'Be a varsity player',
    yesApplies: false,
    yesTitle: 'No application needed',
    yesText: 'Varsity players don’t apply. Your coach evaluates and endorses you, the SDO Director approves, and the Sports Development Office adds you as a scholar. You’ll get an email and see it under My Scholarship.',
    noTitle: 'Try out for a varsity team',
    noText: 'The Athletic Scholarship is for varsity players. If you play basketball, volleyball, athletics, badminton, table tennis, swimming or chess, join the varsity tryouts. Dates are posted in Announcements.',
    encourage: true,
  },
  s8: {
    question: 'Are you a member of the Vicissitude Editorial Board or Editorial Staff?',
    joinLabel: 'Be a member of Vicissitude',
    yesApplies: false,
    yesTitle: 'No application needed',
    yesText: 'Vicissitude adds its members as scholars each semester, based on their evaluation and duty hours. You’ll get an email and see it under My Scholarship.',
    noTitle: 'Join Vicissitude',
    noText: 'This scholarship is for the people who make the university yearbook. If you write, edit, take photos or do layout, join Vicissitude: you get free skills training and can earn up to a 100% tuition discount. Watch Announcements for their call for staff.',
    encourage: true,
  },
  s10: {
    question: 'Are you an officer of the 267th NROTC unit?',
    joinLabel: 'Be an officer of the 267th NROTCU',
    yesApplies: false,
    yesTitle: 'No application needed',
    yesText: 'The ROTC Office adds its officers as scholars each semester, at their current rank, when the Commandant or the ROTC Coordinator recommends them. You’ll get an email and see it under My Scholarship.',
    noTitle: 'Become an NROTC officer',
    noText: 'This scholarship is for officers of the 267th NROTC unit, with grants of up to ₱30,000. Join the NROTC program through the ROTC Office, earn your rank and stay on active duty to qualify.',
    encourage: true,
  },
  s12: {
    question: 'Are you a member of the Heraldo Filipino Editorial Staff?',
    joinLabel: 'Be a member of the Heraldo Filipino',
    yesApplies: false,
    yesTitle: 'No application needed',
    yesText: 'The Heraldo Filipino adds its Editorial Staff as scholars. Your discount is computed from your scholarship points each term. You’ll get an email and see it under My Scholarship.',
    noTitle: 'Join the Heraldo Filipino',
    noText: 'This scholarship is for the Editorial Staff of the official student publication. If you like writing, photography or design, join the Heraldo Filipino and earn a tuition discount for your work. Watch Announcements for their staff recruitment.',
    encourage: true,
  },
};

export function ApplyCheckDialog({ scholarshipName, check, onApply, onDetails, onClose }: {
  scholarshipName: string;
  check: ApplyCheck;
  onApply: () => void;
  onDetails: () => void;
  onClose: () => void;
}) {
  const [answer, setAnswer] = useState<'yes' | 'no' | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const result = answer === 'yes' ? { title: check.yesTitle ?? '', text: check.yesText ?? '', Icon: CheckCircle2, tone: 'text-brand-green' }
    : answer === 'no' ? { title: check.noTitle, text: check.noText, Icon: check.encourage ? Sparkles : HelpCircle, tone: check.encourage ? 'text-brand-green' : 'text-slate-500' }
    : null;

  const button = 'inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green';
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="apply-check-title">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden />
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 p-5 pb-0">
          <p className="min-w-0 text-xs font-medium text-slate-500">{scholarshipName}</p>
          <button type="button" onClick={onClose} className="-m-1.5 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        {!result ? (
          <>
            <h2 id="apply-check-title" className="px-5 pt-2 font-display text-lg font-bold leading-snug text-slate-900">{check.question}</h2>
            <div className="grid grid-cols-2 gap-2 p-5">
              <button type="button" autoFocus onClick={() => (check.yesApplies ? onApply() : setAnswer('yes'))} className={`${button} bg-brand-green text-white hover:bg-brand-green-dark`}>Yes</button>
              <button type="button" onClick={() => setAnswer('no')} className={`${button} text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50`}>No</button>
            </div>
          </>
        ) : (
          <>
            <div className="flex gap-3 px-5 pt-2">
              <result.Icon className={`mt-0.5 size-5 shrink-0 ${result.tone}`} aria-hidden />
              <div className="min-w-0 space-y-1.5">
                <h2 id="apply-check-title" className="font-display text-base font-bold text-slate-900">{result.title}</h2>
                <p className="text-sm leading-relaxed text-slate-600">{result.text}</p>
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 p-5 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setAnswer(null)} className={`${button} text-slate-600 hover:bg-slate-100`}>Back</button>
              <button type="button" autoFocus onClick={onDetails} className={`${button} bg-brand-green text-white hover:bg-brand-green-dark`}>
                See the details <ArrowRight className="size-4" />
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
