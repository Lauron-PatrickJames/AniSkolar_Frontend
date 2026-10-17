import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { AlertTriangle, Building2, CheckCircle2, Clock, Download, Hourglass, Pencil, SlidersHorizontal, Users } from 'lucide-react';
import {
  DutyLog, DutySummary, DutyTerm, GRANT_PERCENTAGES, entryHours, format12h, formatDutyDate, formatHours, sortEntries, termLabel,
  todayInManila, weekday, weeklyTotals
} from '../../utils/dutyHours';
import { API_BASE_URL, authHeaders, formatDateTime, titleCaseName } from './adminData';
import {
  Alert, Avatar, Badge, Button, Card, DetailField, EmptyState, ErrorState, Field, KpiCard, KpiGrid, MobileList, Modal, PageHeader,
  SearchInput, Select, Table, TableSkeleton, Td, TextInput, Th, Toast, Tone, Tr
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
  requiredHoursFromAdso: number | null;    // hours for that percentage, when set
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
            <Button icon={SlidersHorizontal} onClick={() => setHoursOpen(true)}>Hours per grant</Button>
            <Button icon={Download} onClick={exportCsv} disabled={rows.length === 0}>Export CSV</Button>
          </>
        }
      />

      {term && (
        <Select value={termKey(term)} onChange={v => { const [y, t] = v.split('|'); load({ academicYear: Number(y), term: t as DutyTerm }); }} label="Term" className="w-full sm:w-80">
          {termOptions.map(t => <option key={termKey(t)} value={termKey(t)}>{termLabel(t)}</option>)}
        </Select>
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
                                {row.sfaHolder ? '' : ' · not an SFAG holder this term'}
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

      {hoursOpen && (
        <HoursSettingsDialog
          getToken={getToken}
          onClose={() => setHoursOpen(false)}
          onSaved={() => { setHoursOpen(false); setToast('Saved the hours per grant.'); if (term) load(term); }}
        />
      )}

      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  );
}

// Required duty hours per term by SFAG grant percentage. An empty one
// leaves those scholars entering their own hours.
function HoursSettingsDialog({ getToken, onClose, onSaved }: {
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<number, string> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/duty-hours/admin/settings`, { headers: await authHeaders(getToken) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Failed to load the settings.');
        if (!cancelled) setValues(Object.fromEntries(GRANT_PERCENTAGES.map(p => [p, body.hoursByPercentage?.[p] != null ? String(body.hoursByPercentage[p]) : ''])));
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
        body: JSON.stringify({ hoursByPercentage: Object.fromEntries(GRANT_PERCENTAGES.map(p => [p, values[p].trim() === '' ? null : Number(values[p])])) }),
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
      description="Duty hours an SFAG grantee renders each term, by grant percentage. Leave one empty and those scholars enter their own hours."
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
        <form className="grid grid-cols-2 gap-4" onSubmit={e => { e.preventDefault(); save(); }}>
          {GRANT_PERCENTAGES.map(p => (
            <Field key={p} label={`${p}% grant`} optional>
              <TextInput
                type="number"
                inputMode="decimal"
                min={0}
                max={1000}
                step="0.5"
                value={values[p]}
                onChange={e => setValues(v => (v ? { ...v, [p]: e.target.value } : v))}
                placeholder="Scholar enters it"
                disabled={busy}
              />
            </Field>
          ))}
          <p className="col-span-2 text-xs text-ink-subtle">Set each grantee's percentage on their approved SFAG application.</p>
        </form>
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
  const listId = useId();
  const single = scholars.length === 1 ? scholars[0] : null;
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
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); submit(office, 'assign'); }}>
        <Field
          label="Office"
          error={error || undefined}
          helper={replacing > 0 && !single
            ? `${replacing} of them already have a different office; it will be replaced.`
            : single
              ? 'Where the scholar renders duty hours this term. They see it on their Duty Hours page.'
              : 'Where these scholars render duty hours this term. They see it on their Duty Hours page.'}
        >
          <TextInput
            value={office}
            onChange={e => { setOffice(e.target.value); if (error) setError(''); }}
            list={listId}
            maxLength={200}
            placeholder="e.g. University Library"
            autoFocus
          />
        </Field>
        {office.trim() && (() => {
          const name = office.trim();
          const already = officeCounts[name] ?? 0;
          const after = already + scholars.filter(sc => sc.officeAssigned !== name).length;
          const big = BIG_OFFICES.test(name);
          return (
            <p className={`text-xs ${!big && after > 2 ? 'text-warning-fg' : 'text-ink-subtle'}`}>
              {already ? `${name} has ${already} ${already === 1 ? 'scholar' : 'scholars'} this term` : `No scholars in ${name} yet this term`}
              {` · ${after} after this.`}
              {!big && after > 2 ? ' Most offices take 1–2; the Registrar, Accounting and Admissions take more.' : ''}
            </p>
          );
        })()}
        <datalist id={listId}>
          {offices.map(o => <option key={o} value={o}>{officeCounts[o] ? `${officeCounts[o]} this term` : 'none this term'}</option>)}
        </datalist>
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
                <thead><tr><Th sticky={false}>Date</Th><Th sticky={false} className="w-20">Day</Th><Th sticky={false} className="w-28">Time in</Th><Th sticky={false} className="w-28">Time out</Th><Th sticky={false} numeric className="w-24">Hours</Th></tr></thead>
                <tbody>
                  {sortEntries(data.log.entries).map((e, i) => (
                    <Tr key={e._id ?? i}><Td>{formatDutyDate(e.date, true)}</Td><Td>{weekday(e.date)}</Td><Td>{format12h(e.timeIn)}</Td><Td>{format12h(e.timeOut)}</Td><Td numeric>{formatHours(entryHours(e))}</Td></Tr>
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
