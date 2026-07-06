import React, { useState, useMemo } from 'react';
import { Scholarship, Application } from '../../types';
import ScholarshipCard from '../../components/ScholarshipCard';
import { Search, SlidersHorizontal, Info, BookmarkCheck } from 'lucide-react';

interface ExploreGrantsProps {
  scholarships: Scholarship[];
  applications: Application[];
  onViewDetails: (id: string) => void;
  onApply: (id: string) => void;
  id?: string;
}

type CategoryFilter = 'All' | 'Academic' | 'Financial' | 'Athletic' | 'Leadership' | 'Others';

export default function ExploreGrants({
  scholarships,
  applications,
  onViewDetails,
  onApply,
  id
}: ExploreGrantsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('All');

  // Categories list
  const categories: CategoryFilter[] = ['All', 'Academic', 'Financial', 'Athletic', 'Leadership', 'Others'];

  // Track which scholarships the user has applied to
  const appliedScholarshipIds = useMemo(() => {
    return new Set(applications.map(app => app.scholarshipId));
  }, [applications]);

  // Filter & Search Logic
  const filteredScholarships = useMemo(() => {
    return scholarships.filter(scholarship => {
      const matchesCategory = activeCategory === 'All' || scholarship.category === activeCategory;
      const matchesSearch = scholarship.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            scholarship.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [scholarships, activeCategory, searchQuery]);

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
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Info Notice about Applications */}
      {applications.length > 0 && (
        <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 flex items-start gap-3">
          <BookmarkCheck className="w-5 h-5 text-brand-green shrink-0 mt-0.5" />
          <div className="text-xs text-brand-green-dark">
            <span className="font-bold">You have {applications.length} submitted application(s).</span> You can view your active submissions status badge or submit additional applications for different eligible slots.
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
              isApplied={appliedScholarshipIds.has(scholarship.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
