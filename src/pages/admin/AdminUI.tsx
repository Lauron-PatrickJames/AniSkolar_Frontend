import React, { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import {
  AlertCircle, AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock,
  FileText, Inbox, Info, MoreHorizontal, RefreshCw, RotateCcw, RotateCw, Search, Send, X, XCircle
} from 'lucide-react';
import { AppStatus, HistoryStatus, historyLabel } from './adminData';

// The admin console's component library. Pages compose these and use only
// the semantic tokens from index.css (bg-surface, text-ink-muted,
// rounded-card, ...), so spacing, colour, radius and type stay consistent.

type ElementType = React.ElementType;

// --- Tones -------------------------------------------------------------------

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

const TONE_BADGE: Record<Tone, string> = {
  neutral: 'bg-neutral-bg text-neutral-fg ring-neutral-fg/10',
  accent: 'bg-accent-subtle text-accent-hover ring-accent/15',
  success: 'bg-success-bg text-success-fg ring-success-fg/15',
  warning: 'bg-warning-bg text-warning-fg ring-warning-fg/15',
  danger: 'bg-danger-bg text-danger-fg ring-danger-fg/15',
  info: 'bg-info-bg text-info-fg ring-info-fg/15'
};

const TONE_DOT: Record<Tone, string> = {
  neutral: 'bg-neutral-solid',
  accent: 'bg-accent',
  success: 'bg-success-solid',
  warning: 'bg-warning-solid',
  danger: 'bg-danger-solid',
  info: 'bg-info-solid'
};

const TONE_ICON_CHIP: Record<Tone, string> = {
  neutral: 'bg-neutral-bg text-ink-muted',
  accent: 'bg-accent-subtle text-accent',
  success: 'bg-success-bg text-success-fg',
  warning: 'bg-warning-bg text-warning-fg',
  danger: 'bg-danger-bg text-danger-fg',
  info: 'bg-info-bg text-info-fg'
};

// Reads a colour token at runtime, for libraries (charts) that need a
// literal colour instead of a class. Keeps index.css the single source.
export function tokenColor(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim();
  return value || fallback;
}

// --- Status ------------------------------------------------------------------

export const STATUS_META: Record<AppStatus, { tone: Tone; icon: ElementType; token: string }> = {
  'Under Evaluation': { tone: 'warning', icon: Clock, token: 'warning-solid' },
  'Needs Revision': { tone: 'info', icon: RotateCcw, token: 'info-solid' },
  'Approved': { tone: 'success', icon: CheckCircle2, token: 'success-solid' },
  'Rejected': { tone: 'danger', icon: XCircle, token: 'danger-solid' }
};

const HISTORY_META: Record<HistoryStatus, { tone: Tone; icon: ElementType }> = {
  'Submitted': { tone: 'neutral', icon: FileText },
  'Resubmitted': { tone: 'neutral', icon: RefreshCw },
  'Forwarded to LSO': { tone: 'accent', icon: Send },
  ...STATUS_META
};

export function Badge({ tone = 'neutral', dot, icon: Icon, children, className = '' }: {
  tone?: Tone;
  dot?: boolean;
  icon?: ElementType;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-badge ring-1 ring-inset text-xs font-medium whitespace-nowrap ${TONE_BADGE[tone]} ${className}`}>
      {dot && <span className={`size-1.5 rounded-full shrink-0 ${TONE_DOT[tone]}`} aria-hidden />}
      {Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: AppStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META['Under Evaluation'];
  return <Badge tone={meta.tone} dot>{status}</Badge>;
}

// --- Avatar ------------------------------------------------------------------

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_SIZES = { sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-14 text-base' };

export function Avatar({ name, avatarUrl, size = 'md' }: { name: string; avatarUrl?: string; size?: keyof typeof AVATAR_SIZES }) {
  const [failed, setFailed] = useState(false);
  const dims = AVATAR_SIZES[size];
  if (avatarUrl && !failed) {
    return <img src={avatarUrl} alt="" onError={() => setFailed(true)} className={`${dims} rounded-full object-cover shrink-0 ring-1 ring-line`} />;
  }
  return (
    <span aria-hidden className={`${dims} rounded-full bg-accent-subtle text-accent font-semibold flex items-center justify-center shrink-0 capitalize`}>
      {initials(name)}
    </span>
  );
}

// --- Buttons -----------------------------------------------------------------

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-secondary';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white shadow-card hover:bg-accent-hover',
  secondary: 'bg-surface text-ink ring-1 ring-inset ring-line-strong shadow-card hover:bg-surface-muted',
  ghost: 'text-ink-muted hover:bg-neutral-bg hover:text-ink',
  danger: 'bg-danger text-white shadow-card hover:bg-danger-hover',
  'danger-secondary': 'bg-surface text-danger ring-1 ring-inset ring-danger/30 hover:bg-danger-bg'
};

const BUTTON_SIZES = {
  sm: { box: 'h-8 px-2.5 text-xs gap-1.5', square: 'size-8', icon: 'size-3.5' },
  md: { box: 'h-9 px-3.5 text-sm gap-2', square: 'size-9', icon: 'size-4' }
};

function Spinner({ className = 'size-4' }: { className?: string }) {
  return <span aria-hidden className={`${className} shrink-0 rounded-full border-2 border-current/30 border-t-current motion-safe:animate-spin`} />;
}

type ButtonProps = React.ComponentPropsWithRef<'button'> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  icon?: ElementType;
  iconRight?: ElementType;
  // Shows a spinner in place of the icon and disables the button.
  loading?: boolean;
};

export function Button({ variant = 'secondary', size = 'md', icon: Icon, iconRight: IconRight, loading, disabled, children, className = '', ...rest }: ButtonProps) {
  const s = BUTTON_SIZES[size];
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center shrink-0 rounded-control font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none ${s.box} ${BUTTON_VARIANTS[variant]} ${className}`}
    >
      {loading ? <Spinner className={s.icon} /> : Icon ? <Icon className={s.icon} aria-hidden /> : null}
      {children}
      {IconRight && <IconRight className={`${s.icon} opacity-60`} aria-hidden />}
    </button>
  );
}

// A link that looks like a Button (downloads, external pages).
export function LinkButton({ variant = 'secondary', size = 'md', icon: Icon, children, className = '', ...rest }:
  React.ComponentPropsWithRef<'a'> & { variant?: ButtonVariant; size?: 'sm' | 'md'; icon?: ElementType }) {
  const s = BUTTON_SIZES[size];
  return (
    <a {...rest} className={`inline-flex items-center justify-center shrink-0 rounded-control font-medium whitespace-nowrap transition-colors ${s.box} ${BUTTON_VARIANTS[variant]} ${className}`}>
      {Icon && <Icon className={s.icon} aria-hidden />}
      {children}
    </a>
  );
}

// Square icon-only button. `label` is required: it is the accessible name
// and the hover tooltip.
export function IconButton({ icon: Icon, label, variant = 'ghost', size = 'sm', loading, disabled, className = '', ...rest }:
  Omit<ButtonProps, 'children' | 'iconRight' | 'icon'> & { icon: ElementType; label: string }) {
  const s = BUTTON_SIZES[size];
  return (
    <button
      type="button"
      {...rest}
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center shrink-0 rounded-control transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${s.square} ${BUTTON_VARIANTS[variant]} ${className}`}
    >
      {loading ? <Spinner className={s.icon} /> : <Icon className={s.icon} aria-hidden />}
    </button>
  );
}

// --- Layout ------------------------------------------------------------------

export function PageHeader({ title, description, actions, back, meta }: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { label: string; onClick: () => void };
  meta?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      {back && (
        <button
          type="button"
          onClick={back.onClick}
          className="inline-flex items-center gap-1.5 rounded-control text-sm font-medium text-ink-muted hover:text-ink transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {back.label}
        </button>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-title font-semibold tracking-tight text-ink">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-ink-muted">{description}</p>}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
      </div>
    </div>
  );
}

// Surface for every grouped piece of content. Never clips overflow, so
// sticky table headers inside it keep working.
export function Card({ title, description, actions, children, footer, flush, className = '', headerSlot }: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  // No body padding (tables, lists that run edge to edge).
  flush?: boolean;
  className?: string;
  // Rendered between the header and body (tabs, toolbars).
  headerSlot?: React.ReactNode;
}) {
  return (
    <section className={`min-w-0 rounded-card bg-surface ring-1 ring-line shadow-card ${className}`}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-ink-subtle">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      {headerSlot}
      <div className={flush ? '' : 'p-5'}>{children}</div>
      {footer && <footer className="border-t border-line px-5 py-3">{footer}</footer>}
    </section>
  );
}

// Filter/search row placed directly under a card's header or tabs.
export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-3 border-b border-line p-4 md:flex-row md:items-center">{children}</div>;
}

export function KpiCard({ label, value, hint, icon: Icon, tone = 'neutral', active, onClick, footer, loading }: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: ElementType;
  tone?: Tone;
  active?: boolean;
  onClick?: () => void;
  footer?: React.ReactNode;
  loading?: boolean;
}) {
  const interactive = !!onClick && !loading;
  const Comp = interactive ? 'button' : 'div';
  return (
    <Comp
      type={interactive ? 'button' : undefined}
      onClick={interactive ? onClick : undefined}
      aria-pressed={interactive ? !!active : undefined}
      className={`flex h-full min-w-0 flex-col rounded-card bg-surface p-4 text-left shadow-card ring-1 transition-colors sm:p-5 ${
        active ? 'ring-2 ring-accent' : 'ring-line'
      } ${interactive ? 'hover:bg-surface-muted' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-ink-muted">{label}</p>
        {Icon && (
          <span className={`flex size-7 shrink-0 items-center justify-center rounded-control ${TONE_ICON_CHIP[tone]}`}>
            <Icon className="size-3.5" aria-hidden />
          </span>
        )}
      </div>
      {loading ? (
        <>
          <Skeleton className="mt-3 h-8 w-16" />
          <Skeleton className="mt-2 h-3 w-28" />
        </>
      ) : (
        <>
          <p className="mt-3 text-metric font-semibold tracking-tight text-ink tabular-nums">{value}</p>
          {hint && <p className="mt-1 text-xs text-ink-subtle">{hint}</p>}
          {footer && <div className="mt-auto pt-2">{footer}</div>}
        </>
      )}
    </Comp>
  );
}

export function KpiGrid({ children, columns = 4 }: { children: React.ReactNode; columns?: 3 | 4 }) {
  return (
    <div className={`grid grid-cols-2 gap-4 ${columns === 4 ? 'lg:grid-cols-4' : 'sm:grid-cols-3'}`}>
      {children}
    </div>
  );
}

// Label/value pair for read-only detail grids (inside a <dl>).
export function DetailField({ label, value }: { label: string; value?: React.ReactNode }) {
  const empty = value === undefined || value === null || value === '';
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-ink wrap-break-word">
        {empty ? <span className="font-normal text-ink-subtle">Not provided</span> : value}
      </dd>
    </div>
  );
}

// Single-line text that truncates and shows the full value on hover.
export function Truncate({ children, className = '' }: { children: string; className?: string }) {
  return <span className={`block truncate ${className}`} title={children}>{children}</span>;
}

// --- Form controls -----------------------------------------------------------

interface FieldContextValue { id: string; describedBy?: string; invalid: boolean }
const FieldContext = createContext<FieldContextValue | null>(null);

// Label above, control, then helper text or the error. Wires ids and
// aria-describedby/aria-invalid into the control automatically.
export function Field({ label, helper, error, optional, labelAside, children, className = '' }: {
  label: string;
  helper?: React.ReactNode;
  error?: string;
  optional?: boolean;
  labelAside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const messageId = `${id}-message`;
  const hasMessage = !!error || !!helper;
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
          {optional && <span className="ml-1 font-normal text-ink-subtle">(optional)</span>}
        </label>
        {labelAside && <span className="text-xs text-ink-subtle tabular-nums">{labelAside}</span>}
      </div>
      <FieldContext.Provider value={{ id, describedBy: hasMessage ? messageId : undefined, invalid: !!error }}>
        {children}
      </FieldContext.Provider>
      {error ? (
        <p id={messageId} className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-danger">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : helper ? (
        <p id={messageId} className="mt-1.5 text-xs text-ink-subtle">{helper}</p>
      ) : null}
    </div>
  );
}

function useFieldProps(props: { id?: string; 'aria-describedby'?: string; 'aria-invalid'?: React.AriaAttributes['aria-invalid'] }) {
  const field = useContext(FieldContext);
  return {
    id: props.id ?? field?.id,
    'aria-describedby': props['aria-describedby'] ?? field?.describedBy,
    'aria-invalid': props['aria-invalid'] ?? (field?.invalid || undefined)
  };
}

const CONTROL =
  'block w-full rounded-control border-0 bg-surface text-sm text-ink ring-1 ring-inset ring-line-strong placeholder:text-ink-subtle transition-shadow ' +
  'focus:ring-2 focus:ring-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-subtle ' +
  'aria-[invalid=true]:ring-danger aria-[invalid=true]:focus:ring-danger';

export function TextInput({ className = '', ...rest }: React.ComponentPropsWithRef<'input'>) {
  const field = useFieldProps(rest);
  return <input {...rest} {...field} className={`${CONTROL} h-9 px-3 ${className}`} />;
}

export function Textarea({ className = '', ...rest }: React.ComponentPropsWithRef<'textarea'>) {
  const field = useFieldProps(rest);
  return <textarea {...rest} {...field} className={`${CONTROL} px-3 py-2 leading-relaxed ${className}`} />;
}

export function Select({ value, onChange, children, className = '', label, disabled }: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
  // Accessible name when the select isn't inside a <Field>.
  label?: string;
  disabled?: boolean;
}) {
  const field = useFieldProps({});
  return (
    <div className={`relative min-w-0 ${className}`}>
      <select
        {...field}
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={field.id ? undefined : label}
        disabled={disabled}
        className={`${CONTROL} h-9 appearance-none truncate pl-3 pr-9 font-medium`}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, label, className = '' }: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={`relative min-w-0 ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={`${CONTROL} h-9 pl-9 pr-3`}
      />
    </div>
  );
}

export function Checkbox({ checked, onChange, label, description, disabled }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        aria-describedby={description ? `${id}-desc` : undefined}
        className="mt-0.5 size-4 shrink-0 rounded accent-accent disabled:cursor-not-allowed"
      />
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
        {description && <p id={`${id}-desc`} className="mt-0.5 text-xs text-ink-subtle">{description}</p>}
      </div>
    </div>
  );
}

// Two-or-more option toggle (e.g. New / Old applicant). Clicking the active
// option clears it when `allowEmpty` is set.
export function SegmentedControl<K extends string>({ options, value, onChange, label, allowEmpty }: {
  options: readonly K[];
  value: K | '';
  onChange: (value: K | '') => void;
  label: string;
  allowEmpty?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex w-full rounded-control bg-neutral-bg p-0.5">
      {options.map(option => {
        const active = value === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active && allowEmpty ? '' : option)}
            className={`h-8 flex-1 rounded-control px-3 text-sm font-medium transition-colors ${
              active ? 'bg-surface text-ink shadow-card ring-1 ring-line' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

// --- Tabs --------------------------------------------------------------------

// Underlined tabs with optional counts. Arrow keys / Home / End move
// between tabs (WAI-ARIA tabs pattern, automatic activation).
export function Tabs<K extends string>({ tabs, value, onChange, label, className = '' }: {
  tabs: { key: K; label: string; count?: number; icon?: ElementType }[];
  value: K;
  onChange: (key: K) => void;
  label: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    let next = -1;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    refs.current[next]?.focus();
    onChange(tabs[next].key);
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className={`flex gap-1 overflow-x-auto border-b border-line px-3 scrollbar-none ${className}`}
    >
      {tabs.map((tab, i) => {
        const active = tab.key === value;
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            ref={el => { refs.current[i] = el; }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={e => onKeyDown(e, i)}
            className={`relative inline-flex h-11 shrink-0 items-center gap-2 px-2.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:-outline-offset-2 ${
              active ? 'text-ink' : 'text-ink-subtle hover:text-ink'
            }`}
          >
            {Icon && <Icon className={`size-4 shrink-0 ${active ? 'text-accent' : ''}`} aria-hidden />}
            {tab.label}
            {tab.count !== undefined && (
              <span className={`rounded-badge px-1.5 py-0.5 text-xs font-medium tabular-nums ${active ? 'bg-accent-subtle text-accent-hover' : 'bg-neutral-bg text-ink-muted'}`}>
                {tab.count}
              </span>
            )}
            {active && <span aria-hidden className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        );
      })}
    </div>
  );
}

// --- Tables ------------------------------------------------------------------

// Fixed-layout table: columns take the widths set on <Th>, long text
// truncates instead of pushing the table wider than its card. The header
// sticks below the top bar while the page scrolls.
//
// `minWidth` makes the table scroll sideways inside its own container on
// narrow screens instead of squeezing its columns. Pair it with
// <Th sticky={false}>: a sticky header inside a scroll container would be
// offset against that container, not the page.
export function Table({ children, label, minWidth }: { children: React.ReactNode; label: string; minWidth?: string }) {
  const table = (
    <table
      aria-label={label}
      style={minWidth ? { minWidth } : undefined}
      className="w-full table-fixed border-separate border-spacing-0 text-sm [&>tbody>tr:last-child>td]:border-b-0"
    >
      {children}
    </table>
  );
  // `relative` keeps absolutely positioned cell content (sr-only text)
  // inside the scroll area instead of widening the page.
  return minWidth ? <div className="relative overflow-x-auto overscroll-x-contain">{table}</div> : table;
}

export function Th({ children, className = '', numeric, sticky = true }: {
  children?: React.ReactNode;
  className?: string;
  numeric?: boolean;
  sticky?: boolean;
}) {
  return (
    <th
      scope="col"
      className={`${sticky ? 'sticky top-topbar z-10' : ''} h-10 border-b border-line bg-surface-muted px-4 text-xs font-medium whitespace-nowrap text-ink-muted first:pl-5 last:pr-5 ${
        numeric ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({ children, className = '', numeric }: { children?: React.ReactNode; className?: string; numeric?: boolean }) {
  return (
    <td className={`border-b border-line px-4 py-3 align-middle text-ink-muted first:pl-5 last:pr-5 ${numeric ? 'text-right tabular-nums' : ''} ${className}`}>
      {children}
    </td>
  );
}

// Clickable row. The row's primary cell should also contain a real button
// or link so the row is reachable by keyboard.
export function Tr({ children, onClick, className = '' }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <tr onClick={onClick} className={`group transition-colors ${onClick ? 'cursor-pointer hover:bg-surface-muted' : ''} ${className}`}>
      {children}
    </tr>
  );
}

// Stacked list used in place of a table on phones.
export function MobileList({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-line md:hidden">{children}</ul>;
}

export function RowLink({ children, onClick, className = '' }: { children: React.ReactNode; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick(); }}
      title={typeof children === 'string' ? children : undefined}
      className={`block max-w-full truncate rounded-badge text-left text-sm font-medium text-ink hover:text-accent ${className}`}
    >
      {children}
    </button>
  );
}

// --- Pagination --------------------------------------------------------------

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  return {
    page: current,
    pageCount,
    total: items.length,
    pageSize,
    pageItems: items.slice((current - 1) * pageSize, current * pageSize)
  };
}

// Client-side pagination that resets to page 1 whenever `resetKey` changes.
export function usePagination<T>(items: T[], pageSize: number, resetKey: unknown) {
  const [page, setPage] = useState(1);
  const [lastKey, setLastKey] = useState(resetKey);
  if (lastKey !== resetKey) {
    setLastKey(resetKey);
    setPage(1);
  }
  const result = useMemo(() => paginate(items, page, pageSize), [items, page, pageSize]);
  return { ...result, setPage };
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
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
      <p className="text-xs text-ink-subtle tabular-nums">
        <span className="font-medium text-ink">{from}–{to}</span> of <span className="font-medium text-ink">{total}</span> {noun}
      </p>
      {pageCount > 1 && (
        <div className="flex items-center gap-1">
          <IconButton icon={ChevronLeft} label="Previous page" variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)} />
          <span className="px-2 text-xs text-ink-subtle tabular-nums" aria-current="page">Page {page} of {pageCount}</span>
          <IconButton icon={ChevronRight} label="Next page" variant="secondary" disabled={page >= pageCount} onClick={() => onChange(page + 1)} />
        </div>
      )}
    </nav>
  );
}

// --- Feedback ----------------------------------------------------------------

export function EmptyState({ icon: Icon = Inbox, title, description, action }: {
  icon?: ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-6 py-14 text-center">
      <span className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-neutral-bg text-ink-subtle">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

// Inline load failure, in place of the content that failed to load.
export function ErrorState({ title = 'Something went wrong', message, onRetry, retrying }: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div role="alert" className="px-6 py-14 text-center">
      <span className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-danger-bg text-danger">
        <AlertTriangle className="size-5" aria-hidden />
      </span>
      <p className="text-sm font-medium text-ink">{title}</p>
      {message && <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">{message}</p>}
      {onRetry && (
        <div className="mt-4">
          <Button icon={RotateCw} loading={retrying} onClick={onRetry}>Try again</Button>
        </div>
      )}
    </div>
  );
}

const ALERT_ICONS: Record<Tone, ElementType> = {
  neutral: Info,
  accent: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
  info: Info
};

const ALERT_STYLES: Record<Tone, string> = {
  neutral: 'bg-surface-muted text-ink ring-line',
  accent: 'bg-accent-subtle text-ink ring-accent/20',
  success: 'bg-success-bg text-success-fg ring-success-fg/15',
  warning: 'bg-warning-bg text-warning-fg ring-warning-fg/15',
  danger: 'bg-danger-bg text-danger-fg ring-danger-fg/15',
  info: 'bg-info-bg text-info-fg ring-info-fg/15'
};

const ALERT_ICON_COLOR: Record<Tone, string> = {
  neutral: 'text-ink-subtle',
  accent: 'text-accent',
  success: '',
  warning: '',
  danger: '',
  info: ''
};

// Inline message: confirmations, warnings, non-blocking errors.
export function Alert({ tone = 'neutral', icon, title, children, action, onDismiss }: {
  tone?: Tone;
  icon?: ElementType;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  onDismiss?: () => void;
}) {
  const Icon = icon ?? ALERT_ICONS[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-control px-3.5 py-3 text-sm ring-1 ring-inset ${ALERT_STYLES[tone]}`}
    >
      <Icon className={`mt-0.5 size-4 shrink-0 ${ALERT_ICON_COLOR[tone]}`} aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="-m-1 shrink-0 rounded-badge p-1 opacity-70 hover:opacity-100">
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`block rounded-badge bg-neutral-bg motion-safe:animate-pulse ${className}`} />;
}

// Placeholder rows shaped like the tables (avatar, two lines, badge).
export function TableSkeleton({ rows = 6, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-3.5">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-40 max-w-full" />
            <Skeleton className="h-2.5 w-64 max-w-full" />
          </div>
          <Skeleton className="hidden h-3 w-24 sm:block" />
          <Skeleton className="h-6 w-28" />
        </div>
      ))}
    </div>
  );
}

// --- Modal -------------------------------------------------------------------

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

const MODAL_SIZES = { sm: 'sm:max-w-md', md: 'sm:max-w-2xl', lg: 'sm:max-w-4xl' };

// Accessible dialog: rendered in a portal, traps Tab focus, closes on
// Escape or backdrop click (unless `dismissible` is false, e.g. while
// saving), and returns focus to whatever opened it. Mount it only while
// open: {open && <Modal …/>}.
export function Modal({ title, description, children, footer, onClose, size = 'md', dismissible = true, initialFocusRef, role = 'dialog', icon, bodyClassName = 'p-5' }: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  size?: keyof typeof MODAL_SIZES;
  dismissible?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  role?: 'dialog' | 'alertdialog';
  icon?: React.ReactNode;
  bodyClassName?: string;
}) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  onCloseRef.current = onClose;
  dismissibleRef.current = dismissible;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const firstInBody = bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (initialFocusRef?.current ?? firstInBody ?? panel)?.focus();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissibleRef.current) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null);
      if (focusables.length === 0) { e.preventDefault(); return; }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
    // Runs once per mount; callbacks are read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div data-admin className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-ink/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        onClick={() => { if (dismissibleRef.current) onCloseRef.current(); }}
      />
      <motion.div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className={`relative flex max-h-[92dvh] w-full flex-col rounded-t-card bg-surface text-ink shadow-overlay outline-none sm:max-h-[88dvh] sm:rounded-card ${MODAL_SIZES[size]}`}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-line px-5 py-4">
          {icon}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-ink">{title}</h2>
            {description && <div id={descId} className="mt-0.5 text-sm text-ink-muted">{description}</div>}
          </div>
          {dismissible && <IconButton icon={X} label="Close" onClick={() => onCloseRef.current()} className="-mr-1.5 -mt-1" />}
        </header>
        {children !== undefined && (
          <div ref={bodyRef} className={`min-h-0 flex-1 overflow-y-auto ${bodyClassName}`}>{children}</div>
        )}
        {footer && (
          <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-line bg-surface-muted px-5 py-3 sm:flex-row sm:justify-end sm:rounded-b-card">
            {footer}
          </footer>
        )}
      </motion.div>
    </div>,
    document.body
  );
}

// Confirmation for consequential actions. Focus starts on Cancel; errors
// from the action show inside the dialog, which stays open until it
// succeeds or is cancelled.
export function ConfirmDialog({ title, description, children, confirmLabel, confirmIcon, tone = 'primary', onConfirm, onCancel, busy, error }: {
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel: string;
  confirmIcon?: ElementType;
  tone?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      role="alertdialog"
      size="sm"
      title={title}
      description={description}
      onClose={onCancel}
      dismissible={!busy}
      initialFocusRef={cancelRef}
      icon={tone === 'danger' ? (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-danger-bg text-danger">
          <AlertTriangle className="size-4.5" aria-hidden />
        </span>
      ) : undefined}
      footer={
        <>
          <Button ref={cancelRef} onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant={tone} icon={confirmIcon} loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      {(children || error) && (
        <div className="space-y-3">
          {children}
          {error && <Alert tone="danger">{error}</Alert>}
        </div>
      )}
    </Modal>
  );
}

// --- Menu --------------------------------------------------------------------

// Dropdown menu button (WAI-ARIA menu button): opens with click, Enter,
// Space or ArrowDown; arrows/Home/End move between items; Escape closes
// and returns focus to the trigger.
export function Menu({ label, icon, items, disabled, loading, align = 'end' }: {
  label: string;
  icon?: ElementType;
  items: { key: string; label: string; icon?: ElementType; onSelect: () => void }[];
  disabled?: boolean;
  loading?: boolean;
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const index = itemRefs.current.findIndex(el => el === document.activeElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = (index + 1) % items.length;
    else if (e.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
    else if (e.key === 'Tab') { close(false); return; }
    if (next < 0) return;
    e.preventDefault();
    itemRefs.current[next]?.focus();
  };

  return (
    <div ref={rootRef} className="relative">
      <Button
        ref={triggerRef}
        icon={icon}
        iconRight={ChevronDown}
        loading={loading}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } }}
      >
        {label}
      </Button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className={`absolute z-40 mt-1.5 w-56 rounded-control bg-surface py-1 shadow-overlay ${align === 'end' ? 'right-0' : 'left-0'}`}
        >
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                ref={el => { itemRefs.current[i] = el; }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => { close(true); item.onSelect(); }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-ink hover:bg-surface-muted focus:bg-surface-muted focus-visible:outline-none"
              >
                {Icon && <Icon className="size-4 shrink-0 text-ink-subtle" aria-hidden />}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Positions a fixed overlay next to its anchor, flipping to the other side
// when it would run off the viewport. Overlays render in a portal so a
// scrolling table (overflow-x-auto) can't clip them.
function useAnchoredPosition(
  open: boolean,
  anchorRef: React.RefObject<HTMLElement | null>,
  overlayRef: React.RefObject<HTMLElement | null>,
  placement: 'below-end' | 'below-start' | 'above'
) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const anchor = anchorRef.current?.getBoundingClientRect();
    const overlay = overlayRef.current?.getBoundingClientRect();
    if (!anchor || !overlay) return;
    const gap = 6;
    const margin = 8;
    let top: number;
    let left: number;
    if (placement === 'above') {
      top = anchor.top - overlay.height - gap;
      if (top < margin) top = anchor.bottom + gap;
      left = anchor.left + anchor.width / 2 - overlay.width / 2;
    } else {
      top = anchor.bottom + gap;
      if (top + overlay.height > window.innerHeight - margin) top = Math.max(margin, anchor.top - overlay.height - gap);
      left = placement === 'below-end' ? anchor.right - overlay.width : anchor.left;
    }
    left = Math.min(Math.max(margin, left), window.innerWidth - overlay.width - margin);
    setPos({ top, left });
  }, [open, anchorRef, overlayRef, placement]);
  return pos;
}

export interface DropdownMenuItem {
  key: string;
  label: string;
  icon?: ElementType;
  onSelect: () => void;
  tone?: 'danger';
}

// Overflow (⋯) menu for table rows and toolbars — the WAI-ARIA menu button
// pattern, like <Menu>, with an icon trigger. Opens with click, Enter,
// Space or ArrowDown; arrows/Home/End move between items; Escape closes
// and returns focus to the trigger. Clicks never reach the row behind it.
export function DropdownMenu({ label, items, icon = MoreHorizontal, align = 'end' }: {
  label: string;
  items: DropdownMenuItem[];
  icon?: ElementType;
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const pos = useAnchoredPosition(open, triggerRef, menuRef, align === 'end' ? 'below-end' : 'below-start');
  const positioned = pos !== null;

  // The menu stays hidden until it's positioned, and hidden items can't
  // take focus, so focus the first item once it's placed.
  useEffect(() => {
    if (open && positioned) itemRefs.current[0]?.focus();
  }, [open, positioned]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    // The menu is positioned once; close it rather than let it drift when
    // the page or a table scrolls underneath.
    const onScrollOrResize = (e: Event) => {
      if (e.type === 'scroll' && menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const index = itemRefs.current.findIndex(el => el === document.activeElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = (index + 1) % items.length;
    else if (e.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
    else if (e.key === 'Tab') { close(false); return; }
    if (next < 0) return;
    e.preventDefault();
    itemRefs.current[next]?.focus();
  };

  return (
    <>
      <IconButton
        ref={triggerRef}
        icon={icon}
        label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        onKeyDown={e => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } }}
        className={open ? 'bg-surface-muted text-ink' : ''}
      />
      {open && createPortal(
        // React events bubble through portals to the row; stop them here.
        <div data-admin onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
            style={{ position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
            className="z-50 w-52 rounded-control bg-surface py-1 shadow-overlay"
          >
            {items.map((item, i) => {
              const Icon = item.icon;
              const danger = item.tone === 'danger';
              return (
                <button
                  key={item.key}
                  ref={el => { itemRefs.current[i] = el; }}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => { close(true); item.onSelect(); }}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-surface-muted focus:bg-surface-muted focus-visible:outline-none ${
                    danger ? 'text-danger-fg' : 'text-ink'
                  }`}
                >
                  {Icon && <Icon className={`size-4 shrink-0 ${danger ? 'text-danger-fg' : 'text-ink-subtle'}`} aria-hidden />}
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// Short supplementary text on hover or keyboard focus. The trigger is
// focusable and described by the tooltip, so the text reaches keyboard and
// screen-reader users too. Keep essential information out of tooltips.
export function Tooltip({ content, children, className = '' }: {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const pos = useAnchoredPosition(open, triggerRef, tipRef, 'above');

  useEffect(() => {
    if (!open) return;
    const hide = () => setOpen(false);
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [open]);

  return (
    <>
      <span
        ref={triggerRef}
        tabIndex={0}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
        className={`inline-flex items-center rounded-badge ${className}`}
      >
        {children}
      </span>
      {open && createPortal(
        <div
          ref={tipRef}
          id={id}
          role="tooltip"
          style={{ position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
          className="pointer-events-none z-60 max-w-xs rounded-control bg-ink px-2.5 py-1.5 text-xs leading-relaxed text-surface shadow-overlay"
        >
          {content}
        </div>,
        document.body
      )}
    </>
  );
}

// --- Timeline ----------------------------------------------------------------

export interface TimelineEntry {
  key: string;
  status: HistoryStatus;
  changedAt: string;
  changedBy?: string;
  note?: string;
  // Extra context line (e.g. which scholarship the entry belongs to).
  context?: React.ReactNode;
}

export function Timeline({ entries, empty, formatTime }: {
  entries: TimelineEntry[];
  empty: string;
  formatTime: (iso: string) => string;
}) {
  if (entries.length === 0) return <p className="text-sm text-ink-muted">{empty}</p>;
  return (
    <ol>
      {entries.map((entry, idx) => {
        const meta = HISTORY_META[entry.status] ?? HISTORY_META['Under Evaluation'];
        const Icon = meta.icon;
        const last = idx === entries.length - 1;
        return (
          <li key={entry.key} className="relative flex gap-3 pb-5 last:pb-0">
            {!last && <span aria-hidden className="absolute bottom-0 left-3.5 top-8 w-px bg-line" />}
            <span className={`relative flex size-7 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ${TONE_BADGE[meta.tone]}`}>
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <p className="text-sm font-medium text-ink">{historyLabel(entry.status)}</p>
                <time dateTime={entry.changedAt} className="text-xs text-ink-subtle tabular-nums">{formatTime(entry.changedAt)}</time>
              </div>
              {entry.context && <div className="mt-1">{entry.context}</div>}
              {entry.changedBy && (
                <p className="mt-0.5 text-xs text-ink-subtle">by {entry.changedBy === 'student' ? 'Student' : entry.changedBy}</p>
              )}
              {entry.note && <Quote className="mt-2">{entry.note}</Quote>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// Quoted free text (review notes, history notes).
export function Quote({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`rounded-control bg-surface-muted px-3 py-2 text-sm text-ink-muted ring-1 ring-inset ring-line wrap-break-word whitespace-pre-line ${className}`}>
      {children}
    </p>
  );
}
