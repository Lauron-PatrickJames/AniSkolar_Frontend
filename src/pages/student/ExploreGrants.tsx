import React, { useState, useMemo } from 'react';
import { getAvailableScholarships, profileGpaWarning } from '../../utils/eligibility';
import { Scholarship, Application, StudentProfile } from '../../types';
import ScholarshipCard from '../../components/ScholarshipCard';
import { Search, SlidersHorizontal, Info, BookmarkCheck } from 'lucide-react';


interface ExploreGrantsProps {
  scholarships: Scholarship[];
  applications: Application[];
  student: StudentProfile;   // add this
  onViewDetails: (id: string) => void;
  onApply: (id: string) => void;
  id?: string;
}

// 'Applied' shows only the scholarships the student has applied to.
type CategoryFilter = 'All' | 'Academic' | 'Financial' | 'Athletic' | 'Leadership' | 'Others' | 'Applied';

export default function ExploreGrants({
  scholarships,
  applications,
  student,   // add this
  onViewDetails,
  onApply,
  id
}: ExploreGrantsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('All');

  // Categories list
  const categories: CategoryFilter[] = ['All', 'Academic', 'Financial', 'Athletic', 'Leadership', 'Others', ...(applications.length ? ['Applied' as const] : [])];

  // The student's latest application per scholarship (the API lists them
  // newest first).
  const applicationByScholarship = useMemo(() => {
    const byId = new Map<string, Application>();
    for (const app of applications) {
      if (!byId.has(app.scholarshipId)) byId.set(app.scholarshipId, app);
    }
    return byId;
  }, [applications]);

  // Scholarships open to this student, plus every one they've applied to —
  // even if it's since closed or no longer matches their year level.
  const eligibleScholarships = useMemo(() => {
    const available = new Set(getAvailableScholarships(scholarships, student).map(s => s.id));
    return scholarships.filter(s => available.has(s.id) || applicationByScholarship.has(s.id));
  }, [scholarships, student, applicationByScholarship]);

  const filteredScholarships = useMemo(() => {
    return eligibleScholarships.filter(scholarship => {
      const matchesCategory = activeCategory === 'All'
        || (activeCategory === 'Applied' ? applicationByScholarship.has(scholarship.id) : scholarship.category === activeCategory);
      const matchesSearch = scholarship.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            scholarship.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [eligibleScholarships, activeCategory, searchQuery, applicationByScholarship]);

  return (
    <div id={id} className="space-y-6">
      {/* Search and Filters Header */}
      <div className="bg-white rounded-xl border border-slate-100 p-4 sm:p-6 card-shadow space-y-4">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="w-full md:max-w-md relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by scholarship name or keywords..."
              className="block w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-xs sm:text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/15 focus:border-brand-green transition-all"
            />
          </div>
          
          <div className="flex items-center space-x-2 text-slate-400 text-xs self-start md:self-auto font-medium">
            <SlidersHorizontal className="w-4 h-4" />
            <span>Category Filters</span>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center overflow-x-auto pb-2 scrollbar-none border-b border-slate-100 gap-1.5">
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all focus:outline-hidden ${
                activeCategory === category
                  ? 'bg-brand-green text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              {category === 'Applied' ? `My Applications (${applicationByScholarship.size})` : category}
            </button>
          ))}
        </div>
      </div>

      {/* Info Notice about Applications */}
      {applications.length > 0 && (
        <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 flex items-start gap-3">
          <BookmarkCheck className="w-5 h-5 text-brand-green shrink-0 mt-0.5" />
          <div className="text-xs text-brand-green-dark">
            <span className="font-bold">You have {applications.length} submitted application{applications.length === 1 ? '' : 's'}.</span> Each one shows its status on its card.{' '}
            {activeCategory !== 'Applied' && (
              <button type="button" onClick={() => setActiveCategory('Applied')} className="font-bold underline hover:text-brand-green focus:outline-hidden">
                Show only my applications
              </button>
            )}
          </div>
        </div>
      )}

      {/* Grid List */}
      {filteredScholarships.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
          <Info className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="font-display font-bold text-lg text-slate-700">No Scholarships Found</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            We couldn't find any grants matching your query. Try broadening your keywords or resetting filters.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setActiveCategory('All');
            }}
            className="mt-4 text-xs font-bold text-brand-green hover:text-brand-green-dark underline focus:outline-hidden"
          >
            Clear Search & Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredScholarships.map(scholarship => (
            <ScholarshipCard
              key={scholarship.id}
              scholarship={scholarship}
              onViewDetails={onViewDetails}
              onApply={onApply}
              isApplied={applicationByScholarship.has(scholarship.id)}
              applicationStatus={applicationByScholarship.get(scholarship.id)?.status}
              warning={applicationByScholarship.has(scholarship.id) ? null : profileGpaWarning(scholarship, student)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
