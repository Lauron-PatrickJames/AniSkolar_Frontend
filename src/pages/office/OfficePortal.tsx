import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/react';
import { ArrowRight, Check, CheckCircle2, ChevronDown, ClipboardCheck, Clock, Flag, Hourglass, MessageSquare, Search, Undo2, Users, X } from 'lucide-react';
import AccountSecurity from '../../components/AccountSecurity';
import AdminLayout, { NavSection } from '../admin/AdminLayout';
import Conversation from '../../components/messages/Conversation';
import { ChatMessage, MESSAGES_READ_EVENT, postMessage } from '../../utils/messages';
import { DutyTerm, format12h, hoursUntilRemoved, formatDutyDate, formatHours, termLabel, weekday } from '../../utils/dutyHours';
import { EVALUATION_ITEMS, passingAverage, RATING_LABELS, ratingLabel } from '../../utils/renewals';
import { API_BASE_URL, authHeaders, formatDateTime, titleCaseName } from '../admin/adminData';
import { ResultDialog,
  Alert, Avatar, Badge, Button, Card, EmptyState, MobileList, ErrorState, Field, Modal, PageHeader, SearchInput, SegmentedControl, Select, Table,
  TableSkeleton, Td, TextInput, Textarea, Th, Tr
} from '../admin/AdminUI';

// The office portal: for the head of a duty office (listed by the AdSO in
// Duty hours → Offices), signed in with that school email. They confirm
// their SFAG scholars' duties, evaluate each scholar once their hours are
// complete (they're emailed when that happens), and message the AdSO —
// instead of paper duty sheets, evaluation forms and letters. Backend: routes/office.js and the office
// routes in routes/messages.js.

export interface OfficeHeadInfo {
  office: string;
  name: string;
  email: string;
  current: { academicYear: number; term: DutyTerm };
}

type Tab = 'scholars' | 'evaluations' | 'messages';
type GetToken = () => Promise<string | null>;

async function api<T>(getToken: GetToken, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: await authHeaders(getToken, init.body !== undefined),
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Something went wrong.');
  return body as T;
}

// The sections, in the sidebar (phones: a row of tabs).
const SECTIONS: { key: Tab; label: string; icon: React.ElementType; description: string }[] = [
  { key: 'scholars', label: 'Scholars & duties', icon: Users, description: 'Check the duties your SFAG scholars log, and follow their hours.' },
  { key: 'evaluations', label: 'Evaluations', icon: ClipboardCheck, description: 'Rate each scholar once they finish their hours. It goes into their renewal.' },
  { key: 'messages', label: 'Messages', icon: MessageSquare, description: 'Your conversation with the Admissions and Scholarship Office.' },
];
const isTab = (v: string): v is Tab => SECTIONS.some(sec => sec.key === v);

export default function OfficePortal({ head, onLogout }: { head: OfficeHeadInfo; onLogout: () => void }) {
  const { getToken } = useAuth();
  // The open section is kept in the address (#evaluations…), so a refresh
  // or the browser's Back stays put.
  const [tab, setTabState] = useState<Tab>(() => {
    const h = window.location.hash.slice(1);
    return isTab(h) ? h : 'scholars';
  });
  const setTab = useCallback((next: Tab) => {
    setTabState(next);
    if (window.location.hash.slice(1) !== next) window.history.pushState(window.history.state, '', `#${next}`);
  }, []);
  useEffect(() => {
    const onPop = () => { const h = window.location.hash.slice(1); setTabState(isTab(h) ? h : 'scholars'); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const [counts, setCounts] = useState({ waiting: 0, evaluations: 0, unread: 0 });
  const [toast, setToast] = useState('');
  const [securityOpen, setSecurityOpen] = useState(false);

  // Badges: duties waiting, evaluations not done, unread messages.
  const refreshCounts = useCallback(async () => {
    try {
      const [scholars, evals, unread] = await Promise.all([
        api<{ scholars: { waitingCount: number }[] }>(getToken, '/api/office/scholars?all=1'),
        api<{ terms: { scholars: { state: EvalState; locked: boolean }[] }[] }>(getToken, '/api/office/evaluations'),
        api<{ unread: number }>(getToken, '/api/messages/office/mine/unread'),
      ]);
      setCounts({
        waiting: scholars.scholars.reduce((n, s) => n + s.waitingCount, 0),
        evaluations: evals.terms.reduce((n, t) => n + t.scholars.filter(s => s.state === 'ready' && !s.locked).length, 0),
        unread: unread.unread,
      });
    } catch {
      // keep the last counts
    }
  }, [getToken]);
  useEffect(() => { refreshCounts(); }, [refreshCounts, tab]);
  useEffect(() => {
    window.addEventListener(MESSAGES_READ_EVENT, refreshCounts);
    return () => window.removeEventListener(MESSAGES_READ_EVENT, refreshCounts);
  }, [refreshCounts]);

  const countOf = (t: Tab) => (t === 'scholars' ? counts.waiting : t === 'evaluations' ? counts.evaluations : t === 'messages' ? counts.unread : 0);
  const section = SECTIONS.find(sec => sec.key === tab)!;
  // Same shell as the admin console: sidebar, top bar with breadcrumbs and
  // the account menu.
  const nav: NavSection[] = [
    { title: '', items: [SECTIONS[0], SECTIONS[1]].map(sec => ({ id: sec.key, label: sec.label, icon: sec.icon, count: countOf(sec.key), countLabel: 'to do' })) },
    { title: 'Communication', items: [SECTIONS[2]].map(sec => ({ id: sec.key, label: sec.label, icon: sec.icon, count: countOf(sec.key), countLabel: sec.key === 'messages' ? 'unread' : 'to do' })) },
  ];

  return (
    <>
      <AdminLayout
        currentView={tab}
        onNavigate={view => setTab(view as unknown as Tab)}
        nav={nav}
        consoleName="Office portal"
        homeView="scholars"
        onSecurity={() => setSecurityOpen(true)}
        onLogout={onLogout}
        adminEmail={head.email}
        adminName={head.name}
        officeLabel={head.office}
        officeShort={head.office}
        breadcrumbs={[{ label: section.label }]}
        pageKey={tab}
      >
        <PageHeader title={section.label} description={section.description} />

        {/* What needs doing, from any section. */}
        {tab === 'scholars' && (counts.waiting > 0 || counts.evaluations > 0 || counts.unread > 0) && (
          <div className="flex flex-col divide-y divide-line rounded-card bg-surface ring-1 ring-line sm:flex-row sm:divide-x sm:divide-y-0">
            {counts.waiting > 0 && (
              <TodoItem icon={Clock} tone="warning" text={`${counts.waiting} dut${counts.waiting === 1 ? 'y' : 'ies'} to check below`} action="" />
            )}
            {counts.evaluations > 0 && (
              <TodoItem icon={ClipboardCheck} tone="info" text={`${counts.evaluations} scholar${counts.evaluations === 1 ? '' : 's'} ready to evaluate`} action="Evaluate" onClick={() => setTab('evaluations')} />
            )}
            {counts.unread > 0 && (
              <TodoItem icon={MessageSquare} tone="info" text={`${counts.unread} unread message${counts.unread === 1 ? '' : 's'}`} action="Read" onClick={() => setTab('messages')} />
            )}
          </div>
        )}

        {tab === 'scholars' && <ScholarsTab head={head} getToken={getToken} onChanged={refreshCounts} onToast={setToast} onEvaluate={() => setTab('evaluations')} />}
        {tab === 'evaluations' && <EvaluationsTab getToken={getToken} onChanged={refreshCounts} onToast={setToast} />}
        {tab === 'messages' && <MessagesTab getToken={getToken} />}
      </AdminLayout>
      {toast && <ResultDialog message={toast} onClose={() => setToast('')} />}
      {securityOpen && (
        <Modal title="Account security" onClose={() => setSecurityOpen(false)} size="lg">
          <AccountSecurity />
        </Modal>
      )}
    </>
  );
}

// One "to do" in the strip above the scholars: what, and a way there.
function TodoItem({ icon: Icon, tone, text, action, onClick }: { icon: React.ElementType; tone: 'warning' | 'info'; text: string; action: string; onClick?: () => void }) {
  const inner = (
    <>
      <Icon className={`size-4 shrink-0 ${tone === 'warning' ? 'text-warning-fg' : 'text-accent'}`} aria-hidden />
      <span className="flex-1 text-sm font-medium text-ink">{text}</span>
      {onClick && <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent">{action} <ArrowRight className="size-3.5" aria-hidden /></span>}
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} className="flex flex-1 items-center gap-2.5 px-4 py-3 text-left hover:bg-surface-muted focus:outline-hidden focus-visible:bg-surface-muted">{inner}</button>
    : <div className="flex flex-1 items-center gap-2.5 px-4 py-3">{inner}</div>;
}

// --- Scholars & duties ------------------------------------------------------------

interface ScholarSummaryRow {
  studentNumber: string;
  academicYear: number;
  term: DutyTerm;
  name: string;
  program: string;
  yearLevel: string;
  avatarUrl?: string;
  confirmedHours: number;
  waitingHours: number;
  waitingCount: number;
  flaggedCount: number;
  lastDutyDate: string | null;
  completedHours: number;
  requiredHours: number | null;
  evaluationState: EvalState;
}
type EvalState = 'in_progress' | 'ready' | 'done';
interface TermKey { academicYear: number; term: DutyTerm }
const termKey = (t: TermKey) => `${t.academicYear}|${t.term}`;

function HoursBar({ completed, required }: { completed: number; required: number | null }) {
  const pct = required ? Math.min(100, (completed / required) * 100) : 0;
  return (
    <div className="min-w-28">
      <p className="text-sm tabular-nums text-ink">{formatHours(completed)}{required ? <span className="text-ink-subtle"> / {formatHours(required)} h</span> : ' h'}</p>
      {required ? (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-bg" aria-hidden>
          <div className={`h-full rounded-full ${pct >= 100 ? 'bg-success-solid' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function EvalBadge({ state }: { state: EvalState }) {
  if (state === 'done') return <Badge tone="success" dot>Evaluated</Badge>;
  if (state === 'ready') return <Badge tone="info" dot>Ready to evaluate</Badge>;
  return <Badge tone="neutral" icon={Hourglass}>Rendering hours</Badge>;
}

function ScholarsTab({ head, getToken, onChanged, onToast, onEvaluate }: { head: OfficeHeadInfo; getToken: GetToken; onChanged: () => void; onToast: (m: string) => void; onEvaluate: () => void }) {
  // The current semester by default; or another one, or all of them.
  const [filter, setFilter] = useState<'all' | string>(() => termKey(head.current));
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<ScholarSummaryRow[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<ScholarSummaryRow | null>(null);

  const load = useCallback(async () => {
    try {
      const body = await api<{ scholars: ScholarSummaryRow[] }>(getToken, '/api/office/scholars?all=1');
      setRows(body.scholars);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load your scholars.');
    }
  }, [getToken]);
  useEffect(() => { load(); }, [load]);

  // Semesters that have scholars, newest first (the current one always listed).
  const groups = useMemo(() => {
    const byTerm = new Map<string, { term: TermKey; rows: ScholarSummaryRow[] }>();
    byTerm.set(termKey(head.current), { term: head.current, rows: [] });
    for (const r of rows ?? []) {
      const t = { academicYear: r.academicYear, term: r.term };
      const k = termKey(t);
      if (!byTerm.has(k)) byTerm.set(k, { term: t, rows: [] });
      byTerm.get(k)!.rows.push(r);
    }
    // Who needs you first: duties to check, then ready to evaluate, then by name.
    const rank = (r: ScholarSummaryRow) => (r.waitingCount ? 0 : r.evaluationState === 'ready' ? 1 : 2);
    for (const g of byTerm.values()) g.rows.sort((x, y) => rank(x) - rank(y) || (x.name || '').localeCompare(y.name || ''));
    return [...byTerm.values()].sort((a, b) => b.term.academicYear - a.term.academicYear || b.term.term.localeCompare(a.term.term));
  }, [rows, head.current]);
  const q = query.trim().toLowerCase();
  const shown = (filter === 'all' ? groups.filter(g => g.rows.length || termKey(g.term) === termKey(head.current)) : groups.filter(g => termKey(g.term) === filter))
    .map(g => ({ ...g, rows: q ? g.rows.filter(r => (r.name || '').toLowerCase().includes(q) || r.studentNumber.includes(q)) : g.rows }));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-72"><SearchInput value={query} onChange={setQuery} label="Search scholars" placeholder="Search name or student no.…" /></div>
        <Select value={filter} onChange={setFilter} label="Semester" className="w-full sm:w-72">
          {groups.map(g => <option key={termKey(g.term)} value={termKey(g.term)}>{termLabel(g.term)}{termKey(g.term) === termKey(head.current) ? ' (current)' : ''}</option>)}
          <option value="all">All semesters</option>
        </Select>
      </div>
      {error && !rows ? <Card><ErrorState title="Couldn't load your scholars" message={error} onRetry={load} /></Card>
        : !rows ? <Card flush><TableSkeleton rows={4} label="Loading scholars" /></Card>
          : (
            shown.map(g => {
              const waiting = g.rows.reduce((n, r) => n + r.waitingCount, 0);
              return (
                <Card
                  key={termKey(g.term)}
                  flush
                  title={`${termLabel(g.term)}${termKey(g.term) === termKey(head.current) ? ' · current' : ''}`}
                  description={g.rows.length ? `${g.rows.length} scholar${g.rows.length === 1 ? '' : 's'}${waiting ? ` · ${waiting} dut${waiting === 1 ? 'y' : 'ies'} to check` : ' · all duties checked'}` : undefined}
                >
                  {g.rows.length === 0 ? <EmptyState icon={q ? Search : Users} title={q ? 'No scholar matches your search' : 'No scholars this semester'} /> : (
                    <>
                    <MobileList>
                      {g.rows.map(r => (
                        <li key={r.studentNumber}>
                          <button type="button" onClick={() => setOpen(r)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-muted">
                            <Avatar name={r.name || r.studentNumber} avatarUrl={r.avatarUrl} size="sm" />
                            <span className="min-w-0 flex-1 space-y-1.5">
                              <span className="block truncate text-sm font-medium text-ink">{r.name ? titleCaseName(r.name) : r.studentNumber}</span>
                              <HoursBar completed={r.completedHours} required={r.requiredHours} />
                            </span>
                            {r.waitingCount ? <Badge tone="warning">{r.waitingCount} to check</Badge>
                              : r.evaluationState === 'ready' ? <Badge tone="info">Evaluate</Badge>
                              : <EvalBadge state={r.evaluationState} />}
                          </button>
                        </li>
                      ))}
                    </MobileList>
                    <div className="hidden xl:block">
                    <Table label={`Your scholars, ${termLabel(g.term)}`} minWidth="56rem">
                      <thead>
                        <tr>
                          <Th sticky={false}>Scholar</Th>
                          <Th sticky={false} className="w-40">Hours</Th>
                          <Th sticky={false} className="w-44">To check</Th>
                          <Th sticky={false} className="w-44">Evaluation</Th>
                          <Th sticky={false} className="w-28">Last duty</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map(r => (
                          <Tr key={r.studentNumber} onClick={() => setOpen(r)}>
                            <Td>
                              <div className="flex min-w-0 items-center gap-3">
                                <Avatar name={r.name || r.studentNumber} avatarUrl={r.avatarUrl} size="sm" />
                                <div className="min-w-0">
                                  <span className="block truncate font-medium text-ink">{r.name ? titleCaseName(r.name) : r.studentNumber}</span>
                                  <span className="block truncate text-xs text-ink-subtle">{[r.studentNumber, r.program, r.yearLevel].filter(Boolean).join(' · ')}</span>
                                </div>
                              </div>
                            </Td>
                            <Td><HoursBar completed={r.completedHours} required={r.requiredHours} /></Td>
                            <Td>
                              {r.waitingCount ? <Badge tone="warning">{r.waitingCount} dut{r.waitingCount === 1 ? 'y' : 'ies'} · {formatHours(r.waitingHours)} h</Badge> : <span className="text-ink-subtle">All checked</span>}
                              {r.flaggedCount > 0 && <Badge tone="danger" className="ml-1">{r.flaggedCount} flagged</Badge>}
                            </Td>
                            <Td>
                              {r.evaluationState === 'ready'
                                ? <Button size="sm" variant="primary" icon={ClipboardCheck} onClick={e => { e.stopPropagation(); onEvaluate(); }}>Evaluate</Button>
                                : <EvalBadge state={r.evaluationState} />}
                            </Td>
                            <Td>{r.lastDutyDate ? formatDutyDate(r.lastDutyDate) : '—'}</Td>
                          </Tr>
                        ))}
                      </tbody>
                    </Table>
                    </div>
                    </>
                  )}
                </Card>
              );
            })
          )}
      {open && (
        <DutiesModal
          studentNumber={open.studentNumber}
          term={{ academicYear: open.academicYear, term: open.term }}
          getToken={getToken}
          onClose={() => setOpen(null)}
          onChanged={() => { load(); onChanged(); }}
          onToast={onToast}
        />
      )}
    </div>
  );
}

interface EntryRow { _id: string; date: string; timeIn: string; timeOut: string; hours: number; status: 'confirmed' | 'flagged' | null; note: string | null; loggedAt?: string | null }

function DutiesModal({ studentNumber, term, getToken, onClose, onChanged, onToast }: {
  studentNumber: string; term: TermKey; getToken: GetToken; onClose: () => void; onChanged: () => void; onToast: (m: string) => void;
}) {
  type Progress = { completed: number; required: number | null };
  type Summary = { regularHours: number; waitingHours?: number };
  const [data, setData] = useState<{ student: { name?: string; programCode?: string; yearLevel?: string }; entries: EntryRow[]; summary: Summary; progress?: Progress } | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Flagging: the duties being flagged and the note the scholar will see.
  const [flagging, setFlagging] = useState<string[] | null>(null);
  const [flagNote, setFlagNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [showConfirmed, setShowConfirmed] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api(getToken, `/api/office/scholars/${studentNumber}?academicYear=${term.academicYear}&term=${encodeURIComponent(term.term)}`));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the duties.');
    }
  }, [getToken, studentNumber, term]);
  useEffect(() => { load(); }, [load]);

  // One duty: done in place (the row changes). Several, or a flag: a popup
  // says what happened.
  const act = async (ids: string[], status: 'confirmed' | 'flagged' | null, note = '') => {
    setBusy(true);
    setError('');
    try {
      const body = await api<{ entries: EntryRow[]; summary: Summary; progress?: Progress }>(getToken, `/api/office/scholars/${studentNumber}/entries`, {
        method: 'PATCH', body: { ...term, entryIds: ids, status, note },
      });
      setData(d => (d ? { ...d, entries: body.entries, summary: body.summary, progress: body.progress ?? d.progress } : d));
      setSelected(new Set());
      setFlagging(null);
      setFlagNote('');
      onChanged();
      if (status === 'flagged') onToast(`Flagged ${ids.length === 1 ? 'the duty' : `${ids.length} duties`}. The scholar sees your note and can fix it.`);
      else if (status === 'confirmed' && ids.length > 1) onToast(`Confirmed ${ids.length} duties.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
      load();
    } finally {
      setBusy(false);
    }
  };

  const entries = data?.entries ?? [];
  const waiting = entries.filter(e => !e.status);
  const flagged = entries.filter(e => e.status === 'flagged');
  const confirmed = entries.filter(e => e.status === 'confirmed');
  const waitingHours = waiting.reduce((n, e) => n + e.hours, 0);
  const pick = [...selected].filter(id => waiting.some(e => e._id === id));
  const allPicked = waiting.length > 0 && pick.length === waiting.length;
  const toggle = (id: string) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const progress = data?.progress;
  const left = progress?.required ? Math.max(0, progress.required - progress.completed) : null;

  const footer = flagging ? (
    <>
      <Button onClick={() => { setFlagging(null); setFlagNote(''); }} disabled={busy}>Cancel</Button>
      <Button variant="danger" icon={Flag} loading={busy} disabled={!flagNote.trim()} onClick={() => act(flagging, 'flagged', flagNote)}>
        Flag {flagging.length === 1 ? 'duty' : `${flagging.length} duties`}
      </Button>
    </>
  ) : pick.length > 0 ? (
    <>
      <Button onClick={() => setSelected(new Set())} disabled={busy}>Clear selection</Button>
      <Button icon={Flag} onClick={() => setFlagging(pick)} disabled={busy}>Flag {pick.length}</Button>
      <Button variant="primary" icon={CheckCircle2} loading={busy} onClick={() => act(pick, 'confirmed')}>Confirm {pick.length}</Button>
    </>
  ) : waiting.length > 0 ? (
    <>
      <Button onClick={onClose} disabled={busy}>Close</Button>
      <Button variant="primary" icon={CheckCircle2} loading={busy} onClick={() => act(waiting.map(e => e._id), 'confirmed')}>
        Confirm all {waiting.length} waiting
      </Button>
    </>
  ) : (
    <Button variant="primary" onClick={onClose}>Done</Button>
  );

  // A duty row: date (shown once per day), time, hours, and its actions.
  const row = (e: EntryRow, prev: EntryRow | undefined, actions: React.ReactNode, selectable: boolean) => (
    <li key={e._id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 ${selected.has(e._id) ? 'bg-accent-subtle' : ''}`}>
      {selectable ? (
        <input
          type="checkbox"
          className="size-4 rounded accent-accent"
          checked={selected.has(e._id)}
          onChange={() => toggle(e._id)}
          disabled={busy}
          aria-label={`Select ${weekday(e.date)}, ${formatDutyDate(e.date)}, ${format12h(e.timeIn)}`}
        />
      ) : null}
      <span className={`w-32 text-sm ${prev?.date === e.date ? 'text-transparent select-none' : 'font-medium text-ink'}`} aria-hidden={prev?.date === e.date}>
        {weekday(e.date)}, {formatDutyDate(e.date)}
      </span>
      <span className="w-40 text-sm text-ink-muted">{format12h(e.timeIn)} – {format12h(e.timeOut)}</span>
      <span className="w-12 text-right text-sm tabular-nums text-ink">{hrs(e.hours)} h</span>
      <span className="ml-auto flex items-center gap-1">{actions}</span>
      {e.status === 'flagged' && e.note && <p className="w-full pl-0 text-xs text-danger-fg sm:pl-[8.75rem]">Your note: {e.note}</p>}
      {(() => {
        // Unreviewed duties are removed 48 hours after they're logged.
        const left = hoursUntilRemoved(e);
        return left === null ? null : (
          <p className="w-full pl-0 text-xs text-warning-fg sm:pl-[8.75rem]">
            {left <= 1 ? 'Removed within the hour if not confirmed or flagged' : `Removed in ${left} hours if not confirmed or flagged`}
          </p>
        );
      })()}
    </li>
  );

  return (
    <Modal
      size="lg"
      sheet
      title={data?.student?.name ? titleCaseName(data.student.name) : studentNumber}
      description={`${termLabel(term)}${data?.student?.programCode ? ` · ${data.student.programCode}` : ''}${data?.student?.yearLevel ? ` · ${data.student.yearLevel}` : ''}`}
      onClose={onClose}
      dismissible={!busy}
      footer={footer}
    >
      {error && <Alert tone="danger">{error}</Alert>}
      {!data ? (!error && <TableSkeleton rows={5} label="Loading duties" />) : (
        <div className="space-y-5">
          {/* Progress toward the requirement */}
          <div className="rounded-card bg-surface-muted p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-ink">
                <span className="text-2xl font-semibold tabular-nums">{hrs(progress?.completed ?? data.summary.regularHours)}</span>
                {progress?.required ? <span className="text-ink-muted"> of {hrs(progress.required)} hours</span> : <span className="text-ink-muted"> hours confirmed</span>}
              </p>
              <p className="text-sm text-ink-muted">
                {left === 0 ? 'Requirement complete' : left !== null ? `${hrs(left)} h to go` : ''}
              </p>
            </div>
            {progress?.required ? (
              <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-neutral-bg" aria-hidden>
                <div className="h-full bg-success-solid" style={{ width: `${Math.min(100, (progress.completed / progress.required) * 100)}%` }} />
                <div className="h-full bg-warning-solid/60" style={{ width: `${Math.min(100 - Math.min(100, (progress.completed / progress.required) * 100), (waitingHours / progress.required) * 100)}%` }} />
              </div>
            ) : null}
            {waiting.length > 0 && (
              <p className="mt-2 text-xs text-ink-muted">
                <span className="inline-block size-2 rounded-full bg-warning-solid/60 align-middle" aria-hidden /> {hrs(waitingHours)} h waiting for you to confirm
                {left !== null && left > 0 && waitingHours >= left ? ' · confirming them completes the requirement, and the scholar moves to Ready to evaluate' : ''}
              </p>
            )}
          </div>

          {entries.length === 0 && <EmptyState icon={Clock} title="No duties logged" />}

          {/* Waiting: the part that needs the head */}
          {waiting.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">Waiting for you <span className="text-ink-subtle">({waiting.length})</span></h3>
                <label className="flex items-center gap-2 text-xs text-ink-muted">
                  <input type="checkbox" className="size-4 rounded accent-accent" checked={allPicked} disabled={busy}
                    onChange={() => setSelected(allPicked ? new Set() : new Set(waiting.map(e => e._id)))} />
                  Select all
                </label>
              </div>
              {flagging && (
                <Field label={`What's wrong with ${flagging.length === 1 ? 'this duty' : `these ${flagging.length} duties`}? The scholar sees this.`}>
                  <TextInput value={flagNote} onChange={e => setFlagNote(e.target.value)} maxLength={500} placeholder="e.g. Not in the office that morning" autoFocus />
                </Field>
              )}
              <ul className="divide-y divide-line rounded-control ring-1 ring-warning-fg/20">
                {waiting.map((e, k) => row(e, waiting[k - 1], (
                  <>
                    <Button size="sm" variant="ghost" icon={Flag} onClick={() => { setSelected(new Set([e._id])); setFlagging([e._id]); }} disabled={busy}>Flag</Button>
                    <Button size="sm" icon={Check} onClick={() => act([e._id], 'confirmed')} disabled={busy}>Confirm</Button>
                  </>
                ), true))}
              </ul>
            </section>
          )}

          {/* Flagged: waiting for the scholar to fix */}
          {flagged.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-ink">Flagged <span className="text-ink-subtle">({flagged.length}) · waiting for the scholar to fix</span></h3>
              <ul className="divide-y divide-line rounded-control ring-1 ring-danger-fg/20">
                {flagged.map((e, k) => row(e, flagged[k - 1], (
                  <>
                    <Badge tone="danger" dot>Flagged</Badge>
                    <Button size="sm" variant="ghost" icon={Undo2} onClick={() => act([e._id], null)} disabled={busy}>Undo</Button>
                  </>
                ), false))}
              </ul>
            </section>
          )}

          {/* Confirmed: done, folded away */}
          {confirmed.length > 0 && (
            <section className="space-y-2">
              <button type="button" onClick={() => setShowConfirmed(v => !v)} aria-expanded={showConfirmed}
                className="flex w-full items-center justify-between gap-2 rounded-control text-left text-sm font-semibold text-ink hover:text-accent">
                <span>Confirmed <span className="font-normal text-ink-subtle">({confirmed.length} · {hrs(confirmed.reduce((n, e) => n + e.hours, 0))} h)</span></span>
                <ChevronDown className={`size-4 transition-transform ${showConfirmed ? 'rotate-180' : ''}`} aria-hidden />
              </button>
              {showConfirmed && (
                <ul className="divide-y divide-line rounded-control ring-1 ring-line">
                  {confirmed.map((e, k) => row(e, confirmed[k - 1], (
                    <>
                      <Badge tone="success" dot>Confirmed</Badge>
                      <Button size="sm" variant="ghost" icon={Undo2} onClick={() => act([e._id], null)} disabled={busy}>Undo</Button>
                    </>
                  ), false))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}

// Hours without trailing zeros: 4, 4.5, 13.25.
const hrs = (n: number) => String(Math.round(n * 100) / 100);

// --- Evaluations ------------------------------------------------------------------
// A scholar opens for evaluation once their duty hours are complete; the
// head gets an email then. Grouped: ready, still rendering hours, done.

interface EvalScholar {
  studentNumber: string; name: string; program: string; yearLevel: string; avatarUrl?: string;
  state: EvalState; completed: number; required: number | null; waitingHours: number;
  evaluation: { scores: Record<string, number>; average: number; remarks: string | null; enteredAt: string } | null;
  locked: boolean;
}
interface EvalTerm { term: TermKey; scholars: EvalScholar[] }

function EvaluationsTab({ getToken, onChanged, onToast }: { getToken: GetToken; onChanged: () => void; onToast: (m: string) => void }) {
  const [terms, setTerms] = useState<EvalTerm[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<{ term: TermKey; scholar: EvalScholar } | null>(null);

  const load = useCallback(async () => {
    try {
      setTerms((await api<{ terms: EvalTerm[] }>(getToken, '/api/office/evaluations')).terms);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the evaluations.');
    }
  }, [getToken]);
  useEffect(() => { load(); }, [load]);

  if (error && !terms) return <Card><ErrorState title="Couldn't load the evaluations" message={error} onRetry={load} /></Card>;
  if (!terms) return <Card flush><TableSkeleton rows={4} label="Loading evaluations" /></Card>;
  const withScholars = terms.filter(t => t.scholars.length);
  if (!withScholars.length) return <Card><EmptyState icon={ClipboardCheck} title="No scholars to evaluate yet" /></Card>;

  const row = (term: TermKey, s: EvalScholar) => (
    <li key={s.studentNumber} className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Avatar name={s.name || s.studentNumber} avatarUrl={s.avatarUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{s.name ? titleCaseName(s.name) : s.studentNumber}</p>
        <p className="truncate text-xs text-ink-subtle">{[s.studentNumber, s.program, s.yearLevel].filter(Boolean).join(' · ')}</p>
      </div>
      <HoursBar completed={s.completed} required={s.required} />
      {s.state === 'in_progress' && (
        <span className="w-48 text-right text-xs text-ink-subtle">
          {s.required ? `${formatHours(Math.max(0, s.required - s.completed))} h to go` : 'Required hours not set'}
          {s.waitingHours ? ` · ${formatHours(s.waitingHours)} h waiting for your confirmation` : ''}
        </span>
      )}
      {s.evaluation && <Badge tone={s.evaluation.average >= passingAverage() ? 'success' : 'warning'} dot>{s.evaluation.average.toFixed(2)} · {ratingLabel(s.evaluation.average)}</Badge>}
      {s.state !== 'in_progress' && (s.locked
        ? <Badge tone="neutral">Renewal already decided</Badge>
        : <Button size="sm" variant={s.evaluation ? 'ghost' : 'primary'} onClick={() => setOpen({ term, scholar: s })}>{s.evaluation ? 'Edit' : 'Evaluate'}</Button>)}
    </li>
  );

  return (
    <div className="space-y-4">
      {withScholars.map(t => {
        const ready = t.scholars.filter(s => s.state === 'ready');
        const progress = t.scholars.filter(s => s.state === 'in_progress');
        const done = t.scholars.filter(s => s.state === 'done');
        const group = (title: string, list: EvalScholar[], hint: string) => list.length > 0 && (
          <div>
            <p className="border-b border-line bg-surface-muted px-4 py-2 text-xs font-semibold text-ink-muted">{title} · {list.length}<span className="font-normal text-ink-subtle"> — {hint}</span></p>
            <ul className="divide-y divide-line">{list.map(s => row(t.term, s))}</ul>
          </div>
        );
        return (
          <Card key={`${t.term.academicYear}|${t.term.term}`} flush title={termLabel(t.term)} description={`${ready.length} ready · ${progress.length} still rendering hours · ${done.length} evaluated`}>
            {group('Ready to evaluate', ready, 'finished their hours')}
            {group('Still rendering hours', progress, 'opens when they finish; you’ll get an email')}
            {group('Evaluated', done, 'you can still edit until the renewal is decided')}
          </Card>
        );
      })}
      {open && (
        <EvaluateModal
          term={open.term}
          scholar={open.scholar}
          getToken={getToken}
          onClose={() => setOpen(null)}
          onSaved={() => { setOpen(null); load(); onChanged(); onToast('Evaluation saved. It goes into the scholar’s renewal.'); }}
        />
      )}
    </div>
  );
}

function EvaluateModal({ term, scholar, getToken, onClose, onSaved }: {
  term: TermKey; scholar: EvalScholar; getToken: GetToken; onClose: () => void; onSaved: () => void;
}) {
  const [scores, setScores] = useState<Record<string, number>>(scholar.evaluation?.scores ?? {});
  const [remarks, setRemarks] = useState(scholar.evaluation?.remarks ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rated = EVALUATION_ITEMS.filter(i => scores[i.key]).length;
  const average = rated === EVALUATION_ITEMS.length ? EVALUATION_ITEMS.reduce((n, i) => n + scores[i.key], 0) / EVALUATION_ITEMS.length : null;

  const save = async () => {
    if (average === null) { setError('Rate every item from 1 to 5.'); return; }
    setBusy(true);
    setError('');
    try {
      await api(getToken, `/api/office/evaluations/${scholar.studentNumber}`, { method: 'PUT', body: { ...term, scores, remarks } });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the evaluation.');
      setBusy(false);
    }
  };

  return (
    <Modal
      size="lg"
      sheet
      title={`Evaluate ${scholar.name ? titleCaseName(scholar.name) : scholar.studentNumber}`}
      description={termLabel(term)}
      onClose={onClose}
      dismissible={!busy}
      footer={(
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-muted">
            {average === null ? `${rated} of ${EVALUATION_ITEMS.length} rated` : <>Average <b className="text-ink">{average.toFixed(2)}</b> · {ratingLabel(average)}</>}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={save} disabled={average === null}>Submit evaluation</Button>
          </div>
        </div>
      )}
    >
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="divide-y divide-line rounded-control ring-1 ring-line">
        {EVALUATION_ITEMS.map((item, i) => (
          <div key={item.key} className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-ink"><span className="mr-1.5 tabular-nums text-ink-subtle">{i + 1}.</span>{item.label}</span>
            <SegmentedControl<'5' | '4' | '3' | '2' | '1'>
              label={item.label}
              options={['5', '4', '3', '2', '1']}
              value={scores[item.key] ? (String(scores[item.key]) as '5') : ''}
              onChange={v => v && setScores(prev => ({ ...prev, [item.key]: Number(v) }))}
              className="sm:w-56"
            />
          </div>
        ))}
      </div>
      <div className="mt-4">
        <Field label="Remarks" optional helper="The scholar sees this.">
          <Textarea rows={2} value={remarks} onChange={e => setRemarks(e.target.value)} maxLength={2000} disabled={busy} />
        </Field>
      </div>
      {average !== null && average < passingAverage() && (
        <p className="mt-3 text-sm text-warning-fg">Below 4: the scholarship office will interview the scholar before deciding their renewal.</p>
      )}
    </Modal>
  );
}

// --- Messages ---------------------------------------------------------------------

function MessagesTab({ getToken }: { getToken: GetToken }) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const body = await api<{ messages: ChatMessage[] }>(getToken, '/api/messages/office/mine');
      setMessages(body.messages);
      if (body.messages.some(m => m.from === 'adso' && !m.readAt)) {
        await api(getToken, '/api/messages/office/mine/read', { method: 'POST', body: {} });
        window.dispatchEvent(new Event(MESSAGES_READ_EVENT));
      }
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load your messages.');
    }
  }, [getToken]);
  useEffect(() => {
    load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, 20_000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (error && !messages) return <Card><ErrorState title="Couldn't load your messages" message={error} onRetry={load} /></Card>;
  if (!messages) return <Card flush><TableSkeleton rows={3} label="Loading messages" /></Card>;
  return (
    <Card flush title="Admissions and Scholarship Office">
      <Conversation
        className="h-[min(70dvh,680px)]"
        messages={messages}
        viewer="office"
        filesPath="/api/messages/office/files"
        getToken={getToken}
        onSend={async data => { const m = await postMessage('/api/messages/office/mine', getToken, data); setMessages(prev => [...(prev ?? []), m]); }}
        emptyText="No messages yet. Write to the scholarship office below."
        placeholder="Write to the scholarship office…"
      />
    </Card>
  );
}

