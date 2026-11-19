import { ClipboardCheck } from 'lucide-react';

// The office head's evaluation of a scholar's duty, as the scholar sees it:
// the head's commendations and recommendations (or remarks, on older
// evaluations), who wrote them and when. Never the ratings or the average:
// the backend doesn't send those to scholars (utils/renewals.js
// studentEvaluation). Used on Duty Hours and on a renewal.
export interface ScholarEvaluation {
  commendations?: string | null;
  recommendations?: string | null;
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

export default function EvaluationSummary({ evaluation, title = 'Your office’s evaluation' }: {
  evaluation: ScholarEvaluation;
  title?: string;
  // Kept for callers; there's nothing to expand any more.
  defaultOpen?: boolean;
}) {
  const who = [evaluation.evaluatorName, evaluation.assignedOffice].filter(Boolean).join(', ');
  const comments = ([['Commendations', evaluation.commendations], ['Recommendations', evaluation.recommendations], ['Remarks', evaluation.remarks]] as const)
    .filter(([, text]) => text);
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 font-display font-bold text-base text-slate-900">
          <ClipboardCheck className="w-4 h-4 text-brand-green" aria-hidden />{title}
        </h3>
        {(who || evaluation.enteredAt) && (
          <p className="text-xs text-slate-500 mt-1">{[who && `By ${who}`, formatDate(evaluation.enteredAt)].filter(Boolean).join(' · ')}</p>
        )}
      </div>

      {comments.length > 0 ? comments.map(([label, text]) => (
        <blockquote key={label} className="rounded-xl bg-slate-50 border border-slate-100 p-3.5">
          <p className="text-xs font-bold text-slate-400">{label}</p>
          <p className="text-sm text-slate-700 whitespace-pre-line mt-0.5">{text}</p>
        </blockquote>
      )) : (
        <p className="text-sm text-slate-600">Your office has evaluated your duty. It goes to the scholarship office with your renewal.</p>
      )}
    </div>
  );
}
