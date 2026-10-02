import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import { CircleCheck, CircleOff, Info, ListChecks, Pencil, Plus, Save } from 'lucide-react';
import { ApplicationFormType, Scholarship, ScholarshipOffice, ScholarshipOverride } from '../../types';
import {
  OFFICE_LABELS, acceptsOnlineApplications, applyScholarshipOverrides, mockScholarships, officeOf
} from '../../data/scholarships';
import { API_BASE_URL, AppStatus, STATUS_OPTIONS, authHeaders, formatDateTime } from './adminData';
import {
  Alert, Badge, Button, Card, ConfirmDialog, DropdownMenu, DropdownMenuItem, EmptyState, ErrorState, Field, PageHeader,
  RowLink, SearchInput, SegmentedControl, Select, Skeleton, Table, TableSkeleton, Tabs, Td, TextInput, Textarea, Th,
  Toolbar, Tone, Tooltip, Tr
} from './AdminUI';

// AdSO-only page for managing every scholarship: open/close it and edit the
// details students see. The structural parts of a scholarship (name, office,
// application form, eligibility rules, required documents) are defined in
// code and aren't editable here. Application counts include POLCA and
// Alumni applications their office hasn't approved yet — view only.
//
// Two views: a compact list (filter, search, sort, row actions) and a
// detail view that holds the edit form. The parent owns which scholarship
// is open so the sidebar and scroll position follow it.

type ScholarshipStatus = Scholarship['status'];
const STATUSES: readonly ScholarshipStatus[] = ['Open', 'Closing Soon', 'Closed'];

const STATUS_TONE: Record<ScholarshipStatus, Tone> = {
  'Open': 'success',
  'Closing Soon': 'warning',
  'Closed': 'neutral'
};

// Shape returned by GET /api/scholarships/admin.
type ApplicationCounts = { total: number; byStatus: Partial<Record<AppStatus, number>> };

interface AdminScholarshipRow {
  id: string;
  name: string;
  office: string;
  overrides: ScholarshipOverride;
  applications: ApplicationCounts;
}

interface Row {
  scholarship: Scholarship;          // defaults merged with the AdSO's edits
  defaults: Scholarship;             // the defaults in code
  overrides: ScholarshipOverride;
  applications: ApplicationCounts;
}

function toRows(data: AdminScholarshipRow[]): Row[] {
  return mockScholarships.map(defaults => {
    const entry = data.find(d => d.id === defaults.id);
    const overrides = entry?.overrides ?? { id: defaults.id };
    return {
      defaults,
      overrides,
      scholarship: applyScholarshipOverrides([defaults], [overrides])[0],
      applications: entry?.applications ?? { total: 0, byStatus: {} }
    };
  });
}

function withOverrides(row: Row, overrides: ScholarshipOverride): Row {
  return { ...row, overrides, scholarship: applyScholarshipOverrides([row.defaults], [overrides])[0] };
}

const isEdited = (overrides: ScholarshipOverride) =>
  Object.keys(overrides).some(k => !['id', 'updatedAt', 'updatedBy'].includes(k));

function routingNote(office: ScholarshipOffice): string {
  return `Reviewed by the ${OFFICE_LABELS[office]} first. Applications it approves are forwarded to the AdSO automatically.`;
}

// The applications list's form labels name the scholarship ("Entrance
// form"); here they describe the form any scholarship of that type uses.
const FORM_LABELS: Record<ApplicationFormType, string> = {
  standard: 'Standard online form',
  sfag: 'SFA Grant form',
  polca: 'POLCA grant form',
  alumni: 'Alumni grant form'
};

function ScholarshipStatusBadge({ status }: { status: ScholarshipStatus }) {
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'} dot>{status}</Badge>;
}

// --- Schedule text ---------------------------------------------------------------
// Deadlines are free text written by people ("Applications open June 15,
// 2026", "Before scheduled enrollment, SY 2026–2027"). The list shows a
// short, consistent version; the full text stays in the detail view.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_PATTERN = MONTHS.join('|');
const MONTH_RE = new RegExp(`\\b(${MONTH_PATTERN})\\b`, 'g');
const DATE_RE = new RegExp(`\\b(${MONTH_PATTERN})\\s+(\\d{1,2})(?:\\s*[–-]\\s*\\d{1,2})?,\\s*(\\d{4})`);

function shortSchedule(text: string): string {
  const t = text
    .trim()
    .replace(/\.$/, '')
    .replace(MONTH_RE, month => month.slice(0, 3))
    .replace(/\bSY\s*(\d{4})\s*[–-]\s*\d{2}(\d{2})\b/g, 'SY $1–$2');
  const schoolYear = t.match(/SY \d{4}–\d{2}/)?.[0];
  const opens = t.match(/^applications open\s+(.+)$/i);
  if (opens) return `Opens ${opens[1]}`;
  if (/^before (scheduled )?enrollment/i.test(t)) return schoolYear ? `Before enrollment · ${schoolYear}` : 'Before enrollment';
  if (/^contact the adso/i.test(t)) return 'No fixed date';
  if (/^to be announced/i.test(t)) return 'To be announced';
  return t.replace(/\s*\([^)]*\)/g, '').trim() || t;
}

// First full date in the text, for sorting. Undated schedules sort last.
function scheduleTime(text: string): number | null {
  const m = text.match(DATE_RE);
  if (!m) return null;
  const time = new Date(`${m[1]} ${m[2]}, ${m[3]}`).getTime();
  return Number.isNaN(time) ? null : time;
}

// --- Editor state ------------------------------------------------------------------

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

// Compares what would be saved, so whitespace-only edits don't count.
function sameEditor(a: EditorState, b: EditorState): boolean {
  return a.status === b.status
    && a.deadline.trim() === b.deadline.trim()
    && a.description.trim() === b.description.trim()
    && sameList(fromLines(a.benefits), fromLines(b.benefits))
    && sameList(fromLines(a.eligibility), fromLines(b.eligibility))
    && sameList(fromLines(a.process), fromLines(b.process))
    && a.submissionNote.trim() === b.submissionNote.trim()
    && a.schedule.trim() === b.schedule.trim();
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

async function patchScholarship(
  getToken: () => Promise<string | null>,
  id: string,
  payload: Record<string, unknown>
): Promise<ScholarshipOverride> {
  const res = await fetch(`${API_BASE_URL}/api/scholarships/${id}`, {
    method: 'PATCH',
    headers: await authHeaders(getToken, true),
    body: JSON.stringify(payload)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Failed to save the scholarship.');
  return body.scholarship;
}

// --- Page ----------------------------------------------------------------------

type StatusFilter = 'all' | 'open' | 'closed';
type SortKey = 'name' | 'schedule';
type Notice = { tone: 'success' | 'danger'; text: string };

// Refetch when the admin comes back to the tab, at most this often.
const REFETCH_AFTER_MS = 30_000;

interface ScholarshipsManagerProps {
  // The signed-in admin's office. Rows from other offices name their office.
  ownOffice: ScholarshipOffice;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onViewApplications: (scholarshipId: string) => void;
}

export default function ScholarshipsManager({ ownOffice, selectedId, onSelect, onViewApplications }: ScholarshipsManagerProps) {
  const { getToken } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);

  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('name');

  const [closing, setClosing] = useState<Row | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState('');

  // A load that started before a save would overwrite the saved row with
  // stale data; each save bumps this so older responses are dropped.
  const loadSeq = useRef(0);
  const lastLoaded = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setIsLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/scholarships/admin`, { headers: await authHeaders(getToken) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'The server returned an error while loading scholarships.');
      if (seq !== loadSeq.current) return;
      setRows(toRows(body.scholarships ?? []));
      lastLoaded.current = Date.now();
    } catch (err) {
      if (seq === loadSeq.current) setLoadError(err instanceof Error ? err.message : 'Something went wrong loading scholarships.');
    } finally {
      if (seq === loadSeq.current) setIsLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const refetch = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoaded.current > REFETCH_AFTER_MS) load();
    };
    window.addEventListener('focus', refetch);
    document.addEventListener('visibilitychange', refetch);
    return () => {
      window.removeEventListener('focus', refetch);
      document.removeEventListener('visibilitychange', refetch);
    };
  }, [load]);

  const applyOverrides = (id: string, overrides: ScholarshipOverride) => {
    loadSeq.current++;
    setIsLoading(false);
    setRows(prev => prev.map(r => (r.defaults.id === id ? withOverrides(r, overrides) : r)));
  };

  const setStatus = async (row: Row, next: ScholarshipStatus) => {
    setStatusBusy(true);
    setStatusError('');
    try {
      const overrides = await patchScholarship(getToken, row.defaults.id, {
        status: next === row.defaults.status ? null : next
      });
      applyOverrides(row.defaults.id, overrides);
      setClosing(null);
      setNotice({ tone: 'success', text: `${next === 'Closed' ? 'Closed' : 'Opened'} ${row.scholarship.name}.` });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update the scholarship.';
      if (next === 'Closed') setStatusError(message);
      else setNotice({ tone: 'danger', text: message });
    } finally {
      setStatusBusy(false);
    }
  };

  const counts = useMemo(() => ({
    all: rows.length,
    open: rows.filter(r => r.scholarship.status !== 'Closed').length,
    closed: rows.filter(r => r.scholarship.status === 'Closed').length
  }), [rows]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = rows.filter(r => {
      const closed = r.scholarship.status === 'Closed';
      if (filter === 'open' && closed) return false;
      if (filter === 'closed' && !closed) return false;
      return !query || r.scholarship.name.toLowerCase().includes(query);
    });
    const byName = (a: Row, b: Row) => a.scholarship.name.localeCompare(b.scholarship.name);
    if (sort === 'name') return [...list].sort(byName);
    return [...list].sort((a, b) => {
      const ta = scheduleTime(a.scholarship.deadline);
      const tb = scheduleTime(b.scholarship.deadline);
      if (ta !== null && tb !== null && ta !== tb) return ta - tb;
      if (ta !== null && tb === null) return -1;
      if (ta === null && tb !== null) return 1;
      return byName(a, b);
    });
  }, [rows, filter, search, sort]);

  const firstLoad = isLoading && rows.length === 0;
  const failedEmpty = !!loadError && rows.length === 0 && !isLoading;
  const filtersActive = filter !== 'all' || search.trim() !== '';

  // --- Detail view ---------------------------------------------------------------
  const selected = selectedId ? rows.find(r => r.defaults.id === selectedId) : undefined;

  useEffect(() => {
    // An unknown id (e.g. a scholarship removed from the registry) goes back to the list.
    if (selectedId && rows.length > 0 && !selected) onSelect(null);
  }, [selectedId, rows.length, selected, onSelect]);

  if (selectedId) {
    if (selected) {
      return (
        <ScholarshipDetail
          key={selected.defaults.id}
          row={selected}
          ownOffice={ownOffice}
          getToken={getToken}
          onBack={() => onSelect(null)}
          onSaved={overrides => {
            applyOverrides(selected.defaults.id, overrides);
            setNotice({ tone: 'success', text: `Saved changes to ${selected.scholarship.name}.` });
            onSelect(null);
          }}
          onViewApplications={onViewApplications}
        />
      );
    }
    if (failedEmpty) {
      return <ErrorState title="Couldn't load the scholarship" message={loadError} onRetry={load} retrying={isLoading} />;
    }
    return <DetailSkeleton />;
  }

  // --- List view -------------------------------------------------------------------
  const menuItems = (row: Row): DropdownMenuItem[] => {
    const s = row.scholarship;
    const items: DropdownMenuItem[] = [
      { key: 'edit', label: 'Edit', icon: Pencil, onSelect: () => onSelect(s.id) },
      s.status === 'Closed'
        ? { key: 'open', label: 'Open scholarship', icon: CircleCheck, onSelect: () => setStatus(row, 'Open') }
        : { key: 'close', label: 'Close scholarship', icon: CircleOff, onSelect: () => { setStatusError(''); setClosing(row); } }
    ];
    if (acceptsOnlineApplications(s)) {
      items.push({ key: 'applications', label: 'View applications', icon: ListChecks, onSelect: () => onViewApplications(s.id) });
    }
    return items;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scholarships"
        description="Open or close scholarships and edit what students see."
        actions={
          <Tooltip content="Scholarships are added to the system by its developers for now. Adding them here needs backend support.">
            <Button variant="primary" icon={Plus} disabled className="pointer-events-none">New scholarship</Button>
          </Tooltip>
        }
      />

      {notice && (
        <Alert tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Alert>
      )}
      {loadError && rows.length > 0 && (
        <Alert tone="danger" title="Couldn't refresh scholarships" action={<Button size="sm" onClick={load}>Try again</Button>}>
          {loadError} Showing the last loaded list.
        </Alert>
      )}

      <Card
        flush
        headerSlot={
          <>
            <Tabs<StatusFilter>
              label="Filter by status"
              value={filter}
              onChange={setFilter}
              tabs={[
                { key: 'all', label: 'All', count: firstLoad ? undefined : counts.all },
                { key: 'open', label: 'Open', count: firstLoad ? undefined : counts.open },
                { key: 'closed', label: 'Closed', count: firstLoad ? undefined : counts.closed }
              ]}
            />
            <Toolbar>
              <SearchInput value={search} onChange={setSearch} label="Search scholarships" placeholder="Search by name…" className="flex-1" />
              <Select value={sort} onChange={v => setSort(v as SortKey)} label="Sort scholarships" className="md:w-48">
                <option value="name">Sort by name</option>
                <option value="schedule">Sort by schedule</option>
              </Select>
            </Toolbar>
          </>
        }
      >
        {firstLoad ? (
          <TableSkeleton rows={5} label="Loading scholarships" />
        ) : failedEmpty ? (
          <ErrorState title="Couldn't load scholarships" message={loadError} onRetry={load} retrying={isLoading} />
        ) : visible.length === 0 ? (
          filtersActive ? (
            <EmptyState
              title="No scholarships match"
              description="Try a different name or status."
              action={<Button onClick={() => { setFilter('all'); setSearch(''); }}>Clear filters</Button>}
            />
          ) : (
            <EmptyState title="No scholarships" description="Scholarships are defined in the system's scholarship list." />
          )
        ) : (
          <Table label="Scholarships" minWidth="54rem">
            <thead>
              <tr>
                <Th sticky={false}>Scholarship</Th>
                <Th sticky={false} className="w-36">Status</Th>
                <Th sticky={false} className="w-56">Schedule</Th>
                <Th sticky={false} className="w-40">Applications</Th>
                <Th sticky={false} className="w-16"><span className="sr-only">Actions</span></Th>
              </tr>
            </thead>
            <tbody>
              {visible.map(row => {
                const s = row.scholarship;
                const office = officeOf(s);
                const dim = s.status === 'Closed' ? 'opacity-55' : '';
                return (
                  <Tr key={s.id} onClick={() => onSelect(s.id)}>
                    <Td>
                      <div className={`min-w-0 ${dim}`}>
                        <RowLink onClick={() => onSelect(s.id)}>{s.name}</RowLink>
                        {office !== ownOffice && (
                          <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-ink-subtle">
                            <span className="truncate">{OFFICE_LABELS[office]}</span>
                            <Tooltip content={routingNote(office)} className="shrink-0">
                              <Info className="size-3.5" aria-hidden />
                              <span className="sr-only">How applications are routed</span>
                            </Tooltip>
                          </p>
                        )}
                      </div>
                    </Td>
                    <Td><div className={dim}><ScholarshipStatusBadge status={s.status} /></div></Td>
                    <Td>
                      <span title={s.deadline} className={`block truncate ${dim}`}>{shortSchedule(s.deadline)}</span>
                    </Td>
                    <Td><div className={dim}><ApplicationsCell row={row} /></div></Td>
                    <Td className="text-right">
                      <DropdownMenu label={`Actions for ${s.name}`} items={menuItems(row)} />
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {closing && (
        <ConfirmDialog
          title={`Close ${closing.scholarship.name}?`}
          description="Students won't see it in Explore and can't apply while it's closed. Applications already submitted aren't affected."
          confirmLabel="Close scholarship"
          confirmIcon={CircleOff}
          tone="danger"
          busy={statusBusy}
          error={statusError}
          onConfirm={() => setStatus(closing, 'Closed')}
          onCancel={() => { if (!statusBusy) setClosing(null); }}
        />
      )}
    </div>
  );
}

// Total plus a badge only for what needs action; the full breakdown is in
// the tooltip and on the detail view.
function ApplicationsCell({ row }: { row: Row }) {
  if (!acceptsOnlineApplications(row.scholarship)) {
    return <span className="text-ink-subtle">Info only</span>;
  }
  const { total, byStatus } = row.applications;
  if (total === 0) {
    return <span className="text-ink-subtle"><span aria-hidden>—</span><span className="sr-only">No applications</span></span>;
  }
  const pending = byStatus['Under Evaluation'] ?? 0;
  const breakdown = STATUS_OPTIONS
    .filter(status => (byStatus[status] ?? 0) > 0)
    .map(status => `${byStatus[status]} ${status.toLowerCase()}`)
    .join(' · ');
  return (
    <div className="flex items-center gap-2">
      <Tooltip content={breakdown}>
        <span className="font-medium text-ink tabular-nums">{total}</span>
        <span className="sr-only"> {total === 1 ? 'application' : 'applications'}</span>
      </Tooltip>
      {pending > 0 && <Badge tone="warning">{pending} pending</Badge>}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading scholarship">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-8 w-2/3" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-80 lg:col-span-2" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}

// --- Detail view -----------------------------------------------------------------

function ScholarshipDetail({ row, ownOffice, getToken, onBack, onSaved, onViewApplications }: {
  row: Row;
  ownOffice: ScholarshipOffice;
  getToken: () => Promise<string | null>;
  onBack: () => void;
  onSaved: (overrides: ScholarshipOverride) => void;
  onViewApplications: (scholarshipId: string) => void;
}) {
  const s = row.scholarship;
  const office = officeOf(s);
  const online = acceptsOnlineApplications(s);

  const [form, setForm] = useState<EditorState>(() => editorFrom(s));
  const [attempted, setAttempted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) => setForm(f => ({ ...f, [key]: value }));

  const dirty = !sameEditor(form, editorFrom(s));
  const atDefaults = sameEditor(form, editorFrom(row.defaults));

  const errors: Partial<Record<keyof EditorState, string>> = {};
  if (!form.deadline.trim()) errors.deadline = 'Enter a deadline or application period.';
  if (!form.description.trim()) errors.description = 'Enter a description.';
  if (fromLines(form.eligibility).length === 0) errors.eligibility = 'List at least one eligibility requirement.';
  const errorCount = Object.keys(errors).length;
  const shown = attempted ? errors : {};

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isSaving || !dirty) return;
    setAttempted(true);
    if (errorCount > 0) return;
    setIsSaving(true);
    setSaveError('');
    try {
      onSaved(await patchScholarship(getToken, row.defaults.id, toPayload(form, row.defaults)));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save the scholarship.');
      setIsSaving(false);
    }
  };

  const requestLeave = () => {
    if (isSaving) return;
    if (dirty) setConfirmLeave(true);
    else onBack();
  };

  const closingNow = form.status === 'Closed' && s.status !== 'Closed';
  const edited = isEdited(row.overrides);
  const editedLine = edited && row.overrides.updatedAt
    ? `Edited ${formatDateTime(row.overrides.updatedAt)}${row.overrides.updatedBy ? ` by ${row.overrides.updatedBy}` : ''}`
    : 'Using the default content';

  const showFooterError = attempted && errorCount > 0;
  const footerMessage = showFooterError
    ? `Fix ${errorCount} ${errorCount === 1 ? 'field' : 'fields'} before saving.`
    : dirty ? 'You have unsaved changes.' : 'No changes yet.';

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ label: 'Scholarships', onClick: requestLeave }}
        title={s.name}
        description={office === ownOffice ? OFFICE_LABELS[office] : routingNote(office)}
        meta={
          <>
            <ScholarshipStatusBadge status={s.status} />
            {!online && <Badge>Info only</Badge>}
            <span className="text-xs text-ink-subtle">{editedLine}</span>
          </>
        }
      />

      {saveError && <Alert tone="danger" title="Couldn't save the scholarship">{saveError}</Alert>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
        {/* scroll-margin keeps a focused field clear of the sticky save bar */}
        <form
          id="scholarship-form"
          className="space-y-6 lg:col-span-2 [&_input]:scroll-mb-28 [&_textarea]:scroll-mb-28 [&_button]:scroll-mb-28"
          onSubmit={submit}
          noValidate
        >
          <Card title="Basic info" description="What students read on the scholarship's card and details page.">
            <div className="space-y-5">
              <Field label="Status" helper="Closed scholarships are hidden from students' Explore list and can't be applied to.">
                <SegmentedControl<ScholarshipStatus>
                  options={STATUSES}
                  value={form.status}
                  onChange={v => v && set('status', v)}
                  label="Scholarship status"
                />
              </Field>
              {closingNow && (
                <Alert tone="warning">Students won't be able to apply while it's closed. Applications already submitted aren't affected.</Alert>
              )}
              <Field label="Description" error={shown.description}>
                <Textarea value={form.description} onChange={e => set('description', e.target.value)} rows={4} maxLength={4000} disabled={isSaving} className="resize-y" />
              </Field>
              <Field label="Benefits" helper="One per line.">
                <Textarea value={form.benefits} onChange={e => set('benefits', e.target.value)} rows={5} disabled={isSaving} className="resize-y" />
              </Field>
            </div>
          </Card>

          <Card title="Eligibility" description="This is what students read. The system's eligibility checks don't change.">
            <Field label="Who can apply" helper="One requirement per line." error={shown.eligibility}>
              <Textarea value={form.eligibility} onChange={e => set('eligibility', e.target.value)} rows={5} disabled={isSaving} className="resize-y" />
            </Field>
          </Card>

          <Card title="Requirements" description="Documents are set by the system. The steps and the submission note are yours to edit.">
            <div className="space-y-5">
              <div>
                <p className="mb-1.5 text-sm font-medium text-ink">Documents</p>
                {s.requirements.length > 0 ? (
                  <ul className="space-y-1.5 text-sm text-ink-muted">
                    {s.requirements.map(req => (
                      <li key={req} className="flex gap-2">
                        <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-ink-subtle" />
                        <span>{req}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-subtle">No documents — this scholarship doesn't take online applications.</p>
                )}
              </div>
              <Field label="Application process" helper="One step per line.">
                <Textarea value={form.process} onChange={e => set('process', e.target.value)} rows={5} disabled={isSaving} className="resize-y" />
              </Field>
              <Field label="Submission note" optional helper="Shown on the details page and after a student submits.">
                <TextInput value={form.submissionNote} onChange={e => set('submissionNote', e.target.value)} maxLength={500} disabled={isSaving} placeholder="e.g. Submit complete requirements to the Alumni Office." />
              </Field>
            </div>
          </Card>

          <Card title="Schedule">
            <div className="space-y-5">
              <Field
                label="Deadline / application period"
                error={shown.deadline}
                helper={form.deadline.trim() ? <>Shown in the list as “{shortSchedule(form.deadline)}”.</> : undefined}
              >
                <TextInput value={form.deadline} onChange={e => set('deadline', e.target.value)} maxLength={200} disabled={isSaving} placeholder="e.g. Applications open June 15, 2026" />
              </Field>
              {row.defaults.scheduleLabel && (
                <Field label={row.defaults.scheduleLabel} optional helper="Shown on the scholarship's card and details page. For the full details, post an announcement and set its related scholarship to this one.">
                  <TextInput value={form.schedule} onChange={e => set('schedule', e.target.value)} maxLength={300} disabled={isSaving} placeholder="e.g. November 3–7, 2026, 4:00 PM, at the University Gym" />
                </Field>
              )}
            </div>
          </Card>
        </form>

        <aside className="space-y-6">
          <Card
            title="Applications"
            footer={online && row.applications.total > 0 ? (
              <Button size="sm" icon={ListChecks} onClick={() => onViewApplications(s.id)}>View applications</Button>
            ) : undefined}
          >
            {online ? (
              <dl className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-muted">Total</dt>
                  <dd className="font-medium text-ink tabular-nums">{row.applications.total}</dd>
                </div>
                {STATUS_OPTIONS.map(status => (
                  <div key={status} className="flex items-center justify-between gap-3">
                    <dt className="text-ink-muted">{status}</dt>
                    <dd className="text-ink tabular-nums">{row.applications.byStatus[status] ?? 0}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-ink-muted">This scholarship is listed for information only. Students can't apply online, so it has no applications.</p>
            )}
          </Card>

          <Card title="Set by the system">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-ink-subtle">Office</dt>
                <dd className="text-ink">{OFFICE_LABELS[office]}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-subtle">Application</dt>
                <dd className="text-ink">{online ? FORM_LABELS[s.applicationFormType ?? 'standard'] : 'None — info only'}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-ink-subtle">
              The name, office, application form, eligibility checks and required documents can't be changed here.
            </p>
          </Card>
        </aside>
      </div>

      <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card bg-surface/95 px-4 py-3 shadow-overlay ring-1 ring-line backdrop-blur">
        <p
          className={`mr-auto text-sm ${showFooterError ? 'w-full text-danger-fg sm:w-auto' : 'hidden text-ink-muted sm:block'}`}
          aria-live="polite"
        >
          {footerMessage}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" onClick={() => setForm(editorFrom(row.defaults))} disabled={isSaving || atDefaults}>
            <span className="sm:hidden">Reset</span>
            <span className="hidden sm:inline">Reset to defaults</span>
          </Button>
          <Button onClick={requestLeave} disabled={isSaving}>Cancel</Button>
          <Button variant="primary" type="submit" form="scholarship-form" icon={Save} loading={isSaving} disabled={isSaving || !dirty}>
            Save changes
          </Button>
        </div>
      </div>

      {confirmLeave && (
        <ConfirmDialog
          title="Discard your changes?"
          description="Your edits to this scholarship haven't been saved."
          confirmLabel="Discard changes"
          tone="danger"
          onConfirm={onBack}
          onCancel={() => setConfirmLeave(false)}
        />
      )}
    </div>
  );
}
