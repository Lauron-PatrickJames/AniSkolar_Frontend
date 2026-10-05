import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/react';
import {
  AlertCircle, ArrowRight, Calendar, CheckCircle, Clock, FileText, Loader2, MessageSquare, RefreshCw, Upload, X, XCircle
} from 'lucide-react';
import {
  NOT_CONTINUING_REASONS, NotContinuingReason, Renewal, RenewalPeriod, RenewalStatus, formatGpa, periodLabel
} from '../../utils/renewals';

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
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold ${className}`}>
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
        <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
          Renew the scholarship you hold for the coming semester. Submit your grades during the renewal period, or tell the office if you are not continuing.
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
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" aria-label="Loading renewals" />
        </div>
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
            <h3 className="font-display font-bold text-base sm:text-lg text-slate-900">Open for renewal</h3>
            {available.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center shadow-xs">
                <p className="text-sm font-semibold text-slate-700">Nothing to renew right now</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  When the office opens the renewal period for a scholarship you hold, it will appear here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {available.map(period => (
                  <div key={period._id} className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col gap-4">
                    <div>
                      <p className="font-display font-bold text-slate-900 leading-snug">{period.scholarshipName}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{periodLabel(period)}</p>
                    </div>
                    <PeriodFacts period={period} />
                    <button
                      type="button"
                      onClick={() => openForm({ period })}
                      className="mt-auto inline-flex items-center justify-center gap-1.5 self-start font-display font-bold uppercase text-xs tracking-wider text-white bg-brand-green hover:bg-brand-green-dark px-5 py-3 rounded-xl transition-colors"
                    >
                      Start renewal <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
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
          <dd><span className="font-semibold">Deadline:</span> {period.deadline}</dd>
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
          <dt className="font-semibold">Upload</dt>
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

function RenewalCard({ renewal, onRevise }: { renewal: Renewal; onRevise?: () => void }) {
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

      {showMessage && (
        <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 border border-slate-100 p-3.5">
          <MessageSquare className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Message from the office</p>
            <p className="text-sm text-slate-700 whitespace-pre-line mt-0.5">{renewal.reviewNote}</p>
          </div>
        </div>
      )}

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Continuing</dt>
          <dd className="font-semibold text-slate-700 mt-0.5">{renewal.continuing ? 'Yes' : `No · ${renewal.notContinuingReason ?? ''}`}</dd>
        </div>
        {renewal.continuing && (
          <>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">GPA</dt>
              <dd className="font-semibold text-slate-700 mt-0.5">{formatGpa(renewal.gpa)}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Failing grade</dt>
              <dd className="font-semibold text-slate-700 mt-0.5">{renewal.hasFailingGrade ? 'Yes' : 'None'}</dd>
            </div>
          </>
        )}
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Submitted</dt>
          <dd className="font-semibold text-slate-700 mt-0.5">{new Date(renewal.createdAt).toLocaleDateString('en-PH', { dateStyle: 'medium' })}</dd>
        </div>
      </dl>

      {renewal.documents.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {renewal.documents.map(doc => (
            <li key={doc.fileId}>
              <a
                href={`${API_BASE_URL}/api/applications/documents/${doc.fileId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:border-brand-green/40 hover:text-brand-green"
              >
                <FileText className="w-3.5 h-3.5" aria-hidden />
                {doc.docType}
              </a>
            </li>
          ))}
        </ul>
      )}

      {renewal.status === 'Needs Revision' && onRevise && (
        <button
          type="button"
          onClick={onRevise}
          className="inline-flex items-center justify-center gap-1.5 font-display font-bold uppercase text-xs tracking-wider text-white bg-brand-green hover:bg-brand-green-dark px-5 py-3 rounded-xl transition-colors"
        >
          Update renewal <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// --- Form -----------------------------------------------------------------------

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const onFile = new Map((existing?.documents ?? []).map(d => [d.docType, d]));

  const pickFile = (requirement: string, file?: File) => {
    setError('');
    if (!file) return;
    const isJpeg = /\.(jpe?g)$/i.test(file.name) && file.type === 'image/jpeg';
    if (!isJpeg) { setError(`${requirement}: upload a JPG/JPEG image.`); return; }
    if (file.size > 10 * 1024 * 1024) { setError(`${requirement}: each file must be under 10MB.`); return; }
    setFiles(prev => ({ ...prev, [requirement]: file }));
  };

  const validate = (): string => {
    if (continuing === null) return 'Tell us whether you are continuing with the scholarship.';
    if (!continuing) {
      if (!reason) return 'Choose why you are not continuing.';
      if (reason === 'Other' && !details.trim()) return 'Tell us why you are not continuing.';
      return '';
    }
    const value = Number(gpa);
    if (gpa.trim() === '' || !Number.isFinite(value) || value < 0 || value > 4) return 'Enter your GPA for last semester (0.00–4.00).';
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

  const choiceClass = (active: boolean) =>
    `flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors text-left ${
      active ? 'border-brand-green bg-emerald-50 text-brand-green' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
    }`;

  return (
    <form onSubmit={submit} className="space-y-6 max-w-3xl" noValidate>
      <div>
        <button type="button" onClick={onCancel} className="text-xs font-semibold text-slate-500 hover:text-slate-800">← Back to renewals</button>
        <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900 mt-2">{existing ? 'Update renewal' : 'Renew scholarship'}</h2>
        <p className="text-sm text-slate-500 mt-1">{period.scholarshipName} · {periodLabel(period)}</p>
      </div>

      {existing?.reviewNote && (
        <div className="flex items-start gap-2.5 rounded-xl bg-orange-50 border border-orange-200 p-4">
          <AlertCircle className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" aria-hidden />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-orange-700">What the office asked for</p>
            <p className="text-sm text-orange-900 whitespace-pre-line mt-0.5">{existing.reviewNote}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-3">
        <PeriodFacts period={period} />
      </div>

      <fieldset className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-3">
        <legend className="sr-only">Continuing</legend>
        <p className="text-sm font-bold text-slate-800">Are you continuing with this scholarship next semester?</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button type="button" aria-pressed={continuing === true} onClick={() => setContinuing(true)} className={choiceClass(continuing === true)}>
            Yes, I'm renewing
          </button>
          <button type="button" aria-pressed={continuing === false} onClick={() => setContinuing(false)} className={choiceClass(continuing === false)}>
            No, I'm not continuing
          </button>
        </div>
      </fieldset>

      {continuing === true && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <label className="block">
              <span className="text-xs font-bold text-slate-700">GPA last semester</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                max={4}
                value={gpa}
                onChange={e => setGpa(e.target.value)}
                placeholder="e.g. 3.25"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-base sm:text-sm focus:border-brand-green focus:outline-hidden focus:ring-2 focus:ring-brand-green/20"
              />
              <span className="mt-1 block text-[11px] text-slate-400">As shown on your grades (0.00–4.00).</span>
            </label>
            <div>
              <span className="text-xs font-bold text-slate-700">Any failing grade last semester?</span>
              <div className="mt-1.5 flex gap-3">
                <button type="button" aria-pressed={hasFailingGrade === false} onClick={() => setHasFailingGrade(false)} className={choiceClass(hasFailingGrade === false)}>No</button>
                <button type="button" aria-pressed={hasFailingGrade === true} onClick={() => setHasFailingGrade(true)} className={choiceClass(hasFailingGrade === true)}>Yes</button>
              </div>
            </div>
          </div>

          {period.requirements.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-700">Documents <span className="font-normal text-slate-400">· JPG/JPEG, up to 10MB each</span></p>
              {period.requirements.map(requirement => {
                const picked = files[requirement];
                const stored = onFile.get(requirement);
                return (
                  <div key={requirement} className="rounded-xl border border-slate-200 p-3.5 space-y-2">
                    <p className="text-sm font-semibold text-slate-700">{requirement}</p>
                    {stored && !picked && (
                      <p className="text-[11px] text-slate-500 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-emerald-600" aria-hidden /> On file: {stored.filename}</p>
                    )}
                    {picked ? (
                      <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                        <span className="truncate">{picked.name}</span>
                        <button
                          type="button"
                          onClick={() => setFiles(prev => { const next = { ...prev }; delete next[requirement]; return next; })}
                          aria-label={`Remove ${picked.name}`}
                          className="shrink-0 text-emerald-700 hover:text-emerald-950"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center justify-center border-2 border-dashed border-slate-200 hover:border-brand-green/40 hover:bg-brand-green/5 rounded-lg p-3 cursor-pointer transition-colors text-xs text-slate-500 font-semibold gap-1.5">
                        <Upload className="w-4 h-4 text-slate-400" aria-hidden />
                        <span>{stored ? 'Replace file (optional)' : 'Select JPG file'}</span>
                        <input type="file" accept=".jpg,.jpeg,image/jpeg" className="hidden" onChange={e => { pickFile(requirement, e.target.files?.[0]); e.target.value = ''; }} />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {continuing === false && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
          <label className="block">
            <span className="text-xs font-bold text-slate-700">Reason</span>
            <select
              value={reason}
              onChange={e => setReason(e.target.value as NotContinuingReason)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base sm:text-sm focus:border-brand-green focus:outline-hidden focus:ring-2 focus:ring-brand-green/20"
            >
              <option value="" disabled>Choose a reason</option>
              {NOT_CONTINUING_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-700">Details {reason !== 'Other' && <span className="font-normal text-slate-400">(optional)</span>}</span>
            <textarea
              value={details}
              onChange={e => setDetails(e.target.value)}
              rows={3}
              maxLength={500}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-base sm:text-sm focus:border-brand-green focus:outline-hidden focus:ring-2 focus:ring-brand-green/20"
            />
          </label>
          <p className="text-[11px] text-slate-500 leading-relaxed">The office is told you won't continue, and your scholarship won't be renewed for {periodLabel(period)}.</p>
        </div>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-900">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" aria-hidden />{error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={submitting || continuing === null}
          className="inline-flex items-center justify-center gap-1.5 font-display font-bold uppercase text-xs tracking-wider text-white bg-brand-green hover:bg-brand-green-dark disabled:opacity-50 disabled:cursor-not-allowed px-5 py-3 rounded-xl transition-colors"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
          {continuing === false ? 'Submit — not continuing' : existing ? 'Resubmit renewal' : 'Submit renewal'}
        </button>
        <button type="button" onClick={onCancel} disabled={submitting} className="px-5 py-3 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-100">
          Cancel
        </button>
      </div>
    </form>
  );
}
