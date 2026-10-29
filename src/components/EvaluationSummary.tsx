import React, { useState } from 'react';
import { ChevronDown, ClipboardCheck } from 'lucide-react';
import { EVALUATION_ITEMS, PASSING_AVERAGE, RATING_LABELS, ratingLabel } from '../utils/renewals';

// The office head's 1–5 evaluation of a scholar's duty, as the scholar
// sees it: the average and what it means, each item, and the remarks.
// Used on Duty Hours (the term's evaluation) and on a renewal.
export interface ScholarEvaluation {
  scores: Record<string, number>;
  average: number;
  remarks?: string | null;
  evaluatorName?: string | null;
  assignedOffice?: string | null;
  enteredAt?: string | null;
}

const formatDate = (value?: string | null) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
};

export default function EvaluationSummary({ evaluation, title = 'Your office’s evaluation', defaultOpen = false }: {
  evaluation: ScholarEvaluation;
  title?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const passed = evaluation.average >= PASSING_AVERAGE;
  const who = [evaluation.evaluatorName, evaluation.assignedOffice].filter(Boolean).join(', ');
  const items = EVALUATION_ITEMS.filter(i => evaluation.scores?.[i.key]);
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-display font-bold text-base text-slate-900">
            <ClipboardCheck className="w-4 h-4 text-brand-green" aria-hidden />{title}
          </h3>
          {(who || evaluation.enteredAt) && (
            <p className="text-xs text-slate-500 mt-1">{[who && `By ${who}`, formatDate(evaluation.enteredAt)].filter(Boolean).join(' · ')}</p>
          )}
        </div>
        <div className="text-right">
          <p className="font-display font-black text-3xl text-slate-900 leading-none">{evaluation.average.toFixed(2)}<span className="text-base font-bold text-slate-400"> / 5</span></p>
          <p className={`mt-1 text-xs font-bold ${passed ? 'text-brand-green' : 'text-amber-700'}`}>{ratingLabel(evaluation.average)}</p>
        </div>
      </div>

      {!passed && (
        <p className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-xs text-amber-900 leading-relaxed">
          An average below {PASSING_AVERAGE.toFixed(2)} ({RATING_LABELS[PASSING_AVERAGE]}) means the scholarship office will talk with you before deciding your renewal.
        </p>
      )}

      {evaluation.remarks && (
        <blockquote className="rounded-xl bg-slate-50 border border-slate-100 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Remarks</p>
          <p className="text-sm text-slate-700 whitespace-pre-line mt-0.5">{evaluation.remarks}</p>
        </blockquote>
      )}

      {items.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            className="flex items-center gap-1.5 text-xs font-bold text-brand-green hover:text-brand-green-dark focus:outline-hidden"
          >
            {open ? 'Hide the ratings' : `See all ${items.length} ratings`}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          {open && (
            <ul className="mt-3 divide-y divide-slate-100">
              {items.map(i => {
                const score = evaluation.scores[i.key];
                return (
                  <li key={i.key} className="flex items-center gap-3 py-2">
                    <span className="min-w-0 flex-1 text-sm text-slate-700">{i.label}</span>
                    <span className="flex gap-1" aria-hidden>
                      {[1, 2, 3, 4, 5].map(n => (
                        <span key={n} className={`h-1.5 w-4 rounded-full ${n <= score ? (score >= PASSING_AVERAGE ? 'bg-brand-green' : 'bg-amber-500') : 'bg-slate-200'}`} />
                      ))}
                    </span>
                    <span className="w-36 text-right text-xs text-slate-500">
                      <span className="font-bold text-slate-800">{score}</span> · {RATING_LABELS[score]}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
