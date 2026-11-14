import { phoneChars } from '../../utils/numericInput';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { AlertCircle, Check, ChevronDown, FileText, Plus, Trash2, Upload, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DocumentSlot, GrantApplicationDetails, Scholarship, StoredDocument } from '../../types';
import { FieldErrors, getIn } from '../../utils/grantForms';
import { SCHOOLS, SCHOOL_LIST_ID, findSchool } from '../../data/schools';

// Form primitives for the grant-form wizard. Every input is bound to the
// form state by a dot path (e.g. "evaluationSheet.travel.hasPassport"),
// read and written through GrantFormContext, so the section components
// stay declarative.

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export interface GrantFormContextValue {
  scholarship: Scholarship;
  values: GrantApplicationDetails;
  setValue: (path: string, value: unknown) => void;
  errors: FieldErrors;
  // Uploads, keyed by document slot.
  files: Record<string, File[]>;
  storedDocs: Record<string, StoredDocument[]>;   // already on record (resubmit)
  variants: Record<string, string>;
  addFiles: (slot: DocumentSlot, files: File[]) => string | null;   // returns an error message
  removeFile: (slotKey: string, index: number) => void;
  setVariant: (slotKey: string, variant: string) => void;
}

const GrantFormContext = createContext<GrantFormContextValue | null>(null);

export const GrantFormProvider = GrantFormContext.Provider;

export function useGrantForm(): GrantFormContextValue {
  const ctx = useContext(GrantFormContext);
  if (!ctx) throw new Error('useGrantForm must be used inside GrantFormProvider');
  return ctx;
}

export function useField<T = any>(path: string): [T, (value: T) => void, string | undefined] {
  const { values, setValue, errors } = useGrantForm();
  return [getIn(values, path) as T, (value: T) => setValue(path, value), errors[path]];
}

// --- Styles ------------------------------------------------------------------
// Same look as the rest of the app (AdminUI's Field / TextInput): white
// fields with a thin ring, the accent ring on focus, the danger ring on error.

const CONTROL =
  // 16px text on phones so iOS doesn't zoom into a focused field.
  'block w-full rounded-control border-0 bg-surface px-3 py-2 text-base sm:text-sm text-ink ring-1 ring-inset placeholder:text-ink-subtle transition-shadow ' +
  'focus:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-subtle';
export const inputClass = `${CONTROL} ring-line-strong focus:ring-accent`;
export const errorInputClass = `${CONTROL} ring-danger focus:ring-danger`;
export const labelClass = 'flex items-baseline gap-1 text-sm font-medium text-ink mb-1.5';

export function Req() {
  return <span className="text-danger" aria-hidden>*</span>;
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-danger">
      <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  );
}

export function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs text-ink-subtle">{children}</p>;
}

export function SubHeading({ children, note }: { children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-ink">{children}</h3>
      {note && <p className="mt-0.5 text-xs text-ink-subtle">{note}</p>}
    </div>
  );
}

export function Block({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`border-t border-line pt-6 first:border-t-0 first:pt-0 ${className}`}>{children}</div>;
}

interface BaseProps {
  path: string;
  label: React.ReactNode;
  required?: boolean;
  hint?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

function Labelled({ label, required, error, hint, className, children }: {
  label: React.ReactNode; required?: boolean; error?: string; hint?: React.ReactNode; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={`min-w-0 ${className ?? ''}`}>
      <label className={labelClass}>{label} {required && <Req />}</label>
      {children}
      {error ? <FieldError message={error} /> : hint ? <Hint>{hint}</Hint> : null}
    </div>
  );
}

export function TextField({ path, label, required, hint, className, disabled, type = 'text', placeholder, maxLength }: BaseProps & {
  type?: 'text' | 'email' | 'tel' | 'date';
  placeholder?: string;
  maxLength?: number;
}) {
  const [value, setValue, error] = useField<string>(path);
  return (
    <Labelled label={label} required={required} error={error} hint={hint} className={className}>
      <input
        type={type}
        value={value ?? ''}
        onChange={e => setValue(type === 'tel' ? phoneChars(e.target.value) : e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength ?? (type === 'tel' ? 20 : undefined)}
        disabled={disabled}
        inputMode={type === 'tel' ? 'tel' : undefined}
        className={error ? errorInputClass : inputClass}
        aria-invalid={!!error}
      />
    </Labelled>
  );
}

// The list of schools for every school input on the page (render once).
export function SchoolDatalist() {
  return (
    <datalist id={SCHOOL_LIST_ID}>
      {SCHOOLS.map(s => <option key={s.name} value={s.name}>{s.city}</option>)}
    </datalist>
  );
}

export const SCHOOL_HINT = 'Start typing to search. Not on the list? Type the school’s full name.';

// A school name: search the list or type one that isn't listed. Picking a
// listed school fills in its type and, if empty, its address.
export function SchoolField({ path, typePath, addressPath, label, required, hint = SCHOOL_HINT, className, disabled }: BaseProps & {
  typePath?: string;
  addressPath?: string;
}) {
  const { values, setValue, errors } = useGrantForm();
  const value = (getIn(values, path) as string) ?? '';
  const error = errors[path];
  const onChange = (next: string) => {
    setValue(path, next);
    const school = findSchool(next);
    if (!school) return;
    if (typePath) setValue(typePath, school.type);
    if (addressPath && !String(getIn(values, addressPath) ?? '').trim()) setValue(addressPath, school.city);
  };
  return (
    <Labelled label={label} required={required} error={error} hint={hint} className={className}>
      <input
        type="text"
        list={SCHOOL_LIST_ID}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        autoComplete="off"
        placeholder="Search for your school"
        className={error ? errorInputClass : inputClass}
        aria-invalid={!!error}
      />
    </Labelled>
  );
}

// Numbers are stored as numbers. The input keeps its own text so the user
// can clear it while typing; blank commits as 0 (or null with allowEmpty).
export function NumberField({ path, label, required, hint, className, disabled, peso, allowEmpty, integer, min = 0, max, placeholder }: BaseProps & {
  peso?: boolean;
  allowEmpty?: boolean;
  integer?: boolean;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  const [value, setValue, error] = useField<number | null>(path);
  const [text, setText] = useState(value === null || value === undefined ? '' : String(value));

  useEffect(() => {
    const parsed = text.trim() === '' ? (allowEmpty ? null : 0) : Number(text);
    if (parsed !== value) setText(value === null || value === undefined ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = (raw: string) => {
    setText(raw);
    if (raw.trim() === '') {
      setValue(allowEmpty ? null : 0);
      return;
    }
    const n = Number(raw);
    if (!Number.isNaN(n)) setValue(integer ? Math.trunc(n) : n);
  };

  return (
    <Labelled label={label} required={required} error={error} hint={hint} className={className}>
      <div className="relative">
        {peso && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-ink-subtle">₱</span>}
        <input
          type="number"
          inputMode={integer ? 'numeric' : 'decimal'}
          min={min}
          max={max}
          step={integer ? 1 : peso ? 0.01 : 'any'}
          value={text}
          onChange={e => commit(e.target.value)}
          onBlur={() => { if (!allowEmpty && text.trim() === '') setText('0'); }}
          placeholder={placeholder ?? (allowEmpty ? '' : '0')}
          disabled={disabled}
          className={`${error ? errorInputClass : inputClass} ${peso ? 'pl-7' : ''}`}
          aria-invalid={!!error}
        />
      </div>
    </Labelled>
  );
}

export function SelectField({ path, label, required, hint, className, disabled, options, placeholder = 'Select…' }: BaseProps & {
  options: readonly string[];
  placeholder?: string;
}) {
  const [value, setValue, error] = useField<string>(path);
  return (
    <Labelled label={label} required={required} error={error} hint={hint} className={className}>
      <div className="relative">
        <select
          value={value ?? ''}
          onChange={e => setValue(e.target.value)}
          disabled={disabled}
          className={`${error ? errorInputClass : inputClass} appearance-none truncate pr-9 ${value ? '' : 'text-ink-subtle'}`}
          aria-invalid={!!error}
        >
          <option value="" disabled>{placeholder}</option>
          {options.map(o => <option key={o} value={o} className="text-ink">{o}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
      </div>
    </Labelled>
  );
}

// Single choice as a segmented control (Yes/No, Public/Private, ...), the
// same control as the parent status on the profile form. Presentational;
// ChoiceField below binds it to the form context.
export function ChoicePills({ value, onChange, options, disabled, invalid }: {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-invalid={invalid || undefined}
      className={`inline-flex max-w-full flex-wrap rounded-control bg-surface-muted p-0.5 ring-1 ring-inset ${invalid ? 'ring-danger' : 'ring-line'}`}
    >
      {options.map(option => {
        const active = value === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(option)}
            className={`min-w-14 rounded-[calc(var(--radius-control)-2px)] px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${
              active ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-ink-subtle hover:text-ink'
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

// A yes/no style question laid out as one row: the question on the left,
// the choice on the right, anything that depends on the answer underneath.
// For lists of short questions (utilities, credit cards, ...).
export function ChoiceRow({ path, label, required, options, hint, children }: {
  path: string;
  label: React.ReactNode;
  required?: boolean;
  options: readonly string[];
  hint?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [value, setValue, error] = useField<string>(path);
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{label} {required && <Req />}</p>
          {hint && !error && <p className="text-xs text-ink-subtle">{hint}</p>}
        </div>
        <ChoicePills value={value ?? ''} onChange={setValue} options={options} invalid={!!error} />
      </div>
      <FieldError message={error} />
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

export function ChoiceField({ path, label, required, hint, className, disabled, options }: BaseProps & { options: readonly string[] }) {
  const [value, setValue, error] = useField<string>(path);
  return (
    <Labelled label={label} required={required} error={error} hint={hint} className={className}>
      <ChoicePills value={value ?? ''} onChange={setValue} options={options} disabled={disabled} invalid={!!error} />
    </Labelled>
  );
}

export function CheckboxField({ path, label, className, disabled, onToggle }: Omit<BaseProps, 'required' | 'hint'> & {
  onToggle?: (checked: boolean) => void;
}) {
  const [value, setValue, error] = useField<boolean>(path);
  return (
    <div className={className}>
      <label className={`flex cursor-pointer items-start gap-2.5 text-sm leading-relaxed ${error ? 'text-danger' : 'text-ink'}`}>
        <input
          type="checkbox"
          checked={!!value}
          disabled={disabled}
          onChange={e => { setValue(e.target.checked); onToggle?.(e.target.checked); }}
          className={`mt-1 size-4 shrink-0 ${error ? 'accent-danger' : 'accent-accent'}`}
        />
        <span>{label}</span>
      </label>
      <FieldError message={error} />
    </div>
  );
}

// Multi-select stored as string[].
export function CheckboxListField({ path, label, required, options, className }: Omit<BaseProps, 'disabled'> & { options: readonly string[] }) {
  const [value, setValue, error] = useField<string[]>(path);
  const selected = value ?? [];
  const toggle = (option: string) =>
    setValue(selected.includes(option) ? selected.filter(o => o !== option) : [...selected, option]);
  return (
    <Labelled label={label} required={required} error={error} className={className}>
      <div className="flex flex-wrap gap-2" role="group">
        {options.map(option => {
          const on = selected.includes(option);
          return (
            <label
              key={option}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ring-1 ring-inset transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                on ? 'bg-accent-subtle font-medium text-accent ring-accent/40' : error ? 'text-ink ring-danger/60 hover:bg-surface-muted' : 'text-ink ring-line-strong hover:bg-surface-muted'
              }`}
            >
              <input type="checkbox" checked={on} onChange={() => toggle(option)} className="sr-only" />
              {on && <Check className="size-3.5" strokeWidth={2.5} aria-hidden />}
              <span>{option}</span>
            </label>
          );
        })}
      </div>
    </Labelled>
  );
}

// Read-only computed value styled like an input (e.g. age, totals).
export function ComputedField({ label, value, className }: { label: React.ReactNode; value: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className ?? ''}`}>
      <label className={labelClass}>{label}</label>
      <div className="rounded-control bg-surface-muted px-3 py-2 text-base text-ink tabular-nums ring-1 ring-inset ring-line sm:text-sm">{value ?? '—'}</div>
    </div>
  );
}

// Repeatable rows (siblings, contributors, real estate...). Each row gets
// its own card with a remove button; `renderRow` receives the row's base path.
export function RepeatableList<T extends { id: string }>({ path, itemLabel, newItem, renderRow, emptyText, addLabel }: {
  path: string;
  itemLabel: string;
  newItem: () => T;
  renderRow: (basePath: string, index: number) => React.ReactNode;
  emptyText: string;
  addLabel: string;
}) {
  const [rows, setRows] = useField<T[]>(path);
  const list = rows ?? [];
  return (
    <div className="space-y-3">
      {list.length === 0 && (
        <p className="text-sm text-ink-subtle">{emptyText}</p>
      )}
      <AnimatePresence initial={false}>
        {list.map((row, index) => (
          <motion.div
            key={row.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-3 rounded-card p-4 ring-1 ring-inset ring-line"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-subtle">{itemLabel} {index + 1}</span>
              <button
                type="button"
                onClick={() => setRows(list.filter(r => r.id !== row.id))}
                className="inline-flex items-center gap-1 rounded-control px-2 py-1 text-xs font-medium text-ink-subtle transition-colors hover:bg-danger-bg hover:text-danger focus-visible:outline-2 focus-visible:outline-accent"
              >
                <Trash2 className="size-3.5" aria-hidden />
                Remove
              </button>
            </div>
            {renderRow(`${path}.${index}`, index)}
          </motion.div>
        ))}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setRows([...list, newItem()])}
        className="inline-flex h-9 items-center gap-1.5 rounded-control bg-surface px-3 text-sm font-medium text-ink ring-1 ring-inset ring-line-strong transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Plus className="size-4 text-ink-subtle" aria-hidden />
        {addLabel}
      </button>
    </div>
  );
}

// --- Uploads --------------------------------------------------------------------

function formatSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// One document requirement: picker (single or multiple JPGs), optional
// document-type selector, the selected files, and how many are already on
// record. Presentational; FileSlotField below binds it to the form context.
export function FileSlotView({
  label, hint, required, compact, multiple, maxFiles = 10, selected, onRecordCount, onPick, onRemove,
  variants, variant, onVariantChange, error, variantError
}: {
  label: string;
  hint?: string;
  required: boolean;
  compact?: boolean;
  multiple?: boolean;
  maxFiles?: number;
  selected: File[];
  onRecordCount: number;
  onPick: (files: File[]) => void;
  onRemove: (index: number) => void;
  variants?: string[];
  variant?: string;
  onVariantChange?: (variant: string) => void;
  error?: string;
  variantError?: string;
}) {
  const max = multiple ? maxFiles : 1;
  const canAdd = selected.length < max;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (picked.length) onPick(picked);
  };

  return (
    <div className={`space-y-2.5 rounded-card p-3.5 ring-1 ring-inset ${error ? 'ring-danger' : 'ring-line'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug text-ink">
            {label} {required ? <Req /> : <span className="font-normal text-ink-subtle">(optional)</span>}
          </p>
          {!compact && hint && <p className="mt-0.5 text-xs text-ink-subtle">{hint}</p>}
        </div>
        {onRecordCount > 0 && selected.length === 0 && (
          <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink-muted ring-1 ring-inset ring-line">
            {onRecordCount > 1 ? `${onRecordCount} on file` : 'On file'}
          </span>
        )}
      </div>

      {variants && onVariantChange && (
        <div>
          <select
            value={variant ?? ''}
            onChange={e => onVariantChange(e.target.value)}
            className={variantError ? errorInputClass : inputClass}
            aria-label={`Document type for ${label}`}
          >
            <option value="" disabled>Which document are you uploading?</option>
            {variants.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <FieldError message={variantError} />
        </div>
      )}

      {selected.map((file, index) => (
        <div key={`${file.name}-${index}`} className="flex items-center justify-between rounded-control bg-accent-subtle/60 p-2 text-xs">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="size-4 shrink-0 text-accent" aria-hidden />
            <div className="min-w-0">
              <p className="truncate font-medium leading-tight text-ink">{file.name}</p>
              <span className="text-xs text-ink-subtle">{formatSize(file.size)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="rounded-control p-1.5 text-ink-subtle transition-colors hover:bg-danger-bg hover:text-danger"
            title="Remove file"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      {canAdd && (
        <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-control border border-dashed border-line-strong p-3 text-sm font-medium text-ink-muted transition-colors hover:border-accent/50 hover:bg-accent-subtle/40 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
          <Upload className="size-4 text-ink-subtle" aria-hidden />
          <span>
            {selected.length > 0
              ? `Add another JPG (${selected.length}/${max})`
              : onRecordCount > 0
              ? 'Replace file(s) (optional)'
              : multiple ? `Select JPG files (up to ${max})` : 'Select JPG file'}
          </span>
          <input type="file" accept=".jpg,.jpeg,image/jpeg" multiple={!!multiple} onChange={handleChange} className="sr-only" />
        </label>
      )}
      {!canAdd && multiple && (
        <p className="flex items-center gap-1 text-xs text-ink-subtle"><CheckCircle className="size-3" aria-hidden /> Maximum of {max} files reached.</p>
      )}
      <FieldError message={error} />
    </div>
  );
}

export function FileSlotField({ slot, required, compact }: { slot: DocumentSlot; required: boolean; compact?: boolean }) {
  const { files, storedDocs, variants, addFiles, removeFile, setVariant, errors } = useGrantForm();
  const [localError, setLocalError] = useState('');
  return (
    <FileSlotView
      label={slot.label}
      hint={slot.hint}
      required={required}
      compact={compact}
      multiple={slot.multiple}
      maxFiles={slot.maxFiles}
      selected={files[slot.key] ?? []}
      onRecordCount={storedDocs[slot.key]?.length ?? 0}
      onPick={picked => setLocalError(addFiles(slot, picked) ?? '')}
      onRemove={index => removeFile(slot.key, index)}
      variants={slot.variants}
      variant={variants[slot.key]}
      onVariantChange={v => setVariant(slot.key, v)}
      error={localError || errors[`doc.${slot.key}`]}
      variantError={errors[`docVariant.${slot.key}`]}
    />
  );
}
