import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/react';
import { AlertTriangle, Award, Calendar, CircleCheck, CircleDot, CircleOff, Pencil, RefreshCw } from 'lucide-react';
import { Scholarship, ScholarshipOverride } from '../../types';
import { OFFICE_LABELS, acceptsOnlineApplications, applyScholarshipOverrides, mockScholarships, officeOf } from '../../data/scholarships';
import { API_BASE_URL, authHeaders, formatDateTime } from './adminData';
import {
  Alert, Badge, Button, Card, EmptyState, ErrorState, Field, KpiCard, KpiGrid, Modal, PageHeader, SegmentedControl,
  TableSkeleton, TextInput, Textarea, Tone
} from './AdminUI';

// AdSO-only page for managing every scholarship: open/close it and edit the
// details students see. The structural parts of a scholarship (name, office,
// application form, eligibility rules, required documents) are defined in
// code and aren't editable here. Application counts include POLCA and
// Alumni applications their office hasn't approved yet — view only.

type ScholarshipStatus = Scholarship['status'];
const STATUSES: readonly ScholarshipStatus[] = ['Open', 'Closing Soon', 'Closed'];

const STATUS_META: Record<ScholarshipStatus, { tone: Tone; icon: React.ElementType }> = {
  'Open': { tone: 'success', icon: CircleCheck },
  'Closing Soon': { tone: 'warning', icon: CircleDot },
  'Closed': { tone: 'danger', icon: CircleOff }
};

// Shape returned by GET /api/scholarships/admin.
interface AdminScholarshipRow {
  id: string;
  name: string;
  office: string;
  overrides: ScholarshipOverride;
  applications: { total: number; byStatus: Partial<Record<'Under Evaluation' | 'Approved' | 'Rejected' | 'Needs Revision', number>> };
}

interface Row {
  scholarship: Scholarship;          // defaults merged with the AdSO's edits
  defaults: Scholarship;             // the defaults in code
  overrides: ScholarshipOverride;
  applications: AdminScholarshipRow['applications'];
}

// --- Editor ------------------------------------------------------------------

interface EditorState {
  status: ScholarshipStatus;
  deadline: string;
  description: string;
  benefits: string;
  eligibility: string;
  process: string;
  submissionNote: string;
  schedule: string;
}

const toLines = (items: string[] | undefined) => (items ?? []).join('\n');
const fromLines = (text: string) => text.split('\n').map(line => line.trim()).filter(Boolean);
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function editorFrom(s: Scholarship): EditorState {
  return {
    status: s.status,
    deadline: s.deadline,
    description: s.description,
    benefits: toLines(s.benefits),
    eligibility: toLines(s.eligibility),
    process: toLines(s.process),
    submissionNote: s.submissionNote ?? '',
    schedule: s.schedule ?? ''
  };
}

// Builds the PATCH body. A value equal to the default in code is sent as
// null, which clears the override instead of storing a copy of the default.
function toPayload(form: EditorState, defaults: Scholarship) {
  const text = (value: string, base: string | undefined) => (value.trim() === (base ?? '').trim() ? null : value.trim());
  const list = (value: string, base: string[]) => {
    const items = fromLines(value);
    return sameList(items, base) ? null : items;
  };
  return {
    status: form.status === defaults.status ? null : form.status,
    deadline: text(form.deadline, defaults.deadline),
    description: text(form.description, defaults.description),
    benefits: list(form.benefits, defaults.benefits),
    eligibility: list(form.eligibility, defaults.eligibility),
    process: list(form.process, defaults.process),
    submissionNote: text(form.submissionNote, defaults.submissionNote),
    // Only scholarships with a schedule (e.g. Athletic tryouts) send it.
    ...(defaults.scheduleLabel ? { schedule: text(form.schedule, defaults.schedule) } : {})
  };
}

function ScholarshipEditor({ row, onClose, onSave, isSaving, error }: {
  row: Row;
  onClose: () => void;
  onSave: (form: EditorState) => void;
  isSaving: boolean;
  error: string;
}) {
  const [form, setForm] = useState<EditorState>(() => editorFrom(row.scholarship));
  const [attempted, setAttempted] = useState(false);
  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) => setForm(f => ({ ...f, [key]: value }));

  const errors: Partial<Record<keyof EditorState, string>> = {};
  if (attempted) {
    if (!form.deadline.trim()) errors.deadline = 'Enter a deadline or application period.';
    if (!form.description.trim()) errors.description = 'Enter a description.';
    if (fromLines(form.eligibility).length === 0) errors.eligibility = 'List at least one eligibility requirement.';
  }

  const submit = () => {
    if (isSaving) return;
    setAttempted(true);
    if (!form.deadline.trim() || !form.description.trim() || fromLines(form.eligibility).length === 0) return;
    onSave(form);
  };

  const resetToDefaults = () => setForm(editorFrom(row.defaults));
  const closing = form.status === 'Closed' && row.scholarship.status !== 'Closed';

  return (
    <Modal
      title={`Edit ${row.scholarship.name}`}
      description={`${OFFICE_LABELS[officeOf(row.scholarship)]} · Changes show to students right away.`}
      onClose={onClose}
      dismissible={!isSaving}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={resetToDefaults} disabled={isSaving} className="mr-auto">Reset to defaults</Button>
          <Button onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button variant="primary" loading={isSaving} disabled={isSaving} onClick={submit}>Save changes</Button>
        </>
      }
    >
      <form className="space-y-5" onSubmit={e => { e.preventDefault(); submit(); }} noValidate>
        {error && <Alert tone="danger" title="Couldn't save the scholarship">{error}</Alert>}

        <Field label="Status" helper="Closed scholarships are hidden from students' Explore list and can't be applied to.">
          <SegmentedControl<ScholarshipStatus>
            options={STATUSES}
            value={form.status}
            onChange={v => v && set('status', v)}
            label="Scholarship status"
          />
        </Field>
        {closing && (
          <Alert tone="warning">Students won't be able to apply while it's closed. Applications already submitted aren't affected.</Alert>
        )}

        <Field label="Deadline / application period" error={errors.deadline}>
          <TextInput value={form.deadline} onChange={e => set('deadline', e.target.value)} maxLength={200} disabled={isSaving} placeholder="e.g. October 30, 2026" />
        </Field>

        {row.defaults.scheduleLabel && (
          <Field label={row.defaults.scheduleLabel} optional helper="Shown on the scholarship's card and details page. For the full details, post an announcement and set its related scholarship to this one.">
            <TextInput value={form.schedule} onChange={e => set('schedule', e.target.value)} maxLength={300} disabled={isSaving} placeholder="e.g. November 3–7, 2026, 4:00 PM, at the University Gym" />
          </Field>
        )}

        <Field label="Description" error={errors.description}>
          <Textarea value={form.description} onChange={e => set('description', e.target.value)} rows={4} maxLength={4000} disabled={isSaving} className="resize-y" />
        </Field>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Field label="Benefits" helper="One per line.">
            <Textarea value={form.benefits} onChange={e => set('benefits', e.target.value)} rows={5} disabled={isSaving} className="resize-y" />
          </Field>
          <Field label="Eligibility" helper="One per line. This is what students read; the system's eligibility checks don't change." error={errors.eligibility}>
            <Textarea value={form.eligibility} onChange={e => set('eligibility', e.target.value)} rows={5} disabled={isSaving} className="resize-y" />
          </Field>
        </div>

        <Field label="Application process" helper="One step per line.">
          <Textarea value={form.process} onChange={e => set('process', e.target.value)} rows={5} disabled={isSaving} className="resize-y" />
        </Field>

        <Field label="Submission note" optional helper="Shown on the details page and after a student submits.">
          <TextInput value={form.submissionNote} onChange={e => set('submissionNote', e.target.value)} maxLength={500} disabled={isSaving} placeholder="e.g. Submit complete requirements to the Alumni Office." />
        </Field>

        <p className="text-xs text-ink-subtle">
          The name, office, application form, eligibility checks and required documents are part of the system and can't be changed here.
        </p>
      </form>
    </Modal>
  );
}

// --- Page ----------------------------------------------------------------------

export default function ScholarshipsManager() {
  const { getToken } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState<Row | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedName, setSavedName] = useState('');

  const toRows = (data: AdminScholarshipRow[]): Row[] =>
    mockScholarships.map(defaults => {
      const entry = data.find(d => d.id === defaults.id);
      const overrides = entry?.overrides ?? { id: defaults.id };
      return {
        defaults,
        overrides,
        scholarship: applyScholarshipOverrides([defaults], [overrides])[0],
        applications: entry?.applications ?? { total: 0, byStatus: {} }
      };
    });

  const load = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/scholarships/admin`, { headers: await authHeaders(getToken) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'The server returned an error while loading scholarships.');
      setRows(toRows(body.scholarships ?? []));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Something went wrong loading scholarships.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (form: EditorState) => {
    if (!editing || isSaving) return;
    setIsSaving(true);
    setSaveError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/scholarships/${editing.scholarship.id}`, {
        method: 'PATCH',
        headers: await authHeaders(getToken, true),
        body: JSON.stringify(toPayload(form, editing.defaults))
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to save the scholarship.');
      const overrides: ScholarshipOverride = body.scholarship;
      setRows(prev => prev.map(r => (r.defaults.id === editing.defaults.id
        ? { ...r, overrides, scholarship: applyScholarshipOverrides([r.defaults], [overrides])[0] }
        : r)));
      setSavedName(editing.scholarship.name);
      setEditing(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save the scholarship.');
    } finally {
      setIsSaving(false);
    }
  };

  const stats = useMemo(() => ({
    open: rows.filter(r => r.scholarship.status !== 'Closed' && acceptsOnlineApplications(r.scholarship)).length,
    closed: rows.filter(r => r.scholarship.status === 'Closed').length,
    applications: rows.reduce((sum, r) => sum + r.applications.total, 0),
    awaiting: rows.reduce((sum, r) => sum + (r.applications.byStatus['Under Evaluation'] ?? 0), 0)
  }), [rows]);

  const firstLoad = isLoading && rows.length === 0;
  const failedEmpty = !!loadError && rows.length === 0 && !isLoading;
  const kpi = (n: number) => (failedEmpty ? '—' : n);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scholarships"
        description="Open or close each scholarship and edit the details students see."
        actions={<Button icon={RefreshCw} loading={isLoading} onClick={load}>Refresh</Button>}
      />

      {loadError && rows.length > 0 && (
        <Alert tone="danger" title="Couldn't refresh scholarships" action={<Button size="sm" onClick={load}>Try again</Button>}>
          {loadError} Showing the last loaded list.
        </Alert>
      )}
      {savedName && <Alert tone="success" onDismiss={() => setSavedName('')}>Saved changes to {savedName}.</Alert>}

      <KpiGrid>
        <KpiCard label="Accepting applications" value={kpi(stats.open)} hint="Open online applications" icon={CircleCheck} tone="success" loading={firstLoad} />
        <KpiCard label="Closed" value={kpi(stats.closed)} hint="Hidden from students" icon={CircleOff} tone="danger" loading={firstLoad} />
        <KpiCard label="Applications" value={kpi(stats.applications)} hint="Across every office" icon={Award} tone="accent" loading={firstLoad} />
        <KpiCard label="Under evaluation" value={kpi(stats.awaiting)} hint="Waiting for a decision" icon={AlertTriangle} tone="warning" loading={firstLoad} />
      </KpiGrid>

      <Card flush>
        {firstLoad ? (
          <TableSkeleton rows={4} label="Loading scholarships" />
        ) : failedEmpty ? (
          <ErrorState title="Couldn't load scholarships" message={loadError} onRetry={load} retrying={isLoading} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Award} title="No scholarships" description="Scholarships are defined in the system's scholarship list." />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map(row => {
              const s = row.scholarship;
              const meta = STATUS_META[s.status] ?? STATUS_META.Open;
              const counts = row.applications.byStatus;
              const office = officeOf(s);
              const infoOnly = !acceptsOnlineApplications(s);
              const edited = Object.keys(row.overrides).some(k => !['id', 'updatedAt', 'updatedBy'].includes(k));
              return (
                <li key={s.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="mr-1 text-sm font-medium text-ink">{s.name}</h3>
                      <Badge tone={meta.tone} icon={meta.icon}>{s.status}</Badge>
                      <Badge>{OFFICE_LABELS[office]}</Badge>
                      {infoOnly && <Badge>Info only</Badge>}
                      {edited && <Badge tone="accent">Edited</Badge>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{s.description}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-subtle">
                      <span className="flex items-center gap-1"><Calendar className="size-3.5" aria-hidden />{s.deadline}</span>
                      {s.scheduleLabel && <span>{s.scheduleLabel}: {s.schedule || 'not set'}</span>}
                      {infoOnly ? (
                        <span>No online applications — listed for information</span>
                      ) : (
                      <span className="tabular-nums">
                        {row.applications.total} application{row.applications.total === 1 ? '' : 's'}
                        {row.applications.total > 0 && (
                          <> · {counts['Under Evaluation'] ?? 0} under evaluation · {counts['Approved'] ?? 0} approved · {counts['Needs Revision'] ?? 0} needs revision · {counts['Rejected'] ?? 0} rejected</>
                        )}
                      </span>
                      )}
                      {row.overrides.updatedAt && (
                        <span>Updated {formatDateTime(row.overrides.updatedAt)}{row.overrides.updatedBy ? ` by ${row.overrides.updatedBy}` : ''}</span>
                      )}
                    </div>
                    {office !== 'LSO' && (
                      <p className="mt-1.5 text-xs text-ink-subtle">
                        Reviewed by the {OFFICE_LABELS[office]}. Its applications reach your Applications list once the office approves them.
                      </p>
                    )}
                  </div>
                  <Button size="sm" icon={Pencil} onClick={() => { setSaveError(''); setEditing(row); }} className="shrink-0 self-start">
                    Edit
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {editing && (
        <ScholarshipEditor row={editing} onClose={() => setEditing(null)} onSave={save} isSaving={isSaving} error={saveError} />
      )}
    </div>
  );
}
