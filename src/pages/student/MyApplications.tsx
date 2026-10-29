import React, { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Clock, FileText, RotateCcw, Search, XCircle, AlertTriangle, Ban } from 'lucide-react';
import { Application } from '../../types';

// Every application the student has submitted, newest first, with its
// status, the office's message and what to do next.

type Filter = 'All' | 'Under Evaluation' | 'Needs Revision' | 'Approved' | 'Rejected';

const STATUS: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  'Under Evaluation': { label: 'Under evaluation', className: 'bg-sky-50 text-sky-700 ring-sky-200', icon: Clock },
  'Needs Revision': { label: 'Needs revision', className: 'bg-amber-50 text-amber-800 ring-amber-200', icon: AlertTriangle },
  Approved: { label: 'Approved', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: CheckCircle2 },
  Rejected: { label: 'Not approved', className: 'bg-rose-50 text-rose-700 ring-rose-200', icon: XCircle },
  Declined: { label: 'Declined by you', className: 'bg-slate-100 text-slate-600 ring-slate-200', icon: Ban },
};

const formatDate = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
};

export default function MyApplications({ applications, onViewScholarship, onResubmit, onNavigate }: {
  applications: Application[];
  onViewScholarship: (scholarshipId: string) => void;
  onResubmit: (applicationId: string) => void;
  onNavigate: (page: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>('All');
  const stateOf = (a: Application) => (a.endReason === 'Declined' ? 'Declined' : a.status);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    applications.forEach(a => { c[a.status] = (c[a.status] ?? 0) + 1; });
    return c;
  }, [applications]);
  const shown = applications.filter(a => filter === 'All' || a.status === filter);
  const filters: Filter[] = ['All', 'Under Evaluation', 'Needs Revision', 'Approved', 'Rejected'];

  if (!applications.length) {
    return (
      <div className="mx-auto max-w-lg space-y-3 rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <FileText className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="font-display text-lg font-bold text-slate-900">No applications yet</h2>
        <p className="text-sm text-slate-500">Applications you submit show here with their status and the office’s messages.</p>
        <button type="button" onClick={() => onNavigate('explore')} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-green px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-green-dark">
          <Search className="h-4 w-4" /> Explore scholarships
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter by status">
        {filters.map(f => {
          const n = f === 'All' ? applications.length : counts[f] ?? 0;
          const active = filter === f;
          return (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f)}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${active ? 'bg-brand-green text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
            >
              {f === 'All' ? 'All' : STATUS[f].label} <span className={active ? 'text-white/80' : 'text-slate-400'}>{n}</span>
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No applications with this status.</p>
      ) : (
        <ul className="space-y-3">
          {shown.map(a => {
            const meta = STATUS[stateOf(a)] ?? STATUS['Under Evaluation'];
            const Icon = meta.icon;
            return (
              <li key={a.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <h3 className="font-display text-base font-bold text-slate-900">{a.scholarshipName}</h3>
                    <p className="text-xs text-slate-500">
                      {a.referenceCode && <span className="font-mono font-semibold text-slate-700">{a.referenceCode}</span>}
                      {a.referenceCode && ' · '}Submitted {formatDate(a.submittedAt)}
                    </p>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1.5 self-start rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${meta.className}`}>
                    <Icon className="h-3.5 w-3.5" /> {meta.label}
                  </span>
                </div>

                {a.reviewNote && (
                  <div className="mt-4 rounded-xl bg-slate-50 p-3.5 ring-1 ring-slate-200">
                    <p className="mb-1 text-xs font-semibold text-slate-500">Message from the office</p>
                    <p className="whitespace-pre-line text-sm text-slate-700">{a.reviewNote}</p>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={() => onViewScholarship(a.scholarshipId)} className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
                    View details <ArrowRight className="h-4 w-4" />
                  </button>
                  {a.status === 'Needs Revision' && (
                    <button type="button" onClick={() => onResubmit(a.id)} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-green px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-green-dark">
                      <RotateCcw className="h-4 w-4" /> Revise and resubmit
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
