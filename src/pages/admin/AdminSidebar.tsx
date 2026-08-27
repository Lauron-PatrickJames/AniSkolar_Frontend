import React from 'react';
import { LayoutList, BarChart3, History, Megaphone, LogOut, X, ShieldCheck } from 'lucide-react';

type MainView = 'applications' | 'analytics' | 'lifecycle' | 'announcements';

interface AdminSidebarProps {
  currentView: MainView;
  onNavigate: (view: MainView) => void;
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  id?: string;
}

// Mirrors the student portal's Sidebar.tsx: same shell, same mobile
// slide-in/overlay behavior, same footer treatment — just a different
// icon/logo (ShieldCheck instead of the AniSkolar crest, since this is the
// admin surface) and a menu built from AdminDashboard's four main views
// instead of student pages.
export default function AdminSidebar({
  currentView,
  onNavigate,
  isOpen,
  onClose,
  onLogout,
  id
}: AdminSidebarProps) {
  const menuItems: { id: MainView; name: string; icon: React.ElementType }[] = [
    { id: 'applications', name: 'Applications', icon: LayoutList },
    { id: 'analytics', name: 'Statistics', icon: BarChart3 },
    { id: 'lifecycle', name: 'Scholars', icon: History },
    { id: 'announcements', name: 'Announcements', icon: Megaphone }
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
        className={`fixed md:sticky top-0 left-0 h-screen w-[78vw] max-w-64 sm:w-64 bg-white border-r border-slate-200 text-slate-700 flex flex-col z-50 transition-transform duration-300 md:transform-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Sidebar Header with Branding */}
        <div className="p-4 sm:p-6 flex items-center justify-between border-b border-slate-50 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white flex items-center justify-center shadow-md border-2 border-white overflow-hidden shrink-0">
              <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 text-brand-green" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold leading-none text-brand-green uppercase tracking-tight truncate">AniSkolar</h1>
              <p className="text-[10px] text-slate-400 font-semibold mt-1 truncate">ADMIN PORTAL</p>
            </div>
          </div>

          {/* Close Sidebar button (Mobile only) */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 md:hidden focus:outline-hidden shrink-0"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 py-0 space-y-1 overflow-y-auto">
          {menuItems.map(item => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  onClose();
                }}
                className={`w-full flex items-center px-5 sm:px-6 py-3 text-sm font-medium transition-colors duration-200 focus:outline-hidden group ${
                  isActive
                    ? 'sidebar-item-active'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-5 h-5 mr-3 shrink-0 transition-colors ${isActive ? 'text-brand-green' : 'text-slate-400 group-hover:text-slate-600'}`} />
                <span className="truncate">{item.name}</span>
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer with Logout */}
        <div className="p-4 sm:p-6 border-t border-slate-100 shrink-0">
          <button
            onClick={onLogout}
            className="flex items-center w-full px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors focus:outline-hidden"
          >
            <LogOut className="w-5 h-5 mr-3 shrink-0" />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}