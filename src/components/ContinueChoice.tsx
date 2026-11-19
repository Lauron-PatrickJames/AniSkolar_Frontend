import React from 'react';
import { CONTINUE_LABELS } from '../utils/renewals';

// The evaluation form's question 8 as two radio options, side by side on
// wider screens and stacked on phones (the answers are too long for one
// row). Used by the office head's evaluation and the AdSO's copy of it.
export type ContinueValue = 'Continue' | 'Another' | '';

export default function ContinueChoice({ value, onChange, name, disabled, invalid }: {
  value: ContinueValue;
  onChange: (v: ContinueValue) => void;
  name: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const options: { value: Exclude<ContinueValue, ''>; label: string }[] = [
    { value: 'Continue', label: CONTINUE_LABELS.true },
    { value: 'Another', label: CONTINUE_LABELS.false },
  ];
  return (
    <div role="radiogroup" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {options.map(o => {
        const on = value === o.value;
        return (
          <label
            key={o.value}
            className={`flex cursor-pointer items-center gap-2.5 rounded-control px-3 py-2.5 text-sm ring-1 ring-inset transition-colors has-disabled:cursor-not-allowed has-disabled:opacity-60 ${
              on ? 'bg-accent-subtle text-ink ring-accent' : invalid ? 'text-ink ring-danger' : 'text-ink ring-line-strong hover:bg-surface-muted'
            }`}
          >
            <input type="radio" name={name} value={o.value} checked={on} disabled={disabled} onChange={() => onChange(o.value)} className="size-4 accent-accent" />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}
