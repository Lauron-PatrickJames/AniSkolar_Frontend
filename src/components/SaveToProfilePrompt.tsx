import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Check, Loader2, UserRoundPen } from 'lucide-react';
import { ProfileChanges, SaveResult } from '../types';
import { ProfileFieldChange, changesToPayload } from '../utils/profileSync';

// After a submission: the details on the form that the profile doesn't
// have yet, or has differently, offered back to the profile. Every row is
// selected to start with, but nothing is saved until the student confirms;
// only the chosen fields are sent (PATCH /api/students/me).
export default function SaveToProfilePrompt({ changes, onSave }: {
  changes: ProfileFieldChange[];
  onSave: (payload: ProfileChanges) => Promise<SaveResult>;
}) {
  const reduceMotion = useReducedMotion();
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(changes.map(c => c.key)));
  const [state, setState] = useState<'ask' | 'saving' | 'saved' | 'dismissed'>('ask');
  const [error, setError] = useState('');

  if (!changes.length || state === 'dismissed') return null;

  const toggle = (key: string) => setChosen(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const save = async () => {
    setState('saving');
    setError('');
    const result = await onSave(changesToPayload(changes.filter(c => chosen.has(c.key))));
    if (result.ok) setState('saved');
    else { setState('ask'); setError(result.error ?? 'Your profile couldn’t be updated.'); }
  };

  return (
    <motion.section
      aria-labelledby="save-to-profile-title"
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut', delay: 0.15 }}
      className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-xs sm:p-6"
    >
      <AnimatePresence mode="wait" initial={false}>
        {state === 'saved' ? (
          <motion.p
            key="saved"
            role="status"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 text-sm font-semibold text-brand-green"
          >
            <Check className="h-4 w-4" aria-hidden /> Saved to your profile. Your next application will be filled in for you.
          </motion.p>
        ) : (
          <motion.div key="ask" exit={reduceMotion ? undefined : { opacity: 0 }}>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-brand-green">
                <UserRoundPen className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h3 id="save-to-profile-title" className="font-display text-base font-bold text-slate-900">Save these details to your profile?</h3>
                <p className="mt-0.5 text-sm text-slate-500">Your application is already submitted. These are details from it that your profile doesn’t have yet, or has differently.</p>
              </div>
            </div>

            <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {changes.map(c => {
                const id = `save-${c.key}`;
                return (
                  <li key={c.key}>
                    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 px-3.5 py-2.5 hover:bg-slate-50">
                      <input
                        id={id}
                        type="checkbox"
                        checked={chosen.has(c.key)}
                        onChange={() => toggle(c.key)}
                        disabled={state === 'saving'}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-brand-green"
                      />
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="block text-xs font-medium text-slate-500">{c.label}</span>
                        {c.from ? (
                          <span className="flex flex-wrap items-center gap-x-1.5 text-slate-900">
                            <span className="text-slate-400 line-through decoration-slate-300">{c.from}</span>
                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-label="changes to" />
                            <span className="font-semibold">{c.to}</span>
                          </span>
                        ) : (
                          <span className="block font-semibold text-slate-900">
                            {c.to} <span className="ml-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-green">New</span>
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            {error && <p role="alert" className="mt-3 text-sm font-medium text-rose-600">{error}</p>}

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setState('dismissed')}
                disabled={state === 'saving'}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={save}
                disabled={state === 'saving' || chosen.size === 0}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-green px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-green-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {state === 'saving' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Save {chosen.size === changes.length ? '' : `${chosen.size} `}to profile
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
