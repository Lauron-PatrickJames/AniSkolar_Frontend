import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, MessageSquare, Trash2, UserCheck, UserRound, Users } from 'lucide-react';
import { API_BASE_URL, authHeaders, formatDate, titleCaseName } from './adminData';
import {
  Alert, Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, IconButton, KpiCard, KpiGrid, MobileList, PageHeader, Pagination,
  RowLink, SearchInput, Select, Table, TableSkeleton, Td, Th, Toast, Toolbar, Tooltip, Tr, Truncate, usePagination
} from './AdminUI';
import { COLLEGES, collegeName } from '../../data/programs';

// Every student who finished setting up a profile, and whether they've
// applied (AdSO only; GET /api/students). For seeing who signed up but
// hasn't applied yet. Profile details only, no activity tracking.
// Students the office no longer needs (rejected, graduated, stopped) can be
// deleted with their records: they go to the Trash for 30 days
// (POST /api/students/delete; anyone with something active is skipped).

interface StudentRow {
  studentNumber: string;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  programCode: string | null;
  course: string | null;
  college: string | null;
  yearLevel: string | null;
  joinedAt: string | null;
  applications: number;
  lastAppliedAt: string | null;
  // active: an application being decided or a current scholarship;
  // ended: a scholarship that ended (graduated, stopped, declined).
  outcome: 'active' | 'ended' | 'rejected' | 'none';
}

type Outcome = '' | StudentRow['outcome'];
const OUTCOMES: { value: Outcome; label: string }[] = [
  { value: '', label: 'Any status' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'ended', label: 'Scholarship ended' },
  { value: 'none', label: 'No applications' },
  { value: 'active', label: 'Active' },
];

type Show = 'not-applied' | 'applied' | 'all';

const fullName = (s: StudentRow) =>
  titleCaseName([s.firstName, s.middleName, s.lastName].filter(Boolean).join(' ') || s.name || s.studentNumber);

export default function StudentsPage({ getToken, onOpenScholar, onMessageStudent }: {
  getToken: () => Promise<string | null>;
  // Students with applications open in Scholars.
  onOpenScholar: (studentNumber: string) => void;
  onMessageStudent?: (studentNumber: string) => void;
}) {
  const [rows, setRows] = useState<StudentRow[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState<Show>('not-applied');
  const [search, setSearch] = useState('');
  const [college, setCollege] = useState('');
  const [outcome, setOutcome] = useState<Outcome>('');
  // Students picked for deleting (not active ones).
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [skipped, setSkipped] = useState<{ studentNumber: string; reason: string }[]>([]);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/students`, { headers: await authHeaders(getToken) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to load the students.');
      setRows(body.students ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the students.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const all = rows ?? [];
    const applied = all.filter(s => s.applications > 0).length;
    return { all: all.length, applied, notApplied: all.length - applied };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter(s => {
      if (show === 'not-applied' && s.applications > 0) return false;
      if (show === 'applied' && s.applications === 0) return false;
      if (college && s.college !== college) return false;
      if (outcome && s.outcome !== outcome) return false;
      if (!q) return true;
      return [fullName(s), s.studentNumber, s.email, s.course, s.programCode, s.college]
        .some(v => (v ?? '').toLowerCase().includes(q));
    });
  }, [rows, show, search, college, outcome]);

  const pager = usePagination(filtered, 20, `${show}|${search}|${college}|${outcome}`);
  const filtersActive = !!search.trim() || !!college || !!outcome;

  const canPick = (s: StudentRow) => s.outcome !== 'active';
  const togglePick = (sn: string) => setPicked(p => { const n = new Set(p); if (n.has(sn)) n.delete(sn); else n.add(sn); return n; });
  const pageSelectable = pager.pageItems.filter(canPick);
  const allPagePicked = pageSelectable.length > 0 && pageSelectable.every(s => picked.has(s.studentNumber));
  const togglePage = () => setPicked(p => {
    const n = new Set(p);
    pageSelectable.forEach(s => (allPagePicked ? n.delete(s.studentNumber) : n.add(s.studentNumber)));
    return n;
  });
  const nameOf = (sn: string) => { const s = rows?.find(r => r.studentNumber === sn); return s ? fullName(s) : sn; };

  const deletePicked = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/students/delete`, {
        method: 'POST',
        headers: await authHeaders(getToken, true),
        body: JSON.stringify({ studentNumbers: [...picked] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to delete the students.');
      const gone = new Set<string>(body.deleted ?? []);
      setRows(r => (r ?? []).filter(s => !gone.has(s.studentNumber)));
      setPicked(new Set());
      setSkipped(body.skipped ?? []);
      setConfirmDelete(false);
      if (gone.size) setToast(`Moved ${gone.size} student${gone.size === 1 ? '' : 's'} to the Trash. You can restore them for 30 days.`);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete the students.');
    } finally {
      setDeleting(false);
    }
  };

  const pickBox = (s: StudentRow) => (
    <input
      type="checkbox"
      className="size-4 rounded accent-accent disabled:opacity-30"
      checked={picked.has(s.studentNumber)}
      disabled={!canPick(s)}
      title={canPick(s) ? undefined : 'Has an application being decided or a current scholarship'}
      aria-label={`Select ${fullName(s)}`}
      onClick={e => e.stopPropagation()}
      onChange={() => togglePick(s.studentNumber)}
    />
  );

  const open = (s: StudentRow) => { if (s.applications > 0) onOpenScholar(s.studentNumber); };
  const program = (s: StudentRow) => s.course || s.programCode || '';
  const statusOf = (s: StudentRow) => s.applications > 0
    ? <Badge tone="success">{s.applications} application{s.applications === 1 ? '' : 's'}</Badge>
    : <Badge tone="warning">Not applied yet</Badge>;

  return (
    <>
      <PageHeader title="Students" description="Everyone who has set up an AniSkolar profile, and whether they've applied." />

      <KpiGrid columns={3}>
        <KpiCard label="Signed up" value={counts.all} icon={Users} loading={!rows && loading} active={show === 'all'} onClick={() => setShow('all')} />
        <KpiCard label="Applied" value={counts.applied} icon={UserCheck} tone="success" loading={!rows && loading} active={show === 'applied'} onClick={() => setShow('applied')} />
        <KpiCard label="Not applied yet" value={counts.notApplied} icon={UserRound} tone={counts.notApplied ? 'warning' : 'neutral'} loading={!rows && loading} active={show === 'not-applied'} onClick={() => setShow('not-applied')} />
      </KpiGrid>

      <Card
        flush
        headerSlot={
          <Toolbar>
            <SearchInput value={search} onChange={setSearch} label="Search students" placeholder="Search name, student no., email or program…" className="min-w-56 flex-1" />
            <Select value={college} onChange={setCollege} label="College" className="w-full sm:w-56">
              <option value="">All colleges</option>
              {Object.entries(COLLEGES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </Select>
            <Select value={outcome} onChange={v => setOutcome(v as Outcome)} label="Status" className="w-full sm:w-48">
              {OUTCOMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Toolbar>
        }
      >
        {!rows && loading ? (
          <TableSkeleton label="Loading students" />
        ) : !rows && error ? (
          <ErrorState title="Couldn't load students" message={error} onRetry={load} retrying={loading} />
        ) : filtered.length === 0 ? (
          filtersActive
            ? <EmptyState icon={Users} title="No students match" action={<Button onClick={() => { setSearch(''); setCollege(''); }}>Clear filters</Button>} />
            : <EmptyState icon={Users} title={show === 'not-applied' ? 'Everyone who signed up has applied' : show === 'applied' ? 'No one has applied yet' : 'No students yet'} />
        ) : (
          <>
            {skipped.length > 0 && (
              <div className="px-4 pt-4">
                <Alert tone="warning" title={`${skipped.length} student${skipped.length === 1 ? ' wasn’t' : 's weren’t'} deleted`} onDismiss={() => setSkipped([])}>
                  <ul className="list-disc pl-5">{skipped.map(k => <li key={k.studentNumber}>{nameOf(k.studentNumber)}: {k.reason}</li>)}</ul>
                </Alert>
              </div>
            )}
            {picked.size > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-muted px-4 py-2.5">
                <p className="text-sm text-ink">{picked.size} selected</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>Clear</Button>
                  <Button size="sm" variant="danger" icon={Trash2} onClick={() => { setDeleteError(''); setConfirmDelete(true); }}>Delete</Button>
                </div>
              </div>
            )}
            <div className="hidden xl:block">
              <Table label="Students" minWidth="56rem">
                <thead>
                  <tr>
                    <Th sticky={false} className="w-10">
                      <input type="checkbox" className="size-4 rounded accent-accent disabled:opacity-30" checked={allPagePicked} disabled={!pageSelectable.length} onChange={togglePage} aria-label="Select the students on this page" />
                    </Th>
                    <Th sticky={false}>Student</Th>
                    <Th sticky={false} className="w-24">College</Th>
                    <Th sticky={false} className="w-56">Program</Th>
                    <Th sticky={false} className="w-28">Year</Th>
                    <Th sticky={false} className="w-36">Signed up</Th>
                    <Th sticky={false} className="w-44">Applications</Th>
                    <Th sticky={false} className="w-20"><span className="sr-only">Actions</span></Th>
                  </tr>
                </thead>
                <tbody>
                  {pager.pageItems.map(s => (
                    <Tr key={s.studentNumber} onClick={s.applications > 0 ? () => open(s) : undefined}>
                      <Td>{pickBox(s)}</Td>
                      <Td>
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar name={fullName(s)} avatarUrl={s.avatarUrl ?? undefined} size="sm" />
                          <div className="min-w-0">
                            {s.applications > 0
                              ? <RowLink onClick={() => open(s)}>{fullName(s)}</RowLink>
                              : <p className="truncate text-sm font-medium text-ink">{fullName(s)}</p>}
                            <p className="truncate text-xs text-ink-subtle tabular-nums">{[s.studentNumber, s.email].filter(Boolean).join(' · ')}</p>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        {s.college ? (
                          <Tooltip content={collegeName(s.college)} asChild>
                            <span tabIndex={0} className="rounded-badge font-medium text-ink">{s.college}</span>
                          </Tooltip>
                        ) : <span className="text-ink-subtle">—</span>}
                      </Td>
                      <Td><Truncate>{program(s) || '—'}</Truncate></Td>
                      <Td>{s.yearLevel || <span className="text-ink-subtle">—</span>}</Td>
                      <Td><span className="tabular-nums">{s.joinedAt ? formatDate(s.joinedAt) : '—'}</span></Td>
                      <Td>{statusOf(s)}</Td>
                      <Td>
                        <div className="flex items-center justify-end gap-1">
                          {onMessageStudent && (
                            <IconButton icon={MessageSquare} label={`Message ${fullName(s)}`} onClick={e => { e.stopPropagation(); onMessageStudent(s.studentNumber); }} />
                          )}
                          {/* The arrow's space is kept on every row (shown only
                              when there's a record to open), so the message
                              icons line up in one column. */}
                          <ChevronRight className={`size-4 text-ink-subtle ${s.applications > 0 ? '' : 'invisible'}`} aria-hidden />
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <MobileList>
              {pager.pageItems.map(s => (
                <li key={s.studentNumber} className="flex items-center gap-3 px-4 py-3">
                  {pickBox(s)}
                  <Avatar name={fullName(s)} avatarUrl={s.avatarUrl ?? undefined} size="sm" />
                  <span className="min-w-0 flex-1">
                    {s.applications > 0
                      ? <button type="button" onClick={() => open(s)} className="block max-w-full truncate text-left text-sm font-medium text-ink hover:underline">{fullName(s)}</button>
                      : <span className="block truncate text-sm font-medium text-ink">{fullName(s)}</span>}
                    <span className="block truncate text-xs text-ink-subtle">{[s.studentNumber, s.college, s.yearLevel].filter(Boolean).join(' · ')}</span>
                  </span>
                  {statusOf(s)}
                  {onMessageStudent && <IconButton icon={MessageSquare} label={`Message ${fullName(s)}`} onClick={() => onMessageStudent(s.studentNumber)} />}
                </li>
              ))}
            </MobileList>
            <Pagination page={pager.page} pageCount={pager.pageCount} total={pager.total} pageSize={pager.pageSize} onChange={pager.setPage} noun="students" />
          </>
        )}
      </Card>

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${picked.size} student${picked.size === 1 ? '' : 's'}?`}
          confirmLabel="Delete"
          confirmIcon={Trash2}
          tone="danger"
          busy={deleting}
          error={deleteError}
          onConfirm={deletePicked}
          onCancel={() => { if (!deleting) setConfirmDelete(false); }}
        >
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">
            <li>Their profile, applications, renewals, duty logs and messages move to the Trash.</li>
            <li>You can restore them from the Trash for 30 days. After that they and their uploaded files are deleted for good.</li>
            <li>Anyone with an application being decided or a current scholarship is skipped.</li>
            <li>If they sign in again later, they start a new profile.</li>
          </ul>
          {picked.size <= 8 && <p className="mt-3 text-sm text-ink">{[...picked].map(nameOf).join(', ')}</p>}
        </ConfirmDialog>
      )}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}
