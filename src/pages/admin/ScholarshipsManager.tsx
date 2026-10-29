import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import { CircleCheck, CircleOff, Clock, Info, LayoutList, ListChecks, Pencil, Plus, Save, Table2, Trash2 } from 'lucide-react';
import { ApplicationFormType, Scholarship, ScholarshipOffice, ScholarshipOverride } from '../../types';
import {
  OFFICE_LABELS, acceptsOnlineApplications, applyScholarshipOverrides, officeOf, registerCustomScholarships, scholarshipDefaults
} from '../../data/scholarships';
import { EligibilityRules, lockedRules, ruleLines } from '../../data/requirementCatalog';
import { DocumentsEditor, ListEditor, RulesEditor } from './RequirementEditors';
import ScholarshipMatrix, { MatrixPatch } from './ScholarshipMatrix';
import { API_BASE_URL, AppStatus, STATUS_OPTIONS, authHeaders, formatDateTime } from './adminData';
import {
  Alert, Badge, Button, Card, ConfirmDialog, DropdownMenu, DropdownMenuItem, EmptyState, ErrorState, Field, Modal, PageHeader,
  RowLink, SearchInput, SegmentedControl, Select, Skeleton, Table, TableSkeleton, Tabs, Td, TextInput, Textarea, Th,
  Toolbar, Tone, Tooltip, Tr
} from './AdminUI';
import ScholarshipStatusDialog, { StatusDialogResult } from './ScholarshipStatusDialog';
import { formatScheduled } from './announcementSchedule';

// AdSO-only page for managing every scholarship: open/close it and edit the
// details students see. Changing the status (from the list or the edit
// page) offers an announcement, drafted for the change, to publish now or
// schedule (ScholarshipStatusDialog). The structural parts of a scholarship (name, office,
// application form, eligibility rules, required documents) are defined in
// code and aren't editable here. Application counts include POLCA and
// Alumni applications their office hasn't approved yet — view only.
//
// Eligibility and documents are ticked from a shared list
// (data/requirementCatalog.ts) instead of typed, and the Matrix view shows
// and edits them for every scholarship at once. The AdSO can also create
// scholarships of their own (standard form or info only).
//
// Views: a compact list (filter, search, sort, row actions) or the matrix,
// and a detail view that holds the edit form. The parent owns which scholarship
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
  custom?: boolean;
  overrides: ScholarshipOverride;
  applications: ApplicationCounts;
}

interface Row {
  scholarship: Scholarship;          // defaults merged with the AdSO's edits
  defaults: Scholarship;             // the defaults in code (blank for created ones)
  overrides: ScholarshipOverride;
  applications: ApplicationCounts;
}

const merge = (defaults: Scholarship, overrides: ScholarshipOverride) => applyScholarshipOverrides([defaults], [overrides])[0];

function toRow(overrides: ScholarshipOverride, applications: ApplicationCounts = { total: 0, byStatus: {} }): Row {
  const defaults = scholarshipDefaults(overrides);
  return { defaults, overrides, scholarship: merge(defaults, overrides), applications };
}

// Built-in scholarships first (the server lists them in code order), then
// the ones the AdSO created.
function toRows(data: AdminScholarshipRow[]): Row[] {
  return data.map(entry => toRow(entry.overrides ?? { id: entry.id }, entry.applications));
}

function withOverrides(row: Row, overrides: ScholarshipOverride): Row {
  const defaults = row.defaults.custom ? scholarshipDefaults(overrides) : row.defaults;
  return { ...row, defaults, overrides, scholarship: merge(defaults, overrides) };
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
  sfag: 'SFAG form',
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
  benefits: string[];
  process: string[];
  submissionNote: string;
  schedule: string;
  rules: EligibilityRules;
  customEligibility: string[];
  documentKeys: string[];
  customDocuments: string[];
  // Created scholarships only.
  name: string;
  office: ScholarshipOffice;
  category: Scholarship['category'];
  applicationMode: 'online' | 'info';
  referenceCode: string;
  availNote: string;
}

const CATEGORIES: Scholarship['category'][] = ['Academic', 'Financial', 'Athletic', 'Leadership', 'Others'];
const clean = (items: string[]) => items.map(item => item.trim()).filter(Boolean);
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x));
// "Anyone" is the same as no applicant-type rule.
const rulesKey = (rules: EligibilityRules) => JSON.stringify(
  Object.entries(rules).filter(([k, v]) => v !== undefined && v !== false && !(k === 'applicantType' && v === 'any')).sort(([a], [b]) => a.localeCompare(b))
);

function editorFrom(s: Scholarship): EditorState {
  return {
    status: s.status,
    deadline: s.deadline,
    description: s.description,
    benefits: [...s.benefits],
    process: [...s.process],
    submissionNote: s.submissionNote ?? '',
    schedule: s.schedule ?? '',
    rules: { ...(s.rules ?? {}) },
    customEligibility: [...(s.customEligibility ?? [])],
    documentKeys: [...(s.documentKeys ?? [])],
    customDocuments: [...(s.customDocuments ?? [])],
    name: s.name,
    office: officeOf(s),
    category: s.category,
    applicationMode: s.applicationMode ?? 'online',
    referenceCode: s.referenceCode ?? '',
    availNote: s.availNote ?? ''
  };
}

// Compares what would be saved, so whitespace-only edits don't count.
function sameEditor(a: EditorState, b: EditorState): boolean {
  return a.status === b.status
    && a.deadline.trim() === b.deadline.trim()
    && a.description.trim() === b.description.trim()
    && sameList(clean(a.benefits), clean(b.benefits))
    && sameList(clean(a.process), clean(b.process))
    && a.submissionNote.trim() === b.submissionNote.trim()
    && a.schedule.trim() === b.schedule.trim()
    && rulesKey(a.rules) === rulesKey(b.rules)
    && sameList(clean(a.customEligibility), clean(b.customEligibility))
    && sameSet(a.documentKeys, b.documentKeys)
    && sameList(clean(a.customDocuments), clean(b.customDocuments))
    && a.name.trim() === b.name.trim()
    && a.office === b.office
    && a.category === b.category
    && a.applicationMode === b.applicationMode
    && a.referenceCode.trim().toUpperCase() === b.referenceCode.trim().toUpperCase()
    && a.availNote.trim() === b.availNote.trim();
}

// Builds the PATCH body. A value equal to the default in code is sent as
// null, which clears the override instead of storing a copy of the default.
function toPayload(form: EditorState, defaults: Scholarship) {
  const text = (value: string, base: string | undefined) => (value.trim() === (base ?? '').trim() ? null : value.trim());
  const list = (value: string[], base: string[] = []) => (sameList(clean(value), base) ? null : clean(value));
  const slotBased = !!defaults.documentSlots?.length;
  return {
    status: form.status === defaults.status ? null : form.status,
    deadline: text(form.deadline, defaults.deadline),
    description: text(form.description, defaults.description),
    benefits: list(form.benefits, defaults.benefits),
    process: list(form.process, defaults.process),
    submissionNote: text(form.submissionNote, defaults.submissionNote),
    // Only scholarships with a schedule (e.g. Athletic tryouts) send it.
    ...(defaults.scheduleLabel ? { schedule: text(form.schedule, defaults.schedule) } : {}),
    rules: rulesKey(form.rules) === rulesKey(defaults.rules ?? {}) ? null : form.rules,
    customEligibility: list(form.customEligibility, defaults.customEligibility),
    // POLCA and Alumni upload against their own form's fixed slots.
    ...(slotBased ? {} : {
      documentKeys: sameSet(form.documentKeys, defaults.documentKeys ?? []) ? null : form.documentKeys,
      customDocuments: list(form.customDocuments, defaults.customDocuments)
    }),
    ...(defaults.custom ? {
      name: form.name.trim(),
      office: form.office,
      category: form.category,
      applicationMode: form.applicationMode,
      referenceCode: form.referenceCode.trim().toUpperCase(),
      availNote: form.availNote.trim() || null
    } : {})
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

  // A status change in progress: from the list ('change' — the dialog saves
  // it) or already saved on the edit page ('announce').
  const [statusChange, setStatusChange] = useState<{ row: Row; next: ScholarshipStatus; mode: 'change' | 'announce' } | null>(null);
  const [view, setView] = useState<'List' | 'Matrix'>('List');
  const [creating, setCreating] = useState(false);

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

  // Created scholarships are looked up by id across the admin (names in
  // application lists, history, announcements).
  useEffect(() => { registerCustomScholarships(rows.map(r => r.scholarship)); }, [rows]);

  // A matrix cell: shown right away, saved, and put back if saving fails.
  const patchFromMatrix = async (scholarship: Scholarship, patch: MatrixPatch) => {
    const row = rows.find(r => r.defaults.id === scholarship.id);
    if (!row) return;
    applyOverrides(row.defaults.id, { ...row.overrides, ...patch });
    try {
      applyOverrides(row.defaults.id, await patchScholarship(getToken, row.defaults.id, patch as Record<string, unknown>));
    } catch (err) {
      applyOverrides(row.defaults.id, row.overrides);
      setNotice({ tone: 'danger', text: `Couldn't save ${scholarship.name}: ${err instanceof Error ? err.message : 'try again.'}` });
    }
  };

  const created = (overrides: ScholarshipOverride) => {
    loadSeq.current++;
    setIsLoading(false);
    setRows(prev => [...prev, toRow(overrides)]);
    setCreating(false);
    setNotice({ tone: 'success', text: `Created ${overrides.name}. Fill in its details, then open it when it's ready.` });
    onSelect(overrides.id);
  };

  const statusChanged = ({ row, next, mode }: NonNullable<typeof statusChange>, result: StatusDialogResult) => {
    if (result.overrides) applyOverrides(row.defaults.id, result.overrides);
    setStatusChange(null);
    const name = row.scholarship.name;
    const did = mode === 'announce' ? `Saved ${name}.` : `${next === 'Closed' ? 'Closed' : next === 'Open' ? 'Opened' : 'Marked as closing soon:'} ${name}.`;
    const a = result.announcement;
    const posted = !a ? '' : a.scheduledFor ? ` The announcement publishes ${formatScheduled(a.scheduledFor)}.` : ' The announcement is published.';
    const fb = a?.facebookError ? ` Facebook wasn't updated: ${a.facebookError} Retry it in Announcements.` : '';
    setNotice({ tone: fb ? 'danger' : 'success', text: `${did}${posted}${fb}` });
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
            const before = selected.scholarship.status;
            const updated = withOverrides(selected, overrides);
            applyOverrides(selected.defaults.id, overrides);
            setNotice({ tone: 'success', text: `Saved changes to ${selected.scholarship.name}.` });
            // A status change gets the announcement step.
            if (updated.scholarship.status !== before) setStatusChange({ row: updated, next: updated.scholarship.status, mode: 'announce' });
            onSelect(null);
          }}
          onViewApplications={onViewApplications}
          onDeleted={() => {
            loadSeq.current++;
            setRows(prev => prev.filter(r => r.defaults.id !== selected.defaults.id));
            setNotice({ tone: 'success', text: `Deleted ${selected.scholarship.name}.` });
            onSelect(null);
          }}
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
        ? { key: 'open', label: 'Open scholarship', icon: CircleCheck, onSelect: () => setStatusChange({ row, next: 'Open', mode: 'change' }) }
        : { key: 'close', label: 'Close scholarship', icon: CircleOff, onSelect: () => setStatusChange({ row, next: 'Closed', mode: 'change' }) }
    ];
    if (s.status === 'Open') {
      items.splice(2, 0, { key: 'closing-soon', label: 'Mark closing soon', icon: Clock, onSelect: () => setStatusChange({ row, next: 'Closing Soon', mode: 'change' }) });
    }
    if (acceptsOnlineApplications(s)) {
      items.push({ key: 'applications', label: 'View applications', icon: ListChecks, onSelect: () => onViewApplications(s.id) });
    }
    return items;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scholarships"
        description="Open or close scholarships and edit their eligibility and documents."
        actions={<Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New scholarship</Button>}
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
              {view === 'List' && (
                <Select value={sort} onChange={v => setSort(v as SortKey)} label="Sort scholarships" className="md:w-48">
                  <option value="name">Sort by name</option>
                  <option value="schedule">Sort by schedule</option>
                </Select>
              )}
              <SegmentedControl<'List' | 'Matrix'>
                options={['List', 'Matrix']}
                value={view}
                onChange={v => v && setView(v)}
                label="View"
                className="md:w-56"
                renderLabel={o => (
                  <span className="inline-flex items-center gap-1.5">
                    {o === 'List' ? <LayoutList className="size-4" aria-hidden /> : <Table2 className="size-4" aria-hidden />}
                    {o === 'List' ? 'List' : 'Requirements'}
                  </span>
                )}
              />
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
            <EmptyState title="No scholarships" description="Create one to get started." action={<Button icon={Plus} onClick={() => setCreating(true)}>New scholarship</Button>} />
          )
        ) : view === 'Matrix' ? (
          <ScholarshipMatrix
            scholarships={[...visible].sort((a, b) => Number(!!a.scholarship.custom) - Number(!!b.scholarship.custom)).map(r => r.scholarship)}
            onPatch={patchFromMatrix}
            onOpen={onSelect}
          />
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
                        {s.custom && <Badge className="ml-2">Added by AdSO</Badge>}
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

      {creating && (
        <CreateScholarshipDialog getToken={getToken} onClose={() => setCreating(false)} onCreated={created} />
      )}

      {statusChange && (
        <ScholarshipStatusDialog
          key={`${statusChange.row.defaults.id}-${statusChange.next}-${statusChange.mode}`}
          scholarship={statusChange.mode === 'change' ? { ...statusChange.row.scholarship, status: statusChange.next } : statusChange.row.scholarship}
          next={statusChange.next}
          mode={statusChange.mode}
          getToken={getToken}
          changeStatus={() => patchScholarship(getToken, statusChange.row.defaults.id, {
            status: statusChange.next === statusChange.row.defaults.status ? null : statusChange.next
          })}
          onDone={result => statusChanged(statusChange, result)}
          onCancel={() => setStatusChange(null)}
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

function ScholarshipDetail({ row, ownOffice, getToken, onBack, onSaved, onViewApplications, onDeleted }: {
  row: Row;
  ownOffice: ScholarshipOffice;
  getToken: () => Promise<string | null>;
  onBack: () => void;
  onSaved: (overrides: ScholarshipOverride) => void;
  onViewApplications: (scholarshipId: string) => void;
  onDeleted: () => void;
}) {
  const s = row.scholarship;
  const isCustom = !!row.defaults.custom;

  const [form, setForm] = useState<EditorState>(() => editorFrom(s));
  const [attempted, setAttempted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) => setForm(f => ({ ...f, [key]: value }));

  const office = isCustom ? form.office : officeOf(s);
  const online = isCustom ? form.applicationMode === 'online' : acceptsOnlineApplications(s);
  const slotBased = !!row.defaults.documentSlots?.length;
  const locked = lockedRules(row.defaults.applicationFormType);

  const dirty = !sameEditor(form, editorFrom(s));
  const atDefaults = sameEditor(form, editorFrom(row.defaults));

  const errors: Partial<Record<keyof EditorState, string>> = {};
  if (isCustom && !form.name.trim()) errors.name = 'Enter the scholarship name.';
  if (isCustom && !/^[A-Za-z]{2,8}$/.test(form.referenceCode.trim())) errors.referenceCode = '2–8 letters, e.g. CSG.';
  if (!form.deadline.trim()) errors.deadline = 'Enter a deadline or application period.';
  if (!form.description.trim()) errors.description = 'Enter a description.';
  if (ruleLines(form.rules).length + clean(form.customEligibility).length === 0) errors.customEligibility = 'Tick at least one rule or add a condition, so students know who can apply.';
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

  const remove = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/scholarships/${row.defaults.id}`, { method: 'DELETE', headers: await authHeaders(getToken) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't delete the scholarship.");
      onDeleted();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Couldn't delete the scholarship.");
      setDeleting(false);
    }
  };

  const requestLeave = () => {
    if (isSaving) return;
    if (dirty) setConfirmLeave(true);
    else onBack();
  };

  const closingNow = form.status === 'Closed' && s.status !== 'Closed';
  const edited = isEdited(row.overrides);
  const editedLine = isCustom
    ? `Added${row.overrides.updatedAt ? ` · edited ${formatDateTime(row.overrides.updatedAt)}` : ''}${row.overrides.updatedBy ? ` by ${row.overrides.updatedBy}` : ''}`
    : edited && row.overrides.updatedAt
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
        title={isCustom ? form.name.trim() || 'Untitled scholarship' : s.name}
        description={office === ownOffice ? OFFICE_LABELS[office] : routingNote(office)}
        meta={
          <>
            <ScholarshipStatusBadge status={s.status} />
            {!online && <Badge>Info only</Badge>}
            {isCustom && <Badge>Added by AdSO</Badge>}
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
          {isCustom && (
            <Card title="Details" description="Set when the scholarship was added. Students see the name and category.">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Field label="Name" error={shown.name} className="sm:col-span-2">
                  <TextInput value={form.name} onChange={e => set('name', e.target.value)} maxLength={150} disabled={isSaving} />
                </Field>
                <Field label="Reviewed by">
                  <Select value={form.office} onChange={v => set('office', v as ScholarshipOffice)} disabled={isSaving}>
                    {(Object.keys(OFFICE_LABELS) as ScholarshipOffice[]).map(o => <option key={o} value={o}>{OFFICE_LABELS[o]}</option>)}
                  </Select>
                </Field>
                <Field label="Category">
                  <Select value={form.category} onChange={v => set('category', v as Scholarship['category'])} disabled={isSaving}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </Field>
                <Field label="How students get it" className="sm:col-span-2" helper={form.applicationMode === 'online' ? 'Students apply in AniSkolar with the standard form and upload the documents below.' : 'Listed for information only, with no Apply button.'}>
                  <SegmentedControl<'online' | 'info'>
                    options={['online', 'info']}
                    value={form.applicationMode}
                    onChange={v => v && set('applicationMode', v)}
                    label="How students get it"
                    renderLabel={o => (o === 'online' ? 'Online application' : 'Info only')}
                  />
                </Field>
                {form.applicationMode === 'info' && (
                  <Field label="How it's awarded" optional className="sm:col-span-2">
                    <TextInput value={form.availNote} onChange={e => set('availNote', e.target.value)} maxLength={500} disabled={isSaving} placeholder="e.g. Nominated by the department chair each semester." />
                  </Field>
                )}
                <Field label="Reference code" error={shown.referenceCode} helper={`Application numbers start with it, e.g. ${(form.referenceCode.trim().toUpperCase() || 'CODE')}-2026-0001.`}>
                  <TextInput value={form.referenceCode} onChange={e => set('referenceCode', e.target.value.toUpperCase())} maxLength={8} disabled={isSaving || row.applications.total > 0} />
                </Field>
              </div>
            </Card>
          )}

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
              <Field label="Benefits">
                <ListEditor items={form.benefits} onChange={v => set('benefits', v)} label="Benefit" addLabel="Add benefit" placeholder="e.g. 100% tuition discount" disabled={isSaving} />
              </Field>
            </div>
          </Card>

          <Card
            title="Eligibility"
            description="Tick what applies. Students read the lines shown; rules marked “Checked against profile” warn a student whose profile doesn't fit."
          >
            <div className="space-y-5">
              <RulesEditor rules={form.rules} onChange={v => set('rules', v)} locked={locked} disabled={isSaving} />
              <Field label="Other conditions" optional helper="Shown to students as written; not checked." error={shown.customEligibility}>
                <ListEditor items={form.customEligibility} onChange={v => set('customEligibility', v)} label="Condition" addLabel="Add condition" placeholder="e.g. Must be a member of the Vicissitude Editorial Board" disabled={isSaving} />
              </Field>
            </div>
          </Card>

          <Card
            title="Documents"
            description={slotBased
              ? `Set by the ${s.name} application form.`
              : online ? 'Tick the documents students upload. Each one becomes an upload slot on the application form.' : 'Info-only scholarships have no online application, so nothing is uploaded.'}
          >
            <div className="space-y-5">
              {slotBased ? (
                <ul className="space-y-1.5 text-sm text-ink-muted">
                  {s.requirements.map(req => (
                    <li key={req} className="flex gap-2">
                      <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-ink-subtle" />
                      <span>{req}</span>
                    </li>
                  ))}
                </ul>
              ) : online ? (
                <>
                  <DocumentsEditor keys={form.documentKeys} onChange={v => set('documentKeys', v)} disabled={isSaving} />
                  <Field label="Documents not on the list" optional>
                    <ListEditor items={form.customDocuments} onChange={v => set('customDocuments', v)} label="Document" addLabel="Add document" placeholder="e.g. Certificate of membership from the organization" disabled={isSaving} />
                  </Field>
                </>
              ) : null}
              <Field label="Application process">
                <ListEditor items={form.process} onChange={v => set('process', v)} label="Step" addLabel="Add step" placeholder="e.g. Upload the required documents as JPG files." disabled={isSaving} numbered />
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

          {isCustom ? (
            <Card title="Delete scholarship">
              <p className="text-sm text-ink-muted">
                {row.applications.total > 0
                  ? 'It has applications, so it can\'t be deleted. Close it instead.'
                  : 'Removes it for good. Only possible while it has no applications.'}
              </p>
              {row.applications.total === 0 && (
                <Button className="mt-3" size="sm" variant="danger-secondary" icon={Trash2} onClick={() => { setDeleteError(''); setConfirmDelete(true); }}>
                  Delete scholarship
                </Button>
              )}
            </Card>
          ) : (
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
                The name, office and application form are built in.{slotBased ? ' Its documents, and the rules its form checks, are fixed too.' : ''}
              </p>
            </Card>
          )}
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
          {!isCustom && (
            <Button variant="ghost" onClick={() => setForm(editorFrom(row.defaults))} disabled={isSaving || atDefaults}>
              <span className="sm:hidden">Reset</span>
              <span className="hidden sm:inline">Reset to defaults</span>
            </Button>
          )}
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
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${s.name}?`}
          description="It's removed from AniSkolar for good. This can't be undone."
          confirmLabel="Delete scholarship"
          confirmIcon={Trash2}
          tone="danger"
          busy={deleting}
          error={deleteError}
          onConfirm={remove}
          onCancel={() => { if (!deleting) setConfirmDelete(false); }}
        />
      )}
    </div>
  );
}

// --- New scholarship -------------------------------------------------------------

// First letters of the name's words, e.g. "Computer Studies Grant" -> CSG.
function suggestCode(name: string): string {
  const letters = name.replace(/[^A-Za-z\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 || /^[A-Z]+$/.test(w)).map(w => w[0]).join('').toUpperCase();
  return letters.length >= 2 ? letters.slice(0, 8) : name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
}

function CreateScholarshipDialog({ getToken, onClose, onCreated }: {
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onCreated: (overrides: ScholarshipOverride) => void;
}) {
  const [name, setName] = useState('');
  const [office, setOffice] = useState<ScholarshipOffice>('LSO');
  const [category, setCategory] = useState<Scholarship['category']>('Others');
  const [mode, setMode] = useState<'online' | 'info'>('online');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [benefits, setBenefits] = useState('');
  const [deadline, setDeadline] = useState('');
  const [availNote, setAvailNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const shownCode = codeTouched ? code : suggestCode(name);
  const benefitList = benefits.split('\n').map(b => b.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);

  const submit = async () => {
    if (busy) return;
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Enter the scholarship name.';
    if (!/^[A-Za-z]{2,8}$/.test(shownCode)) e.code = 'Use 2–8 letters, e.g. CSG.';
    if (!description.trim()) e.description = 'Describe the scholarship for students.';
    if (!benefitList.length) e.benefits = 'List at least one benefit.';
    if (mode === 'online' && !deadline.trim()) e.deadline = 'Enter when applications are accepted.';
    if (mode === 'info' && !availNote.trim()) e.availNote = 'Tell students how to get it outside AniSkolar.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/scholarships`, {
        method: 'POST',
        headers: await authHeaders(getToken, true),
        body: JSON.stringify({
          name: name.trim(), office, category, applicationMode: mode, referenceCode: shownCode,
          description: description.trim(), benefits: benefitList, deadline: deadline.trim() || undefined,
          ...(mode === 'info' ? { availNote: availNote.trim() } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't create the scholarship.");
      onCreated(body.scholarship);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the scholarship.");
      setBusy(false);
    }
  };

  const section = (title: string, hint: string) => (
    <div className="sm:col-span-2 border-t border-line pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-0.5 text-xs text-ink-subtle">{hint}</p>
    </div>
  );

  return (
    <Modal
      size="lg"
      sheet
      title="New scholarship"
      description="It starts closed. After this you'll pick its eligibility rules and documents, then open it."
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" icon={Plus} onClick={submit} loading={busy}>Create and continue</Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-5 sm:grid-cols-2" onSubmit={ev => { ev.preventDefault(); submit(); }} noValidate>
        {error && <div className="sm:col-span-2"><Alert tone="danger">{error}</Alert></div>}

        {section('Basics', 'How the scholarship is named, who reviews it, and how students get it.')}
        <Field label="Name" error={errors.name} className="sm:col-span-2">
          <TextInput value={name} onChange={ev => setName(ev.target.value)} maxLength={150} placeholder="e.g. Computer Studies Grant" autoFocus disabled={busy} />
        </Field>
        <Field label="Reviewed by">
          <Select value={office} onChange={v => setOffice(v as ScholarshipOffice)} disabled={busy}>
            {(Object.keys(OFFICE_LABELS) as ScholarshipOffice[]).map(o => <option key={o} value={o}>{OFFICE_LABELS[o]}</option>)}
          </Select>
        </Field>
        <Field label="Category">
          <Select value={category} onChange={v => setCategory(v as Scholarship['category'])} disabled={busy}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="How students get it" className="sm:col-span-2" helper={mode === 'online' ? 'Students apply in AniSkolar and upload their documents.' : 'Students only read about it here; they apply through the office.'}>
          <SegmentedControl<'online' | 'info'>
            options={['online', 'info']}
            value={mode}
            onChange={v => v && setMode(v)}
            label="How students get it"
            renderLabel={o => (o === 'online' ? 'Online application' : 'Info only')}
          />
        </Field>
        <Field label="Reference code" error={errors.code} helper={!errors.code ? `Application numbers start with it: ${shownCode || 'CODE'}-2026-0001.` : undefined}>
          <TextInput
            value={shownCode}
            onChange={ev => { setCodeTouched(true); setCode(ev.target.value.toUpperCase().replace(/[^A-Z]/g, '')); }}
            maxLength={8}
            disabled={busy}
          />
        </Field>

        {section('What students see', 'Shown on the scholarship’s page and in Explore. You can edit all of it later.')}
        <Field label="Description" error={errors.description} className="sm:col-span-2" labelAside={`${description.length}/4000`}>
          <Textarea value={description} onChange={ev => setDescription(ev.target.value)} rows={4} maxLength={4000} disabled={busy} placeholder="Who it's for and what it supports, in a few sentences." className="resize-y" />
        </Field>
        <Field label="Benefits" error={errors.benefits} className="sm:col-span-2" helper={!errors.benefits ? 'One per line, e.g. “100% tuition discount”.' : undefined}>
          <Textarea value={benefits} onChange={ev => setBenefits(ev.target.value)} rows={3} disabled={busy} placeholder={'100% tuition discount\nMonthly book allowance'} className="resize-y" />
        </Field>
        <Field label="Application period" error={errors.deadline} optional={mode === 'info'} className="sm:col-span-2" helper={!errors.deadline ? 'Typed as students should read it, e.g. “June 16 – July 3, 2027”.' : undefined}>
          <TextInput value={deadline} onChange={ev => setDeadline(ev.target.value)} maxLength={200} disabled={busy} placeholder="e.g. June 16 – July 3, 2027" />
        </Field>
        {mode === 'info' && (
          <Field label="How to get it" error={errors.availNote} className="sm:col-span-2" helper={!errors.availNote ? 'Where and how students apply outside AniSkolar.' : undefined}>
            <Textarea value={availNote} onChange={ev => setAvailNote(ev.target.value)} rows={2} maxLength={500} disabled={busy} placeholder="e.g. Apply at the Sports Development Office, 2nd floor, during tryouts." className="resize-y" />
          </Field>
        )}
      </form>
    </Modal>
  );
}
