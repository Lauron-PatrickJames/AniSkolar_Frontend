import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/react';
import { Building2, CheckCircle2, ClipboardCheck, Clock, Flag, Hourglass, LogOut, MessageSquare, Send, Users } from 'lucide-react';
import logo from '../../assets/logo.png';
import Conversation from '../../components/messages/Conversation';
import { ChatMessage, MESSAGES_READ_EVENT, postMessage } from '../../utils/messages';
import { DutyTerm, format12h, formatDutyDate, formatHours, termLabel, weekday } from '../../utils/dutyHours';
import { EVALUATION_ITEMS, PASSING_AVERAGE, RATING_LABELS, ratingLabel } from '../../utils/renewals';
import { API_BASE_URL, authHeaders, formatDateTime, titleCaseName } from '../admin/adminData';
import { ResultDialog,
  Alert, Avatar, Badge, Button, Card, EmptyState, ErrorState, Field, KpiCard, KpiGrid, Modal, PageHeader, SegmentedControl, Select, Table,
  TableSkeleton, Tabs, Td, TextInput, Textarea, Th, Toast, Tr
} from '../admin/AdminUI';

// The office portal: for the head of a duty office (listed by the AdSO in
// Duty hours → Offices), signed in with that school email. They confirm
// their SFAG scholars' duties, evaluate each scholar once their hours are
// complete (they're emailed when that happens), send the
// AdSO requests and message the AdSO — instead of paper duty sheets,
// evaluation forms and letters. Backend: routes/office.js and the office
// routes in routes/messages.js.

export interface OfficeHeadInfo {
  office: string;
  name: string;
  email: string;
  current: { academicYear: number; term: DutyTerm };
}

type Tab = 'scholars' | 'evaluations' | 'requests' | 'messages';
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

export default function OfficePortal({ head, onLogout }: { head: OfficeHeadInfo; onLogout: () => void }) {
  const { getToken } = useAuth();
  const [tab, setTab] = useState<Tab>('scholars');
  const [counts, setCounts] = useState({ waiting: 0, evaluations: 0, unread: 0 });
  const [toast, setToast] = useState('');

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

  return (
    <div data-admin className="min-h-dvh bg-canvas text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-topbar max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface ring-1 ring-line">
              <img src={logo} alt="" className="size-6 object-contain" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-accent">AniSkolar</p>
              <p className="truncate text-xs leading-tight text-ink-subtle">Office portal</p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <Badge icon={Building2} className="hidden max-w-xs truncate sm:inline-flex">{head.office}</Badge>
            <Button size="sm" variant="ghost" icon={LogOut} onClick={onLogout}>Sign out</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:py-8">
        <PageHeader
          title={head.office}
          description={`Welcome${head.name ? `, ${head.name}` : ''}. Confirm your SFAG scholars' duties, evaluate them once they finish their hours, and reach the scholarship office.`}
        />
        <KpiGrid columns={3}>
          <KpiCard label="Duties to check" value={counts.waiting} icon={Clock} tone={counts.waiting ? 'warning' : 'neutral'} active={tab === 'scholars'} onClick={() => setTab('scholars')} hint="Logged by your scholars, waiting for you" />
          <KpiCard label="Ready to evaluate" value={counts.evaluations} icon={ClipboardCheck} tone={counts.evaluations ? 'info' : 'neutral'} active={tab === 'evaluations'} onClick={() => setTab('evaluations')} hint="Finished their duty hours" />
          <KpiCard label="Unread messages" value={counts.unread} icon={MessageSquare} tone={counts.unread ? 'info' : 'neutral'} active={tab === 'messages'} onClick={() => setTab('messages')} hint="From the scholarship office" />
        </KpiGrid>
        <Tabs<Tab>
          label="Office portal sections"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'scholars', label: 'Scholars & duties', icon: Users, count: counts.waiting || undefined },
            { key: 'evaluations', label: 'Evaluations', icon: ClipboardCheck, count: counts.evaluations || undefined },
            { key: 'requests', label: 'Requests', icon: Send },
            { key: 'messages', label: 'Messages', icon: MessageSquare, count: counts.unread || undefined },
          ]}
        />
        {tab === 'scholars' && <ScholarsTab head={head} getToken={getToken} onChanged={refreshCounts} onToast={setToast} onEvaluate={() => setTab('evaluations')} />}
        {tab === 'evaluations' && <EvaluationsTab getToken={getToken} onChanged={refreshCounts} onToast={setToast} />}
        {tab === 'requests' && <RequestsTab getToken={getToken} onToast={setToast} />}
        {tab === 'messages' && <MessagesTab getToken={getToken} />}
      </main>
      {toast && <ResultDialog message={toast} onClose={() => setToast('')} />}
    </div>
  );
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
  // 'all' (default): every semester, grouped newest first; or one semester.
  const [filter, setFilter] = useState<'all' | string>('all');
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
    return [...byTerm.values()].sort((a, b) => b.term.academicYear - a.term.academicYear || b.term.term.localeCompare(a.term.term));
  }, [rows, head.current]);
  const shown = filter === 'all' ? groups.filter(g => g.rows.length || termKey(g.term) === termKey(head.current)) : groups.filter(g => termKey(g.term) === filter);

  return (
    <div className="space-y-4">
      <Select value={filter} onChange={setFilter} label="Semester" className="w-full sm:w-80">
        <option value="all">All semesters</option>
        {groups.map(g => <option key={termKey(g.term)} value={termKey(g.term)}>{termLabel(g.term)}{termKey(g.term) === termKey(head.current) ? ' (current)' : ''}</option>)}
      </Select>
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
                  {g.rows.length === 0 ? <EmptyState icon={Users} title="No scholars this semester" description="SFAG scholars assigned to your office by the scholarship office appear here." /> : (
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

interface EntryRow { _id: string; date: string; timeIn: string; timeOut: string; hours: number; status: 'confirmed' | 'flagged' | null; note: string | null }

function DutiesModal({ studentNumber, term, getToken, onClose, onChanged, onToast }: {
  studentNumber: string; term: TermKey; getToken: GetToken; onClose: () => void; onChanged: () => void; onToast: (m: string) => void;
}) {
  const [data, setData] = useState<{ student: { name?: string; programCode?: string; yearLevel?: string }; entries: EntryRow[]; summary: { regularHours: number; waitingHours?: number } } | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [flagNote, setFlagNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api(getToken, `/api/office/scholars/${studentNumber}?academicYear=${term.academicYear}&term=${encodeURIComponent(term.term)}`));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the duties.');
    }
  }, [getToken, studentNumber, term]);
  useEffect(() => { load(); }, [load]);

  const act = async (ids: string[], status: 'confirmed' | 'flagged' | null, note = '') => {
    setBusy(true);
    setError('');
    try {
      const body = await api<{ entries: EntryRow[]; summary: { regularHours: number; waitingHours?: number } }>(getToken, `/api/office/scholars/${studentNumber}/entries`, {
        method: 'PATCH', body: { ...term, entryIds: ids, status, note },
      });
      setData(d => (d ? { ...d, entries: body.entries, summary: body.summary } : d));
      setSelected(new Set());
      setFlagNote(null);
      onChanged();
      onToast(status === 'confirmed' ? `Confirmed ${ids.length} dut${ids.length === 1 ? 'y' : 'ies'}.` : status === 'flagged' ? 'Flagged. The scholar sees your note.' : 'Undone.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
      load();
    } finally {
      setBusy(false);
    }
  };

  const waiting = data?.entries.filter(e => !e.status) ?? [];
  const pick = [...selected];
  return (
    <Modal
      size="lg"
      title={data?.student?.name ? titleCaseName(data.student.name) : studentNumber}
      description={`${termLabel(term)} · Confirm the duties you can vouch for; flag any that aren't right. Only confirmed duties count toward the scholar's hours.`}
      onClose={onClose}
      dismissible={!busy}
      footer={
        flagNote !== null ? (
          <>
            <Button onClick={() => setFlagNote(null)} disabled={busy}>Cancel</Button>
            <Button variant="danger" icon={Flag} loading={busy} disabled={!flagNote.trim()} onClick={() => act(pick, 'flagged', flagNote)}>Flag {pick.length}</Button>
          </>
        ) : (
          <>
            <Button icon={Flag} onClick={() => setFlagNote('')} disabled={busy || !pick.length}>Flag selected</Button>
            <Button onClick={() => act(pick, 'confirmed')} disabled={busy || !pick.length}>Confirm selected</Button>
            <Button variant="primary" icon={CheckCircle2} loading={busy} disabled={!waiting.length} onClick={() => act(waiting.map(e => e._id), 'confirmed')}>Confirm all waiting ({waiting.length})</Button>
          </>
        )
      }
    >
      {error && <Alert tone="danger">{error}</Alert>}
      {!data ? (!error && <TableSkeleton rows={5} label="Loading duties" />) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            <b className="text-ink">{formatHours(data.summary.regularHours)} h confirmed</b>
            {data.summary.waitingHours ? ` · ${formatHours(data.summary.waitingHours)} h waiting for you` : ''}
          </p>
          {flagNote !== null && (
            <Field label={`What's wrong with the ${pick.length} selected dut${pick.length === 1 ? 'y' : 'ies'}?`}>
              <TextInput value={flagNote} onChange={e => setFlagNote(e.target.value)} maxLength={500} placeholder="e.g. Not in the office that morning" autoFocus />
            </Field>
          )}
          {data.entries.length === 0 ? <EmptyState icon={Clock} title="No duties logged" description="The scholar hasn't logged any duty this term." /> : (
            <ul className="divide-y divide-line rounded-control ring-1 ring-line">
              {data.entries.map(e => (
                <li key={e._id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    className="size-4 rounded accent-accent"
                    checked={selected.has(e._id)}
                    onChange={() => setSelected(s => { const n = new Set(s); if (n.has(e._id)) n.delete(e._id); else n.add(e._id); return n; })}
                    aria-label={`Select ${formatDutyDate(e.date)} ${format12h(e.timeIn)}`}
                  />
                  <span className="w-28 text-sm text-ink">{weekday(e.date)}, {formatDutyDate(e.date)}</span>
                  <span className="w-40 text-sm text-ink-muted">{format12h(e.timeIn)} – {format12h(e.timeOut)}</span>
                  <span className="w-14 text-right text-sm tabular-nums">{formatHours(e.hours)} h</span>
                  <span className="ml-auto flex items-center gap-2">
                    {e.status === 'confirmed' ? <Badge tone="success" dot>Confirmed</Badge>
                      : e.status === 'flagged' ? <Badge tone="danger" dot>Flagged</Badge>
                        : <Badge tone="warning" dot>Waiting</Badge>}
                    {e.status && <Button size="sm" variant="ghost" onClick={() => act([e._id], null)} disabled={busy}>Undo</Button>}
                  </span>
                  {e.status === 'flagged' && e.note && <p className="w-full pl-7 text-xs text-danger-fg">{e.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

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
  if (!withScholars.length) return <Card><EmptyState icon={ClipboardCheck} title="No scholars to evaluate yet" description="Your SFAG scholars appear here. Each one opens for evaluation as soon as they complete their duty hours, and you'll get an email." /></Card>;

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
      {s.evaluation && <Badge tone={s.evaluation.average >= PASSING_AVERAGE ? 'success' : 'warning'} dot>{s.evaluation.average.toFixed(2)} · {ratingLabel(s.evaluation.average)}</Badge>}
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
      description={`Their duty in your office during the ${termLabel(term)}. ${Object.entries(RATING_LABELS).reverse().map(([n, l]) => `${n} ${l}`).join(', ')}.`}
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
        <Field label="Remarks" optional helper="Seen by the scholarship office.">
          <Textarea rows={2} value={remarks} onChange={e => setRemarks(e.target.value)} maxLength={2000} disabled={busy} />
        </Field>
      </div>
      {average !== null && average < PASSING_AVERAGE && (
        <p className="mt-3 text-sm text-warning-fg">Below 4: the scholarship office will interview the scholar before deciding their renewal.</p>
      )}
    </Modal>
  );
}

// --- Requests ---------------------------------------------------------------------

interface OfficeRequestRow { _id: string; kind: 'specific' | 'more' | 'fewer' | 'other'; scholar?: string; count?: number; note?: string; status: 'open' | 'done' | 'declined'; response?: string; createdAt: string; resolvedAt?: string }
const KIND_LABELS: Record<OfficeRequestRow['kind'], string> = { specific: 'A specific scholar', more: 'More scholars', fewer: 'Fewer scholars', other: 'Something else' };

function RequestsTab({ getToken, onToast }: { getToken: GetToken; onToast: (m: string) => void }) {
  const [list, setList] = useState<OfficeRequestRow[] | null>(null);
  const [kind, setKind] = useState<OfficeRequestRow['kind']>('specific');
  const [scholar, setScholar] = useState('');
  const [count, setCount] = useState('1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setList((await api<{ requests: OfficeRequestRow[] }>(getToken, '/api/office/requests')).requests); } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load your requests.'); }
  }, [getToken]);
  useEffect(() => { load(); }, [load]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(getToken, '/api/office/requests', { method: 'POST', body: { kind, scholar, count: kind === 'more' || kind === 'fewer' ? Number(count) : undefined, note } });
      setScholar(''); setNote(''); setCount('1');
      onToast('Request sent to the scholarship office.');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send the request.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <Card title="New request" description="Ask the scholarship office for a specific scholar, or more or fewer scholars.">
        <form onSubmit={send} className="space-y-3">
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="I'm requesting">
            <Select value={kind} onChange={v => setKind(v as OfficeRequestRow['kind'])} disabled={busy}>
              {Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </Field>
          {kind === 'specific' && <Field label="Scholar"><TextInput value={scholar} onChange={e => setScholar(e.target.value)} maxLength={200} placeholder="Name or student number" disabled={busy} /></Field>}
          {(kind === 'more' || kind === 'fewer') && <Field label="How many"><TextInput type="number" min={1} max={20} value={count} onChange={e => setCount(e.target.value)} disabled={busy} /></Field>}
          <Field label="Details" optional={kind !== 'other'}><Textarea rows={3} value={note} onChange={e => setNote(e.target.value)} maxLength={1000} placeholder={kind === 'specific' ? 'e.g. They helped us last term.' : ''} disabled={busy} /></Field>
          <Button type="submit" variant="primary" icon={Send} loading={busy}>Send request</Button>
        </form>
      </Card>
      <Card title="Your requests" flush>
        {!list ? <TableSkeleton rows={3} label="Loading requests" /> : list.length === 0 ? <EmptyState icon={Send} title="No requests yet" description="Requests you send appear here with the office's answer." /> : (
          <ul className="divide-y divide-line">
            {list.map(r => (
              <li key={r._id} className="space-y-1 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">{KIND_LABELS[r.kind]}{r.kind === 'specific' && r.scholar ? `: ${r.scholar}` : ''}{r.count ? ` (${r.count})` : ''}</span>
                  <Badge tone={r.status === 'done' ? 'success' : r.status === 'declined' ? 'danger' : 'warning'} dot>{r.status === 'open' ? 'Waiting' : r.status === 'done' ? 'Done' : 'Declined'}</Badge>
                  <span className="ml-auto text-xs text-ink-subtle">{formatDateTime(r.createdAt)}</span>
                </div>
                {r.note && <p className="text-sm text-ink-muted">{r.note}</p>}
                {r.response && <p className="rounded-control bg-surface-muted px-3 py-2 text-sm text-ink"><b>Scholarship office:</b> {r.response}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
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
    <Card flush title="Admissions and Scholarship Office" description="Message the scholarship office about your scholars — absences, concerns, anything. They're also emailed.">
      <Conversation
        className="h-[min(62vh,600px)]"
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

