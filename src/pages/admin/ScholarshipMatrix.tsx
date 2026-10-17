import React, { useState } from 'react';
import { Download, Lock } from 'lucide-react';
import { Scholarship } from '../../types';
import { acceptsOnlineApplications } from '../../data/scholarships';
import {
  APPLICANT_TYPE_SHORT, ApplicantType, DOCUMENTS, EligibilityRules, RULES, RuleDef, TICKABLE_DOCUMENTS, documentDef, hasDocument,
  lockedRules, ruleCell
} from '../../data/requirementCatalog';
import { Button, Tooltip } from './AdminUI';

// Every scholarship's eligibility rules and documents side by side, from
// the shared catalog. Each cell edits that scholarship directly: tick a
// box, pick who can apply, or type a number. Locked cells are set by a
// scholarship's own application form (POLCA / Alumni), and info-only
// scholarships have no documents to upload.

export interface MatrixPatch {
  rules?: EligibilityRules;
  documentKeys?: string[];
  customDocuments?: string[];
}

// relative z-0 keeps cell controls (selects) under the pinned first column.
const CELL = 'relative z-0 border-b border-line px-2 py-1.5 text-center align-middle';
const STICKY = 'sticky left-0 z-10 bg-surface text-left';

function NumberCell({ def, value, disabled, onCommit, label }: {
  def: Extract<RuleDef, { kind: 'number' }>;
  value: number | undefined;
  disabled: boolean;
  onCommit: (value: number | undefined) => void;
  label: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  if (editing) {
    const commit = () => {
      setEditing(false);
      const n = draft.trim() === '' ? undefined : Number(draft);
      if (n !== undefined && (!Number.isFinite(n) || n < def.min || n > def.max)) return;
      if (n !== value) onCommit(n);
    };
    return (
      <input
        autoFocus
        type="number"
        min={def.min}
        max={def.max}
        step={def.step}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setEditing(false);
        }}
        aria-label={label}
        className="h-7 w-16 rounded-control bg-surface px-1 text-center text-sm tabular-nums ring-2 ring-accent focus:outline-none"
      />
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => { setDraft(value === undefined ? '' : String(value)); setEditing(true); }}
      aria-label={`${label}: ${value === undefined ? 'not required' : value}. Edit`}
      className="h-7 min-w-12 rounded-control px-2 text-sm tabular-nums text-ink hover:bg-surface-muted disabled:cursor-default disabled:hover:bg-transparent"
    >
      {value === undefined ? <span className="text-ink-subtle">—</span> : ruleCell(def.key, { [def.key]: value })}
    </button>
  );
}

export default function ScholarshipMatrix({ scholarships, onPatch, onOpen, readOnly = false }: {
  scholarships: Scholarship[];
  onPatch: (scholarship: Scholarship, patch: MatrixPatch) => void;
  onOpen: (id: string) => void;
  readOnly?: boolean;
}) {
  // Documents: everything tickable, the form-only ones in use, then every custom one.
  const used = new Set(scholarships.flatMap(s => s.documentKeys ?? []));
  const docRows = [
    ...DOCUMENTS.filter(d => TICKABLE_DOCUMENTS.includes(d) || used.has(d.key)).map(d => ({ key: d.key, label: d.label, title: d.text })),
    ...[...new Set(scholarships.flatMap(s => s.customDocuments ?? []))].map(text => ({ key: `custom:${text}`, label: text, title: 'Not on the shared list' })),
  ];

  const setRule = (s: Scholarship, key: keyof EligibilityRules, value: unknown) => {
    const rules = { ...(s.rules ?? {}) } as Record<string, unknown>;
    if (value === undefined || value === false) delete rules[key];
    else rules[key] = value;
    onPatch(s, { rules: rules as EligibilityRules });
  };
  const setDocument = (s: Scholarship, rowKey: string, on: boolean) => {
    if (rowKey.startsWith('custom:')) {
      const text = rowKey.slice(7);
      const list = s.customDocuments ?? [];
      onPatch(s, { customDocuments: on ? [...list, text] : list.filter(t => t !== text) });
    } else {
      const keys = s.documentKeys ?? [];
      onPatch(s, { documentKeys: on ? [...keys, rowKey] : keys.filter(k => k !== rowKey) });
    }
  };

  const exportCsv = () => {
    const header = ['Requirement', ...scholarships.map(s => s.name)];
    const lines: string[][] = [
      ...RULES.map(def => [def.label, ...scholarships.map(s => ruleCell(def.key, s.rules ?? {}) || '')]),
      ['Other conditions', ...scholarships.map(s => (s.customEligibility ?? []).join('; '))],
      ...docRows.map(row => [row.label, ...scholarships.map(s => (hasDocument(s, row.key) ? '✓' : ''))]),
    ];
    const csv = [header, ...lines].map(cells => cells.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scholarship-requirements-matrix.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // The title sits in the pinned first column so it stays put when the
  // table scrolls sideways.
  const section = (title: string) => (
    <tr>
      <th scope="colgroup" className={`${STICKY} border-b border-line bg-surface-muted px-3 py-2 text-xs font-medium text-ink-muted`}>{title}</th>
      <td colSpan={scholarships.length} className="border-b border-line bg-surface-muted" />
    </tr>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <p className="text-sm text-ink-muted">
          {readOnly ? 'Each scholarship\'s eligibility and documents.' : 'Click a cell to change it; it saves right away.'}
          <span className="ml-2 inline-flex items-center gap-1 text-xs text-ink-subtle"><Lock className="size-3" aria-hidden /> set by the scholarship's own form</span>
        </p>
        <Button size="sm" icon={Download} onClick={exportCsv}>Export CSV</Button>
      </div>
      <div className="relative overflow-x-auto overscroll-x-contain">
        <table className="border-separate border-spacing-0 text-sm" aria-label="Scholarship requirements matrix">
          <thead>
            <tr>
              <th scope="col" className={`${STICKY} z-20 w-60 min-w-60 border-b border-line px-3 py-2 text-xs font-medium text-ink-muted`}>Requirement</th>
              {scholarships.map(s => (
                <th key={s.id} scope="col" className="w-32 min-w-32 border-b border-line px-2 py-2 align-bottom text-xs font-medium">
                  <button type="button" onClick={() => onOpen(s.id)} title={s.name} className="line-clamp-3 text-left text-ink hover:text-accent">
                    {s.name}
                  </button>
                  {!acceptsOnlineApplications(s) && <span className="mt-0.5 block font-normal text-ink-subtle">Info only</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section('Eligibility')}
            {RULES.map(def => (
              <tr key={def.key}>
                <th scope="row" className={`${STICKY} border-b border-line px-3 py-1.5 font-normal text-ink`}>{def.label}</th>
                {scholarships.map(s => {
                  const rules = s.rules ?? {};
                  const locked = readOnly || lockedRules(s.applicationFormType).includes(def.key);
                  const label = `${def.label}, ${s.name}`;
                  let content: React.ReactNode;
                  if (def.kind === 'choice') {
                    content = locked ? (
                      <span className="text-ink">{APPLICANT_TYPE_SHORT[rules.applicantType ?? 'any']}</span>
                    ) : (
                      <select
                        value={rules.applicantType ?? 'any'}
                        onChange={e => setRule(s, 'applicantType', e.target.value as ApplicantType)}
                        aria-label={label}
                        className="h-7 w-full rounded-control bg-transparent px-1 text-sm text-ink hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent"
                      >
                        {(Object.keys(APPLICANT_TYPE_SHORT) as ApplicantType[]).map(k => <option key={k} value={k}>{APPLICANT_TYPE_SHORT[k]}</option>)}
                      </select>
                    );
                  } else if (def.kind === 'number') {
                    content = <NumberCell def={def} value={rules[def.key]} disabled={locked} onCommit={v => setRule(s, def.key, v)} label={label} />;
                  } else {
                    content = (
                      <input
                        type="checkbox"
                        checked={!!rules[def.key]}
                        onChange={e => setRule(s, def.key, e.target.checked)}
                        disabled={locked}
                        aria-label={label}
                        className="size-4 rounded accent-accent disabled:opacity-70"
                      />
                    );
                  }
                  return (
                    <td key={s.id} className={`${CELL} ${locked && !readOnly ? 'bg-surface-muted/60' : ''}`}>
                      {locked && !readOnly ? <Tooltip content="Set by this scholarship's own application form.">{content}</Tooltip> : content}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <th scope="row" className={`${STICKY} border-b border-line px-3 py-1.5 font-normal text-ink`}>Other conditions</th>
              {scholarships.map(s => {
                const lines = s.customEligibility ?? [];
                return (
                  <td key={s.id} className={CELL}>
                    {lines.length === 0 ? <span className="text-ink-subtle">—</span> : (
                      <Tooltip content={<ul className="list-disc space-y-1 pl-4 text-left">{lines.map(l => <li key={l}>{l}</li>)}</ul>}>
                        <button type="button" onClick={() => onOpen(s.id)} className="text-sm text-accent hover:underline">{lines.length}</button>
                      </Tooltip>
                    )}
                  </td>
                );
              })}
            </tr>
            {section('Documents to upload')}
            {docRows.map(row => (
              <tr key={row.key}>
                <th scope="row" title={row.title} className={`${STICKY} max-w-60 truncate border-b border-line px-3 py-1.5 font-normal text-ink`}>
                  {row.label}
                  {row.key.startsWith('custom:') && <span className="ml-1 text-xs text-ink-subtle">(custom)</span>}
                </th>
                {scholarships.map(s => {
                  const slotBased = !!s.documentSlots?.length;
                  const info = !acceptsOnlineApplications(s);
                  const locked = readOnly || slotBased || info;
                  const on = hasDocument(s, row.key);
                  if (info) return <td key={s.id} className={CELL}><span className="text-ink-subtle">·</span></td>;
                  return (
                    <td key={s.id} className={`${CELL} ${slotBased && !readOnly ? 'bg-surface-muted/60' : ''}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={e => setDocument(s, row.key, e.target.checked)}
                        disabled={locked}
                        aria-label={`${documentDef(row.key)?.label ?? row.label}, ${s.name}`}
                        className="size-4 rounded accent-accent disabled:opacity-70"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
