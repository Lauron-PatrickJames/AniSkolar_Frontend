import React from 'react';
import { Scholarship } from '../types';
import { Calendar, Award, DollarSign, Dumbbell, Users, CheckCircle, ChevronRight, AlertCircle, Bookmark } from 'lucide-react';
import { motion } from 'motion/react';

interface ScholarshipCardProps {
  scholarship: Scholarship;
  onViewDetails: (id: string) => void;
  onApply?: (id: string) => void;
  isApplied?: boolean;
  id?: string;
  key?: React.Key;
}

export default function ScholarshipCard({
  scholarship,
  onViewDetails,
  onApply,
  isApplied = false,
  id
}: ScholarshipCardProps) {
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Academic':
        return <Award className="w-4 h-4 text-emerald-600" />;
      case 'Financial':
        return <DollarSign className="w-4 h-4 text-amber-600" />;
      case 'Athletic':
        return <Dumbbell className="w-4 h-4 text-blue-600" />;
      case 'Leadership':
        return <Users className="w-4 h-4 text-purple-600" />;
      default:
        return <Bookmark className="w-4 h-4 text-slate-600" />;
    }
  };

  const getCategoryBadgeColor = (category: string) => {
    switch (category) {
      case 'Academic':
        return 'bg-emerald-50 text-emerald-800 border-emerald-100';
      case 'Financial':
        return 'bg-amber-50 text-amber-800 border-amber-100';
      case 'Athletic':
        return 'bg-blue-50 text-blue-800 border-blue-100';
      case 'Leadership':
        return 'bg-purple-50 text-purple-800 border-purple-100';
      default:
        return 'bg-slate-50 text-slate-800 border-slate-100';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'Open':
        return 'bg-emerald-100 text-emerald-800';
      case 'Closing Soon':
        return 'bg-amber-100 text-amber-800';
      default:
        return 'bg-rose-100 text-rose-800';
    }
  };

  return (
    <motion.div
      id={id}
      whileHover={{ y: -3 }}
      className="bg-white rounded-xl border border-slate-100 card-shadow overflow-hidden flex flex-col h-full justify-between transition-all duration-200"
    >
      <div className="p-6">
        {/* Top Badges */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${getCategoryBadgeColor(scholarship.category)}`}>
            {getCategoryIcon(scholarship.category)}
            {scholarship.category}
          </span>
          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase ${getStatusBadgeColor(scholarship.status)}`}>
            {scholarship.status}
          </span>
        </div>

        {/* Title */}
        <h3 className="font-display font-bold text-lg text-slate-900 leading-snug mb-2 hover:text-brand-green transition-colors cursor-pointer" onClick={() => onViewDetails(scholarship.id)}>
          {scholarship.name}
        </h3>

        {/* Description */}
        <p className="text-sm text-slate-600 line-clamp-3 leading-relaxed mb-4">
          {scholarship.description}
        </p>

        {/* Eligibility Preview */}
        <div className="space-y-2 mb-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Quick Requirements</p>
          <ul className="space-y-1.5">
            {scholarship.requirements.slice(0, 2).map((req, idx) => (
              <li key={idx} className="flex items-start text-xs text-slate-600">
                <CheckCircle className="w-3.5 h-3.5 text-brand-green shrink-0 mr-1.5 mt-0.5" />
                <span className="truncate">{req}</span>
              </li>
            ))}
            {scholarship.requirements.length > 2 && (
              <li className="text-xs text-brand-green font-medium pl-5">
                +{scholarship.requirements.length - 2} more requirements
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Deadline */}
        <div className="flex items-center space-x-1.5 self-start sm:self-auto">
          <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
          <div className="text-left">
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wide">Deadline</p>
            <p className="text-xs text-slate-700 font-semibold">{scholarship.deadline}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <button
            onClick={() => onViewDetails(scholarship.id)}
            className="flex-1 sm:flex-none text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 px-3.5 py-2 rounded-lg transition-colors focus:outline-hidden"
          >
            Details
          </button>
          {onApply && (
            <button
              onClick={() => onApply(scholarship.id)}
              disabled={isApplied || scholarship.status === 'Closed'}
              className={`flex-1 sm:flex-none text-xs font-semibold px-4 py-2 rounded-lg flex items-center justify-center space-x-1.5 transition-colors focus:outline-hidden ${
                isApplied
                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  : 'bg-brand-green text-white hover:bg-brand-green-dark shadow-sm'
              }`}
            >
              <span>{isApplied ? 'Applied' : 'Apply'}</span>
              {!isApplied && <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
