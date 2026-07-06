import React, { useState } from 'react';
import Sidebar from '../components/Sidebar';
import Navbar from '../components/Navbar';
import { StudentProfile } from '../types';
import { motion } from 'motion/react';

interface StudentLayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
  student: StudentProfile;
  onLogout: () => void;
  pageTitle: string;
  id?: string;
}

export default function StudentLayout({
  children,
  currentPage,
  onNavigate,
  student,
  onLogout,
  pageTitle,
  id
}: StudentLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  return (
    <div id={id} className="min-h-screen bg-slate-50 flex flex-row overflow-hidden">
      {/* Sidebar Navigation */}
      <Sidebar
        currentPage={currentPage}
        onNavigate={onNavigate}
        student={student}
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
        onLogout={onLogout}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto h-screen relative">
        {/* Top Navbar */}
        <Navbar
          pageTitle={pageTitle}
          student={student}
          onLogout={onLogout}
          onNavigateToProfile={() => onNavigate('profile')}
          onToggleSidebar={toggleSidebar}
        />

        {/* Content Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
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
