import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Building2, CalendarCheck, CalendarClock, Check, CheckCircle2, Clock, Plus, Search, Download, Hourglass, Inbox, Pencil, Shuffle, SlidersHorizontal, Users } from 'lucide-react';
import {
  ClaimStatus, CreditedEvent, DutyLog, DutySummary, DutyTerm, EVENT_ORGANIZERS, EventOrganizer, GRANT_PERCENTAGES, YEAR_GROUPS, YearGroup, entryHours, format12h, formatDutyDate, formatHours, sortEntries, termLabel,
  todayInManila, weekday, weeklyTotals
} from '../../utils/dutyHours';
import { API_BASE_URL, authHeaders, formatDateTime, titleCaseName } from './adminData';
import { ResultDialog,
  Alert, Avatar, Badge, Button, Card, DatePicker, DetailField, EmptyState, ErrorState, Field, KpiCard, KpiGrid, MobileList, Modal, PageHeader,
  SearchInput, Select, Table, TableSkeleton, Td, TextInput, Th, Toast, Tone, Tooltip, Tr
} from './AdminUI';

// AdSO: duty hours of every SFAG holder for a term (plus any other SFAG
// scholar who logged hours), from the logs scholars keep on their Duty
// Hours page.
// The AdSO assigns each scholar the office they render duty in: one at a
// time from the Office column, or several at once by selecting them.

interface TermKey { academicYear: number; term: DutyTerm }
interface ScholarRow {
  studentNumber: string;
  name: string;
  email: string;
  program: string;
  yearLevel: string;
  avatarUrl?: string;
  sfaHolder: boolean;
  logId: string | null;
  officeAssigned: string;
  officeAssignedAt: string | null;
  deadline: string | null;
  entryCount: number;
  summary: DutySummary | null;
  grantPercentage: number | null;          // set on the approved SFAG application
  requiredHoursFromAdso: number | null;    // hours for that percentage and year group, when set
  yearGroup: YearGroup | null;             // from the profile's year level
  pendingClaims: number;                   // event claims waiting for approval
  updatedAt: string | null;
}

type State = 'Not started' | 'In progress' | 'Overdue' | 'Completed';
const STATE_TONE: Record<State, Tone> = { 'Not started': 'neutral', 'In progress': 'info', Overdue: 'danger', Completed: 'success' };

function rowState(row: ScholarRow, today: string): State {
  const s = row.summary;
  if (!s || s.completed === 0) return 'Not started';
  if (s.remaining !== null && s.remaining <= 0) return 'Completed';
  if (row.deadline && row.deadline < today && (s.remaining ?? 0) > 0) return 'Overdue';
  return 'In progress';
}

const termKey = (t: TermKey) => `${t.academicYear}|${t.term}`;

export default function DutyHoursPage({ getToken }: { getToken: () => Promise<string | null> }) {
  const [term, setTerm] = useState<TermKey | null>(null);
  const [current, setCurrent] = useState<TermKey | null>(null);
  const [rows, setRows] = useState<ScholarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'All' | State>('All');
  const [search, setSearch] = useState('');
  const [openLogId, setOpenLogId] = useState<string | null>(null);
  const [offices, setOffices] = useState<string[]>([]);
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState<ScholarRow[] | null>(null);
  const [toast, setToast] = useState('');
  const [hoursOpen, setHoursOpen] = useState(false);
  // The term's duty deadline (set here; scholars see it read-only).
  const [deadline, setDeadline] = useState<string | null>(null);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [randomOpen, setRandomOpen] = useState(false);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [officesOpen, setOfficesOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  // Open office requests (from the office portal), for the button.
  const [openRequests, setOpenRequests] = useState(0);
  const loadRequestCount = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/duty-hours/admin/requests?status=open`, { headers: await authHeaders(getToken) });
      if (res.ok) setOpenRequests((await res.json()).open ?? 0);
    } catch {
      // keep the last count
    }
  }, [getToken]);
  useEffect(() => { loadRequestCount(); }, [loadRequestCount]);
  const today = todayInManila();

  const load = useCallback(async (t: TermKey | null) => {
    setLoading(true);
    setError('');
    try {
      const qs = t ? `?academicYear=${t.academicYear}&term=${encodeURIComponent(t.term)}` : '';
      const res = await fetch(`${API_BASE_URL}/api/duty-hours/admin${qs}`, { headers: await authHeaders(getToken) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to load duty hours.');
      setRows(body.scholars ?? []);
      setOffices(body.offices ?? []);
      setDeadline(body.deadline ?? null);
      setTerm(body.term);
      setCurrent(body.current);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load duty hours.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { load(null); }, [load]);
  // A selection belongs to one term's list.
  useEffect(() => { setSelected(new Set()); }, [term?.academicYear, term?.term]);

  // The current term and the three before it.
  const termOptions = useMemo(() => {
    if (!current) return [];
    const list: TermKey[] = [current];
    while (list.length < 4) {
      const last = list[list.length - 1];
      list.push(last.term === '2nd Semester' ? { academicYear: last.academicYear, term: '1st Semester' } : { academicYear: last.academicYear - 1, term: '2nd Semester' });
    }
    return list;
  }, [current]);

  const counts = useMemo(() => {
    const c: Record<State, number> = { 'Not started': 0, 'In progress': 0, Overdue: 0, Completed: 0 };
    rows.forEach(r => { c[rowState(r, today)]++; });
    return c;
  }, [rows, today]);
  const unassignedCount = useMemo(() => rows.filter(r => !r.officeAssigned).length, [rows]);
  const pendingClaimCount = useMemo(() => rows.reduce((n, r) => n + (r.pendingClaims ?? 0), 0), [rows]);
  // Scholars already in each office this term, to spread them out.
  const officeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    rows.forEach(r => { if (r.officeAssigned) counts[r.officeAssigned] = (counts[r.officeAssigned] ?? 0) + 1; });
    return counts;
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter(r => filter === 'All' || rowState(r, today) === filter)
      .filter(r => !unassignedOnly || !r.officeAssigned)
      .filter(r => !q || r.name.toLowerCase().includes(q) || r.studentNumber.includes(q) || r.officeAssigned.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, filter, search, today, unassignedOnly]);

  const allVisibleSelected = visible.length > 0 && visible.every(r => selected.has(r.studentNumber));
  const toggleAllVisible = () => setSelected(prev => {
    const next = new Set(prev);
    if (allVisibleSelected) visible.forEach(r => next.delete(r.studentNumber));
    else visible.forEach(r => next.add(r.studentNumber));
    return next;
  });
  const toggleOne = (studentNumber: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(studentNumber)) next.delete(studentNumber); else next.add(studentNumber);
    return next;
  });

  const onAssigned = (studentNumbers: string[], office: string) => {
    const at = new Date().toISOString();
    setRows(prev => prev.map(r => studentNumbers.includes(r.studentNumber) ? { ...r, officeAssigned: office, officeAssignedAt: office ? at : null } : r));
    if (office && !offices.includes(office)) setOffices(prev => [...prev, office].sort((a, b) => a.localeCompare(b)));
    setSelected(new Set());
    setAssigning(null);
    const who = studentNumbers.length === 1 ? '1 scholar' : `${studentNumbers.length} scholars`;
    setToast(office ? `Assigned ${who} to ${office}.` : `Removed the office from ${who}.`);
    // Assigning starts a log for scholars who had none, so reload for
    // their new log ids.
    if (office && term) load(term);
  };

  const exportCsv = () => {
    if (!term) return;
    const header = ['Student number', 'Name', 'Email', 'Program', 'SFAG holder this term', 'Grant %', 'Office assigned', 'Deadline', 'Required hours', 'Hours completed', 'Hours remaining', 'Weekly hours needed', 'Duties logged', 'Last duty', 'Status'];
    const lines = rows.map(r => [
      r.studentNumber, titleCaseName(r.name), r.email, r.program, r.sfaHolder ? 'Yes' : 'No', r.grantPercentage ?? '', r.officeAssigned, r.deadline ?? '',
      r.summary?.required ?? '', r.summary ? formatHours(r.summary.completed) : '0.00', r.summary?.remaining ?? '', r.summary?.weeklyNeeded ?? '',
      r.entryCount, r.summary?.lastDutyDate ?? '', rowState(r, today),
    ]);
    const csv = [header, ...lines].map(cells => cells.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `duty-hours-${term.academicYear}-${term.term.replace(/\s+/g, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const kpi = (label: string, state: 'All' | State, value: number, icon: React.ElementType, tone?: Tone) => (
    <KpiCard label={label} value={value} icon={icon} tone={tone} active={filter === state} onClick={() => setFilter(state)} loading={loading && rows.length === 0} />
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Duty hours"
        description="Duty hours rendered by SFAG scholars, from the logs they keep in AniSkolar."
        actions={
          <>
            <Button icon={Inbox} onClick={() => setRequestsOpen(true)}>Requests{openRequests ? ` (${openRequests})` : ''}</Button>
            <Button icon={Building2} onClick={() => setOfficesOpen(true)}>Offices</Button>
            <Button icon={CalendarCheck} onClick={() => setEventsOpen(true)} disabled={!term}>Events{pendingClaimCount ? ` (${pendingClaimCount} to review)` : ''}</Button>
            <Button icon={Shuffle} onClick={() => setRandomOpen(true)} disabled={!term || unassignedCount === 0}>Random assign</Button>
            <Button icon={SlidersHorizontal} onClick={() => setHoursOpen(true)}>Hours per grant</Button>
            <Button icon={Download} onClick={exportCsv} disabled={rows.length === 0}>Export CSV</Button>
          </>
        }
      />

      {term && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select value={termKey(term)} onChange={v => { const [y, t] = v.split('|'); load({ academicYear: Number(y), term: t as DutyTerm }); }} label="Term" className="w-full sm:w-80">
            {termOptions.map(t => <option key={termKey(t)} value={termKey(t)}>{termLabel(t)}</option>)}
          </Select>
          <div className={`flex items-center gap-3 rounded-control px-3 py-1.5 ring-1 ${deadline ? 'ring-line' : 'bg-warning-bg ring-warning-fg/30'}`}>
            <CalendarClock className={`size-4 shrink-0 ${deadline ? 'text-ink-subtle' : 'text-warning-fg'}`} aria-hidden />
            <span className="text-sm text-ink">
              Deadline: <span className="font-semibold">{deadline ? formatDutyDate(deadline, true) : 'not set'}</span>
            </span>
            <Button size="sm" variant="ghost" onClick={() => setDeadlineOpen(true)}>{deadline ? 'Change' : 'Set deadline'}</Button>
          </div>
        </div>
      )}

      <KpiGrid columns={4}>
        {kpi('Scholars', 'All', rows.length, Users)}
        {kpi('Not started', 'Not started', counts['Not started'], Hourglass, 'warning')}
        {kpi('Overdue', 'Overdue', counts.Overdue, AlertTriangle, 'danger')}
        {kpi('Completed', 'Completed', counts.Completed, CheckCircle2, 'success')}
      </KpiGrid>

      <Card
        flush
        headerSlot={
          <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
            <SearchInput value={search} onChange={setSearch} label="Search scholars" placeholder="Search name, student number or office…" className="sm:w-80" />
            <div className="flex flex-wrap items-center gap-2">
              {selected.size > 0 ? (
                <>
                  <span className="text-sm text-ink-muted">{selected.size} selected</span>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
                  <Button size="sm" variant="primary" icon={Building2} onClick={() => setAssigning(rows.filter(r => selected.has(r.studentNumber)))}>Assign office</Button>
                </>
              ) : (
                <>
                  {filter !== 'All' && <Button size="sm" variant="ghost" onClick={() => setFilter('All')}>Show all ({rows.length})</Button>}
                  {(unassignedCount > 0 || unassignedOnly) && (
                    <Button size="sm" variant={unassignedOnly ? 'primary' : 'secondary'} aria-pressed={unassignedOnly} onClick={() => setUnassignedOnly(v => !v)}>
                      No office yet ({unassignedCount})
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        }
      >
        {error ? (
          <ErrorState title="Couldn't load duty hours" message={error} onRetry={() => load(term)} retrying={loading} />
        ) : loading && rows.length === 0 ? (
          <TableSkeleton rows={6} label="Loading duty hours" />
        ) : rows.length === 0 ? (
          <EmptyState icon={Clock} title="No scholars for this term" description="SFAG holders for this term appear here." />
        ) : visible.length === 0 ? (
          <EmptyState title="No scholars match" description="Try another status or search." />
        ) : (
          <>
            <div className="hidden md:block">
              <Table label="Duty hours by scholar" minWidth="56rem">
                <thead>
                  <tr>
                    <Th sticky={false} className="w-12">
                      <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Select all scholars shown" className="size-4 rounded accent-accent" />
                    </Th>
                    <Th sticky={false}>Scholar</Th>
                    <Th sticky={false} className="w-56">Office</Th>
                    <Th sticky={false} numeric className="w-36">Completed</Th>
                    <Th sticky={false} numeric className="w-28">Remaining</Th>
                    <Th sticky={false} numeric className="w-28">Per week</Th>
                    <Th sticky={false} className="w-32">Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(row => {
                    const state = rowState(row, today);
                    const s = row.summary;
                    return (
                      <Tr key={row.studentNumber} onClick={row.logId ? () => setOpenLogId(row.logId) : undefined} className={selected.has(row.studentNumber) ? 'bg-accent-subtle/40' : ''}>
                        <Td>
                          <input
                            type="checkbox"
                            checked={selected.has(row.studentNumber)}
                            onChange={() => toggleOne(row.studentNumber)}
                            onClick={e => e.stopPropagation()}
                            aria-label={`Select ${row.name ? titleCaseName(row.name) : row.studentNumber}`}
                            className="size-4 rounded accent-accent"
                          />
                        </Td>
                        <Td>
                          <div className="flex min-w-0 items-center gap-3">
                            <Avatar name={row.name || row.studentNumber} avatarUrl={row.avatarUrl} size="sm" />
                            <div className="min-w-0">
                              <span className="block truncate font-medium text-ink">{row.name ? titleCaseName(row.name) : 'Unknown student'}</span>
                              <span className="block truncate text-xs text-ink-subtle">
                                {row.studentNumber}
                                {row.grantPercentage !== null ? ` · ${row.grantPercentage}% grant` : ' · grant % not set'}
                                {row.grantPercentage !== null && row.yearGroup === null ? ' · year level not set' : ''}
                                {row.sfaHolder ? '' : ' · not an SFAG holder this term'}
                                {row.pendingClaims ? ` · ${row.pendingClaims} event claim${row.pendingClaims === 1 ? '' : 's'} to review` : ''}
                              </span>
                            </div>
                          </div>
                        </Td>
                        <Td><OfficeButton row={row} onClick={() => setAssigning([row])} /></Td>
                        <Td numeric>{s ? `${formatHours(s.completed)}${s.required !== null ? ` / ${formatHours(s.required)}` : ''}` : '—'}</Td>
                        <Td numeric>{s?.remaining !== null && s?.remaining !== undefined ? formatHours(Math.max(0, s.remaining)) : '—'}</Td>
                        <Td numeric>{formatHours(s?.weeklyNeeded)}</Td>
                        <Td><Badge tone={STATE_TONE[state]} dot>{state}</Badge></Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
            <MobileList>
              {visible.map(row => {
                const state = rowState(row, today);
                return (
                  <li key={row.studentNumber}>
                    <button type="button" onClick={() => (row.logId ? setOpenLogId(row.logId) : setAssigning([row]))} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-muted">
                      <Avatar name={row.name || row.studentNumber} avatarUrl={row.avatarUrl} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{row.name ? titleCaseName(row.name) : 'Unknown student'}</span>
                        <span className="block truncate text-xs text-ink-subtle">{formatHours(row.summary?.completed ?? 0)}{row.summary?.required != null ? ` / ${formatHours(row.summary.required)}` : ''} hours · {row.officeAssigned || 'No office yet'}</span>
                      </span>
                      <Badge tone={STATE_TONE[state]} dot>{state}</Badge>
                    </button>
                  </li>
                );
              })}
            </MobileList>
          </>
        )}
      </Card>

      {openLogId && !assigning && (
        <DutyLogModal
          logId={openLogId}
          row={rows.find(r => r.logId === openLogId)!}
          getToken={getToken}
          onClose={() => setOpenLogId(null)}
          onChangeOffice={row => setAssigning([row])}
        />
      )}

      {assigning && term && (
        <AssignOfficeDialog
          scholars={assigning}
          term={term}
          offices={offices}
          officeCounts={officeCounts}
          getToken={getToken}
          onClose={() => setAssigning(null)}
          onAssigned={onAssigned}
        />
      )}

      {officesOpen && (
        <OfficesDialog getToken={getToken} offices={offices} onClose={() => setOfficesOpen(false)} onSaved={() => { setOfficesOpen(false); setToast('Saved the offices.'); if (term) load(term); }} />
      )}
      {requestsOpen && (
        <RequestsDialog getToken={getToken} onClose={() => { setRequestsOpen(false); loadRequestCount(); }} />
      )}

      {eventsOpen && term && (
        <EventsDialog term={term} getToken={getToken} onClose={() => setEventsOpen(false)} onChanged={() => load(term)} />
      )}

      {randomOpen && term && (
        <RandomAssignDialog
          rows={rows}
          term={term}
          offices={offices}
          officeCounts={officeCounts}
          getToken={getToken}
          onClose={() => setRandomOpen(false)}
          onDone={n => { setRandomOpen(false); setSelected(new Set()); setToast(`Assigned ${n === 1 ? '1 scholar' : `${n} scholars`} to offices at random.`); load(term); }}
        />
      )}

      {deadlineOpen && term && (
        <DeadlineDialog
          term={term}
          deadline={deadline}
          getToken={getToken}
          onClose={() => setDeadlineOpen(false)}
          onSaved={d => { setDeadlineOpen(false); setDeadline(d); setToast(d ? `Deadline set to ${formatDutyDate(d, true)} for every scholar.` : 'Deadline removed.'); load(term); }}
        />
      )}

      {hoursOpen && (
        <HoursSettingsDialog
          getToken={getToken}
          onClose={() => setHoursOpen(false)}
          onSaved={() => { setHoursOpen(false); setToast('Saved the hours per grant.'); if (term) load(term); }}
        />
      )}

      {toast && <ResultDialog message={toast} onClose={() => setToast('')} />}
    </div>
  );
}

// Required duty hours per term by year group and SFAG grant percentage.
// An empty one leaves those scholars entering their own hours.
function HoursSettingsDialog({ getToken, onClose, onSaved }: {
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onSaved: () => void;
}) {
  // values[group][percentage] = the input's text
  const [values, setValues] = useState<Record<YearGroup, Record<number, string>> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/duty-hours/admin/settings`, { headers: await authHeaders(getToken) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Failed to load the settings.');
        if (!cancelled) {
          setValues(Object.fromEntries(YEAR_GROUPS.map(({ key: g }) => [
            g,
            Object.fromEntries(GRANT_PERCENTAGES.map(p => [p, body.hoursByGroup?.[g]?.[p] != null ? String(body.hoursByGroup[g][p]) : ''])),
          ])) as Record<YearGroup, Record<number, string>>);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the settings.');
      }
    })();
    return () => { cancelled = true; };
  }, [getToken]);

  const save = async () => {
    if (!values || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/duty-hours/admin/settings`, {
        method: 'PUT',
        headers: await authHeaders(getToken, true),
        body: JSON.stringify({
          hoursByGroup: Object.fromEntries(YEAR_GROUPS.map(({ key: g }) => [
            g,
            Object.fromEntries(GRANT_PERCENTAGES.map(p => [p, values[g][p].trim() === '' ? null : Number(values[g][p])])),
          ])),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to save the settings.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the settings.');
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Hours per grant"
      description="Duty hours an SFAG grantee renders each term, by year level and grant percentage. Leave one empty and those scholars enter their own hours."
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy} disabled={!values}>Save</Button>
        </>
      }
    >
      {error && <Alert tone="danger">{error}</Alert>}
      {!values ? (!error && <TableSkeleton rows={4} label="Loading settings" />) : (
        <form className="grid grid-cols-[auto_1fr_1fr] items-center gap-x-3 gap-y-3" onSubmit={e => { e.preventDefault(); save(); }}>
          <span className="text-xs font-medium text-ink-subtle">Grant</span>
          {YEAR_GROUPS.map(({ key: g, label }) => (
            <span key={g} className="text-xs font-medium text-ink-subtle">{label}</span>
          ))}
          {GRANT_PERCENTAGES.map(p => (
            <React.Fragment key={p}>
              <span className="text-sm font-medium text-ink">{p}%</span>
              {YEAR_GROUPS.map(({ key: g, label }) => (
                <TextInput
                  key={g}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={1000}
                  step="0.5"
                  aria-label={`Hours for a ${p}% grant, ${label}`}
                  value={values[g][p]}
                  onChange={e => { const text = e.target.value; setValues(v => (v ? { ...v, [g]: { ...v[g], [p]: text } } : v)); }}
                  placeholder="Scholar enters it"
                  disabled={busy}
                />
              ))}
            </React.Fragment>
          ))}
          <p className="col-span-3 text-xs text-ink-subtle">Hours are per term. Set each grantee's percentage on their approved SFAG application; their year level comes from their profile (5th year counts with 3rd year and up).</p>
        </form>
      )}
    </Modal>
  );
}

// Random assign (AdSO, Oct 2026: scholars are assigned to offices at
// random; bigger offices take more). The AdSO keeps a list of offices and
// how many scholars each takes (saved, reused every term); this deals the
// term's scholars without an office into the free slots at random, one
// office at a time so they're spread out, and shows the result before
// anything is saved. Offices can still be changed one by one afterwards.

interface SlotRow { id: number; office: string; slots: string }

// Fisher–Yates shuffle (a copy).
function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Deals scholars into offices' free slots round by round (each office with
// room gets one per round, in a random order), so a short list is spread
// across offices instead of filling the first one.
function dealScholars(scholars: ScholarRow[], free: { office: string; free: number }[]) {
  const queue = shuffled(scholars);
  const left = new Map(free.map(f => [f.office, f.free]));
  const result = new Map<string, ScholarRow[]>();
  while (queue.length) {
    const open = shuffled([...left.entries()].filter(([, n]) => n > 0).map(([office]) => office));
    if (!open.length) break;
    for (const office of open) {
      const scholar = queue.shift();
      if (!scholar) break;
      result.set(office, [...(result.get(office) ?? []), scholar]);
      left.set(office, (left.get(office) ?? 0) - 1);
    }
  }
  return { byOffice: result, leftOver: queue };
}

function RandomAssignDialog({ rows, term, offices, officeCounts, getToken, onClose, onDone }: {
  rows: ScholarRow[];
  term: TermKey;
  offices: string[];
  officeCounts: Record<string, number>;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onDone: (assigned: number) => void;
}) {
  const [slots, setSlots] = useState<SlotRow[] | null>(null);
  const [nextId, setNextId] = useState(1000);
  const [preview, setPreview] = useState<{ byOffice: Map<string, ScholarRow[]>; leftOver: ScholarRow[] } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const unassigned = useMemo(() => rows.filter(r => !r.officeAssigned), [rows]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/duty-hours/admin/settings`, { headers: await authHeaders(getToken) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Failed to load the office slots.');
        const saved: { office: string; slots: number }[] = body.officeSlots ?? [];
        const known = new Set(saved.map(s => s.office.toLowerCase()));
        // Offices used before but not in the saved list start with a
        // suggestion: more for the big offices.
        const extra = offices.filter(o => !known.has(o.toLowerCase())).map(o => ({ office: o, slots: BIG_OFFICES.test(o) ? 5 : 2 }));
        if (!cancelled) setSlots([...saved, ...extra].map((s, i) => ({ id: i, office: s.office, slots: String(s.slots) })));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the office slots.');
      }
    })();
    return () => { cancelled = true; };
  }, [getToken, offices]);

  const named = (slots ?? []).filter(s => s.office.trim());
  const slotError = (() => {
    const seen = new Set<string>();
    for (const s of named) {
      const n = Number(s.slots);
      if (s.slots.trim() === '' || !Number.isInteger(n) || n < 0 || n > 50) return `Slots for ${s.office.trim()} must be a whole number from 0 to 50.`;
      const k = s.office.trim().replace(/\s+/g, ' ').toLowerCase();
      if (seen.has(k)) return `${s.office.trim()} is listed twice.`;
      seen.add(k);
    }
    return '';
  })();
  const free = named.map(s => ({ office: s.office.trim().replace(/\s+/g, ' '), free: Math.max(0, Number(s.slots) - (officeCounts[s.office.trim().replace(/\s+/g, ' ')] ?? 0)) }));
  const freeTotal = slotError ? 0 : free.reduce((n, f) => n + f.free, 0);

  const update = (id: number, patch: Partial<SlotRow>) => setSlots(prev => prev?.map(s => (s.id === id ? { ...s, ...patch } : s)) ?? prev);
  const shuffle = () => setPreview(dealScholars(unassigned, free));

  const assign = async () => {
    if (!preview || busy) return;
    setBusy(true);
    setError('');
    try {
      const headers = await authHeaders(getToken, true);
      let res = await fetch(`${API_BASE_URL}/api/duty-hours/admin/office-slots`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ officeSlots: named.map(s => ({ office: s.office.trim(), slots: Number(s.slots) })) }),
      });
      let body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to save the office slots.');
      let assigned = 0;
      for (const [office, scholars] of preview.byOffice) {
        res = await fetch(`${API_BASE_URL}/api/duty-hours/admin/office`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ academicYear: term.academicYear, term: term.term, studentNumbers: scholars.map(s => s.studentNumber), officeAssigned: office }),
        });
        body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`${body.error || 'Failed to assign.'}${assigned ? ` ${assigned} scholars were already assigned; reopen Random assign for the rest.` : ''}`);
        assigned += scholars.length;
      }
      onDone(assigned);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign.');
      setBusy(false);
    }
  };

  const who = (n: number) => (n === 1 ? '1 scholar' : `${n} scholars`);

  return (
    <Modal
      size="lg"
      title="Random assign"
      description={`${termLabel(term)} · ${who(unassigned.length)} without an office. Set how many scholars each office takes, then shuffle. Nothing is saved until you assign.`}
      onClose={onClose}
      dismissible={!busy}
      footer={preview ? (
        <>
          <Button onClick={() => setPreview(null)} disabled={busy}>Back to slots</Button>
          <Button icon={Shuffle} onClick={shuffle} disabled={busy}>Shuffle again</Button>
          <Button variant="primary" onClick={assign} loading={busy} disabled={preview.byOffice.size === 0}>Assign {who(unassigned.length - preview.leftOver.length)}</Button>
        </>
      ) : (
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Shuffle} onClick={shuffle} disabled={!slots || !!slotError || unassigned.length === 0 || freeTotal === 0}>Shuffle</Button>
        </>
      )}
    >
      {error && <Alert tone="danger">{error}</Alert>}
      {!slots ? (!error && <TableSkeleton rows={4} label="Loading office slots" />) : preview ? (
        <div className="space-y-4">
          {preview.leftOver.length > 0 && (
            <Alert tone="warning">{who(preview.leftOver.length)} won't get an office: there aren't enough free slots. Go back to add slots, or assign them one by one later.</Alert>
          )}
          <ul className="divide-y divide-line rounded-control ring-1 ring-line">
            {[...preview.byOffice].sort(([a], [b]) => a.localeCompare(b)).map(([office, scholars]) => (
              <li key={office} className="p-3">
                <p className="text-sm font-medium text-ink">{office} <span className="font-normal text-ink-subtle">· +{scholars.length}{officeCounts[office] ? ` (has ${officeCounts[office]})` : ''}</span></p>
                <p className="mt-1 text-sm text-ink-muted">{scholars.map(s => (s.name ? titleCaseName(s.name) : s.studentNumber)).join(', ')}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="space-y-3">
          {slotError && <Alert tone="danger">{slotError}</Alert>}
          <div className="grid grid-cols-[1fr_6rem_auto] items-start gap-x-3 gap-y-2">
            <span className="text-xs font-medium text-ink-subtle">Office</span>
            <span className="text-xs font-medium text-ink-subtle">Slots</span>
            {/* Keeps the header row three cells wide (an sr-only label takes no grid cell). */}
            <span aria-hidden />

            {slots.map(s => {
              const has = officeCounts[s.office.trim().replace(/\s+/g, ' ')] ?? 0;
              return (
                <React.Fragment key={s.id}>
                  <div className="min-w-0">
                    <TextInput value={s.office} onChange={e => update(s.id, { office: e.target.value })} placeholder="Office name" aria-label="Office name" />
                    {has > 0 && <span className="mt-0.5 block text-xs text-ink-subtle">Has {has} this term</span>}
                  </div>
                  <TextInput type="number" inputMode="numeric" min={0} max={50} step="1" value={s.slots} onChange={e => update(s.id, { slots: e.target.value })} aria-label={`Slots for ${s.office || 'this office'}`} />
                  <Button size="sm" variant="ghost" onClick={() => setSlots(prev => prev?.filter(x => x.id !== s.id) ?? prev)} aria-label={`Remove ${s.office || 'this office'}`}>Remove</Button>
                </React.Fragment>
              );
            })}
          </div>
          <Button size="sm" onClick={() => { setSlots(prev => [...(prev ?? []), { id: nextId, office: '', slots: '2' }]); setNextId(n => n + 1); }}>Add office</Button>
          <p className="text-xs text-ink-subtle">
            {freeTotal} free {freeTotal === 1 ? 'slot' : 'slots'} for {who(unassigned.length)}. Slots are the total an office takes; scholars it already has this term count toward them. Big offices (Registrar, Accounting, Admissions) usually take more.
          </p>
        </div>
      )}
    </Modal>
  );
}

// Credited events (AdSO, Oct 2026): events set up by the scholarship
// office or COSA that the office credits for duty hours — the credit is the
// office's call, not the event's length. Scholars claim the ones they
// attended; their hours count once a claim is approved here.

interface AdminEvent extends CreditedEvent { claims: Record<ClaimStatus, number> }
interface PendingClaim { studentNumber: string; name: string; eventId: string; claimedAt: string; event: CreditedEvent }
interface EventDraft { id: string | null; name: string; date: string; organizer: EventOrganizer; creditHours: string }
const emptyDraft = (): EventDraft => ({ id: null, name: '', date: todayInManila(), organizer: 'Scholarship office', creditHours: '3' });

function EventsDialog({ term, getToken, onClose, onChanged }: {
  term: TermKey;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [events, setEvents] = useState<AdminEvent[] | null>(null);
  const [pending, setPending] = useState<PendingClaim[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<EventDraft>(emptyDraft);
  const [rejecting, setRejecting] = useState<{ key: string; note: string } | null>(null);
  const [changed, setChanged] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/duty-hours/admin/events?academicYear=${term.academicYear}&term=${encodeURIComponent(term.term)}`, { headers: await authHeaders(getToken) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to load the events.');
      setEvents(body.events ?? []);
      setPending(body.pending ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the events.');
    }
  }, [getToken, term.academicYear, term.term]);
  useEffect(() => { load(); }, [load]);

  const call = async (key: string, url: string, method: string, payload?: unknown) => {
    setBusy(key);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/duty-hours/admin/${url}`, {
        method,
        headers: await authHeaders(getToken, payload !== undefined),
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Something went wrong.');
      setChanged(true);
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const saveDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { name: draft.name, date: draft.date, organizer: draft.organizer, creditHours: Number(draft.creditHours) };
    const ok = draft.id ? await call('draft', `events/${draft.id}`, 'PUT', payload) : await call('draft', 'events', 'POST', payload);
    if (ok) setDraft(emptyDraft());
  };
  const review = async (c: PendingClaim, status: 'Approved' | 'Rejected', note = '') => {
    const ok = await call(`${c.studentNumber}|${c.eventId}`, 'claims', 'PUT', { studentNumber: c.studentNumber, eventId: c.eventId, status, note });
    if (ok) setRejecting(null);
  };
  const close = () => { if (changed) onChanged(); onClose(); };

  return (
    <Modal
      size="lg"
      title="Events"
      description={`${termLabel(term)} · Events credited as duty hours, set up by the scholarship office or COSA. Scholars claim the ones they attended; approve each claim before its hours count.`}
      onClose={close}
      dismissible={!busy}
      footer={<Button onClick={close} disabled={!!busy}>Done</Button>}
    >
      {error && <Alert tone="danger">{error}</Alert>}
      {!events ? (!error && <TableSkeleton rows={4} label="Loading events" />) : (
        <div className="space-y-6">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-ink">Waiting for approval ({pending.length})</h3>
            {pending.length === 0 ? <p className="text-sm text-ink-muted">No claims to review.</p> : (
              <ul className="divide-y divide-line rounded-control ring-1 ring-line">
                {pending.map(c => {
                  const key = `${c.studentNumber}|${c.eventId}`;
                  return (
                    <li key={key} className="p-3 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink">{c.name ? titleCaseName(c.name) : c.studentNumber} <span className="font-normal text-ink-subtle">· {c.studentNumber}</span></p>
                          <p className="text-xs text-ink-muted">{c.event.name} · {formatDutyDate(c.event.date, true)} · {formatHours(c.event.creditHours)} hours</p>
                        </div>
                        {rejecting?.key !== key && (
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => setRejecting({ key, note: '' })} disabled={!!busy}>Reject</Button>
                            <Button size="sm" variant="primary" onClick={() => review(c, 'Approved')} loading={busy === key} disabled={!!busy && busy !== key}>Approve</Button>
                          </div>
                        )}
                      </div>
                      {rejecting?.key === key && (
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <TextInput value={rejecting.note} onChange={e => setRejecting({ key, note: e.target.value })} maxLength={500} placeholder="Reason (optional), e.g. not on the attendance sheet" aria-label="Reason for rejecting" />
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost" onClick={() => setRejecting(null)} disabled={busy === key}>Cancel</Button>
                            <Button size="sm" variant="danger" onClick={() => review(c, 'Rejected', rejecting.note)} loading={busy === key}>Reject claim</Button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-ink">{draft.id ? 'Edit event' : 'Add an event'}</h3>
            <form onSubmit={saveDraft} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_9rem_11rem_6rem]">
              <Field label="Event name"><TextInput value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} maxLength={200} placeholder="e.g. Scholars' Assembly" /></Field>
              <Field label="Date"><TextInput type="date" value={draft.date} onChange={e => setDraft(d => ({ ...d, date: e.target.value }))} /></Field>
              <Field label="Organized by">
                <Select value={draft.organizer} onChange={v => setDraft(d => ({ ...d, organizer: v as EventOrganizer }))}>
                  {EVENT_ORGANIZERS.map(o => <option key={o} value={o}>{o}</option>)}
                </Select>
              </Field>
              <Field label="Credit hrs"><TextInput type="number" inputMode="decimal" min={0.25} max={24} step="0.25" value={draft.creditHours} onChange={e => setDraft(d => ({ ...d, creditHours: e.target.value }))} /></Field>
              <div className="flex gap-2 sm:col-span-4">
                {draft.id && <Button variant="ghost" onClick={() => setDraft(emptyDraft())} disabled={busy === 'draft'}>Cancel edit</Button>}
                <Button type="submit" variant="primary" loading={busy === 'draft'}>{draft.id ? 'Save event' : 'Add event'}</Button>
              </div>
            </form>
            <p className="text-xs text-ink-subtle">The credit is what the scholarship office approved for the event, not its length (e.g. a 1-hour event credited 3 hours). COSA events: add them once the office approves COSA's request.</p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-ink">Events this term ({events.length})</h3>
            {events.length === 0 ? <p className="text-sm text-ink-muted">No events yet.</p> : (
              <ul className="divide-y divide-line rounded-control ring-1 ring-line">
                {events.map(ev => (
                  <li key={ev._id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{ev.name}</p>
                      <p className="text-xs text-ink-muted">
                        {weekday(ev.date)}, {formatDutyDate(ev.date, true)} · {ev.organizer} · {formatHours(ev.creditHours)} hours
                        {' · '}{ev.claims.Approved} credited{ev.claims.Pending ? `, ${ev.claims.Pending} waiting` : ''}{ev.claims.Rejected ? `, ${ev.claims.Rejected} rejected` : ''}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setDraft({ id: ev._id, name: ev.name, date: ev.date, organizer: ev.organizer, creditHours: String(ev.creditHours) })} disabled={!!busy}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => { if (window.confirm(`Delete "${ev.name}"? Claims waiting for review are removed too.`)) call(`del-${ev._id}`, `events/${ev._id}`, 'DELETE'); }} loading={busy === `del-${ev._id}`} disabled={!!busy && busy !== `del-${ev._id}`}>Delete</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

// --- Offices and their heads ----------------------------------------------------

// The duty offices: how many scholars each takes (Random assign) and its
// head, who signs in with that school email to the office portal to
// confirm duties, evaluate scholars and send requests.
interface OfficeRow { id: number; office: string; slots: string; headName: string; headEmail: string }

function OfficesDialog({ getToken, offices, onClose, onSaved }: {
  getToken: () => Promise<string | null>;
  offices: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<OfficeRow[] | null>(null);
  const [nextId, setNextId] = useState(1000);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/duty-hours/admin/settings`, { headers: await authHeaders(getToken) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Failed to load the offices.');
        const saved: { office: string; slots: number; headName?: string; headEmail?: string }[] = body.officeSlots ?? [];
        const known = new Set(saved.map(o => o.office.toLowerCase()));
        const extra = offices.filter(o => !known.has(o.toLowerCase())).map(o => ({ office: o, slots: BIG_OFFICES.test(o) ? 5 : 2 }));
        if (!cancelled) setRows([...saved, ...extra].map((o, i) => ({ id: i, office: o.office, slots: String(o.slots), headName: (o as { headName?: string }).headName ?? '', headEmail: (o as { headEmail?: string }).headEmail ?? '' })));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the offices.');
      }
    })();
    return () => { cancelled = true; };
  }, [getToken, offices]);

  const update = (id: number, patch: Partial<OfficeRow>) => setRows(prev => prev?.map(r => (r.id === id ? { ...r, ...patch } : r)) ?? prev);
  const save = async () => {
    if (!rows) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/duty-hours/admin/office-slots`, {
        method: 'PUT',
        headers: await authHeaders(getToken, true),
        body: JSON.stringify({ officeSlots: rows.filter(r => r.office.trim()).map(r => ({ office: r.office.trim(), slots: Number(r.slots), headName: r.headName.trim(), headEmail: r.headEmail.trim() })) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to save the offices.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the offices.');
      setBusy(false);
    }
  };

  return (
    <Modal
      size="lg"
      title="Offices"
      description="Duty offices, how many SFAG scholars each takes, and their heads. A head signs in to AniSkolar with this school email to confirm their scholars' duties, evaluate them for renewal, and send you requests. Once an office has a head, only the duties they confirm count."
      onClose={onClose}
      dismissible={!busy}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" onClick={save} loading={busy} disabled={!rows}>Save</Button></>}
    >
      {error && <Alert tone="danger">{error}</Alert>}
      {!rows ? (!error && <TableSkeleton rows={4} label="Loading offices" />) : (
        <div className="space-y-3">
          <div className="hidden grid-cols-[1fr_4.5rem_1fr_1.2fr_auto] gap-2 text-xs font-medium text-ink-subtle sm:grid">
            <span>Office</span><span>Slots</span><span>Head</span><span>Head's school email</span><span aria-hidden />
          </div>
          {rows.map(r => (
            <div key={r.id} className="grid grid-cols-1 gap-2 rounded-control p-2 ring-1 ring-line sm:grid-cols-[1fr_4.5rem_1fr_1.2fr_auto] sm:p-0 sm:ring-0">
              <TextInput value={r.office} onChange={e => update(r.id, { office: e.target.value })} placeholder="Office name" aria-label="Office name" disabled={busy} />
              <TextInput type="number" min={0} max={50} value={r.slots} onChange={e => update(r.id, { slots: e.target.value })} aria-label={`Slots for ${r.office || 'this office'}`} disabled={busy} />
              <TextInput value={r.headName} onChange={e => update(r.id, { headName: e.target.value })} placeholder="e.g. Dr. Juan Dela Cruz" aria-label={`Head of ${r.office || 'this office'}`} disabled={busy} />
              <TextInput type="email" value={r.headEmail} onChange={e => update(r.id, { headEmail: e.target.value })} placeholder="name@dlsud.edu.ph" aria-label={`Head's email for ${r.office || 'this office'}`} disabled={busy} />
              <Button size="sm" variant="ghost" onClick={() => setRows(prev => prev?.filter(x => x.id !== r.id) ?? prev)} disabled={busy} aria-label={`Remove ${r.office || 'this office'}`}>Remove</Button>
            </div>
          ))}
          <Button size="sm" onClick={() => { setRows(prev => [...(prev ?? []), { id: nextId, office: '', slots: '2', headName: '', headEmail: '' }]); setNextId(n => n + 1); }} disabled={busy}>Add office</Button>
          <p className="text-xs text-ink-subtle">The head's email must be their @dlsud.edu.ph address — it's how AniSkolar knows it's them when they sign in. Leave it empty for an office that isn't using AniSkolar yet (its scholars' hours count without confirmation).</p>
        </div>
      )}
    </Modal>
  );
}

// --- Office requests --------------------------------------------------------------

interface AdminOfficeRequest { _id: string; office: string; headName?: string; headEmail?: string; kind: 'specific' | 'more' | 'fewer' | 'other'; scholar?: string; count?: number; note?: string; status: 'open' | 'done' | 'declined'; response?: string; createdAt: string; resolvedAt?: string }
const REQUEST_KIND: Record<AdminOfficeRequest['kind'], string> = { specific: 'Specific scholar', more: 'More scholars', fewer: 'Fewer scholars', other: 'Other' };

function RequestsDialog({ getToken, onClose }: { getToken: () => Promise<string | null>; onClose: () => void }) {
  const [list, setList] = useState<AdminOfficeRequest[] | null>(null);
  const [error, setError] = useState('');
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/duty-hours/admin/requests`, { headers: await authHeaders(getToken) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to load the requests.');
      setList(body.requests ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the requests.');
    }
  }, [getToken]);
  useEffect(() => { load(); }, [load]);

  const resolve = async (r: AdminOfficeRequest, status: AdminOfficeRequest['status']) => {
    setBusy(r._id);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/duty-hours/admin/requests/${r._id}`, {
        method: 'PATCH',
        headers: await authHeaders(getToken, true),
        body: JSON.stringify({ status, response: replies[r._id] ?? r.response ?? '' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to update the request.');
      setList(prev => prev?.map(x => (x._id === r._id ? body.request : x)) ?? prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update the request.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal size="lg" title="Office requests" description="Requests duty offices sent from the office portal. Assign scholars as usual, then mark the request done with a note — the office sees your reply." onClose={onClose} footer={<Button onClick={onClose}>Done</Button>}>
      {error && <Alert tone="danger">{error}</Alert>}
      {!list ? (!error && <TableSkeleton rows={3} label="Loading requests" />) : list.length === 0 ? <EmptyState icon={Inbox} title="No requests" description="Requests from office heads appear here." /> : (
        <ul className="divide-y divide-line rounded-control ring-1 ring-line">
          {list.map(r => (
            <li key={r._id} className="space-y-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-ink">{r.office}</span>
                <span className="text-sm text-ink-muted">· {REQUEST_KIND[r.kind]}{r.scholar ? `: ${r.scholar}` : ''}{r.count ? ` (${r.count})` : ''}</span>
                <Badge tone={r.status === 'done' ? 'success' : r.status === 'declined' ? 'danger' : 'warning'} dot>{r.status === 'open' ? 'Open' : r.status === 'done' ? 'Done' : 'Declined'}</Badge>
                <span className="ml-auto text-xs text-ink-subtle">{formatDateTime(r.createdAt)}{r.headName ? ` · ${r.headName}` : ''}</span>
              </div>
              {r.note && <p className="text-sm text-ink-muted">{r.note}</p>}
              {r.status === 'open' ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <TextInput value={replies[r._id] ?? ''} onChange={e => setReplies(v => ({ ...v, [r._id]: e.target.value }))} maxLength={1000} placeholder="Reply to the office (optional)" aria-label="Reply to the office" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => resolve(r, 'declined')} disabled={!!busy}>Decline</Button>
                    <Button size="sm" variant="primary" onClick={() => resolve(r, 'done')} loading={busy === r._id} disabled={!!busy && busy !== r._id}>Mark done</Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {r.response && <p className="text-sm text-ink"><b>Your reply:</b> {r.response}</p>}
                  <Button size="sm" variant="ghost" onClick={() => resolve(r, 'open')} disabled={!!busy}>Reopen</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function OfficeButton({ row, onClick }: { row: ScholarRow; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick(); }}
      title={row.officeAssigned ? `Change office: ${row.officeAssigned}` : 'Assign an office'}
      className="group/office flex max-w-full items-center gap-1.5 rounded-badge text-left text-sm hover:text-accent"
    >
      {row.officeAssigned ? (
        <>
          <span className="truncate text-ink">{row.officeAssigned}</span>
          <Pencil className="size-3.5 shrink-0 text-ink-subtle opacity-0 group-hover/office:opacity-100 group-focus-visible/office:opacity-100" aria-hidden />
        </>
      ) : (
        <span className="font-medium text-accent">Assign office</span>
      )}
    </button>
  );
}

// Offices that usually take more than two scholars (AdSO interview, Oct
// 2026): the transaction-heavy student services.
const BIG_OFFICES = /registrar|accounting|admission/i;

function AssignOfficeDialog({ scholars, term, offices, officeCounts, getToken, onClose, onAssigned }: {
  scholars: ScholarRow[];
  term: TermKey;
  offices: string[];
  officeCounts: Record<string, number>;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onAssigned: (studentNumbers: string[], office: string) => void;
}) {
  const current = [...new Set(scholars.map(s => s.officeAssigned))];
  const [office, setOffice] = useState(current.length === 1 ? current[0] : '');
  const [busy, setBusy] = useState<'assign' | 'remove' | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  // Slots and heads from Duty hours → Offices (missing = not set yet).
  const [saved, setSaved] = useState<{ office: string; slots: number; headName?: string }[] | null>(null);
  const single = scholars.length === 1 ? scholars[0] : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/duty-hours/admin/settings`, { headers: await authHeaders(getToken) });
        const body = await res.json().catch(() => ({}));
        if (!cancelled) setSaved(res.ok ? body.officeSlots ?? [] : []);
      } catch {
        if (!cancelled) setSaved([]);
      }
    })();
    return () => { cancelled = true; };
  }, [getToken]);

  // Every known office: saved ones plus any used in a log.
  const choices = useMemo(() => {
    const byName = new Map<string, { name: string; slots: number | null; headName: string }>();
    for (const o of saved ?? []) byName.set(o.office.toLowerCase(), { name: o.office, slots: Number(o.slots) || 0, headName: o.headName ?? '' });
    for (const o of offices) if (!byName.has(o.toLowerCase())) byName.set(o.toLowerCase(), { name: o, slots: null, headName: '' });
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [saved, offices]);
  const q = query.trim().toLowerCase();
  const shown = q ? choices.filter(c => c.name.toLowerCase().includes(q)) : choices;
  const isNew = !!q && !choices.some(c => c.name.toLowerCase() === q);
  const picked = office.trim();
  const incoming = (name: string) => scholars.filter(sc => sc.officeAssigned !== name).length;
  const pick = (name: string) => { setOffice(name); if (error) setError(''); };
  const anyAssigned = scholars.some(s => s.officeAssigned);
  const replacing = scholars.filter(s => s.officeAssigned && s.officeAssigned !== office.trim()).length;

  const submit = async (value: string, kind: 'assign' | 'remove') => {
    if (kind === 'assign' && !value.trim()) { setError('Enter the office.'); return; }
    setBusy(kind);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/duty-hours/admin/office`, {
        method: 'PUT',
        headers: await authHeaders(getToken, true),
        body: JSON.stringify({ ...term, studentNumbers: scholars.map(s => s.studentNumber), officeAssigned: value.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to assign the office.');
      onAssigned(scholars.map(s => s.studentNumber), body.officeAssigned ?? value.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign the office.');
      setBusy(null);
    }
  };

  return (
    <Modal
      title={single ? (single.officeAssigned ? 'Change office' : 'Assign office') : `Assign office to ${scholars.length} scholars`}
      description={`${single ? `${single.name ? titleCaseName(single.name) : single.studentNumber} · ` : ''}${termLabel(term)}`}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {anyAssigned && (
              <Button variant="ghost" onClick={() => submit('', 'remove')} loading={busy === 'remove'} disabled={!!busy}>
                Remove office
              </Button>
            )}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button onClick={onClose} disabled={!!busy}>Cancel</Button>
            <Button variant="primary" onClick={() => submit(office, 'assign')} loading={busy === 'assign'} disabled={!!busy}>
              {single ? 'Save' : `Assign ${scholars.length}`}
            </Button>
          </div>
        </div>
      }
    >
      <form
        className="space-y-4"
        onSubmit={e => {
          e.preventDefault();
          // Enter in the search box picks the only match or the new office.
          if (q && shown.length === 1 && !isNew) pick(shown[0].name);
          else if (isNew && shown.length === 0) pick(query.trim().replace(/\s+/g, ' '));
          else submit(office, 'assign');
        }}
      >
        <Field
          label="Office"
          error={error || undefined}
          helper={replacing > 0 && !single
            ? `${replacing} of them already have a different office; it will be replaced.`
            : `Where ${single ? 'the scholar renders' : 'these scholars render'} duty hours this term. They see it on their Duty Hours page.`}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
            <TextInput
              value={query}
              onChange={e => setQuery(e.target.value)}
              maxLength={200}
              placeholder="Search offices, or type a new one"
              className="pl-9"
              autoFocus
            />
          </div>
        </Field>
        <div role="listbox" aria-label="Offices" className="max-h-72 divide-y divide-line overflow-y-auto rounded-control ring-1 ring-line">
          {!saved && !choices.length && <p className="px-3 py-3 text-sm text-ink-subtle">Loading offices…</p>}
          {shown.map(c => {
            const has = officeCounts[c.name] ?? 0;
            const selectedHere = c.name === picked;
            const after = has + (selectedHere ? incoming(c.name) : 0);
            const full = c.slots !== null && c.slots > 0 && has >= c.slots;
            const over = c.slots !== null && c.slots > 0 && after > c.slots;
            const isCurrent = current.length === 1 && current[0] === c.name;
            return (
              <button
                key={c.name}
                type="button"
                role="option"
                aria-selected={selectedHere}
                onClick={() => pick(c.name)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${selectedHere ? 'bg-accent-subtle' : 'hover:bg-surface-muted'}`}
              >
                <span className={`flex size-4 shrink-0 items-center justify-center rounded-full ring-1 ${selectedHere ? 'bg-accent ring-accent text-white' : 'ring-line-strong'}`}>
                  {selectedHere && <Check className="size-3" aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-ink">{c.name}</span>
                    {isCurrent && <Badge tone="neutral">Current</Badge>}
                  </span>
                  <span className="block truncate text-xs text-ink-subtle">{c.headName ? `Head: ${c.headName}` : 'No head listed'}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block text-sm tabular-nums ${over ? 'font-medium text-warning-fg' : 'text-ink'}`}>
                    {c.slots ? `${after} / ${c.slots}` : after}
                  </span>
                  <span className={`block text-xs ${full && !selectedHere ? 'text-warning-fg' : 'text-ink-subtle'}`}>
                    {c.slots ? (full && !selectedHere ? 'Full' : 'slots used') : `${after === 1 ? 'scholar' : 'scholars'}`}
                  </span>
                </span>
              </button>
            );
          })}
          {isNew && (
            <button
              type="button"
              role="option"
              aria-selected={picked.toLowerCase() === q}
              onClick={() => pick(query.trim().replace(/\s+/g, ' '))}
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${picked.toLowerCase() === q ? 'bg-accent-subtle' : 'hover:bg-surface-muted'}`}
            >
              <Plus className="size-4 shrink-0 text-accent" aria-hidden />
              <span className="min-w-0 truncate text-ink">Use new office “<span className="font-medium">{query.trim()}</span>”</span>
            </button>
          )}
          {!!q && !shown.length && !isNew && <p className="px-3 py-3 text-sm text-ink-subtle">No office matches.</p>}
        </div>
        {picked && (() => {
          const c = choices.find(x => x.name === picked);
          const after = (officeCounts[picked] ?? 0) + incoming(picked);
          const overSlots = !!c?.slots && after > c.slots;
          const overUsual = !c?.slots && !BIG_OFFICES.test(picked) && after > 2;
          return (
            <p className={`text-xs ${overSlots || overUsual ? 'text-warning-fg' : 'text-ink-subtle'}`}>
              <span className="font-medium text-ink">{picked}</span>
              {` will have ${after} ${after === 1 ? 'scholar' : 'scholars'} this term`}
              {c?.slots ? ` (${c.slots} ${c.slots === 1 ? 'slot' : 'slots'})` : ''}.
              {overSlots ? ' That is more than its slots.' : overUsual ? ' Most offices take 1–2; the Registrar, Accounting and Admissions take more.' : ''}
            </p>
          );
        })()}
        {!single && (
          <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-control text-sm ring-1 ring-line">
            {scholars.map(s => (
              <li key={s.studentNumber} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate text-ink">{s.name ? titleCaseName(s.name) : s.studentNumber}</span>
                <span className="shrink-0 truncate text-xs text-ink-subtle">{s.officeAssigned || 'No office yet'}</span>
              </li>
            ))}
          </ul>
        )}
      </form>
    </Modal>
  );
}

function DutyLogModal({ logId, row, getToken, onClose, onChangeOffice }: {
  logId: string; row: ScholarRow; getToken: () => Promise<string | null>; onClose: () => void; onChangeOffice: (row: ScholarRow) => void;
}) {
  const [data, setData] = useState<{ log: DutyLog; summary: DutySummary } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/duty-hours/admin/${logId}`, { headers: await authHeaders(getToken) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Failed to load the duty log.');
        if (!cancelled) setData(body);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the duty log.');
      }
    })();
    return () => { cancelled = true; };
  }, [logId, getToken]);

  const name = row.name ? titleCaseName(row.name) : row.studentNumber;
  return (
    <Modal size="lg" title={name} description={data ? `${row.studentNumber} · ${termLabel(data.log)}` : row.studentNumber} icon={<Avatar name={row.name || row.studentNumber} avatarUrl={row.avatarUrl} />} onClose={onClose}>
      {error ? <Alert tone="danger">{error}</Alert> : !data ? <TableSkeleton rows={5} label="Loading duty log" /> : (
        <div className="space-y-6">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <DetailField
              label="Office assigned"
              value={
                <span className="flex flex-wrap items-center gap-x-2">
                  <span>{row.officeAssigned || 'None yet'}</span>
                  <button type="button" onClick={() => onChangeOffice(row)} className="text-xs font-medium text-accent hover:underline">
                    {row.officeAssigned ? 'Change' : 'Assign'}
                  </button>
                </span>
              }
            />
            <DetailField label="Deadline" value={data.log.deadline ? formatDutyDate(data.log.deadline, true) : undefined} />
            <DetailField label="Completed" value={`${formatHours(data.summary.completed)}${data.summary.required !== null ? ` of ${formatHours(data.summary.required)}` : ''}`} />
            <DetailField label="Remaining" value={data.summary.remaining !== null ? formatHours(Math.max(0, data.summary.remaining)) : undefined} />
            <DetailField label="Weekly hours needed" value={data.summary.weeklyNeeded !== null ? formatHours(data.summary.weeklyNeeded) : undefined} />
            <DetailField label="Special events" value={formatHours(data.summary.specialHours)} />
            <DetailField label="Last updated" value={data.log.updatedAt ? formatDateTime(data.log.updatedAt) : undefined} />
          </dl>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-ink">Regular duty ({data.log.entries.length})</h3>
            {data.log.entries.length === 0 ? <p className="text-sm text-ink-muted">None logged.</p> : (
              <Table label="Regular duty" minWidth="32rem">
                <thead><tr><Th sticky={false}>Date</Th><Th sticky={false} className="w-20">Day</Th><Th sticky={false} className="w-28">Time in</Th><Th sticky={false} className="w-28">Time out</Th><Th sticky={false} numeric className="w-24">Hours</Th>{data.summary.confirmationRequired && <Th sticky={false} className="w-32">Office</Th>}</tr></thead>
                <tbody>
                  {sortEntries(data.log.entries).map((e, i) => (
                    <Tr key={e._id ?? i}><Td>{formatDutyDate(e.date, true)}</Td><Td>{weekday(e.date)}</Td><Td>{format12h(e.timeIn)}</Td><Td>{format12h(e.timeOut)}</Td><Td numeric>{formatHours(entryHours(e))}</Td>
                      {data.summary.confirmationRequired && (
                        <Td>{e.status === 'confirmed' ? <Badge tone="success" dot>Confirmed</Badge> : e.status === 'flagged' ? <Tooltip content={e.note || 'Flagged by the office'}><Badge tone="danger" dot>Flagged</Badge></Tooltip> : <Badge tone="warning" dot>Waiting</Badge>}</Td>
                      )}
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </section>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-ink">Special events</h3>
              {data.log.specialEvents.length === 0 ? <p className="text-sm text-ink-muted">None.</p> : (
                <ul className="divide-y divide-line rounded-control ring-1 ring-line">
                  {data.log.specialEvents.map((e, i) => (
                    <li key={e._id ?? i} className="flex justify-between gap-3 px-3 py-2 text-sm"><span className="truncate">{e.name}</span><span className="font-medium">{formatHours(e.hours)}</span></li>
                  ))}
                </ul>
              )}
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-ink">Weekly duty hours</h3>
              {data.log.entries.length === 0 ? <p className="text-sm text-ink-muted">None.</p> : (
                <ul className="divide-y divide-line rounded-control ring-1 ring-line">
                  {weeklyTotals(data.log.entries).map(w => (
                    <li key={w.start} className="flex justify-between gap-3 px-3 py-2 text-sm"><span>{formatDutyDate(w.start)} – {formatDutyDate(w.end)}</span><span className="font-medium">{formatHours(w.hours)}</span></li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </Modal>
  );
}

// The term's duty deadline: one date for every SFAG scholar (they can't
// change it); reminders and "hours a week" count down to it.
function DeadlineDialog({ term, deadline, getToken, onClose, onSaved }: {
  term: TermKey;
  deadline: string | null;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onSaved: (deadline: string | null) => void;
}) {
  const [value, setValue] = useState(deadline ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (next: string) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/duty-hours/admin/deadline`, {
        method: 'PUT',
        headers: await authHeaders(getToken, true),
        body: JSON.stringify({ ...term, deadline: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to save the deadline.');
      onSaved(body.deadline ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the deadline.');
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Duty hours deadline"
      description={`${termLabel(term)} · applies to every SFAG scholar. Scholars see it but can't change it.`}
      onClose={onClose}
      dismissible={!busy}
      footer={(
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>{deadline && <Button variant="ghost" onClick={() => save('')} disabled={busy}>Remove deadline</Button>}</div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={() => (value ? save(value) : setError('Choose the date.'))} loading={busy}>Save deadline</Button>
          </div>
        </div>
      )}
    >
      <Field label="Last day to complete duty hours" error={error || undefined} helper={!error ? 'Usually the last day of classes. Reminders and each scholar’s “hours a week” count down to it.' : undefined}>
        <DatePicker value={value} onChange={setValue} placeholder="Select the deadline" />
      </Field>
    </Modal>
  );
}
