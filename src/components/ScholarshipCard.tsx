import React from 'react';
import { Application, Scholarship } from '../types';

import { Ban, Calendar, Award, DollarSign, Dumbbell, Users, CheckCircle, ChevronRight, AlertCircle, Bookmark } from 'lucide-react';
import { motion } from 'motion/react';
import { acceptsOnlineApplications, handlingOffice } from '../data/scholarships';
import { APPLY_CHECKS } from './ApplyCheck';


interface ScholarshipCardProps {
  scholarship: Scholarship;
  onViewDetails: (id: string) => void;
  onApply?: (id: string) => void;
  isApplied?: boolean;
  // The student's application status, shown on the card.
  applicationStatus?: Application['status'];
  // Approved, then declined by the student or ended; and whether the
  // office added the student without an application.
  applicationEndReason?: Application['endReason'];
  awardedDirectly?: boolean;
  // e.g. the student's profile GPA is below the scholarship's minimum.
  warning?: string | null;
  // Why the student can't apply (e.g. they hold the SFAG).
  blockedReason?: string | null;
  id?: string;
  key?: React.Key;
}

export default function ScholarshipCard({
  scholarship,
  onViewDetails,
  onApply,
  isApplied = false,
  applicationStatus,
  applicationEndReason,
  awardedDirectly,
  warning,
  blockedReason,
  id
}: ScholarshipCardProps) {
  const blocked = !isApplied && !!blockedReason;
  const closed = !isApplied && !blocked && scholarship.status === 'Closed';
  const showsRequirements = scholarship.requirements.length > 0;
  const preview = showsRequirements ? scholarship.requirements : scholarship.eligibility;

  // No colour per category or status (panel, Nov 2026): one neutral look,
  // so the Apply button is the only colour on the card.
  const getCategoryIcon = (category: string) => {
    const cls = 'w-3.5 h-3.5 text-slate-500';
    switch (category) {
      case 'Academic': return <Award className={cls} />;
      case 'Financial': return <DollarSign className={cls} />;
      case 'Athletic': return <Dumbbell className={cls} />;
      case 'Leadership': return <Users className={cls} />;
      default: return <Bookmark className={cls} />;
    }
  };
  // Members-only (no application) and EBPSP: Apply asks a question first.
  const asksFirst = !!APPLY_CHECKS[scholarship.id];
  const membersOnly = asksFirst && !acceptsOnlineApplications(scholarship);

  return (
    <motion.div
      id={id}
      whileHover={{ y: -3 }}
      className="bg-white rounded-xl border border-slate-100 card-shadow overflow-hidden flex flex-col h-full justify-between transition-all duration-200"
    >
      <div className="p-6">
        {/* Top Badges */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold text-slate-600 bg-slate-100">
            {getCategoryIcon(scholarship.category)}
            {scholarship.category}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            {/* No application: nothing to be open for (members-only say so). */}
            {membersOnly ? 'Members only' : acceptsOnlineApplications(scholarship) ? scholarship.status : null}
          </span>
        </div>

        {/* Title */}
        <h3 className="font-display font-bold text-lg text-slate-900 leading-snug mb-2 hover:text-brand-green transition-colors cursor-pointer" onClick={() => onViewDetails(scholarship.id)}>
          {scholarship.name}
        </h3>

        {applicationStatus && (applicationStatus === 'Approved' && applicationEndReason ? (
          <p className="mb-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold bg-slate-100 text-slate-600 border-slate-200">
            <Ban className="w-3.5 h-3.5" aria-hidden />
            {applicationEndReason === 'Declined' ? 'Declined by you' : applicationEndReason === 'Not Renewed' ? 'Not renewed' : 'Scholarship ended'}
          </p>
        ) : (
          <p className="mb-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold bg-slate-50 text-slate-700 border-slate-200">
            <CheckCircle className="w-3.5 h-3.5" aria-hidden />
            {applicationStatus === 'Approved' && awardedDirectly
              ? 'You’re a scholar'
              : `Your application: ${applicationStatus === 'Under Evaluation' ? 'Under evaluation' : applicationStatus === 'Needs Revision' ? 'Needs revision' : applicationStatus}`}
          </p>
        ))}

        {/* Description */}
        <p className="text-sm text-slate-600 line-clamp-3 leading-relaxed mb-4">
          {scholarship.description}
        </p>

        {scholarship.scheduleLabel && (
          <p className="mb-4 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
            <span className="font-bold">{scholarship.scheduleLabel}:</span> {scholarship.schedule || 'To be announced.'}
          </p>
        )}

        {blocked && (
          <p className="mb-4 px-3 py-2 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-700 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px text-slate-500" aria-hidden />
            <span>{blockedReason}</span>
          </p>
        )}

        {!blocked && warning && (
          <p className="mb-4 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px text-slate-500" aria-hidden />
            <span>{warning}</span>
          </p>
        )}

        {/* Eligibility Preview */}
        <div className="space-y-2 mb-4">
          <p className="text-xs font-semibold text-slate-500">{showsRequirements ? 'Quick Requirements' : 'Who Qualifies'}</p>
          <ul className="space-y-1.5">
            {preview.slice(0, 2).map((req, idx) => (
              <li key={idx} className="flex items-start text-xs text-slate-600">
                <CheckCircle className="w-3.5 h-3.5 text-slate-400 shrink-0 mr-1.5 mt-0.5" />
                <span className="truncate">{req}</span>
              </li>
            ))}
            {preview.length > 2 && (
              <li className="text-xs text-slate-500 font-medium pl-5">
                +{preview.length - 2} more {showsRequirements ? 'requirements' : 'criteria'}
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-col gap-3">
        {/* Deadline */}
        <div className="flex items-center space-x-1.5 self-start min-w-0">
          <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
          <div className="text-left">
            {/* Dates are an application period; otherwise it says how and when. */}
            <p className="text-xs text-slate-500 font-bold">
              {scholarship.directAward || !acceptsOnlineApplications(scholarship) ? 'How scholars are chosen' : scholarship.opensOn || scholarship.closesOn ? 'Application period' : 'Schedule'}
            </p>
            <p className="text-xs text-slate-700 font-semibold">{scholarship.deadline}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 w-full">
          <button
            onClick={() => onViewDetails(scholarship.id)}
            className="flex-1 h-10 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 px-3.5 rounded-lg transition-colors focus:outline-hidden"
          >
            Details
          </button>
          {onApply && !acceptsOnlineApplications(scholarship) && !membersOnly && (
            // No application (e.g. Academic: from the Registrar's ranking);
            // who awards it on hover.
            <span
              title={`Awarded by the ${handlingOffice(scholarship)}`}
              className="min-w-0 flex-1 h-10 inline-flex items-center justify-center px-3.5 rounded-lg text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200"
            >
              <span className="truncate">No application needed</span>
            </span>
          )}
          {onApply && membersOnly && (
            // No application: Apply asks whether they're a member, then
            // explains how members get it or invites them to join.
            <button
              onClick={() => onApply(scholarship.id)}
              type="button"
              disabled={isApplied}
              className={`flex-1 h-10 text-xs font-semibold px-4 rounded-lg flex items-center justify-center space-x-1.5 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 ${
                isApplied ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed' : 'bg-brand-green text-white hover:bg-brand-green-dark shadow-sm'
              }`}
            >
              <span className="truncate">{isApplied ? 'You’re a scholar' : (APPLY_CHECKS[scholarship.id]?.joinLabel ?? 'Apply').replace(/^(Be an? (member|officer)) of .*$/, '$1')}</span>
              {!isApplied && <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          )}
          {onApply && acceptsOnlineApplications(scholarship) && (
            <button
              onClick={() => onApply(scholarship.id)}
              type="button"
              disabled={isApplied || blocked || closed}
              title={closed ? 'Applications are closed for now' : undefined}
              className={`flex-1 h-10 text-xs font-semibold px-4 rounded-lg flex items-center justify-center space-x-1.5 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 ${
                isApplied || blocked || closed
                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  : 'bg-brand-green text-white hover:bg-brand-green-dark shadow-sm'
              }`}
            >
              <span>{isApplied ? 'Applied' : blocked ? 'Not available' : closed ? 'Closed' : 'Apply'}</span>
              {!isApplied && !blocked && !closed && <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
