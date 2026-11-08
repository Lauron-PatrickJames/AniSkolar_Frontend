import React, { useCallback, useEffect, useState } from 'react';
import { DutyNotice } from '../utils/notifications';
import { useAuth } from '@clerk/react';
import { MESSAGES_API_BASE, MESSAGES_READ_EVENT } from '../utils/messages';
import Sidebar from '../components/Sidebar';
import Navbar from '../components/Navbar';
import { StudentProfile, Application, Announcement } from '../types';
import { HeldScholarship, isSfagScholar } from '../utils/eligibility';
import { motion } from 'motion/react';

interface StudentLayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
  // Lets a clicked notification (e.g. "Your application for X was approved")
  // jump straight to that scholarship's details page.
  onViewScholarship: (scholarshipId: string) => void;
  student: StudentProfile;
  applications: Application[];
  // Scholarships the student holds now (GET /api/students/me/holdings).
  heldScholarships?: HeldScholarship[];
  dutyNotice?: DutyNotice | null;
  announcements?: Announcement[];
  onLogout: () => void;
  pageTitle: string;
  id?: string;
}

export default function StudentLayout({
  children,
  currentPage,
  onNavigate,
  onViewScholarship,
  student,
  applications,
  heldScholarships = [],
  dutyNotice = null,
  announcements = [],
  onLogout,
  pageTitle,
  id
}: StudentLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const unreadMessages = useUnreadMessages(currentPage);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  return (
    <div id={id} className="h-dvh bg-slate-50 flex flex-row overflow-hidden">
      <Sidebar
        currentPage={currentPage}
        onNavigate={onNavigate}
        student={student}
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
        onLogout={onLogout}
        isScholar={applications.some(app => app.status === 'Approved')}
        isSfagScholar={isSfagScholar(applications)}
        heldScholarships={heldScholarships}
        unreadMessages={unreadMessages}
        needsRevision={applications.filter(app => app.status === 'Needs Revision').length}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto h-dvh relative">
        <Navbar
          pageTitle={pageTitle}
          student={student}
          applications={applications}
          onLogout={onLogout}
          onNavigateToProfile={() => onNavigate('profile')}
          onToggleSidebar={toggleSidebar}
          onViewScholarship={onViewScholarship}
          onNavigate={onNavigate}
          heldScholarships={heldScholarships}
          dutyNotice={dutyNotice}
          announcements={announcements}
        />

        <main className="flex-1 p-4 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-[calc(2rem+env(safe-area-inset-bottom))] lg:p-8 lg:pb-[calc(2.5rem+env(safe-area-inset-bottom))] max-w-7xl w-full mx-auto">
          <motion.div
            key={currentPage}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="w-full h-full"
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}

// Unread messages from the AdSO: checked on every page change, every
// minute, and right after the Messages page marks them read.
export function useUnreadMessages(currentPage: string): number {
  const { getToken } = useAuth();
  const [unread, setUnread] = useState(0);
  const check = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${MESSAGES_API_BASE}/api/messages/mine/unread`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (res.ok) setUnread((await res.json()).unread ?? 0);
    } catch {
      // keep the last count
    }
  }, [getToken]);
  useEffect(() => { check(); }, [check, currentPage]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') check(); }, 60_000);
    const onRead = () => setUnread(0);
    window.addEventListener(MESSAGES_READ_EVENT, onRead);
    return () => { window.clearInterval(timer); window.removeEventListener(MESSAGES_READ_EVENT, onRead); };
  }, [check]);
  return unread;
}
