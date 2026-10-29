import React, { useState } from 'react';
import { LayoutDashboard, Compass, Megaphone, LogOut, X, Award, Calculator, RefreshCw, Clock, MessageSquare, FileText, ShieldCheck, AlertTriangle } from 'lucide-react';
import { displayName, nameInitials } from '../utils/names';
import { StudentProfile } from '../types';
import logo from '/src/assets/logo.png';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  student: StudentProfile;
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  // Scholars (an approved application) also get Renewal; SFAG scholars
  // also get Duty Hours.
  isScholar?: boolean;
  isSfagScholar?: boolean;
  // Scholarships held now: scholars get My Scholarship instead of Explore
  // Grants, and a badge with the scholarship's name.
  heldScholarships?: { scholarshipId: string; scholarshipName: string }[];
  // Unread messages from the AdSO, shown on Messages.
  unreadMessages?: number;
  // Applications the office asked the student to revise, shown on My Applications.
  needsRevision?: number;
  id?: string;
}

export default function Sidebar({
  currentPage,
  onNavigate,
  student,
  isOpen,
  onClose,
  onLogout,
  isScholar = false,
  isSfagScholar = false,
  heldScholarships = [],
  unreadMessages = 0,
  needsRevision = 0,
  id
}: SidebarProps) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const holds = heldScholarships.length > 0;
  const choosing = heldScholarships.length > 1;
  // "Student Financial Aid Grant (SFAG)" -> "SFAG" for the chip.
  const short = (name: string) => name.match(/\(([^)]+)\)\s*$/)?.[1] ?? name;
  const fullName = displayName(student);

  type Item = { id: string; name: string; icon: React.ElementType; count?: number; tone?: 'alert' | 'info' };
  type Group = { label?: string; chip?: React.ReactNode; items: Item[] };
  const groups: Group[] = [
    { items: [{ id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard }] },
    ...(holds ? [{
      label: 'Scholarship',
      chip: !choosing ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-brand-green ring-1 ring-emerald-100" title={heldScholarships[0].scholarshipName}>
          <ShieldCheck className="h-3 w-3" aria-hidden />{short(heldScholarships[0].scholarshipName)}
        </span>
      ) : undefined,
      items: [
        { id: 'my-scholarship', name: 'My Scholarship', icon: Award },
        ...(isScholar ? [{ id: 'renewals', name: 'Renewal', icon: RefreshCw }] : []),
        ...(isSfagScholar ? [{ id: 'duty-hours', name: 'Duty Hours', icon: Clock }] : []),
      ],
    }] : []),
    {
      label: 'Applications',
      items: [
        ...(!holds ? [{ id: 'explore', name: 'Explore Grants', icon: Compass }] : []),
        { id: 'applications', name: 'My Applications', icon: FileText, count: needsRevision, tone: 'alert' as const },
        // A scholar who isn't holding anything yet (e.g. renewal only).
        ...(!holds && isScholar ? [{ id: 'renewals', name: 'Renewal', icon: RefreshCw }] : []),
        ...(!holds && isSfagScholar ? [{ id: 'duty-hours', name: 'Duty Hours', icon: Clock }] : []),
      ],
    },
    {
      label: 'Communication',
      items: [
        { id: 'messages', name: 'Messages', icon: MessageSquare, count: unreadMessages, tone: 'info' as const },
        { id: 'announcements', name: 'Announcements', icon: Megaphone },
      ],
    },
    { label: 'Tools', items: [{ id: 'gpa-calculator', name: 'GPA Calculator', icon: Calculator }] },
  ];

  const go = (page: string) => { onNavigate(page); onClose(); };
  const activeFor = (id: string) =>
    currentPage === id || ((id === 'explore' || id === 'my-scholarship') && (currentPage === 'scholarship-details' || currentPage === 'apply-scholarship'));

  return (
    <>
      {/* Mobile Sidebar Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        id={id}
        className={`fixed md:sticky top-0 left-0 h-screen w-[78vw] max-w-64 sm:w-64 bg-white border-r border-slate-200 text-slate-700 flex flex-col z-50 transition-transform duration-300 md:transform-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* University branding */}
        <div className="px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-md border-2 border-white overflow-hidden shrink-0">
              <img src={logo} alt="AniSkolar logo" className="w-4/5 h-4/5 object-contain" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold leading-none text-brand-green uppercase tracking-tight truncate">AniSkolar</h1>
              <p className="text-[10px] text-slate-400 font-semibold mt-1 truncate">DLSU-DASMARIÑAS</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 md:hidden focus:outline-hidden shrink-0"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Approved for two: the student keeps one. */}
        {choosing && (
          <button
            type="button"
            onClick={() => go('my-scholarship')}
            className="mx-3 mb-2 flex items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-left ring-1 ring-amber-200 hover:bg-amber-100/70 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            <span className="min-w-0 text-xs leading-snug text-amber-900">
              <span className="block font-bold">Choose your scholarship</span>
              {heldScholarships.map(h => short(h.scholarshipName)).join(' or ')}: you can keep one.
            </span>
          </button>
        )}

        <nav className="flex-1 overflow-y-auto px-3 pb-3" aria-label="Main">
          {groups.map((group, gi) => (
            <div key={group.label ?? gi} className={gi ? 'mt-4' : ''}>
              {group.label && (
                <div className="mb-1 flex items-center justify-between gap-2 px-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{group.label}</p>
                  {group.chip}
                </div>
              )}
              <ul className="space-y-0.5">
                {group.items.map(item => {
                  const Icon = item.icon;
                  const active = activeFor(item.id);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => go(item.id)}
                        aria-current={active ? 'page' : undefined}
                        className={`group w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green ${
                          active ? 'bg-emerald-50 text-brand-green' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        <Icon className={`w-[18px] h-[18px] shrink-0 ${active ? 'text-brand-green' : 'text-slate-400 group-hover:text-slate-600'}`} aria-hidden />
                        <span className="truncate">{item.name}</span>
                        {item.count ? (
                          <span
                            className={`ml-auto rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums text-white ${item.tone === 'alert' ? 'bg-amber-500' : 'bg-rose-500'}`}
                            aria-label={item.tone === 'alert' ? `${item.count} need revision` : `${item.count} unread`}
                          >
                            {item.count > 9 ? '9+' : item.count}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Account: opens Profile; sign out beside it. */}
        <div className="border-t border-slate-100 p-3 shrink-0">
          <div className={`flex items-center gap-1 rounded-lg ${activeFor('profile') ? 'bg-emerald-50' : ''}`}>
            <button
              type="button"
              onClick={() => go('profile')}
              aria-current={activeFor('profile') ? 'page' : undefined}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-2 text-left hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green"
            >
              {student.avatarUrl && !avatarFailed ? (
                <img src={student.avatarUrl} alt="" onError={() => setAvatarFailed(true)} className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-slate-200" />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-green text-xs font-bold text-white">{nameInitials(fullName)}</span>
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-800">{fullName}</span>
                <span className="block truncate text-[11px] text-slate-400">{student.studentNumber} · View profile</span>
              </span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              title="Sign out"
              aria-label="Sign out"
              className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-500"
            >
              <LogOut className="h-[18px] w-[18px]" aria-hidden />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
