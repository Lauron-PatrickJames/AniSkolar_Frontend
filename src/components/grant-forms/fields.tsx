import React, { createContext, useContext, useEffect, useState } from 'react';
import { AlertCircle, FileText, Plus, Trash2, Upload, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DocumentSlot, GrantApplicationDetails, Scholarship, StoredDocument } from '../../types';
import { FieldErrors, getIn } from '../../utils/grantForms';

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

// --- Styles (match ApplyScholarship.tsx) ------------------------------------

export const inputClass =
  'block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all placeholder:text-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed';
export const errorInputClass =
  'block w-full px-3.5 py-2.5 border-2 border-rose-400 rounded-xl text-sm bg-rose-50/60 focus:outline-hidden focus:ring-2 focus:ring-rose-300 focus:border-rose-500 transition-all placeholder:text-rose-300';
export const labelClass = 'flex items-center gap-1 text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5';

export function Req() {
  return <span className="text-rose-500">*</span>;
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-rose-500">
      <AlertCircle className="w-3 h-3 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

export function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] text-slate-400">{children}</p>;
}

export function SubHeading({ children, note }: { children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h3 className="font-display font-bold text-sm text-brand-green uppercase tracking-wider">{children}</h3>
      {note && <p className="text-[11px] text-slate-400 mt-0.5">{note}</p>}
    </div>
  );
}

export function Block({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`border-t border-slate-100 pt-6 first:border-t-0 first:pt-0 ${className}`}>{children}</div>;
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
    <div className={className}>
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
        onChange={e => setValue(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        inputMode={type === 'tel' ? 'tel' : undefined}
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
        {peso && <span className="absolute inset-y-0 left-3 flex items-center text-sm font-semibold text-slate-400 pointer-events-none">₱</span>}
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
      <select
        value={value ?? ''}
        onChange={e => setValue(e.target.value)}
        disabled={disabled}
        className={error ? errorInputClass : inputClass}
        aria-invalid={!!error}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </Labelled>
  );
}

// Single choice rendered as pill buttons — Yes/No, Public/Private, etc.
export function ChoiceField({ path, label, required, hint, className, disabled, options }: BaseProps & { options: readonly string[] }) {
  const [value, setValue, error] = useField<string>(path);
  return (
    <Labelled label={label} required={required} error={error} hint={hint} className={className}>
      <div role="radiogroup" className="flex flex-wrap gap-2">
        {options.map(option => {
          const active = value === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => setValue(option)}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold border transition-colors focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 ${
                active
                  ? 'bg-brand-green text-white border-brand-green shadow-sm'
                  : error
                  ? 'bg-rose-50/60 text-slate-600 border-rose-300 hover:bg-rose-50'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-brand-green/40 hover:bg-brand-green/5'
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </Labelled>
  );
}

export function CheckboxField({ path, label, className, disabled, onToggle }: Omit<BaseProps, 'required' | 'hint'> & {
  onToggle?: (checked: boolean) => void;
}) {
  const [value, setValue, error] = useField<boolean>(path);
  return (
    <div className={className}>
      <label className={`flex items-start gap-2.5 text-xs leading-relaxed cursor-pointer ${error ? 'text-rose-700' : 'text-slate-700'}`}>
        <input
          type="checkbox"
          checked={!!value}
          disabled={disabled}
          onChange={e => { setValue(e.target.checked); onToggle?.(e.target.checked); }}
          className={`mt-0.5 shrink-0 ${error ? 'accent-rose-500' : 'accent-brand-green'}`}
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {options.map(option => (
          <label key={option} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer p-2 rounded-lg border border-slate-100 hover:bg-slate-50">
            <input type="checkbox" checked={selected.includes(option)} onChange={() => toggle(option)} className="accent-brand-green" />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </Labelled>
  );
}

// Read-only computed value styled like an input (e.g. age, totals).
export function ComputedField({ label, value, className }: { label: React.ReactNode; value: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className={labelClass}>{label}</label>
      <div className="px-3.5 py-2.5 rounded-xl text-sm bg-slate-100/70 border border-slate-100 text-slate-600 font-semibold">{value ?? '—'}</div>
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
        <p className="text-xs text-slate-400 italic px-1">{emptyText}</p>
      )}
      <AnimatePresence initial={false}>
        {list.map((row, index) => (
          <motion.div
            key={row.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="p-4 border border-slate-200 rounded-xl bg-slate-50/40 space-y-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{itemLabel} {index + 1}</span>
              <button
                type="button"
                onClick={() => setRows(list.filter(r => r.id !== row.id))}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-500 hover:bg-rose-50 px-2 py-1 rounded-md transition-colors focus:outline-hidden"
              >
                <Trash2 className="w-3.5 h-3.5" />
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
        className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-green hover:text-brand-green-dark bg-brand-green/5 hover:bg-brand-green/10 border border-brand-green/20 px-3.5 py-2 rounded-lg transition-colors focus:outline-hidden"
      >
        <Plus className="w-3.5 h-3.5" />
        {addLabel}
      </button>
    </div>
  );
}

// --- Uploads --------------------------------------------------------------------

function formatSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// One document slot: picker (single or multiple JPGs), optional document-type
// selector for multi-type slots, the selected files, and what's on record.
export function FileSlotField({ slot, required, compact }: { slot: DocumentSlot; required: boolean; compact?: boolean }) {
  const { files, storedDocs, variants, addFiles, removeFile, setVariant, errors } = useGrantForm();
  const [localError, setLocalError] = useState('');
  const selected = files[slot.key] ?? [];
  const onRecord = storedDocs[slot.key] ?? [];
  const error = localError || errors[`doc.${slot.key}`];
  const variantError = errors[`docVariant.${slot.key}`];
  const max = slot.multiple ? (slot.maxFiles ?? 10) : 1;
  const canAdd = selected.length < max;

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!picked.length) return;
    setLocalError(addFiles(slot, picked) ?? '');
  };

  return (
    <div className={`p-3.5 border rounded-xl space-y-2.5 ${error ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200 bg-slate-50/30'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-700 leading-snug">
            {slot.label} {required ? <Req /> : <span className="text-[10px] font-semibold text-slate-400">(optional)</span>}
          </p>
          {!compact && slot.hint && <p className="text-[11px] text-slate-400 mt-0.5">{slot.hint}</p>}
        </div>
        {onRecord.length > 0 && selected.length === 0 && (
          <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
            {onRecord.length > 1 ? `${onRecord.length} on file` : 'On file'}
          </span>
        )}
      </div>

      {slot.variants && (
        <div>
          <select
            value={variants[slot.key] ?? ''}
            onChange={e => setVariant(slot.key, e.target.value)}
            className={`${variantError ? errorInputClass : inputClass} py-2 text-xs`}
            aria-label={`Document type for ${slot.label}`}
          >
            <option value="" disabled>Which document are you uploading?</option>
            {slot.variants.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <FieldError message={variantError} />
        </div>
      )}

      {selected.map((file, index) => (
        <div key={`${file.name}-${index}`} className="flex items-center justify-between p-2 bg-emerald-50 rounded-lg border border-emerald-100 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-brand-green shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold text-slate-800 truncate leading-tight">{file.name}</p>
              <span className="text-[10px] text-slate-400">{formatSize(file.size)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => removeFile(slot.key, index)}
            className="p-1.5 text-rose-500 hover:bg-rose-100 rounded-md transition-colors"
            title="Remove file"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      {canAdd && (
        <label className="flex items-center justify-center border-2 border-dashed border-slate-200 hover:border-brand-green/40 hover:bg-brand-green/5 rounded-lg p-3 cursor-pointer transition-colors text-xs text-slate-500 font-semibold gap-1.5">
          <Upload className="w-4 h-4 text-slate-400" />
          <span>
            {selected.length > 0
              ? `Add another JPG (${selected.length}/${max})`
              : onRecord.length > 0
              ? 'Replace file(s) (optional)'
              : slot.multiple ? `Select JPG files (up to ${max})` : 'Select JPG file'}
          </span>
          <input type="file" accept=".jpg,.jpeg,image/jpeg" multiple={!!slot.multiple} onChange={onPick} className="hidden" />
        </label>
      )}
      {!canAdd && slot.multiple && (
        <p className="text-[11px] text-slate-400 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Maximum of {max} files reached.</p>
      )}
      <FieldError message={error} />
    </div>
  );
}
