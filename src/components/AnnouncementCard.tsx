import React, { useState } from 'react';
import { Announcement } from '../types';
import { Calendar, ChevronDown, ChevronUp, Bell, Megaphone, Clock, Award, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { mockScholarships } from '../data/scholarships';

interface AnnouncementCardProps {
  announcement: Announcement;
  id?: string;
  isInitiallyExpanded?: boolean;
  key?: React.Key;
}

export default function AnnouncementCard({ announcement, id, isInitiallyExpanded = false }: AnnouncementCardProps) {
  const [isExpanded, setIsExpanded] = useState(isInitiallyExpanded);
  const imageUrls = announcement.imageUrls ?? [];
  const relatedScholarship = announcement.scholarshipId
    ? mockScholarships.find(s => s.id === announcement.scholarshipId)
    : undefined;

  const getCategoryBadgeColor = (category: string) => {
    switch (category) {
      case 'General':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Deadline':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'Event':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'Update':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'General':
        return <Megaphone className="w-4 h-4 text-blue-600" />;
      case 'Deadline':
        return <Clock className="w-4 h-4 text-rose-600" />;
      case 'Event':
        return <Calendar className="w-4 h-4 text-amber-600" />;
      case 'Update':
        return <Award className="w-4 h-4 text-emerald-600" />;
      default:
        return <Bell className="w-4 h-4 text-slate-600" />;
    }
  };

  return (
    <motion.div
      id={id}
      layout
      className={`bg-white rounded-xl border border-slate-100 card-shadow transition-shadow duration-200 overflow-hidden ${
        isExpanded ? 'border-brand-green/30 ring-1 ring-brand-green/5' : ''
      }`}
    >
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center space-x-2 min-w-0">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border shrink-0 ${getCategoryBadgeColor(announcement.category)}`}>
              {getCategoryIcon(announcement.category)}
              {announcement.category}
            </span>
            {relatedScholarship && (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold border bg-slate-50 text-slate-600 border-slate-200 truncate">
                {relatedScholarship.name}
              </span>
            )}
          </div>
          <div className="flex items-center text-slate-400 text-xs gap-1 shrink-0">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>{announcement.date}</span>
          </div>
        </div>

        <h3 className="text-sm sm:text-base font-display font-bold text-slate-900 leading-snug mb-2 hover:text-brand-green transition-colors cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
          {announcement.title}
        </h3>

        <p className="text-xs sm:text-sm text-slate-600 line-clamp-2 leading-relaxed mb-4">
          {announcement.description}
        </p>

        <div className="flex flex-wrap gap-2 justify-between items-center pt-2 border-t border-slate-100">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs font-semibold text-brand-green hover:text-brand-green-dark flex items-center space-x-1 focus:outline-hidden"
          >
            <span>{isExpanded ? 'Collapse Article' : 'Read Full Announcement'}</span>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {announcement.fbPermalink && (
            <a
              href={announcement.fbPermalink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-slate-500 hover:text-brand-green inline-flex items-center gap-1"
            >
              <span>View on Facebook</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          >
            <div className="px-4 sm:px-5 pb-6 pt-2 border-t border-slate-100 bg-slate-50/50">
              {imageUrls.length === 1 && (
                <img
                  src={imageUrls[0]}
                  alt=""
                  loading="lazy"
                  className="w-full max-h-80 object-cover rounded-lg border border-slate-100 mt-2 mb-4"
                />
              )}
              {imageUrls.length > 1 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 mb-4">
                  {imageUrls.map((url, i) => (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block">
                      <img
                        src={url}
                        alt={`Image ${i + 1} of ${imageUrls.length}`}
                        loading="lazy"
                        className="aspect-square w-full object-cover rounded-lg border border-slate-100 hover:opacity-90 transition-opacity"
                      />
                    </a>
                  ))}
                </div>
              )}
              <div className="prose prose-slate max-w-none text-sm text-slate-700 whitespace-pre-line leading-relaxed font-normal break-words">
                {announcement.content}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}