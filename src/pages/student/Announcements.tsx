import React, { useState, useMemo } from 'react';
import { Announcement } from '../../types';
import AnnouncementCard from '../../components/AnnouncementCard';
import { Search, Megaphone, Bell, Calendar, SlidersHorizontal, Info } from 'lucide-react';

interface AnnouncementsProps {
  announcements: Announcement[];
  id?: string;
}

type AnnouncementFilter = 'All' | 'General' | 'Deadline' | 'Event' | 'Update';

export default function Announcements({ announcements, id }: AnnouncementsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<AnnouncementFilter>('All');

  // Filter Categories list
  const categories: AnnouncementFilter[] = ['All', 'General', 'Deadline', 'Event', 'Update'];

  // Search & Filter Logic
  const filteredAnnouncements = useMemo(() => {
    return announcements.filter(ann => {
      const matchesCategory = activeCategory === 'All' || ann.category === activeCategory;
      const matchesSearch = ann.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            ann.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [announcements, activeCategory, searchQuery]);

  return (
    <div id={id} className="space-y-6">
      {/* Filters Board */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="w-full md:max-w-md relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search announcements..."
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

      {/* Announcements Count Notice */}
      <div className="text-xs text-slate-400 font-bold uppercase tracking-wider pl-1">
        Showing {filteredAnnouncements.length} of {announcements.length} Announcements
      </div>

      {/* Announcements List */}
      {filteredAnnouncements.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
          <Info className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="font-display font-bold text-lg text-slate-700">No Announcements Found</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Try adjusting your search filters or check back later for updates from the Scholarship and Financial Assistance Office (SFAO).
          </p>
        </div>
      ) : (
        <div className="space-y-4 max-w-4xl">
          {filteredAnnouncements.map((ann, idx) => (
            <AnnouncementCard
              key={ann.id}
              announcement={ann}
              isInitiallyExpanded={idx === 0 && searchQuery === '' && activeCategory === 'All'} // Expand the very first one for focus
            />
          ))}
        </div>
      )}
    </div>
  );
}
