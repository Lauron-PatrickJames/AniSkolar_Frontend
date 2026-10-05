import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Download, Hourglass, Users } from 'lucide-react';
import {
  DutyLog, DutySummary, DutyTerm, entryHours, format12h, formatDutyDate, formatHours, sortEntries, termLabel,
  todayInManila, weekday, weeklyTotals
} from '../../utils/dutyHours';
import { API_BASE_URL, authHeaders, formatDateTime, titleCaseName } from './adminData';
import {
  Alert, Avatar, Badge, Button, Card, DetailField, EmptyState, ErrorState, KpiCard, KpiGrid, MobileList, Modal, PageHeader,
  SearchInput, Select, Table, TableSkeleton, Td, Th, Tone, Tr
} from './AdminUI';

// AdSO: duty hours of every SFA Grant holder for a term (plus anyone else
// who logged hours), from the logs scholars keep on their Duty Hours page.

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
  deadline: string | null;
  entryCount: number;
  summary: DutySummary | null;
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
      setTerm(body.term);
      setCurrent(body.current);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load duty hours.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { load(null); }, [load]);

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

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter(r => filter === 'All' || rowState(r, today) === filter)
      .filter(r => !q || r.name.toLowerCase().includes(q) || r.studentNumber.includes(q) || r.officeAssigned.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, filter, search, today]);

  const exportCsv = () => {
    if (!term) return;
    const header = ['Student number', 'Name', 'Email', 'Program', 'SFA holder', 'Office assigned', 'Deadline', 'Required hours', 'Hours completed', 'Hours remaining', 'Weekly hours needed', 'Duties logged', 'Last duty', 'Status'];
    const lines = rows.map(r => [
      r.studentNumber, titleCaseName(r.name), r.email, r.program, r.sfaHolder ? 'Yes' : 'No', r.officeAssigned, r.deadline ?? '',
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
        description="Duty hours rendered by SFA Grant scholars, from the logs they keep in AniSkolar."
        actions={<Button icon={Download} onClick={exportCsv} disabled={rows.length === 0}>Export CSV</Button>}
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
            {filter !== 'All' && <Button size="sm" variant="ghost" onClick={() => setFilter('All')}>Show all ({rows.length})</Button>}
          </div>
        }
      >
        {error ? (
          <ErrorState title="Couldn't load duty hours" message={error} onRetry={() => load(term)} retrying={loading} />
        ) : loading && rows.length === 0 ? (
          <TableSkeleton rows={6} label="Loading duty hours" />
        ) : rows.length === 0 ? (
          <EmptyState icon={Clock} title="No scholars for this term" description="SFA Grant holders appear here, along with anyone who logs duty hours." />
        ) : visible.length === 0 ? (
          <EmptyState title="No scholars match" description="Try another status or search." />
        ) : (
          <>
            <div className="hidden md:block">
              <Table label="Duty hours by scholar" minWidth="56rem">
                <thead>
                  <tr>
                    <Th sticky={false}>Scholar</Th>
                    <Th sticky={false} className="w-48">Office</Th>
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
                      <Tr key={row.studentNumber} onClick={row.logId ? () => setOpenLogId(row.logId) : undefined}>
                        <Td>
                          <div className="flex min-w-0 items-center gap-3">
                            <Avatar name={row.name || row.studentNumber} avatarUrl={row.avatarUrl} size="sm" />
                            <div className="min-w-0">
                              <span className="block truncate font-medium text-ink">{row.name ? titleCaseName(row.name) : 'Unknown student'}</span>
                              <span className="block truncate text-xs text-ink-subtle">{row.studentNumber}{row.sfaHolder ? '' : ' · not an SFA holder'}</span>
                            </div>
                          </div>
                        </Td>
                        <Td><span className="block truncate" title={row.officeAssigned}>{row.officeAssigned || '—'}</span></Td>
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
                    <button type="button" disabled={!row.logId} onClick={() => setOpenLogId(row.logId)} className="flex w-full items-center gap-3 px-4 py-3 text-left disabled:cursor-default enabled:hover:bg-surface-muted">
                      <Avatar name={row.name || row.studentNumber} avatarUrl={row.avatarUrl} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{row.name ? titleCaseName(row.name) : 'Unknown student'}</span>
                        <span className="block truncate text-xs text-ink-subtle">{formatHours(row.summary?.completed ?? 0)}{row.summary?.required != null ? ` / ${formatHours(row.summary.required)}` : ''} hours</span>
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

      {openLogId && (
        <DutyLogModal
          logId={openLogId}
          row={rows.find(r => r.logId === openLogId)!}
          getToken={getToken}
          onClose={() => setOpenLogId(null)}
        />
      )}
    </div>
  );
}

function DutyLogModal({ logId, row, getToken, onClose }: {
  logId: string; row: ScholarRow; getToken: () => Promise<string | null>; onClose: () => void;
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
            <DetailField label="Office assigned" value={data.log.officeAssigned} />
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
