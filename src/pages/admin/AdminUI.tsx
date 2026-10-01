import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronLeft, ChevronRight, Inbox, Search } from 'lucide-react';

// Shared building blocks for every admin page (applications, statistics,
// scholars, announcements). One place for the admin visual language:
// white panels on a soft slate canvas, sentence-case headings, a single
// brand accent, and quiet status colours. Pages compose these instead of
// styling cards/buttons/tables by hand.

// --- Status ------------------------------------------------------------------

export type AppStatus = 'Under Evaluation' | 'Approved' | 'Rejected' | 'Needs Revision';

export const STATUS_STYLES: Record<AppStatus, { badge: string; dot: string; text: string }> = {
  'Under Evaluation': { badge: 'bg-amber-50 text-amber-800 ring-amber-600/15', dot: 'bg-amber-500', text: 'text-amber-700' },
  'Approved': { badge: 'bg-emerald-50 text-emerald-800 ring-emerald-600/15', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  'Rejected': { badge: 'bg-rose-50 text-rose-800 ring-rose-600/15', dot: 'bg-rose-500', text: 'text-rose-700' },
  'Needs Revision': { badge: 'bg-sky-50 text-sky-800 ring-sky-600/15', dot: 'bg-sky-500', text: 'text-sky-700' }
};

export function StatusBadge({ status }: { status: AppStatus }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES['Under Evaluation'];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md ring-1 ring-inset text-xs font-medium whitespace-nowrap ${style.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
      {status}
    </span>
  );
}

// Neutral tag (form type, office, cycle...).
export function Tag({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'green' | 'blue' | 'amber' | 'rose' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600 ring-slate-500/10',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
    blue: 'bg-sky-50 text-sky-700 ring-sky-600/15',
    amber: 'bg-amber-50 text-amber-700 ring-amber-600/15',
    rose: 'bg-rose-50 text-rose-700 ring-rose-600/15'
  };
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md ring-1 ring-inset text-[11px] font-medium whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  );
}

// --- Avatar --------------------------------------------------------------------

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AdminAvatar({ name, avatarUrl, size = 'md' }: { name: string; avatarUrl?: string; size?: 'sm' | 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false);
  const dims = size === 'lg' ? 'w-14 h-14 text-lg' : size === 'sm' ? 'w-8 h-8 text-[11px]' : 'w-10 h-10 text-xs';
  if (avatarUrl && !failed) {
    return <img src={avatarUrl} alt={name} onError={() => setFailed(true)} className={`${dims} rounded-full object-cover shrink-0 ring-1 ring-slate-200`} />;
  }
  return (
    <div className={`${dims} rounded-full bg-emerald-50 text-brand-green ring-1 ring-emerald-600/15 font-semibold flex items-center justify-center shrink-0`}>
      {initials(name)}
    </div>
  );
}

// --- Layout ----------------------------------------------------------------------

export function PageHeader({ title, description, actions, children }: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">{title}</h1>
        {description && <p className="text-sm text-slate-500 mt-1 max-w-2xl">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Panel({ title, description, actions, children, className = '', bodyClassName = 'p-5 sm:p-6', footer }: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  footer?: React.ReactNode;
}) {
  return (
    <section className={`bg-white rounded-xl border border-slate-200/80 shadow-[0_1px_2px_rgba(16,24,40,0.04)] min-w-0 ${className}`}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
            {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
      {footer && <footer className="px-5 sm:px-6 py-3 border-t border-slate-100">{footer}</footer>}
    </section>
  );
}

// --- KPI -------------------------------------------------------------------------

export type Tone = 'slate' | 'green' | 'amber' | 'sky' | 'rose' | 'violet';

const TONE_ICON: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-600',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  sky: 'bg-sky-50 text-sky-700',
  rose: 'bg-rose-50 text-rose-700',
  violet: 'bg-violet-50 text-violet-700'
};

export function KpiCard({ label, value, hint, icon: Icon, tone = 'slate', active, onClick, footer }: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ElementType;
  tone?: Tone;
  active?: boolean;
  onClick?: () => void;
  footer?: React.ReactNode;
}) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`text-left bg-white rounded-xl border p-4 sm:p-5 min-w-0 transition-all shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${
        active ? 'border-brand-green ring-1 ring-brand-green' : 'border-slate-200/80'
      } ${onClick ? 'hover:border-slate-300 hover:shadow-sm focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green/40' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {Icon && (
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${TONE_ICON[tone]}`}>
            <Icon className="w-3.5 h-3.5" />
          </span>
        )}
      </div>
      <p className="text-2xl sm:text-[28px] leading-none font-semibold text-slate-900 tracking-tight mt-3 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-slate-500 mt-2">{hint}</p>}
      {footer && <div className="mt-2">{footer}</div>}
    </Comp>
  );
}

// --- Controls ----------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'info';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-green text-white hover:bg-brand-green-dark shadow-sm',
  secondary: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 shadow-sm',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  danger: 'bg-white text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50',
  success: 'bg-brand-green text-white hover:bg-brand-green-dark shadow-sm',
  info: 'bg-white text-sky-700 ring-1 ring-inset ring-sky-200 hover:bg-sky-50'
};

export function Button({ variant = 'secondary', size = 'md', icon: Icon, iconRight, children, className = '', loading, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  icon?: React.ElementType;
  iconRight?: React.ReactNode;
  loading?: boolean;
}) {
  const sizes = size === 'sm' ? 'px-2.5 py-1.5 text-xs gap-1.5' : 'px-3.5 py-2 text-sm gap-2';
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green/40 disabled:opacity-50 disabled:cursor-not-allowed ${sizes} ${BUTTON_VARIANTS[variant]} ${className}`}
    >
      {loading ? (
        <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
      ) : Icon ? (
        <Icon className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      ) : null}
      {children}
      {iconRight}
    </button>
  );
}

export const controlClass =
  'w-full border-0 ring-1 ring-inset ring-slate-300 rounded-lg text-sm bg-white text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-brand-green transition-shadow';

export function SearchInput({ value, onChange, placeholder, className = '' }: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={`relative min-w-0 ${className}`}>
      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${controlClass} pl-9 pr-3 py-2`}
      />
    </div>
  );
}

export function SelectInput({ value, onChange, children, className = '', ariaLabel }: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={ariaLabel}
        className={`${controlClass} appearance-none pl-3 pr-9 py-2 font-medium text-slate-700`}
      >
        {children}
      </select>
      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  );
}

// Underlined tabs with optional counts (status filters, detail sections).
export function TabBar<K extends string>({ tabs, value, onChange, className = '' }: {
  tabs: { key: K; label: string; count?: number; icon?: React.ElementType }[];
  value: K;
  onChange: (key: K) => void;
  className?: string;
}) {
  return (
    <div className={`flex gap-1 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden border-b border-slate-200 ${className}`} role="tablist">
      {tabs.map(tab => {
        const active = tab.key === value;
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            className={`relative inline-flex items-center gap-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors focus:outline-hidden ${
              active ? 'text-brand-green' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {Icon && <Icon className="w-4 h-4 shrink-0" />}
            {tab.label}
            {tab.count !== undefined && (
              <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-semibold tabular-nums ${active ? 'bg-emerald-50 text-brand-green' : 'bg-slate-100 text-slate-500'}`}>
                {tab.count}
              </span>
            )}
            {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-green" />}
          </button>
        );
      })}
    </div>
  );
}

// --- Tables ------------------------------------------------------------------------

export function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <th scope="col" className={`px-4 py-3 text-left text-xs font-medium text-slate-500 whitespace-nowrap ${className}`}>{children}</th>;
}

export function Td({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 text-sm text-slate-600 align-middle ${className}`}>{children}</td>;
}

// Client-side pagination; resets to page 1 whenever `resetKey` changes
// (e.g. a filter or search term).
export function usePagination<T>(items: T[], pageSize: number, resetKey: unknown) {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [resetKey]);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pageCount);
  const pageItems = useMemo(() => items.slice((current - 1) * pageSize, current * pageSize), [items, current, pageSize]);
  return { page: current, setPage, pageCount, pageItems, total: items.length, pageSize };
}

export function Pagination({ page, pageCount, total, pageSize, onChange, noun = 'results' }: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
  noun?: string;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-slate-500">
        Showing <span className="font-medium text-slate-700">{from}–{to}</span> of <span className="font-medium text-slate-700">{total}</span> {noun}
      </p>
      {pageCount > 1 && (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="secondary" icon={ChevronLeft} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
            <span className="hidden sm:inline">Previous</span>
          </Button>
          <span className="px-2 text-xs text-slate-500 tabular-nums">{page} / {pageCount}</span>
          <Button size="sm" variant="secondary" disabled={page >= pageCount} onClick={() => onChange(page + 1)} aria-label="Next page" iconRight={<ChevronRight className="w-3.5 h-3.5" />}>
            <span className="hidden sm:inline">Next</span>
          </Button>
        </div>
      )}
    </div>
  );
}

// --- Feedback ------------------------------------------------------------------------

export function EmptyState({ icon: Icon = Inbox, title, description, action }: {
  icon?: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="py-14 px-6 text-center">
      <div className="w-11 h-11 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {description && <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="p-3.5 bg-rose-50 text-rose-800 rounded-lg ring-1 ring-inset ring-rose-200 text-sm flex items-center gap-2">
      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-slate-100">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5 animate-pulse">
          <div className="w-8 h-8 rounded-full bg-slate-100" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-40 bg-slate-100 rounded" />
            <div className="h-2.5 w-64 bg-slate-100 rounded" />
          </div>
          <div className="h-5 w-24 bg-slate-100 rounded-md" />
        </div>
      ))}
    </div>
  );
}

// Label/value pair for read-only detail grids.
export function DetailField({ label, value }: { label: string; value?: React.ReactNode }) {
  const empty = value === undefined || value === null || value === '';
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900 font-medium mt-0.5 wrap-break-word">{empty ? <span className="text-slate-300">—</span> : value}</dd>
    </div>
  );
}
