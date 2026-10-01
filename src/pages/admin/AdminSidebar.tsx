import React from 'react';
import { LayoutList, BarChart3, GraduationCap, Megaphone, LogOut, X, ShieldCheck } from 'lucide-react';
import { initials } from './AdminUI';

type MainView = 'applications' | 'analytics' | 'lifecycle' | 'announcements';

interface AdminSidebarProps {
  currentView: MainView;
  onNavigate: (view: MainView) => void;
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  adminEmail?: string;
  officeLabel: string;
  pendingCount?: number;
  id?: string;
}

const SECTIONS: { title: string; items: { id: MainView; name: string; icon: React.ElementType }[] }[] = [
  {
    title: 'Review',
    items: [
      { id: 'applications', name: 'Applications', icon: LayoutList },
      { id: 'lifecycle', name: 'Scholars', icon: GraduationCap }
    ]
  },
  {
    title: 'Insights',
    items: [{ id: 'analytics', name: 'Statistics', icon: BarChart3 }]
  },
  {
    title: 'Communication',
    items: [{ id: 'announcements', name: 'Announcements', icon: Megaphone }]
  }
];

// Admin navigation: dark brand-green rail with grouped sections, the
// pending-review count on Applications, and the signed-in admin + office
// in the footer. Slides in over the page on mobile.
export default function AdminSidebar({
  currentView,
  onNavigate,
  isOpen,
  onClose,
  onLogout,
  adminEmail,
  officeLabel,
  pendingCount,
  id
}: AdminSidebarProps) {
  const displayName = adminEmail?.split('@')[0].replace(/[._-]+/g, ' ') || 'Administrator';

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 md:hidden" onClick={onClose} />
      )}

      <aside
        id={id}
        className={`fixed md:sticky top-0 left-0 h-screen w-[78vw] max-w-64 md:w-64 shrink-0 bg-[#062e1c] text-emerald-50 flex flex-col z-50 transition-transform duration-300 md:transform-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="h-16 px-5 flex items-center justify-between border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-white/10 ring-1 ring-white/15 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4.5 h-4.5 text-emerald-300" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white leading-none tracking-tight">AniSkolar</p>
              <p className="text-[11px] text-emerald-200/60 mt-1 leading-none">Admin console</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-emerald-100/60 hover:text-white hover:bg-white/10 md:hidden focus:outline-hidden"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {SECTIONS.map(section => (
            <div key={section.title}>
              <p className="px-3 mb-1.5 text-[11px] font-medium uppercase tracking-wider text-emerald-200/40">{section.title}</p>
              <div className="space-y-0.5">
                {section.items.map(item => {
                  const Icon = item.icon;
                  const active = currentView === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => { onNavigate(item.id); onClose(); }}
                      aria-current={active ? 'page' : undefined}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-300/50 ${
                        active ? 'bg-white/10 text-white' : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <Icon className={`w-4.5 h-4.5 shrink-0 ${active ? 'text-emerald-300' : 'text-emerald-200/50'}`} />
                      <span className="flex-1 text-left truncate">{item.name}</span>
                      {item.id === 'applications' && !!pendingCount && (
                        <span className="px-1.5 py-0.5 rounded-md bg-amber-400/15 text-amber-200 text-[11px] font-semibold tabular-nums">{pendingCount}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-white/10 shrink-0">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-emerald-400/15 text-emerald-200 text-xs font-semibold flex items-center justify-center shrink-0 capitalize">
              {initials(displayName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate capitalize">{displayName}</p>
              <p className="text-[11px] text-emerald-200/60 truncate">{officeLabel}</p>
            </div>
            <button
              onClick={onLogout}
              className="p-2 rounded-lg text-emerald-100/60 hover:text-white hover:bg-white/10 transition-colors focus:outline-hidden"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
