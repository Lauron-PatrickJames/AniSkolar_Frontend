import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck, CalendarClock, CheckCircle2, ChevronDown, CircleAlert, CircleDashed, Download, ExternalLink, FileText, Lock, LockOpen, Mail, Pencil, Plus, RefreshCw, Users, X, XCircle
} from 'lucide-react';
import { mockScholarships, acceptsOnlineApplications, applyScholarshipOverrides } from '../../data/scholarships';
import { retentionMinGpa } from '../../utils/eligibility';
import {
  DEFAULT_RENEWAL_REQUIREMENTS, EVALUATION_ITEMS, PASSING_AVERAGE, RATING_LABELS, RENEWAL_DECISIONS, RENEWAL_TERMS, Renewal,
  RenewalDecision, RenewalPeriod, RenewalStatus, RenewalTerm, academicYearLabel, currentAcademicYear, formatGpa, meetsGpa,
  deadlineLabel, isIsoDate, periodLabel, ratingLabel
} from '../../utils/renewals';
import { downloadZip, openDocument } from '../../utils/documents';
import { API_BASE_URL, authHeaders, formatDate, formatDateTime, officeName, titleCaseName } from './adminData';
import { ResultDialog,
  Alert, Avatar, Badge, Button, Card, Checkbox, ConfirmDialog, DatePicker, DetailField, DropdownMenu, EmptyState, ErrorState, Field,
  MobileList, Modal, PageHeader, SearchInput, SegmentedControl, Select, Table, TableSkeleton, Tabs, Td, TextInput, Textarea, Th, Toast, Tone, Tooltip, Tr
} from './AdminUI';
import { QuickReplies, UnfilledHint, firstNameOf, unfilledParts } from './ReplyTemplates';

// Renewals: the AdSO opens a renewal period per scholarship and term;
// scholars holding the scholarship submit their grades (or say they're not
// continuing); the office enters the department head's evaluation where
// the period needs one, then decides. Office admins (POLCA / Alumni) see
// their own scholarships' periods; only the AdSO opens or edits periods.

interface ScholarRow {
  studentNumber: string;
  name: string;
  email: string;
  program: string;
  yearLevel: string;
  avatarUrl?: string;
  holder: { referenceCode?: string; renewedFrom?: string } | null;
  renewal: Renewal | null;
  // The office they rendered duty in during the term being evaluated
  // (Duty hours); its head evaluates them.
  dutyOffice?: string | null;
  // Pre-check of a submitted renewal (backend utils/renewalCheck.js).
  check?: RenewalCheck | null;
}

// What the office checks by hand before renewing: GPA, failing grade,
// documents, duty hours (SFAG) and the evaluation. The worst item decides.
type CheckStatus = 'pass' | 'fail' | 'review' | 'waiting';
type CheckResult = 'eligible' | 'waiting' | 'review' | 'not_eligible';
interface RenewalCheck { result: CheckResult; items: { key: string; label: string; status: CheckStatus; detail: string }[] }
const CHECK_META: Record<CheckResult, { label: string; tone: Tone }> = {
  eligible: { label: 'Eligible', tone: 'success' },
  waiting: { label: 'Waiting', tone: 'neutral' },
  review: { label: 'Needs review', tone: 'warning' },
  not_eligible: { label: 'Not eligible', tone: 'danger' },
};
const ITEM_META: Record<CheckStatus, { icon: React.ElementType; className: string }> = {
  pass: { icon: CheckCircle2, className: 'text-success-fg' },
  fail: { icon: XCircle, className: 'text-danger' },
  review: { icon: CircleAlert, className: 'text-warning-fg' },
  waiting: { icon: CircleDashed, className: 'text-ink-subtle' },
};

function CheckList({ check }: { check: RenewalCheck }) {
  return (
    <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      {check.items.map(item => {
        const { icon: Icon, className } = ITEM_META[item.status];
        return (
          <li key={item.key} className="flex items-start gap-2 text-sm">
            <Icon className={`mt-0.5 size-4 shrink-0 ${className}`} aria-hidden />
            <span className="min-w-0"><span className="font-medium text-ink">{item.label}:</span> <span className="text-ink-muted">{item.detail}</span></span>
          </li>
        );
      })}
    </ul>
  );
}

function CheckBadge({ check }: { check: RenewalCheck | null | undefined }) {
  if (!check) return <span className="text-ink-subtle">—</span>;
  const meta = CHECK_META[check.result];
  const notes = check.items.filter(i => i.status !== 'pass');
  return (
    <Tooltip content={notes.length ? notes.map(i => `${i.label}: ${i.detail}`).join(' · ') : 'Passes every check'}>
      <Badge tone={meta.tone}>{meta.label}</Badge>
    </Tooltip>
  );
}

type RowState = RenewalStatus | 'Not submitted';
type Filter = 'All' | RowState;

const STATE_TONE: Record<RowState, Tone> = {
  'Not submitted': 'neutral',
  'Under Evaluation': 'info',
  'Needs Revision': 'warning',
  Renewed: 'success',
  'Not Renewed': 'danger',
  'Not Continuing': 'neutral',
};

const rowState = (row: ScholarRow): RowState => row.renewal?.status ?? 'Not submitted';

// Read at render, so scholarships the AdSO created are included.
// POLCA has no renewals: its scholars keep it until they graduate.
// The signed-in office's scholarships that renew (each office runs its own).
let renewalOffice = 'LSO';
const renewableScholarships = () => mockScholarships.filter(s => acceptsOnlineApplications(s) && !s.noRenewal && (s.office ?? 'LSO') === renewalOffice);

export default function RenewalsPage({ getToken, isAdso, ownOffice = 'LSO' }: { getToken: () => Promise<string | null>; isAdso: boolean; ownOffice?: string }) {
  renewalOffice = ownOffice;
  const [periods, setPeriods] = useState<RenewalPeriod[]>([]);
  const [periodsLoading, setPeriodsLoading] = useState(true);
  const [periodsError, setPeriodsError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [rows, setRows] = useState<ScholarRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState('');

  const [filter, setFilter] = useState<Filter>('All');
  const [search, setSearch] = useState('');
  const [editingPeriod, setEditingPeriod] = useState<RenewalPeriod | 'new' | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  // The term the renewal looks back on (for the duty office column).
  const [dutyTerm, setDutyTerm] = useState<{ academicYear: number; term: string } | null>(null);
  const showDutyOffice = rows.some(r => r.dutyOffice);
  const [toast, setToast] = useState<string | null>(null);
  // Not a confirmation: a passing note while a download is prepared.
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState('');
  // Under evaluation and passing every check: can be renewed together.
  const eligibleRows = useMemo(() => rows.filter(r => r.renewal?.status === 'Under Evaluation' && r.check?.result === 'eligible'), [rows]);

  // Reminds the heads of offices with scholars to evaluate (one email).
  const notifyOfficeHeads = async () => {
    if (!selectedId) return;
    setActionError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/renewals/admin/periods/${selectedId}/notify-offices`, { method: 'POST', headers: await authHeaders(getToken) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to email the office heads.');
      setToast(body.emailed ? `Emailed ${body.emailed} office head${body.emailed === 1 ? '' : 's'}.` : 'No office heads to email — list them in Duty hours → Offices.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to email the office heads.');
    }
  };

  const loadPeriods = useCallback(async (select?: string) => {
    setPeriodsLoading(true);
    setPeriodsError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/renewals/admin/periods`, { headers: await authHeaders(getToken) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to load renewal periods.');
      const list: RenewalPeriod[] = body.periods ?? [];
      setPeriods(list);
      setSelectedId(prev => select ?? (prev && list.some(p => p._id === prev) ? prev : (list.find(p => p.open) ?? list[0])?._id ?? null));
    } catch (err) {
      setPeriodsError(err instanceof Error ? err.message : 'Failed to load renewal periods.');
    } finally {
      setPeriodsLoading(false);
    }
  }, [getToken]);

  useEffect(() => { loadPeriods(); }, [loadPeriods]);

  const loadRows = useCallback(async () => {
    if (!selectedId) { setRows([]); return; }
    setRowsLoading(true);
    setRowsError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/renewals/admin/periods/${selectedId}/scholars`, { headers: await authHeaders(getToken) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to load scholars.');
      setRows(body.scholars ?? []);
      setDutyTerm(body.dutyTerm ?? null);
    } catch (err) {
      setRowsError(err instanceof Error ? err.message : 'Failed to load scholars.');
    } finally {
      setRowsLoading(false);
    }
  }, [selectedId, getToken]);

  useEffect(() => { setFilter('All'); setSearch(''); loadRows(); }, [loadRows]);

  const period = periods.find(p => p._id === selectedId) ?? null;

  const renewEligible = async () => {
    if (!selectedId) return;
    setBulkBusy(true);
    setBulkError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/renewals/admin/periods/${selectedId}/renew-eligible`, {
        method: 'POST', headers: await authHeaders(getToken, true), body: JSON.stringify({ renewalIds: eligibleRows.map(r => r.renewal!._id) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to renew.');
      setBulkOpen(false);
      setToast(`Renewed ${body.renewed} scholar${body.renewed === 1 ? '' : 's'}.${body.skipped ? ` ${body.skipped} skipped: their check or status changed; open them to decide.` : ''}`);
      loadRows();
      loadPeriods(selectedId);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'Failed to renew.');
    } finally {
      setBulkBusy(false);
    }
  };

  const counts = useMemo(() => {
    const c: Record<RowState, number> = { 'Not submitted': 0, 'Under Evaluation': 0, 'Needs Revision': 0, Renewed: 0, 'Not Renewed': 0, 'Not Continuing': 0 };
    rows.forEach(r => { c[rowState(r)]++; });
    return c;
  }, [rows]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter(r => filter === 'All' || rowState(r) === filter)
      .filter(r => !q || r.name.toLowerCase().includes(q) || r.studentNumber.includes(q) || r.program.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, filter, search]);

  const setOpen = async (open: boolean) => {
    if (!period) return;
    setActionError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/renewals/admin/periods/${period._id}`, {
        method: 'PATCH', headers: await authHeaders(getToken, true), body: JSON.stringify({ open }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to update the period.');
      setToast(open ? 'Renewal period reopened.' : 'Renewal period closed. Scholars asked to revise can still resubmit.');
      loadPeriods(period._id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update the period.');
    }
  };

  const exportCsv = () => {
    if (!period) return;
    const header = ['Student number', 'Name', 'Email', 'Program', 'Year level', 'Status', 'Continuing', 'Reason not continuing', 'GPA', 'Meets GPA', 'Failing grade', 'Evaluation average', 'Documents', 'Submitted', 'Decided', 'Message to scholar'];
    const lines = rows.map(r => {
      const x = r.renewal;
      const meets = meetsGpa(x?.gpa, period.minGpa);
      return [
        r.studentNumber, titleCaseName(r.name), r.email, r.program, r.yearLevel, rowState(r),
        x ? (x.continuing ? 'Yes' : 'No') : '', x?.notContinuingReason ?? '',
        x?.gpa !== undefined ? formatGpa(x.gpa) : '', meets === null ? '' : meets ? 'Yes' : 'No',
        x?.continuing ? (x.hasFailingGrade ? 'Yes' : 'No') : '',
        x?.evaluation?.average !== undefined ? x.evaluation.average.toFixed(2) : '',
        x ? `${x.documents.length}/${period.requirements.length}` : '',
        x ? formatDate(x.createdAt) : '', x?.reviewedAt ? formatDate(x.reviewedAt) : '', x?.reviewNote ?? '',
      ];
    });
    const csv = [header, ...lines].map(cells => cells.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `renewals-${period.scholarshipId}-${period.academicYear}-${period.term.replace(/\s+/g, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedRow = openRow ? rows.find(r => r.studentNumber === openRow) ?? null : null;
  const firstLoad = periodsLoading && periods.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Renewals"
        actions={
          <>
            {period && (
              <DropdownMenu
                label="More actions"
                items={[
                  { key: 'export', label: 'Export to CSV', icon: Download, onSelect: exportCsv },
                  {
                    key: 'files', label: 'Download all documents (.zip)', icon: FileText,
                    onSelect: () => {
                      setActionError('');
                      setNotice('Preparing the download…');
                      downloadZip(`renewal-period/${period._id}`, getToken).catch(err => setActionError(err instanceof Error ? err.message : "Couldn't prepare the download."));
                    },
                  },
                  { key: 'edit', label: 'Edit period', icon: Pencil, onSelect: () => setEditingPeriod(period) },
                  period.open
                    ? { key: 'close', label: 'Close period', icon: Lock, onSelect: () => setOpen(false) }
                    : { key: 'open', label: 'Reopen period', icon: LockOpen, onSelect: () => setOpen(true) },
                  ...(isAdso && period.open && period.requiresEvaluation
                    ? [{ key: 'notify', label: 'Email office heads to evaluate', icon: Mail, onSelect: notifyOfficeHeads }]
                    : []),
                ]}
              />
            )}
            <Button variant="primary" icon={Plus} onClick={() => setEditingPeriod('new')}>Open renewal period</Button>
          </>
        }
      />

      {actionError && <Alert tone="danger" onDismiss={() => setActionError('')}>{actionError}</Alert>}

      {firstLoad ? (
        <Card flush><TableSkeleton rows={6} label="Loading renewal periods" /></Card>
      ) : periodsError && periods.length === 0 ? (
        <Card flush><ErrorState title="Couldn't load renewals" message={periodsError} onRetry={() => loadPeriods()} retrying={periodsLoading} /></Card>
      ) : periods.length === 0 ? (
        <Card flush>
          <EmptyState
            icon={RefreshCw}
            title="No renewal periods yet"
           
            action={<Button variant="primary" icon={Plus} onClick={() => setEditingPeriod('new')}>Open renewal period</Button>}
          />
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={selectedId ?? ''} onChange={setSelectedId} label="Renewal period" className="w-full sm:w-96">
              {periods.map(p => (
                <option key={p._id} value={p._id}>{p.scholarshipName} · {periodLabel(p)}{p.open ? '' : ' (closed)'}</option>
              ))}
            </Select>
            {period && <PeriodSummary period={period} />}
          </div>

          {eligibleRows.length > 0 && (
            <Alert
              tone="success"
              icon={BadgeCheck}
              title={`${eligibleRows.length} renewal${eligibleRows.length === 1 ? ' passes' : 's pass'} every check`}
              action={<Button size="sm" variant="primary" onClick={() => setBulkOpen(true)}>Renew {eligibleRows.length}</Button>}
            >
              GPA, no failing grade, documents{period?.scholarshipId === 's1' ? ', duty hours' : ''}{period?.requiresEvaluation ? ', evaluation 4+' : ''}.
            </Alert>
          )}

          <Card
            flush
            headerSlot={
              <>
                <Tabs<Filter>
                  label="Filter by status"
                  value={filter}
                  onChange={setFilter}
                  tabs={(['All', 'Not submitted', 'Under Evaluation', 'Needs Revision', 'Renewed', 'Not Renewed', 'Not Continuing'] as Filter[])
                    .filter(k => k === 'All' || k === 'Not submitted' || k === 'Under Evaluation' || k === 'Renewed' || (counts[k as RowState] ?? 0) > 0)
                    .map(k => ({
                      key: k,
                      label: k === 'All' ? 'All scholars' : k === 'Under Evaluation' ? 'To review' : k,
                      count: rowsLoading && rows.length === 0 ? undefined : k === 'All' ? rows.length : counts[k as RowState],
                    }))}
                />
                <div className="border-b border-line p-4">
                  <SearchInput value={search} onChange={setSearch} label="Search scholars" placeholder="Search name, student number or program…" className="lg:w-80" />
                </div>
              </>
            }
          >
            {rowsError ? (
              <ErrorState title="Couldn't load scholars" message={rowsError} onRetry={loadRows} retrying={rowsLoading} />
            ) : rowsLoading && rows.length === 0 ? (
              <TableSkeleton rows={6} label="Loading scholars" />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No scholars hold this scholarship for the term"
               
              />
            ) : visibleRows.length === 0 ? (
              <EmptyState title="No scholars match" />
            ) : period && (
              <>
                <div className="hidden xl:block">
                  <Table label="Scholars and their renewals" minWidth="56rem">
                    <thead>
                      <tr>
                        <Th sticky={false}>Scholar</Th>
                        <Th sticky={false} className="w-36">Program</Th>
                        {showDutyOffice && <Th sticky={false} className="w-44">Duty office{dutyTerm ? ` (${dutyTerm.term.replace(' Semester', ' sem')})` : ''}</Th>}
                        <Th sticky={false} numeric className="w-24">GPA</Th>
                        {period.requiresEvaluation && <Th sticky={false} numeric className="w-32">Evaluation</Th>}
                        <Th sticky={false} numeric className="w-24">Documents</Th>
                        <Th sticky={false} className="w-32">Check</Th>
                        <Th sticky={false} className="w-40">Status</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map(row => (
                        <Tr key={row.studentNumber} onClick={row.renewal ? () => setOpenRow(row.studentNumber) : undefined}>
                          <Td>
                            <div className="flex min-w-0 items-center gap-3">
                              <Avatar name={row.name || row.studentNumber} avatarUrl={row.avatarUrl} size="sm" />
                              <div className="min-w-0">
                                <span className="block truncate font-medium text-ink">{row.name ? titleCaseName(row.name) : 'Unknown student'}</span>
                                <span className="block truncate text-xs text-ink-subtle">{row.studentNumber}</span>
                              </div>
                            </div>
                          </Td>
                          <Td><span className="block truncate" title={row.program}>{row.program || '—'}</span></Td>
                          {showDutyOffice && <Td><span className="block truncate" title={row.dutyOffice ?? ''}>{row.dutyOffice || '—'}</span></Td>}
                          <Td numeric><GpaCell renewal={row.renewal} minGpa={period.minGpa} /></Td>
                          {period.requiresEvaluation && <Td numeric><EvaluationCell renewal={row.renewal} /></Td>}
                          <Td numeric>{row.renewal?.continuing ? `${row.renewal.documents.length}/${period.requirements.length}` : '—'}</Td>
                          <Td><CheckBadge check={row.check} /></Td>
                          <Td><Badge tone={STATE_TONE[rowState(row)]} dot>{rowState(row) === 'Under Evaluation' ? 'To review' : rowState(row)}</Badge></Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
                <MobileList>
                  {visibleRows.map(row => (
                    <li key={row.studentNumber}>
                      <button
                        type="button"
                        disabled={!row.renewal}
                        onClick={() => setOpenRow(row.studentNumber)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left disabled:cursor-default enabled:hover:bg-surface-muted"
                      >
                        <Avatar name={row.name || row.studentNumber} avatarUrl={row.avatarUrl} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">{row.name ? titleCaseName(row.name) : 'Unknown student'}</span>
                          <span className="block truncate text-xs text-ink-subtle">{row.studentNumber} · GPA {formatGpa(row.renewal?.gpa)}{row.check ? ` · ${CHECK_META[row.check.result].label}` : ''}</span>
                        </span>
                        <Badge tone={STATE_TONE[rowState(row)]} dot>{rowState(row) === 'Under Evaluation' ? 'To review' : rowState(row)}</Badge>
                      </button>
                    </li>
                  ))}
                </MobileList>
              </>
            )}
          </Card>
        </>
      )}

      {editingPeriod && (
        <PeriodModal
          key={editingPeriod === 'new' ? 'new' : editingPeriod._id}
          getToken={getToken}
          period={editingPeriod === 'new' ? null : editingPeriod}
          existing={periods}
          onEditExisting={p => setEditingPeriod(p)}
          onClose={() => setEditingPeriod(null)}
          onSaved={saved => {
            setEditingPeriod(null);
            setToast(editingPeriod === 'new' ? `Opened renewal for ${saved.scholarshipName}, ${periodLabel(saved)}.` : 'Renewal period saved.');
            loadPeriods(saved._id);
          }}
        />
      )}

      {selectedRow?.renewal && period && (
        <RenewalModal
          key={selectedRow.renewal._id}
          row={selectedRow}
          period={period}
          getToken={getToken}
          onClose={() => setOpenRow(null)}
          onUpdated={updated => {
            setRows(prev => prev.map(r => (r.studentNumber === updated.studentNumber ? { ...r, renewal: updated } : r)));
            loadPeriods(period._id);
          }}
        />
      )}

      {bulkOpen && period && (
        <ConfirmDialog
          title={`Renew ${eligibleRows.length} scholar${eligibleRows.length === 1 ? '' : 's'}?`}
          description={`${period.scholarshipName}, ${periodLabel(period)}`}
          confirmLabel={`Renew ${eligibleRows.length}`}
          confirmIcon={CheckCircle2}
          onConfirm={renewEligible}
          onCancel={() => { setBulkOpen(false); setBulkError(''); }}
          busy={bulkBusy}
          error={bulkError}
        >
          <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-control text-sm ring-1 ring-line">
            {eligibleRows.map(r => (
              <li key={r.studentNumber} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate text-ink">{r.name ? titleCaseName(r.name) : r.studentNumber}</span>
                <span className="shrink-0 text-xs text-ink-subtle">GPA {formatGpa(r.renewal?.gpa)}</span>
              </li>
            ))}
          </ul>
        </ConfirmDialog>
      )}

      {toast && <ResultDialog message={toast} onClose={() => setToast(null)} />}
      {notice && <Toast message={notice} onClose={() => setNotice(null)} />}
    </div>
  );
}

function PeriodSummary({ period }: { period: RenewalPeriod }) {
  const parts = [
    period.open ? null : 'Closed',
    period.deadline ? `Deadline ${deadlineLabel(period.deadline)}` : null,
    period.minGpa !== undefined && period.minGpa !== null ? `Min. GPA ${formatGpa(period.minGpa)}` : null,
    period.requiresEvaluation ? 'Head evaluation required' : null,
    `${officeName(period.office)}`,
  ].filter(Boolean);
  return (
    <span className="flex flex-wrap items-center gap-2 text-xs text-ink-subtle">
      <Badge tone={period.open ? 'success' : 'neutral'} dot>{period.open ? 'Open' : 'Closed'}</Badge>
      {parts.slice(period.open ? 0 : 1).join(' · ')}
    </span>
  );
}

function GpaCell({ renewal, minGpa }: { renewal: Renewal | null; minGpa?: number }) {
  if (!renewal?.continuing || renewal.gpa === undefined) return <span className="text-ink-subtle">—</span>;
  const meets = meetsGpa(renewal.gpa, minGpa);
  const flagged = meets === false || renewal.hasFailingGrade;
  return (
    <span className={flagged ? 'font-medium text-danger-fg' : 'text-ink'} title={renewal.hasFailingGrade ? 'Reported a failing grade' : meets === false ? `Below the minimum of ${formatGpa(minGpa)}` : undefined}>
      {formatGpa(renewal.gpa)}{renewal.hasFailingGrade ? ' · F' : ''}
    </span>
  );
}

function EvaluationCell({ renewal }: { renewal: Renewal | null }) {
  if (!renewal?.continuing) return <span className="text-ink-subtle">—</span>;
  const avg = renewal.evaluation?.average;
  if (avg === undefined) return <span className="text-ink-subtle">Not entered</span>;
  return <Badge tone={avg >= PASSING_AVERAGE ? 'success' : 'warning'}>{avg.toFixed(2)}{avg < PASSING_AVERAGE ? ' · interview' : ''}</Badge>;
}

// --- Period ------------------------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, '0');
const isoLocal = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return isoLocal(d); };
const endOfMonth = () => { const d = new Date(); return isoLocal(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
// Whole days from today to a YYYY-MM-DD date (negative when past).
const daysUntil = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const today = new Date();
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86_400_000);
};
const daysLabel = (n: number) => (n < 0 ? `${-n} day${n === -1 ? '' : 's'} ago` : n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);

// A labelled on/off switch row.
function SwitchRow({ checked, onChange, disabled, title, description }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; title: string; description?: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <label htmlFor={id} className={`flex items-center gap-3 rounded-control px-3.5 py-3 ring-1 transition-colors ${checked ? 'bg-accent-subtle/40 ring-accent/40' : 'bg-surface ring-line'} ${disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{title}</span>
        {description && <span className="mt-0.5 block text-xs leading-relaxed text-ink-subtle">{description}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} className="peer sr-only" />
        <span aria-hidden className="h-5 w-9 rounded-full bg-line-strong transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2" />
        <span aria-hidden className="absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

function PeriodModal({ getToken, period, existing = [], onEditExisting, onClose, onSaved }: {
  getToken: () => Promise<string | null>;
  period: RenewalPeriod | null;
  // Periods already set up, to catch opening the same one twice.
  existing?: RenewalPeriod[];
  onEditExisting?: (period: RenewalPeriod) => void;
  onClose: () => void;
  onSaved: (period: RenewalPeriod) => void;
}) {
  const isNew = !period;
  const ay = currentAcademicYear();
  const [scholarshipId, setScholarshipId] = useState(period?.scholarshipId ?? renewableScholarships()[0]?.id ?? '');
  const [academicYear, setAcademicYear] = useState(String(period?.academicYear ?? ay));
  const [term, setTerm] = useState<RenewalTerm>(period?.term ?? '2nd Semester');
  // Older periods have a typed deadline: pick it again.
  const [deadline, setDeadline] = useState(isIsoDate(period?.deadline) ? period!.deadline! : '');
  const [minGpa, setMinGpa] = useState(period?.minGpa !== undefined && period?.minGpa !== null ? String(period.minGpa) : '');
  const [requiresEvaluation, setRequiresEvaluation] = useState(period?.requiresEvaluation ?? false);
  const [notes, setNotes] = useState(period?.notes ?? '');
  const [open, setOpenState] = useState(period?.open ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // 1st semester: the scholarship's application requirements (as the AdSO
  // set them) are asked again with the grades.
  const [appDocs, setAppDocs] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/scholarships`);
        const body = await res.json().catch(() => ({}));
        const merged = applyScholarshipOverrides(mockScholarships, body.scholarships ?? []);
        if (!cancelled) setAppDocs(merged.find(s => s.id === scholarshipId)?.requirements ?? []);
      } catch {
        if (!cancelled) setAppDocs(mockScholarships.find(s => s.id === scholarshipId)?.requirements ?? []);
      }
    })();
    return () => { cancelled = true; };
  }, [scholarshipId]);
  const firstSem = term === '1st Semester';
  const docs = firstSem ? [...new Set([DEFAULT_RENEWAL_REQUIREMENTS[0], ...appDocs])] : [DEFAULT_RENEWAL_REQUIREMENTS[0]];

  // Suggestions for a new period: the SFAG's renewal uses the head
  // evaluation, and the scholarship's own retention GPA (e.g. 2.50).
  const suggestedMin = retentionMinGpa(mockScholarships.find(s => s.id === scholarshipId) ?? {});
  useEffect(() => {
    if (!isNew) return;
    setRequiresEvaluation(scholarshipId === 's1');
    setMinGpa(suggestedMin !== undefined ? suggestedMin.toFixed(2) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, scholarshipId]);

  const min = minGpa.trim();
  const gpaError = min && (!Number.isFinite(Number(min)) || Number(min) < 0 || Number(min) > 4) ? 'Enter a GPA from 0.00 to 4.00.' : undefined;
  const days = deadline ? daysUntil(deadline) : null;
  const duplicate = isNew ? existing.find(p => p.scholarshipId === scholarshipId && p.academicYear === Number(academicYear) && p.term === term) : undefined;
  const scholarshipLabel = isNew ? mockScholarships.find(s => s.id === scholarshipId)?.name ?? '' : period!.scholarshipName;
  const label = periodLabel({ academicYear: Number(academicYear), term });

  const save = async () => {
    setError('');
    if (gpaError) {
      setError('The minimum GPA must be between 0.00 and 4.00.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        ...(isNew ? { scholarshipId, academicYear: Number(academicYear), term } : {}),
        deadline, notes, open, requiresEvaluation,
        minGpa: min === '' ? null : Number(min),
        requirements: firstSem ? appDocs : [],
      };
      const res = await fetch(`${API_BASE_URL}/api/renewals/admin/periods${isNew ? '' : `/${period!._id}`}`, {
        method: isNew ? 'POST' : 'PATCH', headers: await authHeaders(getToken, true), body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save the renewal period.');
      onSaved(data.period);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the renewal period.');
    } finally {
      setSaving(false);
    }
  };

  const quickPicks: { label: string; value: string }[] = [
    { label: '1 week', value: addDays(7) },
    { label: '2 weeks', value: addDays(14) },
    { label: '30 days', value: addDays(30) },
    { label: 'Month end', value: endOfMonth() },
  ];

  const summary = !open && !isNew
    ? 'Closed: scholars can’t submit.'
    : deadline
      ? `Scholars can submit until ${deadlineLabel(deadline)} (${daysLabel(days!)}).`
      : 'Scholars can submit until you close it.';

  return (
    <Modal
      title={isNew ? 'Open a renewal period' : 'Edit renewal period'}
      description={isNew ? 'Scholars holding the scholarship get a Renew button for this term.' : `${period!.scholarshipName} · ${periodLabel(period!)}`}
      icon={<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent"><RefreshCw className="size-4" aria-hidden /></span>}
      onClose={onClose}
      dismissible={!saving}
      size="lg"
      bodyClassName="p-0"
      footer={
        <>
          <p className="hidden min-w-0 flex-1 items-center gap-2 text-xs text-ink-muted sm:flex">
            <CalendarClock className="size-3.5 shrink-0 text-ink-subtle" aria-hidden />
            <span className="truncate">{summary}</span>
          </p>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" icon={isNew ? LockOpen : undefined} onClick={save} loading={saving} disabled={!!duplicate || !scholarshipId}>
            {isNew ? 'Open renewal period' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="space-y-5 px-5 py-5 sm:px-6">
          {error && <Alert tone="danger">{error}</Alert>}

          {isNew && (
            <>
              <Field label="Scholarship">
                <Select value={scholarshipId} onChange={setScholarshipId} disabled={saving}>
                  {renewableScholarships().map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[13.5rem_minmax(0,1fr)]">
                <Field label="Academic year">
                  <Select value={academicYear} onChange={setAcademicYear} disabled={saving}>
                    {[ay + 1, ay, ay - 1].map(y => <option key={y} value={y}>{academicYearLabel(y)}{y === ay ? ' (current)' : ''}</option>)}
                  </Select>
                </Field>
                <Field label="Term">
                  <SegmentedControl<RenewalTerm> label="Term" options={RENEWAL_TERMS} value={term} onChange={v => v && setTerm(v)} />
                </Field>
              </div>
              {duplicate && (
                <Alert
                  tone="warning"
                  title="This renewal period already exists"
                  action={onEditExisting ? <Button size="sm" icon={Pencil} onClick={() => onEditExisting(duplicate)}>Edit it instead</Button> : undefined}
                >
                  {duplicate.scholarshipName}, {periodLabel(duplicate)} is {duplicate.open ? 'open' : 'closed'}.
                </Alert>
              )}
            </>
          )}

          <div className={`grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_11.5rem] ${isNew ? 'border-t border-line pt-5' : ''}`}>
            <div className="space-y-2">
              <Field
                label="Deadline"
                optional
                helper={period?.deadline && !isIsoDate(period.deadline)
                  ? `Was typed as “${period.deadline}”. Pick it from the calendar.`
                  : days !== null ? (days < 0 ? <span className="text-warning-fg">This date has passed.</span> : `Closes ${daysLabel(days)}.`) : 'Without one, it stays open until you close it.'}
              >
                <DatePicker value={deadline} onChange={setDeadline} disabled={saving} placeholder="Pick the last day" min={isNew ? isoLocal(new Date()) : undefined} />
              </Field>
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Quick deadlines">
                {quickPicks.map(q => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => setDeadline(q.value)}
                    disabled={saving}
                    aria-pressed={deadline === q.value}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      deadline === q.value ? 'bg-accent-subtle text-accent ring-accent' : 'bg-surface text-ink-muted ring-line-strong hover:bg-surface-muted hover:text-ink'}`}
                  >
                    {q.label}
                  </button>
                ))}
                {deadline && (
                  <button type="button" onClick={() => setDeadline('')} disabled={saving} aria-label="Clear the deadline" title="Clear" className="flex size-5 items-center justify-center rounded-full text-ink-subtle hover:bg-neutral-bg hover:text-ink">
                    <X className="size-3.5" aria-hidden />
                  </button>
                )}
              </div>
            </div>
            <Field
              label="Minimum GPA"
              optional
              error={gpaError}
              helper={!gpaError ? (suggestedMin !== undefined ? `Retention GPA: ${suggestedMin.toFixed(2)}` : 'Blank for none') : undefined}
            >
              <TextInput
                type="text"
                inputMode="decimal"
                value={minGpa}
                onChange={e => setMinGpa(e.target.value.replace(/[^\d.]/g, ''))}
                onBlur={() => { const n = Number(min); if (min && Number.isFinite(n) && n >= 0 && n <= 4) setMinGpa(n.toFixed(2)); }}
                placeholder="e.g. 2.50"
                disabled={saving}
              />
            </Field>
          </div>

          <SwitchRow
            checked={requiresEvaluation}
            onChange={setRequiresEvaluation}
            disabled={saving}
            title="Department head’s evaluation"
            description={`Below a ${PASSING_AVERAGE} average means an interview.`}
          />

          <Field label="Note to scholars" optional>
            <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} disabled={saving} maxLength={1000} placeholder="e.g. Upload your TCG from the Online Student Records Portal." />
          </Field>

          {!isNew && (
            <SwitchRow
              checked={open}
              onChange={setOpenState}
              disabled={saving}
              title="Open for submissions"
              description={open ? 'Scholars can submit or update their renewal.' : 'Scholars can’t submit. Turn it on to reopen.'}
            />
          )}
        </div>

        {/* What scholars will see */}
        <aside className="hidden border-l border-line bg-surface-muted px-5 py-5 lg:block">
          <div className="lg:sticky lg:top-5">
          <h3 className="text-sm font-semibold text-ink">What scholars will see</h3>
          <div className="mt-3 overflow-hidden rounded-card bg-surface shadow-card ring-1 ring-line">
            <div className="border-b border-line px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">Renewal {open || isNew ? 'open' : 'closed'}</p>
              <p className="mt-0.5 text-sm font-semibold leading-snug text-ink">{scholarshipLabel || 'Scholarship'}</p>
              <p className="text-xs text-ink-subtle">{isNew ? label : periodLabel(period!)}</p>
            </div>
            <dl className="space-y-3 px-4 py-3 text-xs">
              <div>
                <dt className="text-ink-subtle">Deadline</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {deadline ? <>{deadlineLabel(deadline)} <span className={`font-normal ${days! < 0 ? 'text-warning-fg' : 'text-ink-subtle'}`}>· {daysLabel(days!)}</span></> : 'No deadline'}
                </dd>
              </div>
              <div>
                <dt className="text-ink-subtle">To upload</dt>
                <dd className="mt-1">
                  <ul className="space-y-1">
                    {docs.map(d => (
                      <li key={d} className="flex items-start gap-1.5 text-ink"><FileText className="mt-px size-3.5 shrink-0 text-ink-subtle" aria-hidden />{d}</li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-ink-subtle">{firstSem ? '1st semester: the application papers are asked again.' : '2nd semester: grades only.'}</p>
                </dd>
              </div>
              {(min && !gpaError) || requiresEvaluation ? (
                <div>
                  <dt className="text-ink-subtle">Checked by the office</dt>
                  <dd className="mt-1 space-y-1 text-ink">
                    {min && !gpaError && <p className="flex items-center gap-1.5"><BadgeCheck className="size-3.5 text-ink-subtle" aria-hidden />GPA of at least {Number(min).toFixed(2)}</p>}
                    {requiresEvaluation && <p className="flex items-center gap-1.5"><Users className="size-3.5 text-ink-subtle" aria-hidden />Department head’s evaluation</p>}
                  </dd>
                </div>
              ) : null}
              {notes.trim() && (
                <div>
                  <dt className="text-ink-subtle">Note from the office</dt>
                  <dd className="mt-1 whitespace-pre-line rounded-control bg-surface-muted px-2.5 py-2 text-ink">{notes.trim()}</dd>
                </div>
              )}
            </dl>
          </div>
          </div>
        </aside>
      </div>
    </Modal>
  );
}

// --- One scholar's renewal ------------------------------------------------------------

function RenewalModal({ row, period, getToken, onClose, onUpdated }: {
  row: ScholarRow;
  period: RenewalPeriod;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onUpdated: (renewal: Renewal) => void;
}) {
  const renewal = row.renewal!;
  const [editingEvaluation, setEditingEvaluation] = useState(false);
  const meets = meetsGpa(renewal.gpa, period.minGpa);
  const name = row.name ? titleCaseName(row.name) : row.studentNumber;

  return (
    <Modal
      size="xl"
      title={name}
      description={`${row.studentNumber} · ${renewal.scholarshipName} · ${periodLabel(period)}`}
      icon={<Avatar name={row.name || row.studentNumber} avatarUrl={row.avatarUrl} />}
      onClose={onClose}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* What the decision rests on */}
        <div className="min-w-0 space-y-4">
          {!renewal.continuing ? (
            <Alert tone="neutral" title={`Not continuing · ${renewal.notContinuingReason ?? ''}`}>{renewal.notContinuingDetails || 'The scholar told the office they are not continuing.'}</Alert>
          ) : row.check ? (
            <ModalSection
              title="Renewal check"
              aside={<>
                <span className="text-xs text-ink-subtle tabular-nums">{row.check.items.filter(i => i.status === 'pass').length} of {row.check.items.length} pass</span>
                <Badge tone={CHECK_META[row.check.result].tone} dot>{CHECK_META[row.check.result].label}</Badge>
              </>}
            >
              <CheckList check={row.check} />
            </ModalSection>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <GlanceTile
                label={period.minGpa !== undefined && period.minGpa !== null ? `GPA · min. ${formatGpa(period.minGpa)}` : 'GPA'}
                value={formatGpa(renewal.gpa)}
                tone={meets === false ? 'danger' : meets ? 'success' : 'neutral'}
              />
              <GlanceTile label="Failing grade" value={renewal.hasFailingGrade ? 'Yes' : 'None'} tone={renewal.hasFailingGrade ? 'danger' : 'success'} />
            </div>
          )}

          {renewal.continuing && (
            <ModalSection
              title="Documents"
              aside={<span className="text-xs text-ink-subtle tabular-nums">{period.requirements.filter(r => renewal.documents.some(d => d.docType === r)).length} of {period.requirements.length} uploaded</span>}
            >
              <ul className="divide-y divide-line">
                {period.requirements.map(requirement => {
                  const doc = renewal.documents.find(d => d.docType === requirement);
                  return (
                    <li key={requirement} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                      <span className="flex min-w-0 items-center gap-2 text-sm text-ink">
                        <FileText className="size-4 shrink-0 text-ink-subtle" aria-hidden />
                        <span className="truncate">{requirement}</span>
                      </span>
                      {doc
                        ? (
                          <Button size="sm" icon={ExternalLink} onClick={() => openDocument(doc.fileId, getToken).catch(err => window.alert(err instanceof Error ? err.message : "Couldn't open the file."))}>
                            Open
                          </Button>
                        )
                        : <Badge tone="warning">Missing</Badge>}
                    </li>
                  );
                })}
              </ul>
            </ModalSection>
          )}

          {renewal.continuing && (period.requiresEvaluation || renewal.evaluation) && (
            <ModalSection
              title="Office evaluation"
              aside={renewal.evaluation && !editingEvaluation && (
                <Button size="xs" variant="ghost" icon={Pencil} onClick={() => setEditingEvaluation(true)}>Edit</Button>
              )}
            >
              {renewal.evaluation && !editingEvaluation ? (
                <EvaluationSummary renewal={renewal} />
              ) : editingEvaluation || !renewal.evaluation ? (
                <EvaluationForm
                  renewal={renewal}
                  dutyOffice={row.dutyOffice ?? null}
                  getToken={getToken}
                  onCancel={renewal.evaluation ? () => setEditingEvaluation(false) : undefined}
                  onSaved={updated => { setEditingEvaluation(false); onUpdated(updated); }}
                />
              ) : null}
            </ModalSection>
          )}

          {renewal.history.length > 0 && (
            <details className="group rounded-card ring-1 ring-line">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-ink">
                History ({renewal.history.length})
                <ChevronDown className="size-4 text-ink-subtle transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <ol className="space-y-2 border-t border-line px-4 py-3">
                {[...renewal.history].reverse().map((h, i) => (
                  <li key={`${h.changedAt}-${i}`} className="text-sm">
                    <span className="font-medium text-ink">{h.status}</span>
                    <span className="text-ink-subtle"> · {formatDateTime(h.changedAt)} · {h.changedBy === 'student' ? 'Scholar' : h.changedByName || h.changedBy}{h.changedByOffice ? ` (${officeName(h.changedByOffice)})` : ''}</span>
                    {h.note && h.changedBy !== 'student' && <p className="mt-0.5 whitespace-pre-line text-ink-muted">{h.note}</p>}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>

        {/* The decision, in view while reading */}
        <div className="min-w-0 space-y-4 lg:sticky lg:top-0 lg:self-start">
          {renewal.continuing
            ? <DecisionPanel renewal={renewal} period={period} studentName={row.name} check={row.check ?? null} getToken={getToken} onUpdated={onUpdated} />
            : <Badge tone={STATE_TONE[renewal.status]} dot>{renewal.status}</Badge>}
          <dl className="divide-y divide-line rounded-card bg-surface-muted px-4 text-sm">
            {([
              ['Program', row.program || '—'],
              ['Holds it through', row.holder?.renewedFrom ? `Renewed ${row.holder.renewedFrom}` : row.holder?.referenceCode ? row.holder.referenceCode : 'No longer a holder'],
              ['Submitted', formatDateTime(renewal.createdAt)],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3 py-2.5">
                <dt className="shrink-0 text-ink-subtle">{label}</dt>
                <dd className="min-w-0 truncate text-right font-medium text-ink" title={value}>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Modal>
  );
}

// A titled card in the renewal dialog; aside sits at the right of the title.
function ModalSection({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-card bg-surface p-4 ring-1 ring-line">
      <div className="mb-3 flex min-h-6 items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {aside && <div className="flex items-center gap-2">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

function EvaluationSummary({ renewal }: { renewal: Renewal }) {
  const ev = renewal.evaluation!;
  const passing = ev.average >= PASSING_AVERAGE;
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <Alert tone={passing ? 'success' : 'warning'} title={`Average ${ev.average.toFixed(2)} · ${ratingLabel(ev.average)}`}>
        {passing ? 'Meets the Very satisfactory average needed to renew.' : `Below ${PASSING_AVERAGE} (Very satisfactory): interview the scholar before deciding.`}
      </Alert>
      <p className="text-sm text-ink-muted">
        By <span className="font-medium text-ink">{ev.evaluatorName || 'the office head'}</span>{ev.assignedOffice ? `, ${ev.assignedOffice}` : ''}
        {ev.enteredAt ? ` · ${formatDateTime(ev.enteredAt)}` : ''}{ev.source === 'office' ? ' · in the office portal' : ' · entered by the scholarship office'}
      </p>
      {ev.remarks && <DetailField label="Remarks (the scholar sees these too)" value={<span className="whitespace-pre-line font-normal">{ev.remarks}</span>} />}
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
        {open ? 'Hide the ratings' : `Show all ${EVALUATION_ITEMS.length} ratings`}
        <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {EVALUATION_ITEMS.map(item => (
            <div key={item.key} className="flex items-baseline justify-between gap-3 border-b border-line py-1 text-sm">
              <dt className="text-ink-muted">{item.label}</dt>
              <dd className="shrink-0 font-medium text-ink">{ev.scores?.[item.key] ?? '—'}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

// A fact the decision rests on, coloured by whether it's fine.
function GlanceTile({ label, value, tone, note, action }: {
  label: string; value: React.ReactNode; tone: 'success' | 'warning' | 'danger' | 'neutral'; note?: string;
  action?: { label: string; onClick: () => void };
}) {
  const ring = { success: 'ring-success-fg/20 bg-success-bg/40', warning: 'ring-warning-fg/25 bg-warning-bg/50', danger: 'ring-danger-fg/25 bg-danger-bg/50', neutral: 'ring-line bg-surface-muted' }[tone];
  const text = { success: 'text-success-fg', warning: 'text-warning-fg', danger: 'text-danger-fg', neutral: 'text-ink' }[tone];
  return (
    <div className={`rounded-card p-3 ring-1 ${ring}`}>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${text}`}>{value}</p>
      <div className="flex items-center justify-between gap-2">
        {note && <p className="text-xs text-ink-muted">{note}</p>}
        {action && <button type="button" onClick={action.onClick} className="text-xs font-medium text-accent hover:underline">{action.label}</button>}
      </div>
    </div>
  );
}

function EvaluationForm({ renewal, dutyOffice, getToken, onCancel, onSaved }: {
  renewal: Renewal;
  dutyOffice: string | null;
  getToken: () => Promise<string | null>;
  onCancel?: () => void;
  onSaved: (renewal: Renewal) => void;
}) {
  const ev = renewal.evaluation;
  const [scores, setScores] = useState<Record<string, number>>(ev?.scores ?? {});
  const [evaluatorName, setEvaluatorName] = useState(ev?.evaluatorName ?? '');
  // The scholar's duty office (Duty hours) unless one was saved before.
  const [assignedOffice, setAssignedOffice] = useState(ev?.assignedOffice ?? dutyOffice ?? '');
  const [remarks, setRemarks] = useState(ev?.remarks ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const rated = EVALUATION_ITEMS.filter(i => scores[i.key]).length;
  const average = rated === EVALUATION_ITEMS.length
    ? EVALUATION_ITEMS.reduce((sum, i) => sum + scores[i.key], 0) / EVALUATION_ITEMS.length
    : null;

  const save = async () => {
    if (average === null) { setError('Rate every item from 1 to 5.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/renewals/admin/${renewal._id}/evaluation`, {
        method: 'PATCH',
        headers: await authHeaders(getToken, true),
        body: JSON.stringify({ scores, evaluatorName, assignedOffice, remarks }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to save the evaluation.');
      onSaved(body.renewal);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the evaluation.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 rounded-card p-4 ring-1 ring-line">
      <p className="text-xs text-ink-muted">
        Copy the ratings from the head's evaluation form: {Object.entries(RATING_LABELS).reverse().map(([n, l]) => `${n} ${l}`).join(', ')}.
      </p>
      <div className="space-y-2">
        {EVALUATION_ITEMS.map(item => (
          <div key={item.key} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-ink">{item.label}</span>
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Evaluated by" optional><TextInput value={evaluatorName} onChange={e => setEvaluatorName(e.target.value)} disabled={saving} maxLength={200} placeholder="Department head" /></Field>
        <Field label="Evaluating office" optional helper={dutyOffice ? (assignedOffice === dutyOffice ? 'Their duty office, from Duty hours.' : `Duty hours says: ${dutyOffice}`) : 'No duty office in Duty hours for that term.'}>
          <TextInput value={assignedOffice} onChange={e => setAssignedOffice(e.target.value)} disabled={saving} maxLength={200} />
        </Field>
      </div>
      <Field label="Remarks" optional helper="Staff only.">
        <Textarea rows={2} value={remarks} onChange={e => setRemarks(e.target.value)} disabled={saving} maxLength={2000} />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-ink-muted">
          {average === null
            ? `${rated} of ${EVALUATION_ITEMS.length} rated`
            : <>Average <span className={`font-medium ${average >= PASSING_AVERAGE ? 'text-success-fg' : 'text-warning-fg'}`}>{average.toFixed(2)}</span> · {ratingLabel(average)}</>}
        </span>
        <div className="flex gap-2">
          {onCancel && <Button onClick={onCancel} disabled={saving}>Cancel</Button>}
          <Button variant="primary" onClick={save} loading={saving} disabled={average === null}>Save evaluation</Button>
        </div>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}

// The three decisions, said plainly: what each does, and its button.
const DECISION_COPY: Record<RenewalDecision, {
  title: string; hint: (term: string) => string; icon: React.ElementType;
  tone: 'success' | 'warning' | 'danger'; button: (firstName: string) => string; variant: 'primary' | 'secondary' | 'danger';
}> = {
  Renewed: {
    title: 'Renew', icon: CheckCircle2, tone: 'success', variant: 'primary',
    hint: term => `Keeps the scholarship for the ${term}. The scholar sees it on their Renewal page.`,
    button: first => `Renew ${first || 'scholar'}`,
  },
  'Needs Revision': {
    title: 'Send back for revision', icon: RefreshCw, tone: 'warning', variant: 'secondary',
    hint: () => 'They fix what you ask (e.g. an unreadable TCG) and submit again.',
    button: () => 'Send back for revision',
  },
  'Not Renewed': {
    title: 'Don’t renew', icon: XCircle, tone: 'danger', variant: 'danger',
    hint: () => 'The scholarship ends after this semester. Tell them why.',
    button: first => `Don’t renew ${first || 'scholar'}`,
  },
};
const TONE_RING = { success: 'ring-success-fg/40 bg-success-bg/50', warning: 'ring-warning-fg/40 bg-warning-bg/60', danger: 'ring-danger-fg/40 bg-danger-bg/60' };
const TONE_TEXT = { success: 'text-success-fg', warning: 'text-warning-fg', danger: 'text-danger-fg' };

function DecisionPanel({ renewal, period, studentName, check, getToken, onUpdated }: {
  renewal: Renewal;
  period: RenewalPeriod;
  studentName: string;
  check: RenewalCheck | null;
  getToken: () => Promise<string | null>;
  onUpdated: (renewal: Renewal) => void;
}) {
  const decided = renewal.status !== 'Under Evaluation';
  const [changing, setChanging] = useState(false);
  const [decision, setDecision] = useState<RenewalDecision | ''>('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  const first = firstNameOf(studentName);
  const term = periodLabel(period);
  // A scholar's own "Not continuing" can only be sent back to them (the
  // server refuses renewing or refusing it on their behalf).
  const options = RENEWAL_DECISIONS.filter(d => d !== renewal.status && (renewal.status !== 'Not Continuing' || d === 'Needs Revision'));
  const noteRequired = decision === 'Needs Revision' || decision === 'Not Renewed' || (decision !== '' && decided);
  const evaluationMissing = period.requiresEvaluation && !renewal.evaluation;
  // What the renewal check points to.
  const recommended: RenewalDecision | null = check?.result === 'eligible' ? 'Renewed' : check?.result === 'not_eligible' ? 'Not Renewed' : null;

  const save = async () => {
    if (!decision) return;
    if (noteRequired && !note.trim()) {
      setError(decided ? 'Tell the scholar why the decision changed.' : decision === 'Needs Revision' ? 'Tell the scholar what to fix.' : 'Tell the scholar why.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/renewals/admin/${renewal._id}/status`, {
        method: 'PATCH',
        headers: await authHeaders(getToken, true),
        body: JSON.stringify({ status: decision, reviewNote: note.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to save the decision.');
      setResult(decision === 'Renewed' ? `${first || 'The scholar'} keeps the scholarship for the ${term}.`
        : decision === 'Needs Revision' ? `Sent back to ${first || 'the scholar'} with your note. They can submit again.`
          : `${first || 'The scholar'} won’t be renewed. They see your message on their Renewal page.`);
      setDecision('');
      setNote('');
      setChanging(false);
      onUpdated(body.renewal);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the decision.');
    } finally {
      setSaving(false);
    }
  };

  const current = decided ? DECISION_COPY[renewal.status as RenewalDecision] : null;

  return (
    <section className="space-y-3 rounded-card p-4 ring-1 ring-line">
      <h3 className="text-sm font-semibold text-ink">Decision</h3>

      {/* Already decided: say so, and offer to change it. */}
      {current && !changing && (
        <div className={`flex flex-wrap items-start gap-3 rounded-control p-3 ring-1 ${TONE_RING[current.tone]}`}>
          <current.icon className={`mt-0.5 size-5 shrink-0 ${TONE_TEXT[current.tone]}`} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-semibold ${TONE_TEXT[current.tone]}`}>{renewal.status}</p>
            {renewal.reviewNote && <p className="mt-0.5 whitespace-pre-line text-sm text-ink-muted">“{renewal.reviewNote}”</p>}
          </div>
          <Button size="sm" onClick={() => setChanging(true)}>Change decision</Button>
        </div>
      )}

      {(!decided || changing) && (
        <>
          <div role="radiogroup" aria-label="Decision" className="space-y-2">
            {options.map(option => {
              const c = DECISION_COPY[option];
              const disabled = option === 'Renewed' && evaluationMissing;
              const active = decision === option;
              const suggested = recommended === option && !disabled;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={disabled || saving}
                  onClick={() => { setDecision(option); setError(''); }}
                  className={`flex w-full items-start gap-3 rounded-control p-3 text-left ring-1 transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    active ? `${TONE_RING[c.tone]} ring-2` : 'ring-line hover:bg-surface-muted'
                  }`}
                >
                  <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${active ? 'bg-surface' : 'bg-surface-muted'}`}>
                    <c.icon className={`size-4 ${active || suggested ? TONE_TEXT[c.tone] : 'text-ink-subtle'}`} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={`text-sm font-semibold ${active ? TONE_TEXT[c.tone] : 'text-ink'}`}>{c.title}</span>
                      {suggested && <Badge tone={c.tone === 'danger' ? 'danger' : 'success'}>Suggested</Badge>}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-ink-muted">
                      {disabled ? 'Waiting for the office head’s evaluation (enter a paper one on the left if needed).' : c.hint(term)}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={`mt-1.5 flex size-4 shrink-0 items-center justify-center rounded-full ring-2 ${active ? `${TONE_TEXT[c.tone]} ring-current` : 'ring-line'}`}
                  >
                    {active && <span className="size-2 rounded-full bg-current" />}
                  </span>
                </button>
              );
            })}
          </div>
          {check?.result === 'review' && !decision && <p className="text-xs text-warning-fg">The check flagged something to look at (see above) before you decide.</p>}

          {decision && (
            <>
              <QuickReplies
                getToken={getToken}
                context="renewal"
                decision={decision}
                vars={{ firstName: first, scholarship: renewal.scholarshipName, term }}
                value={note}
                onInsert={text => { setNote(text); setError(''); }}
                disabled={saving}
              />
              <Field
                label={decision === 'Needs Revision' ? 'What should they fix?' : decision === 'Not Renewed' ? 'Why not?' : 'Message to the scholar'}
                optional={!noteRequired}
                helper="Shown to the scholar."
              >
                <Textarea rows={3} value={note} onChange={e => { setNote(e.target.value); setError(''); }} disabled={saving} maxLength={2000} />
              </Field>
              <UnfilledHint text={note} />
            </>
          )}
          {error && <Alert tone="danger">{error}</Alert>}
          {decision ? (
            <div className="flex gap-2">
              {changing && <Button onClick={() => { setChanging(false); setDecision(''); setNote(''); setError(''); }} disabled={saving}>Cancel</Button>}
              <Button
                variant={DECISION_COPY[decision].variant}
                icon={DECISION_COPY[decision].icon}
                onClick={save}
                loading={saving}
                className="flex-1 justify-center"
              >
                {DECISION_COPY[decision].button(first)}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-ink-subtle">Pick one above to continue.</p>
              {changing && <Button size="sm" onClick={() => { setChanging(false); setNote(''); setError(''); }}>Cancel</Button>}
            </div>
          )}
        </>
      )}
      {result && <ResultDialog message={result} onClose={() => setResult('')} />}
    </section>
  );
}
