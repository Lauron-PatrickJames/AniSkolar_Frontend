import React from 'react';
import { Scholarship, Application } from '../../types';
import { ArrowLeft, Award, CheckCircle, ListChecks, HelpCircle, FileCheck, Calendar, ShieldAlert } from 'lucide-react';
import { motion } from 'motion/react';

interface ScholarshipDetailsProps {
  scholarship: Scholarship;
  applications: Application[];
  onBack: () => void;
  onApply: (id: string) => void;
  id?: string;
}

export default function ScholarshipDetails({
  scholarship,
  applications,
  onBack,
  onApply,
  id
}: ScholarshipDetailsProps) {
  const isApplied = applications.some(app => app.scholarshipId === scholarship.id);

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
            <span className="font-semibold">SFAO Submission Deadline:</span>
            <span className="text-slate-800 font-bold">{scholarship.deadline}</span>
          </div>
        </div>

        {/* Apply Action */}
        <button
          onClick={() => onApply(scholarship.id)}
          disabled={isApplied || scholarship.status === 'Closed'}
          className={`w-full md:w-auto font-display font-bold uppercase text-xs tracking-wider px-8 py-3.5 rounded-xl transition-all shadow-sm focus:outline-hidden text-center shrink-0 ${
            isApplied
              ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
              : 'bg-brand-green text-white hover:bg-brand-green-dark hover:shadow-md'
          }`}
        >
          {isApplied ? 'Application Submitted' : 'Apply For This Scholarship'}
        </button>
      </div>

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

          {/* SFAO Integrity Notice */}
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
