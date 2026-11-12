import React, { useCallback, useEffect, useState } from 'react';
import EvaluationSummary from '../../components/EvaluationSummary';
import { useAuth } from '@clerk/react';
import { openDocument } from '../../utils/documents';
import {
  AlertCircle, ArrowLeft, ArrowRight, Calendar, CalendarClock, Check, CheckCircle, Clock, FileText, GraduationCap, Info, Loader2, LogOut, MessageSquare, RefreshCw, Upload, X, XCircle
} from 'lucide-react';
import {
  NOT_CONTINUING_REASONS, NotContinuingReason, Renewal, RenewalPeriod, RenewalStatus, deadlineLabel, formatGpa, isIsoDate, meetsGpa, periodLabel
} from '../../utils/renewals';
import { CardsSkeleton } from '../../components/Skeletons';
import { useRefreshTick } from '../../utils/useRefreshTick';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

// Scholars renew the scholarships they hold here: one renewal per open
// period (the AdSO opens them for the 2nd semester, and for the 1st
// semester of a new academic year). Data: GET /api/renewals/mine.

const STATUS_STYLES: Record<RenewalStatus, { label: string; className: string; icon: React.ElementType }> = {
  'Under Evaluation': { label: 'Under evaluation', className: 'bg-amber-50 text-amber-800 border-amber-200', icon: Clock },
  'Needs Revision': { label: 'Needs revision', className: 'bg-orange-50 text-orange-800 border-orange-200', icon: AlertCircle },
  Renewed: { label: 'Renewed', className: 'bg-emerald-50 text-emerald-800 border-emerald-200', icon: CheckCircle },
  'Not Renewed': { label: 'Not renewed', className: 'bg-rose-50 text-rose-800 border-rose-200', icon: XCircle },
  'Not Continuing': { label: 'Not continuing', className: 'bg-slate-100 text-slate-700 border-slate-200', icon: XCircle },
};

function StatusPill({ status }: { status: RenewalStatus }) {
  const { label, className, icon: Icon } = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-bold ${className}`}>
      <Icon className="w-3.5 h-3.5" aria-hidden />
      {label}
    </span>
  );
}

export default function Renewals() {
  const { getToken } = useAuth();
  const [available, setAvailable] = useState<RenewalPeriod[]>([]);
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // The period being submitted, or the renewal being revised.
  const [editing, setEditing] = useState<{ period: RenewalPeriod; renewal?: Renewal } | null>(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/api/renewals/mine`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to load your renewals.');
      setAvailable(body.available ?? []);
      setRenewals(body.renewals ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load your renewals.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { load(); }, [load]);
  // Kept current without a page refresh (back on the tab, and every minute).
  const refreshTick = useRefreshTick(60_000);
  useEffect(() => { if (refreshTick) load(); }, [refreshTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // The form is its own history entry, so the browser's Back closes it
  // instead of leaving the page.
  const openForm = (target: { period: RenewalPeriod; renewal?: Renewal }) => {
    setEditing(target);
    window.history.pushState({ ...window.history.state, sub: 'renewal-form' }, '');
  };
  const closeForm = () => {
    if (window.history.state?.sub === 'renewal-form') window.history.back();
    else setEditing(null);
  };
  useEffect(() => {
    const onPop = () => { if (window.history.state?.sub !== 'renewal-form') setEditing(null); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (editing) {
    return (
      <RenewalForm
        period={editing.period}
        existing={editing.renewal}
        onCancel={closeForm}
        onSaved={saved => {
          closeForm();
          setNotice(saved.status === 'Not Continuing'
            ? `We've recorded that you are not continuing with ${saved.scholarshipName}.`
            : `Your renewal for ${saved.scholarshipName} was submitted. The office will review it.`);
          load();
        }}
      />
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900">Scholarship Renewal</h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500 sm:text-sm">
          Submit your grades each semester to keep your scholarship, then follow the office's review here.
        </p>
      </div>

      {notice && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle className="w-5 h-5 shrink-0 text-emerald-600" aria-hidden />
          <p className="flex-1">{notice}</p>
          <button type="button" onClick={() => setNotice('')} aria-label="Dismiss" className="text-emerald-700 hover:text-emerald-900"><X className="w-4 h-4" /></button>
        </div>
      )}

      {loading && renewals.length === 0 && available.length === 0 ? (
        <CardsSkeleton label="Loading renewals" />
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center space-y-3">
          <p className="text-sm font-semibold text-rose-900">{error}</p>
          <button type="button" onClick={load} className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-800 hover:text-rose-950">
            <RefreshCw className="w-3.5 h-3.5" /> Try again
          </button>
        </div>
      ) : (
        <>
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <h3 className="font-display font-bold text-base sm:text-lg text-slate-900">Open for renewal</h3>
              {available.length > 1 && <span className="rounded-full bg-brand-green/10 px-2 py-0.5 text-xs font-bold text-brand-green tabular-nums">{available.length}</span>}
            </div>
            {available.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400"><CalendarClock className="h-5 w-5" aria-hidden /></span>
                <p className="mt-3 text-sm font-semibold text-slate-700">Nothing to renew right now</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  When the office opens the renewal period for a scholarship you hold, it will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {available.map(period => {
                  const submitted = renewals.some(r => r.period?._id === period._id);
                  return <OpenPeriodCard key={period._id} period={period} submitted={submitted} onStart={() => openForm({ period })} />;
                })}
              </div>
            )}
          </section>

          {renewals.length > 0 && (
            <section className="space-y-4">
              <h3 className="font-display font-bold text-base sm:text-lg text-slate-900">My renewals</h3>
              <div className="space-y-4">
                {renewals.map(renewal => (
                  <RenewalCard
                    key={renewal._id}
                    renewal={renewal}
                    onRevise={renewal.period ? () => openForm({ period: renewal.period!, renewal }) : undefined}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function PeriodFacts({ period }: { period: RenewalPeriod }) {
  return (
    <dl className="space-y-2 text-xs">
      {period.deadline && (
        <div className="flex items-center gap-1.5 text-slate-600">
          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden />
          <dt className="sr-only">Deadline</dt>
          <dd><span className="font-semibold">Deadline:</span> {deadlineLabel(period.deadline)}</dd>
        </div>
      )}
      {period.minGpa !== undefined && period.minGpa !== null && (
        <div className="text-slate-600">
          <dt className="inline font-semibold">Minimum GPA: </dt>
          <dd className="inline">{formatGpa(period.minGpa)}, with no failing grades</dd>
        </div>
      )}
      {period.requirements.length > 0 && (
        <div className="text-slate-600">
          <dt className="font-semibold">{period.requirements.length > 1 ? 'Submit your grades and these papers' : 'Submit your grades'}</dt>
          <dd>
            <ul className="mt-1 space-y-0.5">
              {period.requirements.map(r => <li key={r} className="flex items-start gap-1.5"><FileText className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-px" aria-hidden />{r}</li>)}
            </ul>
          </dd>
        </div>
      )}
      {period.notes && <p className="text-slate-500 leading-relaxed whitespace-pre-line">{period.notes}</p>}
    </dl>
  );
}

// An open renewal period, as one card: on the left what to prepare, on the
// right the deadline, the one button, and what happens after.
function OpenPeriodCard({ period, submitted, onStart }: { period: RenewalPeriod; submitted: boolean; onStart: () => void }) {
  const left = daysLeft(period.deadline);
  const urgent = left !== null && left >= 0 && left <= 3;
  const hasMin = period.minGpa !== undefined && period.minGpa !== null;
  const prepare = [
    ...(hasMin ? [`A GPA of ${formatGpa(period.minGpa)} or higher last semester`] : []),
    'No failing grades',
    ...period.requirements.map(r => `A clear photo (JPG) of your ${r}`),
  ];
  const next = ['You submit your GPA and grades', 'The office reviews them', 'You see the decision on this page'];
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
      <div className="grid md:grid-cols-[minmax(0,1fr)_19rem]">
        {/* What to prepare */}
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-green/10 text-brand-green">
              <GraduationCap className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="font-display font-bold leading-snug text-slate-900">{period.scholarshipName}</p>
              <p className="mt-0.5 text-xs text-slate-500">{periodLabel(period)}</p>
            </div>
          </div>

          <p className="mt-6 text-sm font-bold text-slate-800">Before you start, have ready:</p>
          <ul className="mt-2.5 space-y-2">
            {prepare.map(item => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-slate-600">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
          {period.notes && <p className="mt-4 whitespace-pre-line rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">{period.notes}</p>}
          {period.evaluationWait && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
              <Clock className="mt-px h-4 w-4 shrink-0 text-amber-600" aria-hidden />
              <p><span className="font-bold">Waiting for your office’s evaluation.</span> {period.evaluationWait.message}</p>
            </div>
          )}
        </div>

        {/* Deadline, the action, and what happens next */}
        <div className="flex flex-col gap-5 border-t border-slate-200 bg-slate-50/70 p-5 sm:p-6 md:border-l md:border-t-0">
          {period.deadline && (
            <div>
              <p className="text-xs font-semibold text-slate-500">Submit by</p>
              <p className="mt-0.5 font-display text-lg font-bold text-slate-900">{deadlineLabel(period.deadline)}</p>
              {left !== null && left >= 0 && (
                <p className={`mt-0.5 text-xs font-semibold ${urgent ? 'text-amber-700' : 'text-slate-500'}`}>
                  {left === 0 ? 'Due today' : left === 1 ? '1 day left' : `${left} days left`}
                </p>
              )}
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={onStart}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-green-dark focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
            >
              {submitted ? 'Update my renewal' : 'Start renewal'} <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
            <p className="mt-2 text-center text-xs text-slate-500">{submitted ? 'Already submitted. You can still change it.' : 'Takes about 2 minutes'}</p>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <p className="text-xs font-semibold text-slate-500">What happens next</p>
            <ol className="mt-2 space-y-2">
              {next.map((item, i) => (
                <li key={item} className="flex items-center gap-2.5 text-xs text-slate-600">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">{i + 1}</span>
                  {item}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </article>
  );
}

// Where a submitted renewal is: Submitted → Under review → Decision.
function RenewalProgress({ status }: { status: RenewalStatus }) {
  const decided = status !== 'Under Evaluation';
  const tone = status === 'Renewed' ? 'bg-emerald-600' : status === 'Needs Revision' ? 'bg-orange-500' : status === 'Not Renewed' ? 'bg-rose-500' : 'bg-slate-400';
  const steps = [
    { label: 'Submitted', done: true },
    { label: 'Under review', done: true, current: !decided },
    { label: decided ? STATUS_STYLES[status].label : 'Decision', done: decided, current: decided },
  ];
  return (
    <ol className="flex items-center" aria-label="Renewal progress">
      {steps.map((st, i) => (
        <li key={st.label} className={`flex items-center ${i < steps.length - 1 ? 'flex-1' : ''}`}>
          <span className="flex items-center gap-2">
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
              st.done ? (i === 2 ? tone : 'bg-brand-green') : 'border-2 border-slate-300 bg-white'
            } ${st.current && !decided ? 'ring-4 ring-amber-100 bg-amber-500' : ''}`}>
              {st.done && !(st.current && !decided) && <Check className="h-3 w-3 text-white" aria-hidden />}
            </span>
            <span className={`whitespace-nowrap text-xs ${st.current ? 'font-bold text-slate-900' : st.done ? 'font-medium text-slate-600' : 'text-slate-400'}`}>{st.label}</span>
          </span>
          {i < steps.length - 1 && <span aria-hidden className={`mx-2 h-0.5 min-w-4 flex-1 rounded-full ${steps[i + 1].done ? 'bg-brand-green' : 'bg-slate-200'}`} />}
        </li>
      ))}
    </ol>
  );
}

function RenewalCard({ renewal, onRevise }: { renewal: Renewal; onRevise?: () => void }) {
  const { getToken } = useAuth();
  const showMessage = renewal.reviewNote && renewal.status !== 'Under Evaluation';
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display font-bold text-slate-900 leading-snug">{renewal.scholarshipName}</p>
          <p className="text-xs text-slate-500 mt-0.5">{periodLabel(renewal)}</p>
        </div>
        <StatusPill status={renewal.status} />
      </div>

      {renewal.continuing && renewal.status !== 'Not Continuing' && <RenewalProgress status={renewal.status} />}

      {showMessage && (
        <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 border border-slate-100 p-3.5">
          <MessageSquare className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-400">Message from the office</p>
            <p className="text-sm text-slate-700 whitespace-pre-line mt-0.5">{renewal.reviewNote}</p>
          </div>
        </div>
      )}

      {renewal.evaluation?.average ? <EvaluationSummary evaluation={renewal.evaluation} title="Your office's evaluation (part of this renewal)" /> : null}

      <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 [&>div]:rounded-xl [&>div]:bg-slate-50 [&>div]:px-3 [&>div]:py-2.5">
        <div>
          <dt className="text-xs font-bold text-slate-400">Continuing</dt>
          <dd className="font-semibold text-slate-700 mt-0.5">{renewal.continuing ? 'Yes' : `No · ${renewal.notContinuingReason ?? ''}`}</dd>
        </div>
        {renewal.continuing && (
          <>
            <div>
              <dt className="text-xs font-bold text-slate-400">GPA</dt>
              <dd className="font-semibold text-slate-700 mt-0.5">{formatGpa(renewal.gpa)}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold text-slate-400">Failing grade</dt>
              <dd className="font-semibold text-slate-700 mt-0.5">{renewal.hasFailingGrade ? 'Yes' : 'None'}</dd>
            </div>
          </>
        )}
        <div>
          <dt className="text-xs font-bold text-slate-400">Submitted</dt>
          <dd className="font-semibold text-slate-700 mt-0.5">{new Date(renewal.createdAt).toLocaleDateString('en-PH', { dateStyle: 'medium' })}</dd>
        </div>
      </dl>

      {renewal.documents.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {renewal.documents.map(doc => (
            <li key={doc.fileId}>
              <button
                type="button"
                onClick={() => openDocument(doc.fileId, getToken).catch(err => window.alert(err instanceof Error ? err.message : "Couldn't open the file."))}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-brand-green/40 hover:text-brand-green"
              >
                <FileText className="w-3.5 h-3.5" aria-hidden />
                {doc.docType}
              </button>
            </li>
          ))}
        </ul>
      )}

      {renewal.status === 'Needs Revision' && onRevise && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-orange-50 p-3">
          <p className="flex-1 text-xs font-medium text-orange-900">The office needs a change before it can renew you.</p>
          <button
            type="button"
            onClick={onRevise}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-green px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-green-dark"
          >
            Fix and resubmit <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// --- Form -----------------------------------------------------------------------

// Days until a YYYY-MM-DD deadline (Manila time), or null if it isn't a date.
function daysLeft(deadline?: string | null): number | null {
  if (!isIsoDate(deadline)) return null;
  const today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) + 'T00:00:00Z');
  return Math.round((new Date(`${deadline}T00:00:00Z`).getTime() - today.getTime()) / 86_400_000);
}

// A numbered step card; done shows a check in place of the number.
function Step({ n, title, hint, done, children }: { n: number; title: string; hint?: string; done?: boolean; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs">
      <div className="flex items-start gap-3">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${done ? 'bg-brand-green text-white' : 'bg-slate-100 text-slate-500'}`}>
          {done ? <Check className="h-4 w-4" aria-hidden /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
        </div>
      </div>
      <div className="mt-4 sm:pl-10">{children}</div>
    </section>
  );
}

function RenewalForm({ period, existing, onCancel, onSaved }: {
  period: RenewalPeriod;
  existing?: Renewal;
  onCancel: () => void;
  onSaved: (renewal: Renewal) => void;
}) {
  const { getToken } = useAuth();
  const [continuing, setContinuing] = useState<boolean | null>(existing ? existing.continuing : null);
  const [gpa, setGpa] = useState(existing?.gpa !== undefined ? String(existing.gpa) : '');
  const [hasFailingGrade, setHasFailingGrade] = useState<boolean | null>(existing?.hasFailingGrade ?? null);
  const [reason, setReason] = useState<NotContinuingReason | ''>(existing?.notContinuingReason ?? '');
  const [details, setDetails] = useState(existing?.notContinuingDetails ?? '');
  const [files, setFiles] = useState<Record<string, File>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const onFile = new Map((existing?.documents ?? []).map(d => [d.docType, d]));
  const term = periodLabel(period);
  const left = daysLeft(period.deadline);

  // Thumbnails for picked images, freed when replaced or on leaving.
  useEffect(() => {
    const urls = Object.fromEntries(Object.entries(files).map(([k, f]) => [k, URL.createObjectURL(f)]));
    setPreviews(urls);
    return () => Object.values(urls).forEach(u => URL.revokeObjectURL(u));
  }, [files]);

  const pickFile = (requirement: string, file?: File) => {
    setError('');
    if (!file) return;
    const isJpeg = /\.(jpe?g)$/i.test(file.name) && file.type === 'image/jpeg';
    if (!isJpeg) { setError(`${requirement}: upload a JPG/JPEG image.`); return; }
    if (file.size > 10 * 1024 * 1024) { setError(`${requirement}: each file must be under 10MB.`); return; }
    setFiles(prev => ({ ...prev, [requirement]: file }));
  };

  const gpaValue = Number(gpa);
  const gpaValid = gpa.trim() !== '' && Number.isFinite(gpaValue) && gpaValue >= 0 && gpaValue <= 4;
  const meets = gpaValid ? meetsGpa(gpaValue, period.minGpa) : null;
  const docsDone = period.requirements.every(r => files[r] || onFile.has(r));
  const gradesDone = gpaValid && hasFailingGrade !== null;
  const notContinuingDone = !!reason && (reason !== 'Other' || !!details.trim());

  // What's left, in order (also what the checklist shows).
  const checklist: { label: string; done: boolean }[] = continuing === false
    ? [{ label: 'Say you’re not continuing', done: true }, { label: 'Give a reason', done: notContinuingDone }]
    : [
      { label: 'Confirm you’re renewing', done: continuing === true },
      { label: 'Enter your GPA', done: gpaValid },
      { label: 'Answer the failing-grade question', done: hasFailingGrade !== null },
      ...(period.requirements.length ? [{ label: period.requirements.length > 1 ? 'Upload your documents' : 'Upload your grades', done: docsDone }] : []),
    ];
  const doneCount = checklist.filter(c => c.done).length;
  const ready = doneCount === checklist.length;

  const validate = (): string => {
    if (continuing === null) return 'Tell us whether you are continuing with the scholarship.';
    if (!continuing) {
      if (!reason) return 'Choose why you are not continuing.';
      if (reason === 'Other' && !details.trim()) return 'Tell us why you are not continuing.';
      return '';
    }
    if (!gpaValid) return 'Enter your GPA for last semester (0.00–4.00).';
    if (hasFailingGrade === null) return 'Tell us whether you had any failing grade last semester.';
    const missing = period.requirements.filter(r => !files[r] && !onFile.has(r));
    if (missing.length) return `Please upload: ${missing.join(', ')}.`;
    return '';
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validate();
    if (problem) { setError(problem); return; }
    setSubmitting(true);
    setError('');
    try {
      const form = new FormData();
      form.append('periodId', period._id);
      form.append('continuing', String(continuing));
      const labels: string[] = [];
      if (continuing) {
        form.append('gpa', gpa.trim());
        form.append('hasFailingGrade', String(hasFailingGrade));
        for (const requirement of period.requirements) {
          const file = files[requirement];
          if (!file) continue;
          form.append('documents', file, file.name);
          labels.push(requirement);
        }
      } else {
        form.append('notContinuingReason', reason);
        form.append('notContinuingDetails', details.trim());
      }
      form.append('documentLabels', JSON.stringify(labels));

      const token = await getToken();
      const res = await fetch(existing ? `${API_BASE_URL}/api/renewals/${existing._id}` : `${API_BASE_URL}/api/renewals`, {
        method: existing ? 'PATCH' : 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to submit your renewal.');
      onSaved(body.renewal);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit your renewal.');
    } finally {
      setSubmitting(false);
    }
  };

  const pill = (active: boolean) =>
    `rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green ${
      active ? 'border-brand-green bg-brand-green text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
    }`;

  const choice = (value: boolean, title: string, text: string, Icon: React.ElementType, disabled = false) => {
    const active = continuing === value;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={active}
        disabled={disabled}
        onClick={() => { setContinuing(value); setError(''); }}
        className={`group flex flex-1 items-start gap-3 rounded-xl border p-4 text-left transition-all focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green disabled:cursor-not-allowed disabled:opacity-50 ${
          active
            ? value ? 'border-brand-green bg-emerald-50/70 ring-1 ring-brand-green' : 'border-slate-400 bg-slate-50 ring-1 ring-slate-400'
            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
        }`}
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${active ? (value ? 'bg-brand-green text-white' : 'bg-slate-600 text-white') : 'bg-slate-100 text-slate-500'}`}>
          <Icon className="h-4.5 w-4.5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-bold ${active && value ? 'text-brand-green' : 'text-slate-900'}`}>{title}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{text}</span>
        </span>
        <span aria-hidden className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${active ? (value ? 'border-brand-green' : 'border-slate-600') : 'border-slate-300'}`}>
          {active && <span className={`h-2 w-2 rounded-full ${value ? 'bg-brand-green' : 'bg-slate-600'}`} />}
        </span>
      </button>
    );
  };

  const submitLabel = continuing === false ? 'Submit — not continuing' : existing ? 'Resubmit renewal' : 'Submit renewal';

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {/* Header */}
      <div>
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to renewals
        </button>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900">{existing ? 'Update your renewal' : 'Renew your scholarship'}</h2>
            <p className="mt-1 text-sm text-slate-500">{period.scholarshipName} · {term}</p>
          </div>
          {period.deadline && (
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
              left !== null && left <= 3 ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-600'
            }`}>
              <Calendar className="h-3.5 w-3.5" aria-hidden />
              Due {deadlineLabel(period.deadline)}
              {left !== null && left >= 0 && <span className="font-bold">· {left === 0 ? 'today' : left === 1 ? '1 day left' : `${left} days left`}</span>}
            </span>
          )}
        </div>
      </div>

      {existing?.reviewNote && (
        <div className="flex items-start gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" aria-hidden />
          <div>
            <p className="text-sm font-bold text-orange-800">The office asked you to fix something</p>
            <p className="mt-0.5 whitespace-pre-line text-sm text-orange-900">{existing.reviewNote}</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          <Step n={1} title={`Are you continuing next semester?`} hint={`For the ${term}.`} done={continuing !== null}>
            <div role="radiogroup" aria-label="Are you continuing?" className="flex flex-col gap-3 sm:flex-row">
              {choice(true, 'Yes, I’m renewing', 'Submit your grades so the office can renew your scholarship.', RefreshCw, !!period.evaluationWait)}
              {choice(false, 'No, I’m not continuing', 'Let the office know, e.g. you’re graduating or on OJT.', LogOut)}
            </div>
            {period.evaluationWait && (
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                <Clock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{period.evaluationWait.message} You can still tell the office if you're not continuing.</span>
              </p>
            )}
          </Step>

          {continuing === true && (
            <>
              <Step n={2} title="Your grades last semester" hint="As shown on your Certified True Copy of Grades." done={gradesDone}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-bold text-slate-700">GPA</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={0}
                      max={4}
                      value={gpa}
                      onChange={e => { setGpa(e.target.value); setError(''); }}
                      placeholder="e.g. 3.25"
                      aria-describedby="gpa-hint"
                      className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-base tabular-nums sm:text-sm focus:border-brand-green focus:outline-hidden focus:ring-2 focus:ring-brand-green/20"
                    />
                    <span id="gpa-hint" className={`mt-1.5 flex items-center gap-1 text-xs ${meets === true ? 'text-emerald-700' : meets === false ? 'text-amber-700' : 'text-slate-500'}`}>
                      {meets === true ? <><CheckCircle className="h-3.5 w-3.5" aria-hidden /> Meets the {formatGpa(period.minGpa)} minimum</>
                        : meets === false ? <><AlertCircle className="h-3.5 w-3.5" aria-hidden /> Below the {formatGpa(period.minGpa)} minimum. You can still submit; the office decides.</>
                          : gpa.trim() && !gpaValid ? 'Enter a GPA from 0.00 to 4.00.'
                            : period.minGpa !== undefined && period.minGpa !== null ? `Minimum ${formatGpa(period.minGpa)} · 0.00–4.00` : '0.00–4.00'}
                    </span>
                  </label>
                  <div>
                    <span className="text-xs font-bold text-slate-700" id="failing-label">Any failing grade?</span>
                    <div role="radiogroup" aria-labelledby="failing-label" className="mt-1.5 grid grid-cols-2 gap-2">
                      <button type="button" role="radio" aria-checked={hasFailingGrade === false} onClick={() => { setHasFailingGrade(false); setError(''); }} className={pill(hasFailingGrade === false)}>No</button>
                      <button type="button" role="radio" aria-checked={hasFailingGrade === true} onClick={() => { setHasFailingGrade(true); setError(''); }} className={pill(hasFailingGrade === true)}>Yes</button>
                    </div>
                    {hasFailingGrade === true && <p className="mt-1.5 text-xs text-amber-700">Thanks for being upfront. The office will review it with you.</p>}
                  </div>
                </div>
              </Step>

              {period.requirements.length > 0 && (
                <Step
                  n={3}
                  title={period.requirements.length > 1 ? 'Upload your documents' : 'Upload your grades'}
                  hint="A clear photo or scan · JPG/JPEG, up to 10 MB"
                  done={docsDone}
                >
                  <div className="space-y-3">
                    {period.requirements.map(requirement => {
                      const picked = files[requirement];
                      const stored = onFile.get(requirement);
                      const over = dragOver === requirement;
                      return (
                        <div key={requirement}>
                          <p className="mb-1.5 text-xs font-bold text-slate-700">{requirement}</p>
                          {picked ? (
                            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5">
                              {previews[requirement]
                                ? <img src={previews[requirement]} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-black/5" />
                                : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-white"><FileText className="h-5 w-5 text-slate-400" /></span>}
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-slate-800">{picked.name}</p>
                                <p className="text-xs text-emerald-700">{(picked.size / 1024 / 1024).toFixed(1)} MB · ready to submit</p>
                              </div>
                              <label className="cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white">
                                Change
                                <input type="file" accept=".jpg,.jpeg,image/jpeg" className="hidden" onChange={e => { pickFile(requirement, e.target.files?.[0]); e.target.value = ''; }} />
                              </label>
                              <button
                                type="button"
                                onClick={() => setFiles(prev => { const next = { ...prev }; delete next[requirement]; return next; })}
                                aria-label={`Remove ${picked.name}`}
                                className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-rose-600"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <label
                              onDragOver={e => { e.preventDefault(); setDragOver(requirement); }}
                              onDragLeave={() => setDragOver(d => (d === requirement ? null : d))}
                              onDrop={e => { e.preventDefault(); setDragOver(null); pickFile(requirement, e.dataTransfer.files?.[0]); }}
                              className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
                                over ? 'border-brand-green bg-brand-green/5' : 'border-slate-200 hover:border-brand-green/50 hover:bg-brand-green/5'
                              }`}
                            >
                              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-green/10 text-brand-green"><Upload className="h-5 w-5" aria-hidden /></span>
                              <span className="text-sm font-semibold text-slate-800">
                                {stored ? 'Replace the file (optional)' : <>Drop your photo here or <span className="text-brand-green underline-offset-2 hover:underline">browse</span></>}
                              </span>
                              {stored && <span className="flex items-center gap-1 text-xs text-slate-500"><CheckCircle className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> On file: {stored.filename}</span>}
                              <input type="file" accept=".jpg,.jpeg,image/jpeg" className="hidden" onChange={e => { pickFile(requirement, e.target.files?.[0]); e.target.value = ''; }} />
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Step>
              )}
            </>
          )}

          {continuing === false && (
            <Step n={2} title="Why aren’t you continuing?" hint="The office uses this for its records." done={notContinuingDone}>
              <div role="radiogroup" aria-label="Reason" className="flex flex-wrap gap-2">
                {NOT_CONTINUING_REASONS.map(r => (
                  <button key={r} type="button" role="radio" aria-checked={reason === r} onClick={() => { setReason(r); setError(''); }} className={pill(reason === r)}>
                    {r}
                  </button>
                ))}
              </div>
              <label className="mt-4 block">
                <span className="text-xs font-bold text-slate-700">Details {reason !== 'Other' && <span className="font-normal text-slate-400">(optional)</span>}</span>
                <textarea
                  value={details}
                  onChange={e => { setDetails(e.target.value); setError(''); }}
                  rows={3}
                  maxLength={500}
                  placeholder={reason === 'OJT / internship' ? 'e.g. OJT at … until …' : 'Anything the office should know'}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-base sm:text-sm focus:border-brand-green focus:outline-hidden focus:ring-2 focus:ring-brand-green/20"
                />
                <span className="mt-1 block text-right text-[11px] text-slate-400 tabular-nums">{details.length}/500</span>
              </label>
              <p className="mt-2 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
                <Info className="mt-px h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                Your scholarship won't be renewed for the {term}. If you change your mind before the deadline, you can update this.
              </p>
            </Step>
          )}
        </div>

        {/* Summary: what's needed and what's left, with the submit button */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">What's needed</p>
            <div className="mt-3"><PeriodFacts period={period} /></div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Your progress</p>
              <span className="text-xs font-semibold text-slate-500 tabular-nums">{doneCount}/{checklist.length}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
              <div className="h-full rounded-full bg-brand-green transition-all duration-300" style={{ width: `${(doneCount / checklist.length) * 100}%` }} />
            </div>
            <ul className="mt-3 space-y-2">
              {checklist.map(c => (
                <li key={c.label} className={`flex items-center gap-2 text-xs ${c.done ? 'text-slate-500' : 'text-slate-700'}`}>
                  {c.done
                    ? <CheckCircle className="h-4 w-4 shrink-0 text-brand-green" aria-hidden />
                    : <span aria-hidden className="h-4 w-4 shrink-0 rounded-full border-2 border-slate-300" />}
                  <span className={c.done ? 'line-through decoration-slate-300' : ''}>{c.label}</span>
                  <span className="sr-only">{c.done ? '(done)' : '(to do)'}</span>
                </li>
              ))}
            </ul>

            {error && (
              <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
                <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-rose-600" aria-hidden />{error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || continuing === null}
              className={`mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-5 py-3 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                continuing === false ? 'bg-slate-700 hover:bg-slate-800' : 'bg-brand-green hover:bg-brand-green-dark'
              }`}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {submitLabel}
            </button>
            {!ready && continuing !== null && !error && (
              <p className="mt-2 text-center text-[11px] text-slate-400">Finish the steps above to submit.</p>
            )}
            {continuing === null && <p className="mt-2 text-center text-[11px] text-slate-400">Start with step 1.</p>}
            <button type="button" onClick={onCancel} disabled={submitting} className="mt-1 w-full rounded-xl py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-800">
              Cancel
            </button>
          </div>
        </aside>
      </div>
    </form>
  );
}
