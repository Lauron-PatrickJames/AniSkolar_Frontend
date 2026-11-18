import React, { useId, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { DeclaredFunding, DeclaredScholarship, StudentProfile } from '../../types';
import { Alert, Button, Field, IconButton, Modal, SegmentedControl, Select, TextInput } from '../../pages/admin/AdminUI';
import { mockScholarships } from '../../data/scholarships';

// "Scholarships I currently hold": the student's own word on scholarships
// from before AniSkolar and outside grants (DOST, CHED, LGU). Asked in
// Complete your profile and edited from the Profile page; the office sees it
// when reviewing applications. AniSkolar's own records (approved
// applications, Add scholar) stay what counts for the one-scholarship rule.

export const MAX_DECLARED = 10;

export const FUNDING_LABELS: Record<DeclaredFunding, string> = {
  internal: 'DLSU-D or its benefactors',
  external: 'Outside grantor (DOST, CHED, LGU, company…)',
};
const FUNDING_SHORT: Record<DeclaredFunding, string> = { internal: 'DLSU-D', external: 'Outside grant' };

export interface DeclaredDraft {
  holds: 'Yes' | 'No' | '';
  items: { name: string; funding: DeclaredFunding | '' }[];
}

const emptyItem = (): DeclaredDraft['items'][number] => ({ name: '', funding: '' });

export function declaredFromStudent(s: Pick<StudentProfile, 'declaredScholarships' | 'declaredScholarshipsAt'>): DeclaredDraft {
  const list = s.declaredScholarships ?? [];
  if (list.length) return { holds: 'Yes', items: list.map(d => ({ name: d.name, funding: d.funding })) };
  return { holds: s.declaredScholarshipsAt ? 'No' : '', items: [emptyItem()] };
}

// Problems by row, plus one for the yes/no question. Empty when it can be saved.
export interface DeclaredErrors { holds?: string; rows: { name?: string; funding?: string }[] }
export function validateDeclared(d: DeclaredDraft): DeclaredErrors {
  if (!d.holds) return { holds: 'Choose Yes or No.', rows: [] };
  if (d.holds === 'No') return { rows: [] };
  return {
    rows: d.items.map(i => ({
      name: i.name.trim() ? undefined : 'Enter the scholarship’s name.',
      funding: i.funding ? undefined : 'Choose who funds it.',
    })),
  };
}
export const hasDeclaredErrors = (e: DeclaredErrors) => !!e.holds || e.rows.some(r => r.name || r.funding);

export const declaredPayload = (d: DeclaredDraft): DeclaredScholarship[] =>
  d.holds === 'Yes' ? d.items.map(i => ({ name: i.name.trim(), funding: i.funding as DeclaredFunding })) : [];

// AniSkolar's scholarships, offered as suggestions; picking one marks it DLSU-D funded.
const KNOWN = mockScholarships.map(s => s.name);

export function DeclaredScholarshipsFields({ draft, onChange, errors, showErrors }: {
  draft: DeclaredDraft;
  onChange: (d: DeclaredDraft) => void;
  errors: DeclaredErrors;
  showErrors: boolean;
}) {
  const listId = useId();
  const setItem = (i: number, patch: Partial<DeclaredDraft['items'][number]>) =>
    onChange({ ...draft, items: draft.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });

  return (
    <div className="space-y-5">
      <div data-field="holds" className="max-w-sm">
        <Field label="Do you currently hold any scholarship or grant?" error={showErrors ? errors.holds : undefined}>
          <SegmentedControl<'Yes' | 'No'>
            label="Do you currently hold any scholarship or grant?"
            options={['Yes', 'No']}
            value={draft.holds}
            onChange={v => onChange({ holds: v, items: draft.items.length ? draft.items : [emptyItem()] })}
          />
        </Field>
      </div>

      {draft.holds === 'Yes' && (
        <div className="space-y-4">
          <datalist id={listId}>{KNOWN.map(n => <option key={n} value={n} />)}</datalist>
          {draft.items.map((item, i) => (
            <div key={i} className="grid grid-cols-1 items-start gap-3 rounded-control bg-surface-muted p-3 sm:grid-cols-[minmax(0,1fr)_16rem_auto]">
              <div data-field={`name-${i}`}>
                <Field label={`Scholarship ${draft.items.length > 1 ? i + 1 : ''}`.trim()} error={showErrors ? errors.rows[i]?.name : undefined}>
                  <TextInput
                    value={item.name}
                    list={listId}
                    maxLength={120}
                    placeholder="e.g. DOST-SEI Merit Scholarship"
                    onChange={e => {
                      const name = e.target.value;
                      setItem(i, { name, ...(KNOWN.includes(name) ? { funding: 'internal' as const } : {}) });
                    }}
                  />
                </Field>
              </div>
              <div data-field={`funding-${i}`}>
                <Field label="Funded by" error={showErrors ? errors.rows[i]?.funding : undefined}>
                  <Select value={item.funding} onChange={v => setItem(i, { funding: v as DeclaredFunding })}>
                    <option value="" disabled>Select</option>
                    {(Object.keys(FUNDING_LABELS) as DeclaredFunding[]).map(f => <option key={f} value={f}>{FUNDING_LABELS[f]}</option>)}
                  </Select>
                </Field>
              </div>
              {draft.items.length > 1 && (
                <IconButton
                  icon={X}
                  label={`Remove ${item.name.trim() || `scholarship ${i + 1}`}`}
                  onClick={() => onChange({ ...draft, items: draft.items.filter((_, j) => j !== i) })}
                  className="sm:mt-7 justify-self-end"
                />
              )}
            </div>
          ))}
          {draft.items.length < MAX_DECLARED && (
            <Button size="sm" icon={Plus} onClick={() => onChange({ ...draft, items: [...draft.items, emptyItem()] })}>
              Add another
            </Button>
          )}
        </div>
      )}

      <p className="text-xs text-ink-muted">
        Include scholarships from before you used AniSkolar and outside grants. The scholarship office sees this list when it reviews your applications. Only one scholarship funded by DLSU-D or its benefactors can be credited at a time; outside grants have no limit.
      </p>
    </div>
  );
}

// Read-only list, for the Profile page and the office's review.
export function DeclaredScholarshipsList({ list, className = '' }: { list: DeclaredScholarship[]; className?: string }) {
  return (
    <ul className={`space-y-0.5 ${className}`}>
      {list.map(s => (
        <li key={s.name}>
          {s.name} <span className="text-ink-subtle">· {FUNDING_SHORT[s.funding] ?? s.funding}</span>
        </li>
      ))}
    </ul>
  );
}

// The Profile page's edit dialog.
export function DeclaredScholarshipsDialog({ student, onSave, onClose }: {
  student: StudentProfile;
  onSave: (list: DeclaredScholarship[]) => Promise<string | null>;
  onClose: (saved: boolean) => void;
}) {
  const [draft, setDraft] = useState(() => declaredFromStudent(student));
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const errors = validateDeclared(draft);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (hasDeclaredErrors(errors)) return;
    setSaving(true);
    setError('');
    const problem = await onSave(declaredPayload(draft));
    setSaving(false);
    if (problem) setError(problem);
    else onClose(true);
  };

  return (
    <Modal
      title="Scholarships you hold"
      size="lg"
      onClose={() => { if (!saving) onClose(false); }}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={saving} onClick={() => onClose(false)}>Cancel</Button>
          <Button type="submit" form="declared-scholarships" variant="primary" loading={saving}>Save</Button>
        </div>
      }
    >
      <form id="declared-scholarships" onSubmit={save} noValidate className="space-y-4">
        {error && <Alert tone="danger" onDismiss={() => setError('')}>{error}</Alert>}
        <DeclaredScholarshipsFields draft={draft} onChange={d => { setDraft(d); setError(''); }} errors={errors} showErrors={attempted} />
      </form>
    </Modal>
  );
}
