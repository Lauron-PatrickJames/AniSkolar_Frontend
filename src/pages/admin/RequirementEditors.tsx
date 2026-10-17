import React, { useRef } from 'react';
import { Lock, Plus, X } from 'lucide-react';
import {
  APPLICANT_TYPE_LABELS, ApplicantType, EligibilityRules, RULES, RuleDef, RuleKey, TICKABLE_DOCUMENTS, ruleText
} from '../../data/requirementCatalog';
import { Badge, Button, IconButton, Tooltip } from './AdminUI';

// Checklist editors for a scholarship's eligibility and documents, picked
// from the shared catalog (data/requirementCatalog.ts), plus a simple
// list editor for everything else that used to be "one per line" text.

const INPUT =
  'h-8 rounded-control bg-surface px-2 text-sm text-ink ring-1 ring-line ring-inset focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60';

// --- List editor -----------------------------------------------------------------

// One input per item, with remove buttons and an Add button. Enter in an
// item adds a new one below it.
export function ListEditor({ items, onChange, label, addLabel = 'Add', placeholder, disabled, maxLength = 1000, numbered }: {
  items: string[];
  onChange: (items: string[]) => void;
  label: string;          // accessible name for each input, e.g. "Benefit"
  addLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  numbered?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focusAt = (i: number) => requestAnimationFrame(() => refs.current[i]?.focus());
  const update = (i: number, value: string) => onChange(items.map((item, j) => (j === i ? value : item)));
  const insertAfter = (i: number) => {
    onChange([...items.slice(0, i + 1), '', ...items.slice(i + 1)]);
    focusAt(i + 1);
  };
  const remove = (i: number) => {
    onChange(items.filter((_, j) => j !== i));
    focusAt(Math.max(0, i - 1));
  };
  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <ol className="space-y-2">
          {items.map((item, i) => (
            <li key={i} className="flex items-center gap-2">
              {numbered && <span className="w-5 shrink-0 text-right text-xs text-ink-subtle tabular-nums">{i + 1}.</span>}
              <input
                ref={el => { refs.current[i] = el; }}
                value={item}
                onChange={e => update(i, e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); insertAfter(i); }
                  if (e.key === 'Backspace' && item === '' && items.length > 0) { e.preventDefault(); remove(i); }
                }}
                aria-label={`${label} ${i + 1}`}
                placeholder={placeholder}
                maxLength={maxLength}
                disabled={disabled}
                className={`${INPUT} h-9 min-w-0 flex-1 px-3`}
              />
              <IconButton icon={X} label={`Remove ${label.toLowerCase()} ${i + 1}`} onClick={() => remove(i)} disabled={disabled} />
            </li>
          ))}
        </ol>
      )}
      <Button size="sm" variant="ghost" icon={Plus} onClick={() => insertAfter(items.length - 1)} disabled={disabled}>
        {addLabel}
      </Button>
    </div>
  );
}

// --- Rules -------------------------------------------------------------------------

function RuleControl({ def, rules, onChange, disabled }: {
  def: RuleDef;
  rules: EligibilityRules;
  onChange: (next: EligibilityRules) => void;
  disabled?: boolean;
}) {
  const set = (value: unknown) => {
    const next = { ...rules } as Record<string, unknown>;
    if (value === undefined || value === false || value === '') delete next[def.key];
    else next[def.key] = value;
    onChange(next as EligibilityRules);
  };
  if (def.kind === 'choice') {
    return (
      <select
        value={rules.applicantType ?? 'any'}
        onChange={e => set(e.target.value === 'any' ? 'any' : e.target.value)}
        disabled={disabled}
        aria-label={def.label}
        className={`${INPUT} w-48`}
      >
        {(Object.keys(APPLICANT_TYPE_LABELS) as ApplicantType[]).map(k => <option key={k} value={k}>{APPLICANT_TYPE_LABELS[k]}</option>)}
      </select>
    );
  }
  if (def.kind === 'number') {
    const value = rules[def.key];
    return (
      <span className="flex items-center gap-1.5">
        <input
          type="number"
          inputMode="decimal"
          min={def.min}
          max={def.max}
          step={def.step}
          value={value ?? ''}
          onChange={e => set(e.target.value === '' ? undefined : Number(e.target.value))}
          disabled={disabled || value === undefined}
          aria-label={def.label}
          className={`${INPUT} w-24 text-right tabular-nums`}
        />
        {def.unit && <span className="w-10 text-xs text-ink-subtle">{def.unit}</span>}
      </span>
    );
  }
  return null;
}

// A checkbox per catalog rule, with its value inline and the line students
// will read underneath. `locked` rules are checked by the scholarship's own
// form and can't change here.
export function RulesEditor({ rules, onChange, locked = [], disabled }: {
  rules: EligibilityRules;
  onChange: (next: EligibilityRules) => void;
  locked?: RuleKey[];
  disabled?: boolean;
}) {
  return (
    <ul className="divide-y divide-line rounded-control ring-1 ring-line">
      {RULES.map(def => {
        const isLocked = locked.includes(def.key);
        const on = def.kind === 'choice' ? true : rules[def.key] !== undefined && rules[def.key] !== false;
        const text = ruleText(def.key, rules);
        const toggle = (checked: boolean) => {
          const next = { ...rules } as Record<string, unknown>;
          if (!checked) delete next[def.key];
          else next[def.key] = def.kind === 'number' ? def.defaultValue : true;
          onChange(next as EligibilityRules);
        };
        return (
          <li key={def.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
            {def.kind === 'choice' ? (
              <span className="size-4 shrink-0" aria-hidden />
            ) : (
              <input
                type="checkbox"
                checked={on}
                onChange={e => toggle(e.target.checked)}
                disabled={disabled || isLocked}
                aria-label={def.label}
                className="size-4 shrink-0 rounded accent-accent"
              />
            )}
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5 text-sm text-ink">
                {def.label}
                {def.checked && <Badge tone="info">Checked against profile</Badge>}
                {isLocked && (
                  <Tooltip content="Checked by this scholarship's own application form, so it's fixed.">
                    <Lock className="size-3.5 text-ink-subtle" aria-label="Fixed by the application form" />
                  </Tooltip>
                )}
              </span>
              {text && <span className="mt-0.5 block text-xs text-ink-subtle">Students read: “{text}”</span>}
            </span>
            {(def.kind === 'choice' || on) && <RuleControl def={def} rules={rules} onChange={onChange} disabled={disabled || isLocked} />}
          </li>
        );
      })}
    </ul>
  );
}

// --- Documents ---------------------------------------------------------------------

export function DocumentsEditor({ keys, onChange, disabled }: {
  keys: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
}) {
  const ticked = new Set(keys);
  const toggle = (key: string, on: boolean) => onChange(on ? [...keys, key] : keys.filter(k => k !== key));
  return (
    <ul className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
      {TICKABLE_DOCUMENTS.map(d => (
        <li key={d.key}>
          <label title={d.text} className="flex cursor-pointer items-center gap-2.5 rounded-control px-2 py-1.5 text-sm text-ink hover:bg-surface-muted">
            <input
              type="checkbox"
              checked={ticked.has(d.key)}
              onChange={e => toggle(d.key, e.target.checked)}
              disabled={disabled}
              className="size-4 shrink-0 rounded accent-accent"
            />
            <span className="min-w-0 truncate">{d.label}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
