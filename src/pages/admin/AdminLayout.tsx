import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { Award, BarChart3, Building2, Calculator, ChevronRight, Clock, GraduationCap, LayoutList, LogOut, Megaphone, Menu, RefreshCw, X } from 'lucide-react';
import logo from '../../assets/logo.png';
import { Avatar, Badge, IconButton } from './AdminUI';

export type MainView = 'applications' | 'renewals' | 'dutyHours' | 'analytics' | 'fse' | 'lifecycle' | 'announcements' | 'scholarships';

export const VIEW_TITLES: Record<MainView, string> = {
  applications: 'Applications',
  renewals: 'Renewals',
  dutyHours: 'Duty hours',
  analytics: 'Statistics',
  fse: 'FSE report',
  lifecycle: 'Scholars',
  announcements: 'Announcements',
  scholarships: 'Scholarships'
};

const SECTIONS: { title: string; items: { id: MainView; icon: React.ElementType }[] }[] = [
  { title: 'Review', items: [{ id: 'applications', icon: LayoutList }, { id: 'renewals', icon: RefreshCw }, { id: 'lifecycle', icon: GraduationCap }, { id: 'dutyHours', icon: Clock }] },
  { title: 'Insights', items: [{ id: 'analytics', icon: BarChart3 }, { id: 'fse', icon: Calculator }] },
  { title: 'Communication', items: [{ id: 'announcements', icon: Megaphone }] },
  { title: 'Manage', items: [{ id: 'scholarships', icon: Award }] }
];

export interface Crumb {
  label: string;
  onClick?: () => void;
}

interface AdminLayoutProps {
  currentView: MainView;
  onNavigate: (view: MainView) => void;
  onLogout: () => void;
  adminEmail?: string;
  officeLabel: string;
  pendingCount?: number;
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
  currentView, onNavigate, onLogout, adminEmail, officeLabel, pendingCount, hiddenViews = [], breadcrumbs, pageKey, children
}: AdminLayoutProps) {
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
          onNavigate={view => { onNavigate(view); closeDrawer(); }}
          open={drawerOpen}
          onClose={closeDrawer}
          onLogout={onLogout}
          adminEmail={adminEmail}
          officeLabel={officeLabel}
          pendingCount={pendingCount}
          hiddenViews={hiddenViews}
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
            <Badge icon={Building2} className="hidden sm:inline-flex">{officeLabel}</Badge>
          </header>

          <main id="admin-main" tabIndex={-1} className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>
      </div>
    </MotionConfig>
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

function Sidebar({ currentView, onNavigate, open, onClose, onLogout, adminEmail, officeLabel, pendingCount, hiddenViews }: {
  currentView: MainView;
  onNavigate: (view: MainView) => void;
  open: boolean;
  onClose: () => void;
  onLogout: () => void;
  adminEmail?: string;
  officeLabel: string;
  pendingCount?: number;
  hiddenViews: MainView[];
}) {
  const sections = SECTIONS
    .map(section => ({ ...section, items: section.items.filter(item => !hiddenViews.includes(item.id)) }))
    .filter(section => section.items.length > 0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const displayName = adminEmail?.split('@')[0].replace(/[._-]+/g, ' ') || 'Administrator';

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
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface ring-1 ring-line">
              <img src={logo} alt="" className="size-6 object-contain" />
            </span>
            <div className="min-w-0 md:max-lg:sr-only">
              <p className="truncate text-sm font-semibold leading-tight text-accent">AniSkolar</p>
              <p className="truncate text-xs leading-tight text-ink-subtle">Admin console</p>
            </div>
          </div>
          <IconButton ref={closeRef} icon={X} label="Close navigation" onClick={onClose} className="md:hidden" />
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4 md:max-lg:overflow-visible md:max-lg:px-2">
          {sections.map(section => (
            <div key={section.title}>
              <p className="mb-1 px-2.5 text-xs font-medium text-ink-subtle md:max-lg:sr-only">{section.title}</p>
              <ul className="space-y-0.5">
                {section.items.map(item => {
                  const Icon = item.icon;
                  const active = currentView === item.id;
                  const name = VIEW_TITLES[item.id];
                  const count = item.id === 'applications' ? pendingCount ?? 0 : 0;
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
                          {count > 0 && <span className="sr-only">, {count} awaiting review</span>}
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

        <div className="shrink-0 border-t border-line p-3 md:max-lg:px-2">
          <div className="flex items-center gap-3 px-1 md:max-lg:justify-center md:max-lg:px-0">
            <span className="md:max-lg:hidden"><Avatar name={displayName} size="sm" /></span>
            <div className="min-w-0 flex-1 md:max-lg:hidden">
              <p className="truncate text-sm font-medium capitalize text-ink">{displayName}</p>
              <p className="truncate text-xs text-ink-subtle">{officeLabel}</p>
            </div>
            <IconButton icon={LogOut} label="Sign out" onClick={onLogout} />
          </div>
        </div>
      </aside>
    </>
  );
}
