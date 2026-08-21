import React from 'react';
import { Scholarship, Application } from '../../types';
import { ArrowLeft, Award, CheckCircle, ListChecks, HelpCircle, FileCheck, Calendar, ShieldAlert, XCircle, AlertTriangle, Clock, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';

interface ScholarshipDetailsProps {
  scholarship: Scholarship;
  applications: Application[];
  onBack: () => void;
  onApply: (id: string) => void;
  onResubmit?: (applicationId: string) => void;
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
    label: 'Application Submitted',
    description: 'Your application is in the queue and awaiting review by the LSO.',
    badgeClass: 'bg-slate-100 text-slate-500 border border-slate-200',
    cardClass: 'bg-slate-50 border-slate-200',
    iconWrapClass: 'bg-slate-100 text-slate-500',
    icon: Clock
  },
  'Approved': {
    label: 'Application Approved',
    description: 'Congratulations — your application has been approved by the LSO.',
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
    description: 'The LSO has requested changes before this application can move forward.',
    badgeClass: 'bg-sky-50 text-sky-700 border border-sky-200',
    cardClass: 'bg-sky-50 border-sky-200',
    iconWrapClass: 'bg-sky-100 text-sky-700',
    icon: AlertTriangle
  }
};

export default function ScholarshipDetails({
  scholarship,
  applications,
  onBack,
  onApply,
  onResubmit,
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
  const status = (existingApplication?.status as AppStatus) ?? 'Under Evaluation';
  const meta = STATUS_META[status] ?? STATUS_META['Under Evaluation'];
  const StatusIcon = meta.icon;
  const hasNote = !!existingApplication?.reviewNote && (status === 'Rejected' || status === 'Needs Revision');

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
          <div className="flex items-center text-slate-500 text-xs gap-1.5">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="font-semibold">LSO Submission Deadline:</span>
            <span className="text-slate-800 font-bold">{scholarship.deadline}</span>
          </div>
        </div>

        {/* Apply Action — once applied, this becomes a disabled status button
            (label reflects current review state); the status card below
            carries the detail, note, and any resubmit action. */}
        <div className="w-full md:w-auto shrink-0">
          <button
            onClick={() => onApply(scholarship.id)}
            disabled={isApplied || scholarship.status === 'Closed'}
            className={`w-full md:w-auto font-display font-bold uppercase text-xs tracking-wider px-8 py-3.5 rounded-xl transition-all shadow-sm focus:outline-hidden text-center inline-flex items-center justify-center gap-2 ${
              isApplied
                ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                : 'bg-brand-green text-white hover:bg-brand-green-dark hover:shadow-md'
            }`}
          >
            {isApplied && <StatusIcon className="w-4 h-4" />}
            {isApplied ? meta.label : 'Apply For This Scholarship'}
          </button>
        </div>
      </div>

      {/* Status Card — replaces the old inline badge once an application exists.
          Shows the current review state, a one-line explainer, and (for
          Rejected / Needs Revision) the LSO's note plus a resubmit action. */}
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

              {hasNote && (
                <div className="mt-3 p-3 rounded-lg bg-white/70 border border-white text-xs text-slate-600 leading-relaxed">
                  <span className="font-bold text-slate-700">Note from LSO: </span>
                  {existingApplication?.reviewNote}
                </div>
              )}

              {status === 'Needs Revision' && onResubmit && existingApplication && (
                <button
                  onClick={() => onResubmit(existingApplication.id)}
                  className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-sky-700 text-white hover:bg-sky-800 transition-colors shadow-sm focus:outline-hidden"
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

          {/* Application Evaluation Steps */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-xs">
            <h3 className="font-display font-extrabold text-lg text-slate-900 border-b border-slate-100 pb-3 mb-6 flex items-center space-x-2">
              <ListChecks className="w-5 h-5 text-brand-green" />
              <span>Step-by-Step Evaluation Process</span>
            </h3>
            <div className="space-y-6">
              {scholarship.process.map((step, idx) => (
                <div key={idx} className="flex gap-4">
                  <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-display font-bold text-xs flex items-center justify-center shrink-0">
                    {idx + 1}
                  </div>
                  <div className="text-sm">
                    <p className="text-slate-700 leading-relaxed font-semibold">
                      {step}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Side: Eligibility & Requirements (Col-span 1) */}
        <div className="space-y-8">
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
                  <span>{elig}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Document Requirements Checklist */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <h3 className="font-display font-extrabold text-base text-slate-900 border-b border-slate-100 pb-3 mb-4 flex items-center space-x-2">
              <FileCheck className="w-4.5 h-4.5 text-brand-green" />
              <span>Required Documents</span>
            </h3>
            <ul className="space-y-3">
              {scholarship.requirements.map((req, idx) => (
                <li key={idx} className="flex gap-2.5 text-xs text-slate-600">
                  <span className="w-5 h-5 rounded-md bg-slate-50 border border-slate-200 text-slate-500 font-bold text-[10px] flex items-center justify-center shrink-0">
                    PDF
                  </span>
                  <span className="leading-tight">{req}</span>
                </li>
              ))}
            </ul>
          </div>

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