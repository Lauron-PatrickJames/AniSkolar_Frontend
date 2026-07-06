import React from 'react';
import { LayoutDashboard, Compass, Megaphone, UserCircle, LogOut, X, ChevronLeft, ChevronRight, Award } from 'lucide-react';
import { StudentProfile } from '../types';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  student: StudentProfile;
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  id?: string;
}

export default function Sidebar({
  currentPage,
  onNavigate,
  student,
  isOpen,
  onClose,
  onLogout,
  id
}: SidebarProps) {
  const menuItems = [
    { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard },
    { id: 'explore', name: 'Explore Grants', icon: Compass },
    { id: 'announcements', name: 'Announcements', icon: Megaphone },
    { id: 'profile', name: 'Profile', icon: UserCircle }
  ];

  return (
    <>
      {/* Mobile Sidebar Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside
        id={id}
        className={`fixed md:sticky top-0 left-0 h-screen w-64 bg-white border-r border-slate-200 text-slate-700 flex flex-col z-50 transition-transform duration-300 md:transform-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Sidebar Header with University Branding */}
        <div className="p-6 flex items-center justify-between border-b border-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-green rounded-lg flex items-center justify-center text-white font-bold text-xl">
              A
            </div>
            <div>
              <h1 className="text-lg font-bold leading-none text-brand-green uppercase tracking-tight">AniSkolar</h1>
              <p className="text-[10px] text-slate-400 font-semibold mt-1">DLSU-DASMARIÑAS</p>
            </div>
          </div>

          {/* Close Sidebar button (Mobile only) */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 md:hidden focus:outline-hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mini Student Profile inside Sidebar */}
        <div className="p-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-brand-green text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
              {student.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-slate-800 truncate leading-tight">{student.name}</p>
              <p className="text-[10px] text-slate-400 truncate leading-none mt-1">Non-Scholar</p>
              <p className="text-[10px] text-brand-green font-semibold leading-none mt-1">GPA: {student.gpa}</p>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 py-6 space-y-1 overflow-y-auto">
          <div className="px-6 mb-2 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Main Menu</div>
          {menuItems.map(item => {
            const Icon = item.icon;
            const isActive = currentPage === item.id || (item.id === 'explore' && currentPage === 'scholarship-details') || (item.id === 'explore' && currentPage === 'apply-scholarship');
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  onClose();
                }}
                className={`w-full flex items-center px-6 py-3 text-sm font-medium transition-colors duration-200 focus:outline-hidden group ${
                  isActive
                    ? 'sidebar-item-active'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-5 h-5 mr-3 transition-colors ${isActive ? 'text-brand-green' : 'text-slate-400 group-hover:text-slate-600'}`} />
                <span>{item.name}</span>
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer with Logout & University Slogan */}
        <div className="p-6 border-t border-slate-100 shrink-0">
          <button
            onClick={onLogout}
            className="flex items-center w-full px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors focus:outline-hidden"
          >
            <LogOut className="w-5 h-5 mr-3" />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
