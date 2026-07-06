import React, { useState } from 'react';
import { Announcement } from '../types';
import { Calendar, ChevronDown, ChevronUp, Bell, Megaphone, Clock, Award } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AnnouncementCardProps {
  announcement: Announcement;
  id?: string;
  isInitiallyExpanded?: boolean;
  key?: React.Key;
}

export default function AnnouncementCard({ announcement, id, isInitiallyExpanded = false }: AnnouncementCardProps) {
  const [isExpanded, setIsExpanded] = useState(isInitiallyExpanded);

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
      <div className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center space-x-2">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${getCategoryBadgeColor(announcement.category)}`}>
              {getCategoryIcon(announcement.category)}
              {announcement.category}
            </span>
          </div>
          <div className="flex items-center text-slate-400 text-xs gap-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>{announcement.date}</span>
          </div>
        </div>

        <h3 className="text-base font-display font-bold text-slate-900 leading-snug mb-2 hover:text-brand-green transition-colors cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
          {announcement.title}
        </h3>

        <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed mb-4">
          {announcement.description}
        </p>

        <div className="flex justify-between items-center pt-2 border-t border-slate-100">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs font-semibold text-brand-green hover:text-brand-green-dark flex items-center space-x-1 focus:outline-hidden"
          >
            <span>{isExpanded ? 'Collapse Article' : 'Read Full Announcement'}</span>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
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
            <div className="px-5 pb-6 pt-2 border-t border-slate-100 bg-slate-50/50">
              <div className="prose prose-slate max-w-none text-sm text-slate-700 whitespace-pre-line leading-relaxed font-normal">
                {announcement.content}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
