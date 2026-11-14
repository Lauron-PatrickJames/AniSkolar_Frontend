import React, { useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, Inbox } from 'lucide-react';
import { useUser } from '@clerk/react';
import { AdsoRole, canAct } from './ApprovalChain';
import { acceptsOnlineApplications, mockScholarships, officeDisplayName, officeOf } from '../../data/scholarships';
import {
  API_BASE_URL, AdminApplication, STATUS_OPTIONS, applicantName, authHeaders, formatDateTime, isOfficeApp, titleCaseName
} from './adminData';
import {
  Alert, Avatar, Badge, Button, Card, ConfirmDialog, CopyButton, EmptyState, ErrorState, Field, MobileList, PageHeader, Pagination, RowLink, Textarea, Toast,
  SearchInput, Select, StatusBadge, Table, TableSkeleton, Tabs, Td, Th, Toolbar, Tooltip, Tr, Truncate, paginate
} from './AdminUI';
import {
  DEFAULT_FILTERS, ListFilters, StatusTab, WAITING_HIGHLIGHT_DAYS, tabOf,
  filterApplications, waitingDays
} from './applicationQueue';
import { relativeTime } from './history';
import { collegeName, findProgram } from '../../data/programs';

// Where an AdSO application under evaluation is in the approval chain
// (ApprovalChain.tsx); nothing for partner office applications.
const chainStageText = (app: AdminApplication) => {
  if (app.status !== 'Under Evaluation' || isOfficeApp(app)) return '';
  return { associate: 'With the Associate', head: 'With the Head', director: 'For the Director' }[app.approvalStage ?? 'associate'];
};

// Ready for the Director's batch approval: with the Director, and the
// Head's latest recommendation is to approve.
const readyForBatch = (app: AdminApplication) => {
  if (app.status !== 'Under Evaluation' || isOfficeApp(app) || app.approvalStage !== 'director') return false;
  const rec = [...(app.approvalSteps ?? [])].reverse().find(s => s.action === 'recommendApproval' || s.action === 'recommendRejection');
  return rec?.action === 'recommendApproval';
};

export { DEFAULT_FILTERS };
export type { ListFilters };

const PAGE_SIZE = 15;

interface ApplicationsListProps {
  applications: AdminApplication[];
  isLoading: boolean;
  loadError: string;
  onReload: () => Promise<void>;
  onOpen: (app: AdminApplication) => void;
  getToken: () => Promise<string | null>;
  // Kept by the parent so they survive opening an application and coming back.
  filters: ListFilters;
  onFiltersChange: (filters: ListFilters) => void;
  // Office code for office admins (POLCA, ALUMNI); null for the AdSO.
  adminOffice: string | null;
  officeLabel: string;
}

const TABS: { key: StatusTab; label: string }[] = [
  { key: 'Under Evaluation', label: 'Under evaluation' },
  { key: 'Needs Revision', label: 'Needs revision' },
  { key: 'Approved', label: 'Approved' },
  { key: 'Rejected', label: 'Rejected' },
  { key: 'Ended', label: 'Declined or ended' },
  { key: 'All', label: 'All' }
];

const EMPTY_TABS: Record<StatusTab, { title: string; description: string }> = {
  'Under Evaluation': { title: 'Nothing waiting for review', description: 'New and resubmitted applications appear here.' },
  'Needs Revision': { title: 'Nothing waiting on applicants', description: 'Applications sent back for changes stay here until the applicant resubmits.' },
  'Approved': { title: 'No approved applications', description: 'Applications you approve appear here.' },
  'Rejected': { title: 'No rejected applications', description: 'Applications you reject appear here.' },
  'Ended': { title: 'Nothing declined or ended', description: 'Approved scholarships the student declined, or that ended when they graduated or stopped, appear here.' },
  'All': { title: 'No applications yet', description: 'Applications appear here as students apply.' }
};

export default function ApplicationsList({
  applications, isLoading, loadError, onReload, onOpen, getToken, filters, onFiltersChange, adminOffice, officeLabel
}: ApplicationsListProps) {
  const hasData = applications.length > 0;
  const firstLoad = isLoading && !hasData;
  const failedEmpty = !!loadError && !hasData && !isLoading;
  const isAdso = !adminOffice;

  // Any filter change returns to page 1.
  const setFilter = (patch: Partial<Omit<ListFilters, 'page'>>) => onFiltersChange({ ...filters, ...patch, page: 1 });

  const scholarshipOptions = useMemo(() => {
    const map = new Map<string, string>();
    // Every scholarship this admin's office handles, even before it has
    // any applications, plus anything else that shows up in the data.
    mockScholarships
      .filter(s => acceptsOnlineApplications(s) && (!adminOffice || officeOf(s) === adminOffice))
      .forEach(s => map.set(s.id, s.name));
    applications.forEach(a => map.set(a.scholarshipId, a.scholarshipName));
    return Array.from(map.entries());
  }, [applications, adminOffice]);

  const counts = useMemo(() => {
    const c = { All: applications.length, Ended: applications.filter(a => tabOf(a) === 'Ended').length } as Record<StatusTab, number>;
    STATUS_OPTIONS.forEach(s => { c[s] = applications.filter(a => tabOf(a) === s).length; });
    return c;
  }, [applications]);

  const filtered = useMemo(() => filterApplications(applications, filters), [applications, filters]);
  const pager = paginate(filtered, filters.page, PAGE_SIZE);
  const showWaiting = filters.status === 'Under Evaluation';
  const now = Date.now();

  // Counts are hidden until there's data, so a failed or pending load
  // doesn't read as "0 applications".
  const tabCount = (n: number) => (firstLoad || failedEmpty ? undefined : n);

  // The Director approves the Head-recommended applications in a batch
  // (POST /api/applications/batch-approve); rejecting stays one at a time.
  const { user } = useUser();
  const rawRole = (user?.publicMetadata as { adsoRole?: string } | undefined)?.adsoRole;
  const adsoRole: AdsoRole = rawRole === 'associate' || rawRole === 'head' || rawRole === 'director' ? rawRole : null;
  const batchView = isAdso && canAct(adsoRole, 'director') && filters.status === 'Under Evaluation';
  const readyCount = useMemo(() => filtered.filter(readyForBatch).length, [filtered]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [batchNote, setBatchNote] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchError, setBatchError] = useState('');
  const [skipped, setSkipped] = useState<{ id: string; reason: string }[]>([]);
  const [toast, setToast] = useState('');
  const pickedReady = filtered.filter(a => picked.has(a._id) && readyForBatch(a));
  const pageReady = pager.pageItems.filter(readyForBatch);
  const allPagePicked = pageReady.length > 0 && pageReady.every(a => picked.has(a._id));
  const toggle = (id: string) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const togglePage = () => setPicked(p => { const n = new Set(p); pageReady.forEach(a => (allPagePicked ? n.delete(a._id) : n.add(a._id))); return n; });
  const nameOfId = (id: string) => { const a = applications.find(x => x._id === id); return a ? `${titleCaseName(applicantName(a))} (${a.scholarshipName})` : id; };
  const approveBatch = async () => {
    setBatchBusy(true);
    setBatchError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/applications/batch-approve`, {
        method: 'POST',
        headers: await authHeaders(getToken, true),
        body: JSON.stringify({ ids: pickedReady.map(a => a._id), reviewNote: batchNote.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Couldn’t approve them.');
      setConfirming(false);
      setPicked(new Set());
      setBatchNote('');
      setSkipped(body.skipped ?? []);
      const n = (body.approved ?? []).length;
      if (n) setToast(`Approved ${n} application${n === 1 ? '' : 's'}.`);
      await onReload();
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : 'Couldn’t approve them.');
    } finally {
      setBatchBusy(false);
    }
  };
  const pickBox = (app: AdminApplication) => (
    <input
      type="checkbox"
      className="size-4 rounded accent-accent disabled:opacity-30"
      checked={picked.has(app._id)}
      disabled={!readyForBatch(app)}
      title={readyForBatch(app) ? undefined : 'Only applications the Head recommended for approval'}
      aria-label={`Select ${titleCaseName(applicantName(app))}`}
      onClick={e => e.stopPropagation()}
      onChange={() => toggle(app._id)}
    />
  );
  const listFiltersActive = filters.search.trim() !== '' || filters.scholarship !== 'All' || filters.office !== 'All';
  const clearListFilters = () => onFiltersChange({ ...DEFAULT_FILTERS, status: filters.status, sort: filters.sort });

  return (
    <>
      <PageHeader
        title="Applications"
      />

      {loadError && hasData && (
        <Alert
          tone="danger"
          title="Couldn't refresh applications"
          action={<Button size="sm" onClick={() => onReload()} loading={isLoading}>Try again</Button>}
        >
          {loadError} Showing the last loaded list.
        </Alert>
      )}

      <Card
        flush
        headerSlot={
          <>
            <Tabs<StatusTab>
              tabs={TABS.map(t => ({ ...t, count: tabCount(counts[t.key]) }))}
              value={filters.status}
              onChange={status => setFilter({ status })}
              label="Filter by status"
            />
            <Toolbar>
              <SearchInput
                value={filters.search}
                onChange={search => setFilter({ search })}
                label="Search applications"
                placeholder="Search name, student no., reference, scholarship or college…"
                className="min-w-56 flex-1"
              />
              <Select value={filters.scholarship} onChange={scholarship => setFilter({ scholarship })} className="md:w-60" label="Filter by scholarship">
                <option value="All">All scholarships</option>
                {scholarshipOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </Select>
            </Toolbar>
          </>
        }
      >
        {firstLoad ? (
          <TableSkeleton label="Loading applications" />
        ) : failedEmpty ? (
          <ErrorState title="Couldn't load applications" message={loadError} onRetry={() => onReload()} retrying={isLoading} />
        ) : filtered.length === 0 ? (
          listFiltersActive ? (
            <EmptyState
              title="No applications match"
              action={<Button onClick={clearListFilters}>Clear filters</Button>}
            />
          ) : (
            <EmptyState icon={Inbox} title={EMPTY_TABS[filters.status].title} />
          )
        ) : (
          <>
            {batchView && skipped.length > 0 && (
              <div className="px-4 pt-4">
                <Alert tone="warning" title={`${skipped.length} not approved`} onDismiss={() => setSkipped([])}>
                  <ul className="list-disc pl-5">{skipped.map(k => <li key={k.id}>{nameOfId(k.id)}: {k.reason}</li>)}</ul>
                </Alert>
              </div>
            )}
            {batchView && readyCount > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-muted px-4 py-2.5">
                <p className="text-sm text-ink">
                  {pickedReady.length > 0
                    ? `${pickedReady.length} selected`
                    : `${readyCount} recommended for approval by the Head. Select them to approve together.`}
                </p>
                <div className="flex gap-2">
                  {pickedReady.length > 0 && <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>Clear</Button>}
                  {pickedReady.length < readyCount && <Button size="sm" onClick={() => setPicked(new Set(filtered.filter(readyForBatch).map(a => a._id)))}>Select all {readyCount}</Button>}
                  {pickedReady.length > 0 && <Button size="sm" variant="primary" icon={CheckCircle2} onClick={() => { setBatchError(''); setConfirming(true); }}>Approve {pickedReady.length}</Button>}
                </div>
              </div>
            )}
            <div className="hidden xl:block">
            <Table label="Applications" minWidth={showWaiting ? '60rem' : '56rem'}>
              <thead>
                <tr>
                  {batchView && (
                    <Th sticky={false} className="w-10">
                      <input type="checkbox" className="size-4 rounded accent-accent disabled:opacity-30" checked={allPagePicked} disabled={!pageReady.length} onChange={togglePage} aria-label="Select the recommended applications on this page" />
                    </Th>
                  )}
                  <Th sticky={false}>Applicant</Th>
                  <Th sticky={false} className="w-40">College</Th>
                  <Th sticky={false}>Scholarship</Th>
                  <Th sticky={false} className="w-32">Submitted</Th>
                  {showWaiting && <Th sticky={false} className="w-28">Waiting</Th>}
                  <Th sticky={false} className="w-40">Status</Th>
                  <Th sticky={false} className="w-12"><span className="sr-only">Open</span></Th>
                </tr>
              </thead>
              <tbody>
                {pager.pageItems.map(app => {
                  const name = titleCaseName(applicantName(app));
                  const days = waitingDays(app, now);
                  // The student's college and program now (from their profile).
                  const profile = app.currentProfile;
                  const college = profile?.college || findProgram(profile?.programCode)?.college || '';
                  return (
                    <Tr key={app._id} onClick={() => onOpen(app)}>
                      {batchView && <Td>{pickBox(app)}</Td>}
                      <Td>
                        <div className="flex min-w-0 items-start gap-3">
                          <Avatar name={name} avatarUrl={app.avatarUrl} size="sm" />
                          <div className="min-w-0">
                            <RowLink onClick={() => onOpen(app)}>{name}</RowLink>
                            <p className="text-xs text-ink-subtle tabular-nums">{app.studentNumber}</p>
                            <p className="flex items-center gap-1 text-xs text-ink-subtle">
                              <span className="font-mono">{app.referenceCode}</span>
                              <CopyButton
                                value={app.referenceCode}
                                label={`Copy reference ${app.referenceCode}`}
                                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                              />
                            </p>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        {college ? (
                          <Tooltip content={collegeName(college)} asChild>
                            <span tabIndex={0} className="rounded-badge font-medium text-ink">{college}</span>
                          </Tooltip>
                        ) : <span className="text-ink-subtle">—</span>}
                        {(profile?.programCode || profile?.yearLevel) && (
                          <p className="text-xs text-ink-subtle">{[profile?.programCode, profile?.yearLevel].filter(Boolean).join(' · ')}</p>
                        )}
                      </Td>
                      <Td>
                        <Truncate className="text-ink">{app.scholarshipName}</Truncate>
                        {isAdso && isOfficeApp(app) && (
                          <span className="text-xs text-ink-subtle">via {officeDisplayName(app.office)}</span>
                        )}
                      </Td>
                      <Td>
                        <Tooltip content={formatDateTime(app.createdAt)} asChild>
                          <time dateTime={app.createdAt} tabIndex={0} className="rounded-badge tabular-nums">
                            {relativeTime(app.createdAt, now)}
                          </time>
                        </Tooltip>
                        {app.awardedDirectly && <span className="block text-xs text-ink-subtle">Added by {officeDisplayName(app.office).replace(/^.*\(([^)]+)\)$/, '$1')}</span>}
                      </Td>
                      {showWaiting && (
                        <Td>
                          {days >= WAITING_HIGHLIGHT_DAYS
                            ? <Badge tone="warning">{days} days</Badge>
                            : <span className="tabular-nums">{days === 0 ? 'Today' : `${days} ${days === 1 ? 'day' : 'days'}`}</span>}
                        </Td>
                      )}
                      <Td>
                        <StatusBadge status={app.status} endReason={app.endReason} />
                        {chainStageText(app) && <p className="mt-1 text-xs text-ink-subtle">{chainStageText(app)}</p>}
                      </Td>
                      <Td><ChevronRight className="size-4 text-ink-subtle group-hover:text-ink" aria-hidden /></Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
            </div>
            <MobileList>
              {pager.pageItems.map(app => {
                const name = titleCaseName(applicantName(app));
                const days = waitingDays(app, now);
                return (
                  <li key={app._id}>
                    <button type="button" onClick={() => onOpen(app)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-muted">
                      <Avatar name={name} avatarUrl={app.avatarUrl} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{name}</span>
                        <span className="block truncate text-xs text-ink-subtle">{app.scholarshipName}</span>
                        <span className="block text-xs text-ink-subtle tabular-nums">{app.awardedDirectly ? `Added by ${officeDisplayName(app.office).replace(/^.*\(([^)]+)\)$/, '$1')} · ` : ''}{relativeTime(app.createdAt, now)}{showWaiting && days >= WAITING_HIGHLIGHT_DAYS ? ` · waiting ${days} days` : ''}</span>
                      </span>
                      <StatusBadge status={app.status} endReason={app.endReason} />
                    </button>
                  </li>
                );
              })}
            </MobileList>

            <Pagination
              page={pager.page}
              pageCount={pager.pageCount}
              total={pager.total}
              pageSize={pager.pageSize}
              onChange={page => onFiltersChange({ ...filters, page })}
              noun="applications"
            />
          </>
        )}
      </Card>
      {confirming && (
        <ConfirmDialog
          title={`Approve ${pickedReady.length} application${pickedReady.length === 1 ? '' : 's'}?`}
          confirmLabel={`Approve ${pickedReady.length}`}
          confirmIcon={CheckCircle2}
          busy={batchBusy}
          error={batchError}
          onConfirm={approveBatch}
          onCancel={() => { if (!batchBusy) setConfirming(false); }}
        >
          <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-ink-muted">
            <li>Each one the Head recommended for approval is approved, and the applicants see it in their portal.</li>
            <li>SFAG applications get the grant percentage the student applied for.</li>
            <li>Any that can’t be approved now (no slots left, already holds another scholarship, or changed meanwhile) are skipped and listed.</li>
          </ul>
          <Field label="Message to the applicants" optional helper="Sent with every approval in this batch.">
            <Textarea value={batchNote} onChange={e => setBatchNote(e.target.value)} rows={3} maxLength={2000} disabled={batchBusy} className="resize-y" />
          </Field>
        </ConfirmDialog>
      )}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}
