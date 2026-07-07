import React from 'react';
import { Scholarship, Announcement, Application, StudentProfile } from '../../types';
import DashboardCard from '../../components/DashboardCard';
import AnnouncementCard from '../../components/AnnouncementCard';
import { Award, Compass, FileText, AlertCircle, ArrowRight, UserCheck, Calendar, Bell } from 'lucide-react';
import { motion } from 'motion/react';

interface DashboardProps {
  scholarships: Scholarship[];
  announcements: Announcement[];
  applications: Application[];
  student: StudentProfile;
  onNavigate: (page: string) => void;
  onViewScholarship: (id: string) => void;
  id?: string;
}

export default function Dashboard({
  scholarships,
  announcements,
  applications,
  student,
  onNavigate,
  onViewScholarship,
  id
}: DashboardProps) {
  // Compute metrics dynamically from data
  const totalScholarships = scholarships.length;
  const activeApplications = applications.length;
  const closingSoonCount = scholarships.filter(s => s.status === 'Closing Soon').length;
  const totalAnnouncements = announcements.length;

  // Grab upcoming scholarship deadlines
  const upcomingDeadlines = scholarships
    .filter(s => s.status !== 'Closed')
    .slice(0, 3);

  return (
    <div id={id} className="space-y-8">
      {/* Welcome Banner */}
      <div className="hero-placeholder h-50 rounded-2xl flex flex-col justify-center px-8 sm:px-10 text-white card-shadow shrink-0 relative overflow-hidden">
        <div className="relative z-10 max-w-2xl space-y-2">
          <h2 className="text-2xl sm:text-3xl font-display font-extrabold tracking-tight leading-tight">
            Welcome back, <span className="text-emerald-300">{student.name.split(' ')[0]}</span>!
          </h2>
          <p className="text-xs sm:text-sm text-emerald-100/90 leading-relaxed font-normal">
            Explore and manage your educational journey with AniSkolar's integrated scholarship portal. Check your eligibility status, active grants, and upcoming deadlines.
          </p>
          <div className="pt-2 flex flex-wrap items-center gap-3">
            <span className="text-[11px] font-semibold bg-white/10 px-3 py-1 rounded-full text-white border border-white/10">
              ID: {student.studentNumber}
            </span>
            <span className="text-[11px] font-semibold bg-white/10 px-3 py-1 rounded-full text-white border border-white/10">
              GPA: {student.gpa}
            </span>
            <span className="text-[11px] font-semibold bg-white/10 px-3 py-1 rounded-full text-white border border-white/10">
              {student.course}
            </span>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <DashboardCard
          title="Total Grants Available"
          value={totalScholarships}
          description="Active scholarship applications"
          icon={Award}
          onClick={() => onNavigate('explore')}
        />
        <DashboardCard
          title="My Open Applications"
          value={activeApplications}
          description="In-progress evaluations"
          icon={FileText}
          color="border-brand-green/20 bg-emerald-50/25 hover:border-brand-green/30"
          trend={activeApplications > 0 ? { text: 'Submitted', type: 'positive' } : undefined}
          onClick={() => onNavigate('explore')}
        />
        <DashboardCard
          title="Closing Soon"
          value={closingSoonCount}
          description="Urgent submission guidelines"
          icon={AlertCircle}
          onClick={() => onNavigate('explore')}
        />
        <DashboardCard
          title="Announcements"
          value={totalAnnouncements}
          description="Latest LSO releases"
          icon={Bell}
          onClick={() => onNavigate('announcements')}
        />
      </div>

      {/* Main Dual Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Recent Announcements */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="font-display font-bold text-lg text-slate-900">Recent LSO Announcements</h3>
            <button
              onClick={() => onNavigate('announcements')}
              className="text-xs font-semibold text-brand-green hover:text-brand-green-dark flex items-center space-x-1 focus:outline-hidden"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-4">
            {announcements.slice(0, 2).map(ann => (
              <AnnouncementCard key={ann.id} announcement={ann} />
            ))}
          </div>
        </div>

        {/* Right Column: Deadlines & Quick Actions */}
        <div className="space-y-6">
          {/* Upcoming Deadlines */}
          <div>
            <h3 className="font-display font-bold text-lg text-slate-900 mb-4">Upcoming Deadlines</h3>
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden">
              {upcomingDeadlines.map(s => (
                <div
                  key={s.id}
                  onClick={() => onViewScholarship(s.id)}
                  className="p-4 hover:bg-slate-50 transition-colors cursor-pointer group"
                >
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-semibold text-xs text-slate-700 group-hover:text-brand-green transition-colors line-clamp-1">
                      {s.name}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 uppercase tracking-wide ${
                      s.status === 'Closing Soon'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {s.status}
                    </span>
                  </div>
                  <div className="flex items-center text-slate-400 text-[11px] mt-2 gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-medium text-slate-500">Deadline: {s.deadline}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Action Hub */}
          <div>
            <h3 className="font-display font-bold text-lg text-slate-900 mb-4">Quick Actions</h3>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
              <button
                onClick={() => onNavigate('explore')}
                className="w-full flex items-center justify-between p-3.5 rounded-lg border border-slate-100 bg-slate-50 hover:bg-slate-100 transition-colors text-left text-xs font-semibold text-slate-700 focus:outline-hidden"
              >
                <span className="flex items-center space-x-2.5">
                  <Compass className="w-4 h-4 text-brand-green" />
                  <span>Browse Available Scholarships</span>
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              </button>
              
              <button
                onClick={() => onNavigate('profile')}
                className="w-full flex items-center justify-between p-3.5 rounded-lg border border-slate-100 bg-slate-50 hover:bg-slate-100 transition-colors text-left text-xs font-semibold text-slate-700 focus:outline-hidden"
              >
                <span className="flex items-center space-x-2.5">
                  <UserCheck className="w-4 h-4 text-brand-green" />
                  <span>Update Profile</span>
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
