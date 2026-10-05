import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock, CheckCircle2, ClipboardCheck, Download, FileText, Lock, LockOpen, Pencil, Plus, RefreshCw, Users, XCircle
} from 'lucide-react';
import { mockScholarships, acceptsOnlineApplications } from '../../data/scholarships';
import { retentionMinGpa } from '../../utils/eligibility';
import {
  DEFAULT_RENEWAL_REQUIREMENTS, EVALUATION_ITEMS, PASSING_AVERAGE, RATING_LABELS, RENEWAL_DECISIONS, RENEWAL_TERMS, Renewal,
  RenewalDecision, RenewalPeriod, RenewalStatus, RenewalTerm, academicYearLabel, currentAcademicYear, formatGpa, meetsGpa,
  periodLabel, ratingLabel
} from '../../utils/renewals';
import { API_BASE_URL, authHeaders, documentUrl, formatDate, formatDateTime, officeName, titleCaseName } from './adminData';
import {
  Alert, Avatar, Badge, Button, Card, Checkbox, DetailField, DropdownMenu, EmptyState, ErrorState, Field, KpiCard, KpiGrid,
  MobileList, Modal, PageHeader, SearchInput, SegmentedControl, Select, Table, TableSkeleton, Td, TextInput, Textarea, Th, Toast, Tone, Tr
} from './AdminUI';

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

const RENEWABLE_SCHOLARSHIPS = mockScholarships.filter(s => acceptsOnlineApplications(s));

export default function RenewalsPage({ getToken, isAdso }: { getToken: () => Promise<string | null>; isAdso: boolean }) {
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
  const [toast, setToast] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

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
    } catch (err) {
      setRowsError(err instanceof Error ? err.message : 'Failed to load scholars.');
    } finally {
      setRowsLoading(false);
    }
  }, [selectedId, getToken]);

  useEffect(() => { setFilter('All'); setSearch(''); loadRows(); }, [loadRows]);

  const period = periods.find(p => p._id === selectedId) ?? null;

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
        description="Scholars renew each semester: they submit their grades, the office checks them and the department head's evaluation, then decides."
        actions={
          <>
            {period && (
              <DropdownMenu
                label="More actions"
                items={[
                  { key: 'export', label: 'Export to CSV', icon: Download, onSelect: exportCsv },
                  ...(isAdso ? [
                    { key: 'edit', label: 'Edit period', icon: Pencil, onSelect: () => setEditingPeriod(period) },
                    period.open
                      ? { key: 'close', label: 'Close period', icon: Lock, onSelect: () => setOpen(false) }
                      : { key: 'open', label: 'Reopen period', icon: LockOpen, onSelect: () => setOpen(true) },
                  ] : []),
                ]}
              />
            )}
            {isAdso && <Button variant="primary" icon={Plus} onClick={() => setEditingPeriod('new')}>Open renewal period</Button>}
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
            description={isAdso
              ? 'Open a renewal period for a scholarship and term. Scholars who hold it can then submit their grades.'
              : 'The AdSO opens renewal periods. They will appear here for your office’s scholarships.'}
            action={isAdso ? <Button variant="primary" icon={Plus} onClick={() => setEditingPeriod('new')}>Open renewal period</Button> : undefined}
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

          <KpiGrid columns={4}>
            <KpiCard label="Scholars" value={rows.length} icon={Users} active={filter === 'All'} onClick={() => setFilter('All')} loading={rowsLoading && rows.length === 0} hint="Hold the scholarship this term" />
            <KpiCard label="Not submitted" value={counts['Not submitted']} icon={CalendarClock} tone="warning" active={filter === 'Not submitted'} onClick={() => setFilter('Not submitted')} loading={rowsLoading && rows.length === 0} />
            <KpiCard label="To review" value={counts['Under Evaluation']} icon={ClipboardCheck} tone="info" active={filter === 'Under Evaluation'} onClick={() => setFilter('Under Evaluation')} loading={rowsLoading && rows.length === 0} hint={counts['Needs Revision'] ? `${counts['Needs Revision']} waiting on a revision` : undefined} />
            <KpiCard label="Renewed" value={counts.Renewed} icon={CheckCircle2} tone="success" active={filter === 'Renewed'} onClick={() => setFilter('Renewed')} loading={rowsLoading && rows.length === 0} hint={counts['Not Renewed'] + counts['Not Continuing'] ? `${counts['Not Renewed']} not renewed · ${counts['Not Continuing']} not continuing` : undefined} />
          </KpiGrid>

          <Card
            flush
            headerSlot={
              <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
                <SearchInput value={search} onChange={setSearch} label="Search scholars" placeholder="Search name, student number or program…" className="lg:w-80" />
                <SegmentedControl<Filter>
                  label="Status"
                  options={['All', 'Not submitted', 'Under Evaluation', 'Needs Revision', 'Renewed', 'Not Renewed', 'Not Continuing']}
                  value={filter}
                  onChange={v => setFilter((v || 'All') as Filter)}
                  className="overflow-x-auto lg:w-auto"
                  renderLabel={option => option === 'Under Evaluation' ? 'To review' : option}
                />
              </div>
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
                description="Scholars count once their application for the academic year is approved, or once they were renewed last term."
              />
            ) : visibleRows.length === 0 ? (
              <EmptyState title="No scholars match" description="Try another status or search." />
            ) : period && (
              <>
                <div className="hidden md:block">
                  <Table label="Scholars and their renewals" minWidth="56rem">
                    <thead>
                      <tr>
                        <Th sticky={false}>Scholar</Th>
                        <Th sticky={false} className="w-36">Program</Th>
                        <Th sticky={false} numeric className="w-24">GPA</Th>
                        {period.requiresEvaluation && <Th sticky={false} numeric className="w-32">Evaluation</Th>}
                        <Th sticky={false} numeric className="w-24">Documents</Th>
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
                          <Td numeric><GpaCell renewal={row.renewal} minGpa={period.minGpa} /></Td>
                          {period.requiresEvaluation && <Td numeric><EvaluationCell renewal={row.renewal} /></Td>}
                          <Td numeric>{row.renewal?.continuing ? `${row.renewal.documents.length}/${period.requirements.length}` : '—'}</Td>
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
                          <span className="block truncate text-xs text-ink-subtle">{row.studentNumber} · GPA {formatGpa(row.renewal?.gpa)}</span>
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
          getToken={getToken}
          period={editingPeriod === 'new' ? null : editingPeriod}
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

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function PeriodSummary({ period }: { period: RenewalPeriod }) {
  const parts = [
    period.open ? null : 'Closed',
    period.deadline ? `Deadline ${period.deadline}` : null,
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

function PeriodModal({ getToken, period, onClose, onSaved }: {
  getToken: () => Promise<string | null>;
  period: RenewalPeriod | null;
  onClose: () => void;
  onSaved: (period: RenewalPeriod) => void;
}) {
  const isNew = !period;
  const ay = currentAcademicYear();
  const [scholarshipId, setScholarshipId] = useState(period?.scholarshipId ?? RENEWABLE_SCHOLARSHIPS[0]?.id ?? '');
  const [academicYear, setAcademicYear] = useState(String(period?.academicYear ?? ay));
  const [term, setTerm] = useState<RenewalTerm>(period?.term ?? '2nd Semester');
  const [deadline, setDeadline] = useState(period?.deadline ?? '');
  const [minGpa, setMinGpa] = useState(period?.minGpa !== undefined && period?.minGpa !== null ? String(period.minGpa) : '');
  const [requiresEvaluation, setRequiresEvaluation] = useState(period?.requiresEvaluation ?? false);
  const [requirements, setRequirements] = useState((period?.requirements ?? DEFAULT_RENEWAL_REQUIREMENTS).join('\n'));
  const [notes, setNotes] = useState(period?.notes ?? '');
  const [open, setOpenState] = useState(period?.open ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Suggestions for a new period: the SFA Grant's renewal uses the head
  // evaluation, and the scholarship's own retention GPA (e.g. 2.50).
  useEffect(() => {
    if (!isNew) return;
    setRequiresEvaluation(scholarshipId === 's1');
    const min = retentionMinGpa(mockScholarships.find(s => s.id === scholarshipId) ?? {});
    setMinGpa(min !== undefined ? min.toFixed(2) : '');
  }, [isNew, scholarshipId]);

  const save = async () => {
    setError('');
    const min = minGpa.trim();
    if (min && (!Number.isFinite(Number(min)) || Number(min) < 0 || Number(min) > 4)) {
      setError('The minimum GPA must be between 0.00 and 4.00.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        ...(isNew ? { scholarshipId, academicYear: Number(academicYear), term } : {}),
        deadline, notes, open, requiresEvaluation,
        minGpa: min === '' ? null : Number(min),
        requirements: requirements.split('\n').map(r => r.trim()).filter(Boolean),
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

  return (
    <Modal
      title={isNew ? 'Open renewal period' : 'Edit renewal period'}
      description={isNew ? 'Scholars who hold the scholarship can submit their renewal while the period is open.' : `${period!.scholarshipName} · ${periodLabel(period!)}`}
      onClose={onClose}
      dismissible={!saving}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={saving}>{isNew ? 'Open period' : 'Save'}</Button>
        </>
      }
    >
      <div className="space-y-5">
        {isNew && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Field label="Scholarship" className="sm:col-span-3">
              <Select value={scholarshipId} onChange={setScholarshipId} disabled={saving}>
                {RENEWABLE_SCHOLARSHIPS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Academic year">
              <Select value={academicYear} onChange={setAcademicYear} disabled={saving}>
                {[ay + 1, ay, ay - 1].map(y => <option key={y} value={y}>{academicYearLabel(y)}</option>)}
              </Select>
            </Field>
            <Field label="Term" className="sm:col-span-2">
              <SegmentedControl<RenewalTerm> label="Term" options={RENEWAL_TERMS} value={term} onChange={v => v && setTerm(v)} />
            </Field>
          </div>
        )}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Deadline" optional helper="Shown to scholars as written.">
            <TextInput value={deadline} onChange={e => setDeadline(e.target.value)} placeholder="e.g. January 20, 2027" disabled={saving} maxLength={200} />
          </Field>
          <Field label="Minimum GPA" optional helper="0.00–4.00. Lower GPAs are flagged for review.">
            <TextInput type="number" inputMode="decimal" step="0.01" min={0} max={4} value={minGpa} onChange={e => setMinGpa(e.target.value)} placeholder="e.g. 2.50" disabled={saving} />
          </Field>
        </div>
        <Field label="Documents to upload" helper="One per line. Scholars upload a JPG for each.">
          <Textarea rows={3} value={requirements} onChange={e => setRequirements(e.target.value)} disabled={saving} />
        </Field>
        <Field label="Note to scholars" optional>
          <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} disabled={saving} maxLength={1000} placeholder="e.g. Upload your TCG from the Online Student Records Portal." />
        </Field>
        <Checkbox
          checked={requiresEvaluation}
          onChange={setRequiresEvaluation}
          disabled={saving}
          label="Requires the department head's evaluation"
          description={`Staff enter the head's 1–5 ratings. An average below ${PASSING_AVERAGE} (Very satisfactory) means an interview before deciding.`}
        />
        {!isNew && (
          <Checkbox checked={open} onChange={setOpenState} disabled={saving} label="Open for submissions" description="When closed, only scholars asked to revise can resubmit." />
        )}
        {error && <Alert tone="danger">{error}</Alert>}
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
      size="lg"
      title={name}
      description={`${row.studentNumber} · ${renewal.scholarshipName} · ${periodLabel(period)}`}
      icon={<Avatar name={row.name || row.studentNumber} avatarUrl={row.avatarUrl} />}
      onClose={onClose}
    >
      <div className="space-y-6">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <DetailField label="Status" value={<Badge tone={STATE_TONE[renewal.status]} dot>{renewal.status}</Badge>} />
          <DetailField label="Continuing" value={renewal.continuing ? 'Yes' : `No · ${renewal.notContinuingReason ?? ''}`} />
          {renewal.continuing ? (
            <>
              <DetailField
                label={period.minGpa !== undefined && period.minGpa !== null ? `GPA (min. ${formatGpa(period.minGpa)})` : 'GPA'}
                value={<span className={meets === false ? 'text-danger-fg' : undefined}>{formatGpa(renewal.gpa)}{meets === false ? ' · below minimum' : ''}</span>}
              />
              <DetailField label="Failing grade" value={renewal.hasFailingGrade ? <span className="text-danger-fg">Yes</span> : 'None'} />
            </>
          ) : (
            <DetailField label="Details" value={renewal.notContinuingDetails} />
          )}
          <DetailField label="Program" value={row.program} />
          <DetailField label="Holds it through" value={row.holder?.renewedFrom ? `Renewed ${row.holder.renewedFrom}` : row.holder?.referenceCode ? `Application ${row.holder.referenceCode}` : 'No longer counted as a holder'} />
          <DetailField label="Submitted" value={formatDateTime(renewal.createdAt)} />
          <DetailField label="Email" value={row.email} />
        </dl>

        {renewal.continuing && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-ink">Documents</h3>
            <ul className="space-y-1.5">
              {period.requirements.map(requirement => {
                const doc = renewal.documents.find(d => d.docType === requirement);
                return (
                  <li key={requirement} className="flex items-center justify-between gap-3 rounded-control px-3 py-2 ring-1 ring-line">
                    <span className="flex min-w-0 items-center gap-2 text-sm text-ink">
                      <FileText className="size-4 shrink-0 text-ink-subtle" aria-hidden />
                      <span className="truncate">{requirement}</span>
                    </span>
                    {doc
                      ? <a href={documentUrl(doc.fileId)} target="_blank" rel="noreferrer" className="shrink-0 text-sm font-medium text-accent hover:underline">View</a>
                      : <Badge tone="warning">Missing</Badge>}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {renewal.continuing && (period.requiresEvaluation || renewal.evaluation) && (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-ink">Department head's evaluation</h3>
              {renewal.evaluation && !editingEvaluation && (
                <Button size="sm" icon={Pencil} onClick={() => setEditingEvaluation(true)}>Edit</Button>
              )}
            </div>
            {renewal.evaluation && !editingEvaluation ? (
              <EvaluationSummary renewal={renewal} />
            ) : editingEvaluation || !renewal.evaluation ? (
              <EvaluationForm
                renewal={renewal}
                getToken={getToken}
                onCancel={renewal.evaluation ? () => setEditingEvaluation(false) : undefined}
                onSaved={updated => { setEditingEvaluation(false); onUpdated(updated); }}
              />
            ) : null}
          </section>
        )}

        <DecisionPanel renewal={renewal} period={period} getToken={getToken} onUpdated={onUpdated} />

        {renewal.history.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-ink">History</h3>
            <ol className="space-y-2">
              {[...renewal.history].reverse().map((h, i) => (
                <li key={`${h.changedAt}-${i}`} className="text-sm">
                  <span className="font-medium text-ink">{h.status}</span>
                  <span className="text-ink-subtle"> · {formatDateTime(h.changedAt)} · {h.changedBy === 'student' ? 'Scholar' : h.changedByName || h.changedBy}{h.changedByOffice ? ` (${officeName(h.changedByOffice)})` : ''}</span>
                  {h.note && h.changedBy !== 'student' && <p className="mt-0.5 whitespace-pre-line text-ink-muted">{h.note}</p>}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </Modal>
  );
}

function EvaluationSummary({ renewal }: { renewal: Renewal }) {
  const ev = renewal.evaluation!;
  const passing = ev.average >= PASSING_AVERAGE;
  return (
    <div className="space-y-3">
      <Alert tone={passing ? 'success' : 'warning'} title={`Average ${ev.average.toFixed(2)} · ${ratingLabel(ev.average)}`}>
        {passing ? 'Meets the Very satisfactory average needed to renew.' : `Below ${PASSING_AVERAGE} (Very satisfactory): interview the scholar before deciding.`}
      </Alert>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {EVALUATION_ITEMS.map(item => (
          <div key={item.key} className="flex items-baseline justify-between gap-3 border-b border-line py-1 text-sm">
            <dt className="text-ink-muted">{item.label}</dt>
            <dd className="shrink-0 font-medium text-ink">{ev.scores?.[item.key] ?? '—'}</dd>
          </div>
        ))}
      </dl>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <DetailField label="Evaluated by" value={ev.evaluatorName} />
        <DetailField label="Assigned office" value={ev.assignedOffice} />
        <DetailField label="Entered" value={ev.enteredAt ? `${formatDateTime(ev.enteredAt)}${ev.enteredBy ? ` by ${ev.enteredBy}` : ''}` : undefined} />
      </dl>
      {ev.remarks && <DetailField label="Remarks (staff only)" value={<span className="whitespace-pre-line font-normal">{ev.remarks}</span>} />}
    </div>
  );
}

function EvaluationForm({ renewal, getToken, onCancel, onSaved }: {
  renewal: Renewal;
  getToken: () => Promise<string | null>;
  onCancel?: () => void;
  onSaved: (renewal: Renewal) => void;
}) {
  const ev = renewal.evaluation;
  const [scores, setScores] = useState<Record<string, number>>(ev?.scores ?? {});
  const [evaluatorName, setEvaluatorName] = useState(ev?.evaluatorName ?? '');
  const [assignedOffice, setAssignedOffice] = useState(ev?.assignedOffice ?? '');
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
        <Field label="Assigned office" optional><TextInput value={assignedOffice} onChange={e => setAssignedOffice(e.target.value)} disabled={saving} maxLength={200} /></Field>
      </div>
      <Field label="Remarks" optional helper="Staff only. Not shown to the scholar.">
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

const DECISION_ICONS: Record<RenewalDecision, React.ElementType> = { Renewed: CheckCircle2, 'Needs Revision': RefreshCw, 'Not Renewed': XCircle };

function DecisionPanel({ renewal, period, getToken, onUpdated }: {
  renewal: Renewal;
  period: RenewalPeriod;
  getToken: () => Promise<string | null>;
  onUpdated: (renewal: Renewal) => void;
}) {
  const [decision, setDecision] = useState<RenewalDecision | ''>('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const decided = renewal.status !== 'Under Evaluation';
  const options = RENEWAL_DECISIONS.filter(d => d !== renewal.status);
  const noteRequired = decision === 'Needs Revision' || decision === 'Not Renewed' || (decision !== '' && decided);
  const needsEvaluation = decision === 'Renewed' && period.requiresEvaluation && !renewal.evaluation;

  const save = async () => {
    if (!decision) return;
    if (noteRequired && !note.trim()) {
      setError(decided ? 'Add a message to the scholar explaining why the decision changed.' : 'Add a message to the scholar explaining what to do or why.');
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
      setDecision('');
      setNote('');
      onUpdated(body.renewal);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the decision.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-3 rounded-card bg-surface-muted p-4">
      <div>
        <h3 className="text-sm font-semibold text-ink">{decided ? 'Change decision' : 'Decision'}</h3>
        {renewal.reviewNote && decided && (
          <p className="mt-1 text-sm text-ink-muted">Current message to the scholar: <span className="whitespace-pre-line text-ink">{renewal.reviewNote}</span></p>
        )}
      </div>
      <SegmentedControl<RenewalDecision>
        label="Decision"
        options={options}
        value={decision}
        onChange={v => { setDecision(v); setError(''); }}
        renderLabel={option => {
          const Icon = DECISION_ICONS[option];
          return <span className="inline-flex items-center gap-1.5"><Icon className="size-3.5" aria-hidden />{option}</span>;
        }}
      />
      {decision && (
        <>
          <Field
            label="Message to the scholar"
            optional={!noteRequired}
            helper={decision === 'Needs Revision' ? 'Say what to fix or upload again.' : 'The scholar sees this on their Renewal page.'}
          >
            <Textarea rows={3} value={note} onChange={e => setNote(e.target.value)} disabled={saving} maxLength={2000} />
          </Field>
          {needsEvaluation && <Alert tone="warning">Enter the department head's evaluation before renewing.</Alert>}
          <div className="flex justify-end">
            <Button variant="primary" onClick={save} loading={saving} disabled={needsEvaluation}>Save decision</Button>
          </div>
        </>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
    </section>
  );
}
