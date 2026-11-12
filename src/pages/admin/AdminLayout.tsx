import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { Award, BarChart3, Building2, Calculator, ChevronDown, ChevronRight, Clock, GraduationCap, LayoutDashboard, LayoutList, LogOut, Megaphone, Menu, MessageSquare, RefreshCw, ShieldCheck, Users, X, Zap } from 'lucide-react';
import logo from '../../assets/logo.png';
import { Avatar, IconButton } from './AdminUI';

export type MainView = 'home' | 'templates' | 'applications' | 'renewals' | 'dutyHours' | 'analytics' | 'fse' | 'lifecycle' | 'students' | 'messages' | 'announcements' | 'scholarships' | 'automation' | 'security';

export const VIEW_TITLES: Record<MainView, string> = {
  home: 'Dashboard',
  templates: 'Message templates',
  applications: 'Applications',
  renewals: 'Renewals',
  dutyHours: 'Duty hours',
  analytics: 'Statistics',
  fse: 'FSE report',
  lifecycle: 'Scholars',
  students: 'Students',
  messages: 'Messages',
  announcements: 'Announcements',
  scholarships: 'Scholarships',
  automation: 'Automation',
  security: 'Account security'
};

const SECTIONS: { title: string; items: { id: MainView; icon: React.ElementType }[] }[] = [
  { title: '', items: [{ id: 'home', icon: LayoutDashboard }] },
  { title: 'Programs', items: [{ id: 'scholarships', icon: Award }] },
  { title: 'Review', items: [{ id: 'applications', icon: LayoutList }, { id: 'renewals', icon: RefreshCw }, { id: 'lifecycle', icon: GraduationCap }, { id: 'students', icon: Users }, { id: 'dutyHours', icon: Clock }] },
  { title: 'Insights', items: [{ id: 'analytics', icon: BarChart3 }, { id: 'fse', icon: Calculator }] },
  { title: 'Communication', items: [{ id: 'messages', icon: MessageSquare }, { id: 'announcements', icon: Megaphone }] },
  { title: 'Manage', items: [{ id: 'automation', icon: Zap }] }
];

// Another console's own menu (the office portal reuses this shell). Each
// item: its id, label, icon and an optional count badge.
export interface NavItem { id: string; label: string; icon: React.ElementType; count?: number; countLabel?: string }
export interface NavSection { title: string; items: NavItem[] }

export interface Crumb {
  label: string;
  onClick?: () => void;
}

interface AdminLayoutProps {
  currentView: MainView | string;
  onNavigate: (view: MainView) => void;
  // Another console's menu, name ("Office portal") and home page, instead
  // of the admin console's.
  nav?: NavSection[];
  consoleName?: string;
  homeView?: string;
  // Account menu → Account security (default: the 'security' view).
  onSecurity?: () => void;
  onLogout: () => void;
  adminEmail?: string;
  // The account's name and photo in Clerk, when set.
  adminName?: string;
  adminAvatarUrl?: string;
  officeLabel: string;
  // e.g. "SDO", for the account button.
  officeShort?: string;
  pendingCount?: number;
  // Unread messages from students, shown on Messages.
  messageCount?: number;
  // Offices' announcements waiting for the AdSO's approval, on Announcements.
  announcementCount?: number;
  // Views this admin can't open (e.g. announcements for office admins).
  hiddenViews?: MainView[];
  breadcrumbs: Crumb[];
  // Changes whenever the visible page changes; scrolls content to the top.
  pageKey: string;
  children: React.ReactNode;
}

// Admin shell. The content column is the scroll container, so the top bar
// and table headers (sticky top-topbar) stay pinned while pages scroll.
// Sidebar: full width from lg, an icon rail from md to lg, a drawer below md.
export default function AdminLayout({
  currentView, onNavigate, nav, consoleName = 'Admin console', homeView = 'home', onSecurity, onLogout, adminEmail, adminName, adminAvatarUrl, officeLabel, officeShort, pendingCount, messageCount, announcementCount, hiddenViews = [], breadcrumbs, pageKey, children
}: AdminLayoutProps) {
  // The menu: the given one, or the admin console's (minus hidden views).
  const sections: NavSection[] = nav ?? SECTIONS
    .map(section => ({
      title: section.title,
      items: section.items.filter(item => !hiddenViews.includes(item.id)).map(item => ({
        id: item.id,
        label: VIEW_TITLES[item.id],
        icon: item.icon,
        count: item.id === 'applications' ? pendingCount : item.id === 'messages' ? messageCount : item.id === 'announcements' ? announcementCount : undefined,
        countLabel: item.id === 'messages' ? 'unread' : item.id === 'announcements' ? 'waiting for your approval' : 'awaiting review',
      })),
    }))
    .filter(section => section.items.length > 0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [pageKey]);

  return (
    <MotionConfig reducedMotion="user">
      <div data-admin className="flex h-dvh overflow-hidden bg-canvas text-ink">
        <a
          href="#admin-main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-60 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-overlay"
        >
          Skip to content
        </a>

        <Sidebar
          currentView={currentView}
          onNavigate={view => { onNavigate(view as MainView); closeDrawer(); }}
          open={drawerOpen}
          onClose={closeDrawer}
          sections={sections}
          consoleName={consoleName}
          homeView={homeView}
        />

        <div ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto">
          <header className="sticky top-0 z-30 flex h-topbar items-center justify-between gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-2">
              <IconButton
                icon={Menu}
                label="Open navigation"
                size="md"
                onClick={() => setDrawerOpen(true)}
                aria-expanded={drawerOpen}
                aria-controls="admin-sidebar"
                className="-ml-2 md:hidden"
              />
              {breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
            </div>
            <AccountMenu adminEmail={adminEmail} adminName={adminName} avatarUrl={adminAvatarUrl} officeLabel={officeLabel} officeShort={officeShort ?? officeLabel} onSecurity={onSecurity ?? (() => onNavigate('security'))} onLogout={onLogout} />
          </header>

          <main id="admin-main" tabIndex={-1} className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>
      </div>
    </MotionConfig>
  );
}

// The signed-in account, top right (as in the student portal): their name
// and office (short, so it never gets cut off), then a menu with the full
// office, Account security and Sign out.
function AccountMenu({ adminEmail, adminName, avatarUrl, officeLabel, officeShort, onSecurity, onLogout }: {
  adminEmail?: string;
  adminName?: string;
  avatarUrl?: string;
  officeLabel: string;
  officeShort: string;
  onSecurity: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // The name in Clerk, else the email's name part ("maria.santos" → "Maria Santos").
  const name = adminName?.trim() || (adminEmail?.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())) || 'Administrator';
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const item = 'flex w-full items-center gap-3 rounded-control px-2.5 py-2 text-left text-sm hover:bg-surface-muted focus:outline-hidden focus-visible:bg-surface-muted';
  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${name}, ${officeLabel}. Account menu`}
        className={`flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-surface-muted focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent sm:pr-3 ${open ? 'bg-surface-muted' : ''}`}
      >
        <Avatar name={name} avatarUrl={avatarUrl} size="sm" />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-40 truncate text-sm font-medium text-ink">{name}</span>
          <span className="block text-xs text-ink-subtle">{officeShort}</span>
        </span>
        <ChevronDown className={`size-4 text-ink-subtle transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-72 rounded-card bg-surface p-1.5 shadow-overlay ring-1 ring-line">
          <div className="flex items-center gap-3 px-2.5 pb-3 pt-2">
            <Avatar name={name} avatarUrl={avatarUrl} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{name}</p>
              {adminEmail && <p className="truncate text-xs text-ink-muted">{adminEmail}</p>}
            </div>
          </div>
          <div className="mx-1 mb-1.5 flex items-start gap-2 rounded-control bg-surface-muted px-2.5 py-2">
            <Building2 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <p className="text-xs leading-snug text-ink">{officeLabel}</p>
          </div>
          <div className="border-t border-line pt-1.5">
            <button type="button" role="menuitem" className={`${item} text-ink`} onClick={() => { setOpen(false); onSecurity(); }}>
              <ShieldCheck className="size-4 text-ink-subtle" aria-hidden /> Account security
            </button>
            <button type="button" role="menuitem" className={`${item} text-danger-fg hover:bg-danger-bg`} onClick={() => { setOpen(false); onLogout(); }}>
              <LogOut className="size-4" aria-hidden /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className={`flex items-center gap-1.5 ${last ? 'min-w-0' : 'shrink-0'}`}>
              {i > 0 && <ChevronRight className="size-4 shrink-0 text-ink-subtle" aria-hidden />}
              {last || !item.onClick ? (
                <span aria-current={last ? 'page' : undefined} className={`truncate ${last ? 'font-semibold text-ink' : 'text-ink-muted'}`}>
                  {item.label}
                </span>
              ) : (
                <button type="button" onClick={item.onClick} className="rounded-badge font-medium text-ink-muted hover:text-ink">
                  {item.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Sidebar({ currentView, onNavigate, open, onClose, sections, consoleName, homeView }: {
  currentView: string;
  onNavigate: (view: string) => void;
  open: boolean;
  onClose: () => void;
  sections: NavSection[];
  consoleName: string;
  homeView: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // Drawer (below md): move focus in on open, close on Escape, and hand
  // focus back to the menu button on close.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.querySelector<HTMLElement>('[aria-controls="admin-sidebar"]')?.focus();
    };
  }, [open, onClose]);

  return (
    <>
      {open && <div aria-hidden className="fixed inset-0 z-40 bg-ink/40 md:hidden" onClick={onClose} />}

      <aside
        id="admin-sidebar"
        aria-label="Admin navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-sidebar max-w-[85vw] shrink-0 flex-col border-r border-line bg-surface transition-[translate,visibility] duration-200 ease-out motion-reduce:transition-none md:static md:z-auto md:w-rail md:max-w-none md:translate-x-0 lg:w-sidebar ${
          open ? 'translate-x-0 shadow-overlay' : 'max-md:invisible -translate-x-full'
        }`}
      >
        <div className="flex h-topbar shrink-0 items-center justify-between gap-2 border-b border-line px-4 md:max-lg:justify-center md:max-lg:px-0">
          {/* The logo goes home. */}
          <button
            type="button"
            onClick={() => onNavigate(homeView)}
            aria-label="AniSkolar, go to Home"
            className="-m-1 flex min-w-0 items-center gap-2.5 rounded-lg p-1 text-left focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface ring-1 ring-line">
              <img src={logo} alt="" className="size-6 object-contain" />
            </span>
            <span className="min-w-0 md:max-lg:sr-only">
              <span className="block truncate text-sm font-semibold leading-tight text-accent">AniSkolar</span>
              <span className="block truncate text-xs leading-tight text-ink-subtle">{consoleName}</span>
            </span>
          </button>
          <IconButton ref={closeRef} icon={X} label="Close navigation" onClick={onClose} className="md:hidden" />
        </div>

        <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 py-4 md:max-lg:overflow-visible md:max-lg:px-2">
          {sections.map(section => (
            <div key={section.title || 'top'}>
              {section.title && <p className="mb-1 px-2.5 text-xs font-medium text-ink-subtle md:max-lg:sr-only">{section.title}</p>}
              <ul className="space-y-0.5">
                {section.items.map(item => {
                  const Icon = item.icon;
                  const active = currentView === item.id;
                  const name = item.label;
                  const count = item.count ?? 0;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onNavigate(item.id)}
                        aria-current={active ? 'page' : undefined}
                        className={`group relative flex h-9 w-full items-center gap-3 rounded-control px-2.5 text-sm font-medium transition-colors md:max-lg:justify-center md:max-lg:px-0 ${
                          active ? 'bg-accent-subtle text-accent-hover' : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
                        }`}
                      >
                        <Icon className={`size-4.5 shrink-0 ${active ? 'text-accent' : 'text-ink-subtle group-hover:text-ink-muted'}`} aria-hidden />
                        <span className="flex-1 truncate text-left md:max-lg:sr-only">
                          {name}
                          {count > 0 && <span className="sr-only">, {count} {item.countLabel ?? 'to do'}</span>}
                        </span>
                        {count > 0 && (
                          <>
                            <span aria-hidden className="rounded-badge bg-warning-bg px-1.5 text-xs font-medium text-warning-fg tabular-nums md:max-lg:hidden">
                              {count}
                            </span>
                            <span aria-hidden className="absolute right-2 top-1.5 hidden size-2 rounded-full bg-warning-solid ring-2 ring-surface md:max-lg:block" />
                          </>
                        )}
                        {/* Rail tooltip (md–lg only; the label is sr-only there). */}
                        <span
                          aria-hidden
                          className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-control bg-ink px-2 py-1 text-xs font-medium text-white shadow-overlay md:max-lg:group-hover:block md:max-lg:group-focus-visible:block"
                        >
                          {name}{count > 0 ? ` · ${count}` : ''}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

      </aside>
    </>
  );
}
