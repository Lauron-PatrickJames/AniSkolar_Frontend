import React, { useState } from 'react';
import { Scholarship, Application, Announcement } from '../../types';
import AnnouncementCard from '../../components/AnnouncementCard';
import { ArrowLeft, ArrowRight, Award, CheckCircle, ListChecks, HelpCircle, FileCheck, Calendar, ShieldAlert, XCircle, AlertTriangle, Clock, RefreshCw, Building2, Repeat, Info, Megaphone } from 'lucide-react';
import { motion } from 'motion/react';
import { OFFICE_SHORT_LABELS, acceptsOnlineApplications, officeOf } from '../../data/scholarships';

interface ScholarshipDetailsProps {
  scholarship: Scholarship;
  applications: Application[];
  // Published announcements; the ones tagged with this scholarship are shown.
  announcements?: Announcement[];
  onBack: () => void;
  onApply: (id: string) => void;
  // Why the student can't apply (e.g. they hold the SFAG), and a
  // heads-up shown under the header.
  blockedReason?: string | null;
  notice?: string | null;
  onResubmit?: (applicationId: string) => void;
  // Opens My Applications (signed-in students).
  onViewApplications?: () => void;
  id?: string;
}

// Same four statuses AdminDashboard writes via PATCH /:id/status. Kept in
// sync with that enum (also mirrored server-side in models/Application.js).
type AppStatus = 'Under Evaluation' | 'Approved' | 'Rejected' | 'Needs Revision';

const STATUS_META: Record<AppStatus, {
  label: string;
  description: string;
  badgeClass: string;
  cardClass: string;
  iconWrapClass: string;
  icon: React.ElementType;
}> = {
  'Under Evaluation': {
    label: 'Under Evaluation',
    description: 'Your application was submitted and is waiting for review by the AdSO. We’ll notify you when there’s a decision.',
    badgeClass: 'bg-sky-50 text-sky-700 border border-sky-200',
    cardClass: 'bg-sky-50 border-sky-200',
    iconWrapClass: 'bg-sky-100 text-sky-700',
    icon: Clock
  },
  'Approved': {
    label: 'Application Approved',
    description: 'Congratulations — your application has been approved by the AdSO.',
    badgeClass: 'bg-emerald-50 text-brand-green border border-emerald-200',
    cardClass: 'bg-emerald-50 border-emerald-200',
    iconWrapClass: 'bg-emerald-100 text-brand-green',
    icon: CheckCircle
  },
  'Rejected': {
    label: 'Application Rejected',
    description: 'Your application was not approved this cycle. See the note below for details.',
    badgeClass: 'bg-rose-50 text-rose-600 border border-rose-200',
    cardClass: 'bg-rose-50 border-rose-200',
    iconWrapClass: 'bg-rose-100 text-rose-600',
    icon: XCircle
  },
  'Needs Revision': {
    label: 'Revision Needed',
    description: 'The AdSO has requested changes before this application can move forward.',
    badgeClass: 'bg-amber-50 text-amber-800 border border-amber-200',
    cardClass: 'bg-amber-50 border-amber-200',
    iconWrapClass: 'bg-amber-100 text-amber-700',
    icon: AlertTriangle
  }
};

export default function ScholarshipDetails({
  scholarship,
  applications,
  announcements = [],
  onBack,
  onApply,
  onResubmit,
  onViewApplications,
  blockedReason,
  notice,
  id
}: ScholarshipDetailsProps) {
  // Look up the actual application (not just whether one exists) so the
  // button/badge can reflect its real review status. If a student somehow
  // has more than one application on file for this scholarship, prefer the
  // most recently submitted one.
  const existingApplication = applications
    .filter(app => app.scholarshipId === scholarship.id)
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())[0];

  const isApplied = !!existingApplication;
  const blocked = !isApplied && !!blockedReason;
  const status = (existingApplication?.status as AppStatus) ?? 'Under Evaluation';
  // Status copy names the LSO; swap in whichever office reviews this grant.
  const officeShort = OFFICE_SHORT_LABELS[officeOf(scholarship)];
  const isInfoOnly = !acceptsOnlineApplications(scholarship);
  const relatedAnnouncements = announcements.filter(a => a.scholarshipId === scholarship.id);
  const hasDocuments = Boolean(scholarship.documentSlots?.length || scholarship.requirements.length);
  const baseMeta = STATUS_META[status] ?? STATUS_META['Under Evaluation'];
  const meta = { ...baseMeta, description: baseMeta.description.replace(/\b([Tt])he AdSO\b/, (_, t) => `${t}he ${officeShort}`) };
  const StatusIcon = meta.icon;
  const hasNote = !!existingApplication?.reviewNote && (status === 'Rejected' || status === 'Needs Revision');
  // Reference, date and (SFAG) grant, under the status.
  const grantApplied = existingApplication?.sfagDetails?.requestedGrant ?? existingApplication?.sfagPercentageRequested ?? null;
  const grantGiven = status === 'Approved' ? existingApplication?.sfagPercentage ?? null : null;
  const facts = existingApplication ? [
    existingApplication.referenceCode && ['Reference', existingApplication.referenceCode],
    existingApplication.submittedAt && ['Submitted', new Date(existingApplication.submittedAt).toString() === 'Invalid Date' ? existingApplication.submittedAt : new Date(existingApplication.submittedAt).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })],
    grantGiven ? ['Grant', `${grantGiven}% tuition discount`] : grantApplied ? ['Grant applied for', `${grantApplied}%`] : null,
  ].filter(Boolean) as [string, string][] : [];
  // Process items written "Step N: …" are numbered steps (the number is
  // drawn, so the prefix goes); any others are notes shown after them.
  const STEP = /^Step\s+\d+\s*[:.]\s*/i;
  const hasSteps = scholarship.process.some(p => STEP.test(p));
  const steps = hasSteps ? scholarship.process.filter(p => STEP.test(p)).map(p => p.replace(STEP, '')) : scholarship.process;
  const processNotes = hasSteps ? scholarship.process.filter(p => !STEP.test(p)) : [];
  // "Applications open June 16 – July 3" reads as a period, not a deadline.
  const period = scholarship.deadline?.replace(/^Applications open\s+/i, '') ?? '';

  return (
    <div id={id} className="space-y-6">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-500 hover:text-brand-green transition-colors focus:outline-hidden"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Scholarships</span>
      </button>

      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-green/10 text-brand-green border border-brand-green/20">
              {scholarship.category}
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              scholarship.status === 'Open' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
            }`}>
              {scholarship.status}
            </span>
          </div>
          <h2 className="font-display font-black text-2xl md:text-3xl text-slate-900 tracking-tight leading-snug">
            {scholarship.name}
          </h2>
          {period && (
            <div className="flex items-center text-slate-500 text-xs gap-1.5">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span className="font-semibold">Application period:</span>
              <span className="text-slate-800 font-bold">{period}</span>
            </div>
          )}
        </div>

        {/* Apply Action. Once applied, the status card below says where it
            stands, and this links to My Applications instead. */}
        <div className="w-full md:w-auto shrink-0">
          {isApplied ? (
            onViewApplications && (
              <button
                onClick={onViewApplications}
                className="w-full md:w-auto px-5 py-3 rounded-xl bg-white text-slate-700 border border-slate-200 font-display font-bold text-xs tracking-wide inline-flex items-center justify-center gap-2 hover:border-brand-green hover:text-brand-green transition-colors focus:outline-hidden"
              >
                View in My Applications <ArrowRight className="w-4 h-4" />
              </button>
            )
          ) : isInfoOnly ? (
            <span className="w-full md:w-auto px-5 py-3 rounded-xl bg-slate-100 text-slate-500 border border-slate-200 font-display font-bold uppercase text-xs tracking-wider inline-flex items-center justify-center gap-2">
              <Info className="w-4 h-4" />
              No Online Application
            </span>
          ) : (
            <button
              onClick={() => onApply(scholarship.id)}
              disabled={blocked || scholarship.status === 'Closed'}
              className={`w-full md:w-auto font-display font-bold uppercase text-xs tracking-wider px-8 py-3.5 rounded-xl transition-all shadow-sm focus:outline-hidden text-center inline-flex items-center justify-center gap-2 ${
                blocked || scholarship.status === 'Closed'
                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  : 'bg-brand-green text-white hover:bg-brand-green-dark hover:shadow-md'
              }`}
            >
              {blocked ? 'Not Available To You' : scholarship.status === 'Closed' ? 'Applications Closed' : 'Apply For This Scholarship'}
            </button>
          )}
        </div>
      </div>

      {(blocked || (!isApplied && notice)) && (
        <div className={`p-4 rounded-xl border flex items-start gap-2.5 ${blocked ? 'bg-slate-50 border-slate-200' : 'bg-amber-50 border-amber-100'}`}>
          <AlertTriangle className={`w-4.5 h-4.5 shrink-0 mt-0.5 ${blocked ? 'text-slate-500' : 'text-amber-600'}`} />
          <p className={`text-xs leading-relaxed ${blocked ? 'text-slate-700' : 'text-amber-900'}`}>{blocked ? blockedReason : notice}</p>
        </div>
      )}

      {/* Info-only scholarships: how they're awarded instead of an Apply flow. */}
      {isInfoOnly && (
        <div className="p-4 rounded-xl bg-sky-50 border border-sky-100 flex items-start gap-2.5">
          <Info className="w-4.5 h-4.5 text-sky-700 shrink-0 mt-0.5" />
          <div className="text-xs text-sky-900 leading-relaxed">
            <p className="font-bold mb-0.5">How this scholarship is awarded</p>
            <p>{scholarship.availNote ?? 'This scholarship doesn\'t take online applications.'} For questions, contact the {officeShort}.</p>
          </div>
        </div>
      )}

      {/* AdSO-maintained date, e.g. varsity tryouts for the Athletic Scholarship. */}
      {scholarship.scheduleLabel && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-100 flex items-start gap-2.5">
          <Calendar className="w-4.5 h-4.5 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 leading-relaxed">
            <p className="font-bold mb-0.5">{scholarship.scheduleLabel}</p>
            <p>{scholarship.schedule || 'To be announced.'}</p>
          </div>
        </div>
      )}

      {/* Status Card — replaces the old inline badge once an application exists.
          Shows the current review state, a one-line explainer, and (for
          Rejected / Needs Revision) the AdSO's note plus a resubmit action. */}
      {isApplied && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className={`rounded-2xl border p-5 md:p-6 shadow-xs ${meta.cardClass}`}
        >
          <div className="flex items-start gap-4">
            <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${meta.iconWrapClass}`}>
              <StatusIcon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <h4 className="font-display font-extrabold text-sm text-slate-900">
                {meta.label}
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                {meta.description}
              </p>
              {facts.length > 0 && (
                <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs">
                  {facts.map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-slate-500">{label}</dt>
                      <dd className={`font-bold text-slate-800 ${label === 'Reference' ? 'font-mono' : ''}`}>{value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {hasNote && (
                <div className="mt-3 p-3 rounded-lg bg-white/70 border border-white text-xs text-slate-600 leading-relaxed">
                  <span className="font-bold text-slate-700">Note from {officeShort}: </span>
                  {existingApplication?.reviewNote}
                </div>
              )}

              {status === 'Needs Revision' && onResubmit && existingApplication && (
                <button
                  onClick={() => onResubmit(existingApplication.id)}
                  className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-amber-600 text-white hover:bg-amber-700 transition-colors shadow-sm focus:outline-hidden"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Resubmit Documents
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Side: Overview & Process (Col-span 2) */}
        <div className="lg:col-span-2 space-y-8">
          {/* Announcements the AdSO tagged with this scholarship. */}
          {relatedAnnouncements.length > 0 && (
            <section aria-labelledby="related-announcements" className="space-y-3">
              <h3 id="related-announcements" className="font-display font-extrabold text-lg text-slate-900 flex items-center space-x-2">
                <Megaphone className="w-5 h-5 text-brand-green" />
                <span>Announcements</span>
              </h3>
              {relatedAnnouncements.map((a, i) => (
                <AnnouncementCard key={a.id} announcement={a} isInitiallyExpanded={i === 0} />
              ))}
            </section>
          )}

          {/* Overview */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-xs">
            <h3 className="font-display font-extrabold text-lg text-slate-900 border-b border-slate-100 pb-3 mb-4 flex items-center space-x-2">
              <Award className="w-5 h-5 text-brand-green" />
              <span>Program Overview</span>
            </h3>
            <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-line">
              {scholarship.description}
            </p>
          </div>

          {/* Benefits */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-xs">
            <h3 className="font-display font-extrabold text-lg text-slate-900 border-b border-slate-100 pb-3 mb-4 flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-brand-green" />
              <span>Scholarship Benefits & Privileges</span>
            </h3>
            <ul className="space-y-3">
              {scholarship.benefits.map((benefit, idx) => (
                <li key={idx} className="flex items-start text-sm text-slate-600">
                  <div className="w-5 h-5 rounded-full bg-emerald-50 text-brand-green flex items-center justify-center shrink-0 mr-3 mt-0.5">
                    <CheckCircle className="w-3.5 h-3.5" />
                  </div>
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Document Requirements Checklist */}
          {(hasDocuments || scholarship.submissionNote) && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-xs">
            <h3 className="font-display font-extrabold text-lg text-slate-900 border-b border-slate-100 pb-3 mb-4 flex items-center space-x-2">
              <FileCheck className="w-5 h-5 text-brand-green" />
              <span>Required Documents</span>
            </h3>
            <p className="text-xs text-slate-500 mb-2">Upload each one as a JPG file, up to 10 MB.</p>
            <ul className="divide-y divide-slate-100">
              {(scholarship.documentSlots
                ? scholarship.documentSlots.filter(slot => slot.placement !== 'form').map(slot => ({
                  key: slot.key,
                  label: slot.label,
                  extra: [slot.source === 'form' && 'filled out online', slot.multiple && 'multiple files', slot.optional && 'if any'].filter(Boolean).join(' · '),
                }))
                : scholarship.requirements.map((req, idx) => ({ key: String(idx), label: req, extra: '' }))
              ).map(doc => (
                <li key={doc.key} className="flex items-start gap-3 py-3 text-sm text-slate-700">
                  <FileCheck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">
                    {doc.label}
                    {doc.extra && <span className="text-slate-400"> ({doc.extra})</span>}
                  </span>
                </li>
              ))}
            </ul>
            {scholarship.submissionNote && (
              <p className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-100 text-[11px] font-semibold text-amber-800 flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{scholarship.submissionNote}</span>
              </p>
            )}
          </div>
          )}

          {/* How it works: the numbered steps, then any notes. */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-xs">
            <h3 className="font-display font-extrabold text-lg text-slate-900 border-b border-slate-100 pb-3 mb-6 flex items-center space-x-2">
              <ListChecks className="w-5 h-5 text-brand-green" />
              <span>How It Works</span>
            </h3>
            <ol className="space-y-5">
              {steps.map((step, idx) => (
                <li key={idx} className="flex gap-4">
                  <span className="w-7 h-7 rounded-full bg-brand-green/10 text-brand-green font-display font-bold text-xs flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <p className="text-sm text-slate-700 leading-relaxed pt-1">{step}</p>
                </li>
              ))}
            </ol>
            {processNotes.length > 0 && (
              <div className="mt-6 p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-start gap-2 text-xs text-slate-600 leading-relaxed">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
                <div className="space-y-1">{processNotes.map(n => <p key={n}>{n}</p>)}</div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Eligibility & Requirements (Col-span 1) */}
        <div className="space-y-8">
          {/* Provider / office (grant-form scholarships) */}
          {scholarship.provider && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-3">
              <h3 className="font-display font-extrabold text-base text-slate-900 border-b border-slate-100 pb-3 mb-1 flex items-center space-x-2">
                <Building2 className="w-4.5 h-4.5 text-brand-green" />
                <span>Provider</span>
              </h3>
              <p className="text-sm font-semibold text-slate-800 leading-snug">{scholarship.provider.name}</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                {scholarship.provider.office && <span className="font-semibold text-slate-600">{scholarship.provider.office}, </span>}
                {scholarship.provider.address}
              </p>
              {scholarship.provider.contact && (
                <ul className="text-xs text-slate-500 space-y-0.5">
                  {scholarship.provider.contact.map(line => <li key={line}>{line}</li>)}
                </ul>
              )}
              {(scholarship.targetApplicants || scholarship.formId || scholarship.guidelinesNote) && (
                <dl className="pt-3 border-t border-slate-100 space-y-2 text-xs">
                  {scholarship.targetApplicants && (
                    <div><dt className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">For</dt><dd className="text-slate-700 font-semibold">{scholarship.targetApplicants}</dd></div>
                  )}
                  {scholarship.formId && (
                    <div><dt className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Form</dt><dd className="text-slate-700 font-semibold">{scholarship.formId}</dd></div>
                  )}
                  {scholarship.guidelinesNote && (
                    <div><dt className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Guidelines</dt><dd className="text-slate-700">{scholarship.guidelinesNote}</dd></div>
                  )}
                </dl>
              )}
            </div>
          )}

          {/* Eligibility Criteria */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <h3 className="font-display font-extrabold text-base text-slate-900 border-b border-slate-100 pb-3 mb-4 flex items-center space-x-2">
              <HelpCircle className="w-4.5 h-4.5 text-brand-green" />
              <span>Eligibility Criteria</span>
            </h3>
            <ul className="space-y-3">
              {scholarship.eligibility.map((elig, idx) => (
                <li key={idx} className="flex items-start text-xs sm:text-sm text-slate-600">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-green shrink-0 mt-2 mr-2.5" />
                  <LongText text={elig} />
                </li>
              ))}
            </ul>
          </div>

          {/* Retention conditions — informational only, never block applying */}
          {scholarship.retentionConditions && scholarship.retentionConditions.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
              <h3 className="font-display font-extrabold text-base text-slate-900 border-b border-slate-100 pb-3 mb-4 flex items-center space-x-2">
                <Repeat className="w-4.5 h-4.5 text-brand-green" />
                <span>To Keep the Scholarship</span>
              </h3>
              <ul className="space-y-3">
                {scholarship.retentionConditions.map(condition => (
                  <li key={condition} className="flex items-start text-xs sm:text-sm text-slate-600">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0 mt-2 mr-2.5" />
                    <span>{condition}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* LSO Integrity Notice */}
          <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex items-start gap-2.5">
            <ShieldAlert className="w-4.5 h-4.5 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-[11px] text-amber-800 leading-relaxed">
              <span className="font-bold">Compliance Warning:</span> Any misrepresentation of academic standing, falsification of documents, or failure to disclose other active institutional scholarships will result in automatic disqualification and disciplinary action.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// A long item (like a list of priority courses) shows its first 3 lines,
// with "Show more" for the rest.
function LongText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (text.length <= 160) return <span>{text}</span>;
  return (
    <span className="flex min-w-0 flex-col items-start">
      <span className={open ? '' : 'line-clamp-3'}>{text}</span>
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} className="mt-1 text-xs font-bold text-brand-green hover:underline focus:outline-hidden">
        {open ? 'Show less' : 'Show more'}
      </button>
    </span>
  );
}
