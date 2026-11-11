import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ChevronRight, GraduationCap, MapPin, User, UserRoundPen, Users } from 'lucide-react';
import { ProfileCompletion, ProfileSectionKey } from '../types';

// Dashboard nudge: how complete the profile is (the backend's computed
// `completion`, never stored), with a link to each section still missing
// something. Hidden once the profile is complete, or when the backend
// doesn't send completion.

const ICONS: Record<ProfileSectionKey, React.ElementType> = {
  academic: GraduationCap,
  personal: User,
  contact: MapPin,
  family: Users,
};

export default function ProfileCompletionCard({ completion, onEditSection }: {
  completion?: ProfileCompletion;
  onEditSection: (section: ProfileSectionKey) => void;
}) {
  const reduceMotion = useReducedMotion();
  if (!completion || completion.complete) return null;
  const missing = completion.sections.filter(s => !s.complete);

  return (
    <motion.section
      aria-labelledby="profile-completion-title"
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-brand-green">
          <UserRoundPen className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="profile-completion-title" className="font-display text-base font-bold text-slate-900">
            Profile <span className="tabular-nums">{completion.percent}%</span> complete
          </h3>
          <p className="mt-0.5 text-sm text-slate-500">Complete it to fill applications faster: your details are filled in for you.</p>
        </div>
      </div>

      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={completion.percent}
        aria-label="Profile completion"
      >
        <motion.div
          className="h-full rounded-full bg-brand-green"
          initial={reduceMotion ? false : { width: 0 }}
          animate={{ width: `${completion.percent}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        />
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {missing.map(s => {
          const Icon = ICONS[s.key];
          const left = s.missing.length;
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => onEditSection(s.key)}
                className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-2.5 text-left transition-colors hover:border-brand-green/40 hover:bg-emerald-50/40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green"
              >
                <Icon className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-brand-green" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800">{s.label}</span>
                  <span className="block text-xs text-slate-500">{left} {left === 1 ? 'detail' : 'details'} to add</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-green" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </motion.section>
  );
}
