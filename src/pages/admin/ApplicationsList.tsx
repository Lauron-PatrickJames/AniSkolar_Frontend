import React, { useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, Clock, Inbox, RefreshCw, RotateCcw, Send, ShieldCheck } from 'lucide-react';
import { mockScholarships, officeOf } from '../../data/scholarships';
import {
  API_BASE_URL, AdminApplication, AppStatus, applicantName, authHeaders, formTypeLabel, formatDateTime,
  formatShortDate, isOfficeApp, officeName, plural
} from './adminData';
import {
  Alert, Avatar, Button, Card, ConfirmDialog, EmptyState, ErrorState, KpiCard, KpiGrid, MobileList, PageHeader,
  Pagination, RowLink, SearchInput, Select, StatusBadge, Table, TableSkeleton, Tabs, Td, Th, Toolbar, Tr, Truncate, paginate
} from './AdminUI';

const PAGE_SIZE = 15;

export interface ListFilters {
  search: string;
  status: AppStatus | 'All';
  scholarship: string;
  page: number;
}

export const DEFAULT_FILTERS: ListFilters = { search: '', status: 'All', scholarship: 'All', page: 1 };

interface ApplicationsListProps {
  applications: AdminApplication[];
  isLoading: boolean;
  loadError: string;
  onReload: () => Promise<void>;
  onOpen: (app: AdminApplication) => void;
  // Kept by the parent so they survive opening an application and coming back.
  filters: ListFilters;
  onFiltersChange: (filters: ListFilters) => void;
  // Office code for office admins (POLCA, ALUMNI); null for the AdSO.
  adminOffice: string | null;
  officeLabel: string;
  getToken: () => Promise<string | null>;
}

export default function ApplicationsList({
  applications, isLoading, loadError, onReload, onOpen, filters, onFiltersChange, adminOffice, officeLabel, getToken
}: ApplicationsListProps) {
  const hasData = applications.length > 0;
  const firstLoad = isLoading && !hasData;
  const failedEmpty = !!loadError && !hasData && !isLoading;

  // Any filter change returns to page 1.
  const setFilter = (patch: Partial<Omit<ListFilters, 'page'>>) => onFiltersChange({ ...filters, ...patch, page: 1 });
  const clearFilters = () => onFiltersChange(DEFAULT_FILTERS);

  const scholarshipOptions = useMemo(() => {
    const map = new Map<string, string>();
    // Every scholarship this admin's office handles, even before it has
    // any applications, plus anything else that shows up in the data.
    mockScholarships
      .filter(s => !adminOffice || officeOf(s) === adminOffice)
      .forEach(s => map.set(s.id, s.name));
    applications.forEach(a => map.set(a.scholarshipId, a.scholarshipName));
    return Array.from(map.entries());
  }, [applications, adminOffice]);

  const stats = useMemo(() => {
    const count = (s: AppStatus) => applications.filter(a => a.status === s).length;
    return {
      total: applications.length,
      pending: count('Under Evaluation'),
      revision: count('Needs Revision'),
      approved: count('Approved'),
      rejected: count('Rejected')
    };
  }, [applications]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return applications.filter(app => {
      if (filters.status !== 'All' && app.status !== filters.status) return false;
      if (filters.scholarship !== 'All' && app.scholarshipId !== filters.scholarship) return false;
      if (q) {
        return applicantName(app).toLowerCase().includes(q) ||
          app.studentNumber.toLowerCase().includes(q) ||
          app.scholarshipName.toLowerCase().includes(q) ||
          app.referenceCode.toLowerCase().includes(q);
      }
      return true;
    });
  }, [applications, filters.search, filters.status, filters.scholarship]);

  const pager = paginate(filtered, filters.page, PAGE_SIZE);

  // Counts are hidden until there's data, so a failed or pending load
  // doesn't read as "0 applications".
  const tabCount = (n: number) => (firstLoad || failedEmpty ? undefined : n);
  const statusTabs: { key: AppStatus | 'All'; label: string; count?: number }[] = [
    { key: 'All', label: 'All', count: tabCount(stats.total) },
    { key: 'Under Evaluation', label: 'Under evaluation', count: tabCount(stats.pending) },
    { key: 'Needs Revision', label: 'Needs revision', count: tabCount(stats.revision) },
    { key: 'Approved', label: 'Approved', count: tabCount(stats.approved) },
    { key: 'Rejected', label: 'Rejected', count: tabCount(stats.rejected) }
  ];
  const decided = stats.approved + stats.rejected;
  const approvalRate = decided > 0 ? Math.round((stats.approved / decided) * 100) : null;
  const filtersActive = filters.search.trim() !== '' || filters.scholarship !== 'All' || filters.status !== 'All';
  const toggleStatus = (status: AppStatus) => setFilter({ status: filters.status === status ? 'All' : status });
  const kpiValue = (n: number | string) => (failedEmpty ? '—' : n);

  return (
    <>
      <PageHeader
        title="Applications"
        description={adminOffice
          ? `Applications for the ${officeLabel}. Review them, then send them to the AdSO.`
          : 'Review submissions, verify documents, and record a decision for each applicant.'}
        actions={<Button icon={RefreshCw} loading={isLoading} onClick={() => onReload()}>Refresh</Button>}
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

      {adminOffice && hasData && (
        <SendToAdsoCard applications={applications} getToken={getToken} onSent={onReload} statusTabs={statusTabs} />
      )}

      <KpiGrid>
        <KpiCard label="Total applications" value={kpiValue(stats.total)} hint="All submissions on file" icon={Inbox} loading={firstLoad} />
        <KpiCard
          label="Under evaluation"
          value={kpiValue(stats.pending)}
          hint="Waiting for a decision"
          icon={Clock}
          tone="warning"
          loading={firstLoad}
          active={filters.status === 'Under Evaluation'}
          onClick={() => toggleStatus('Under Evaluation')}
        />
        <KpiCard
          label="Needs revision"
          value={kpiValue(stats.revision)}
          hint="Waiting on applicants"
          icon={RotateCcw}
          tone="info"
          loading={firstLoad}
          active={filters.status === 'Needs Revision'}
          onClick={() => toggleStatus('Needs Revision')}
        />
        <KpiCard
          label="Approval rate"
          value={kpiValue(approvalRate === null ? '—' : `${approvalRate}%`)}
          hint={failedEmpty ? 'No data' : `${stats.approved} approved of ${decided} decided`}
          icon={CheckCircle2}
          tone="success"
          loading={firstLoad}
        />
      </KpiGrid>

      <Card
        flush
        headerSlot={
          <>
            <Tabs<AppStatus | 'All'> tabs={statusTabs} value={filters.status} onChange={status => setFilter({ status })} label="Filter by status" />
            <Toolbar>
              <SearchInput
                value={filters.search}
                onChange={search => setFilter({ search })}
                label="Search applications"
                placeholder="Search name, student no., scholarship or reference…"
                className="flex-1"
              />
              <Select value={filters.scholarship} onChange={scholarship => setFilter({ scholarship })} className="md:w-72" label="Filter by scholarship">
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
          filtersActive ? (
            <EmptyState
              title="No applications match your filters"
              description="Try a different search term, status or scholarship."
              action={<Button onClick={clearFilters}>Clear filters</Button>}
            />
          ) : (
            <EmptyState
              title="No applications yet"
              description="New submissions appear here as students apply. Refresh to check for new ones."
              action={<Button variant="primary" icon={RefreshCw} loading={isLoading} onClick={() => onReload()}>Refresh</Button>}
            />
          )
        ) : (
          <>
            <div className="hidden md:block">
              <Table label="Applications">
                <thead>
                  <tr>
                    <Th>Applicant</Th>
                    <Th>Scholarship</Th>
                    <Th className="hidden w-40 lg:table-cell">Reference</Th>
                    <Th className="w-32">Submitted</Th>
                    <Th className="w-44">Status</Th>
                    <Th className="w-12"><span className="sr-only">Open</span></Th>
                  </tr>
                </thead>
                <tbody>
                  {pager.pageItems.map(app => {
                    const name = applicantName(app);
                    return (
                      <Tr key={app._id} onClick={() => onOpen(app)}>
                        <Td>
                          <div className="flex min-w-0 items-center gap-3">
                            <Avatar name={name} avatarUrl={app.avatarUrl} size="sm" />
                            <div className="min-w-0">
                              <RowLink onClick={() => onOpen(app)}>{name}</RowLink>
                              <p className="text-xs text-ink-subtle tabular-nums">{app.studentNumber}</p>
                            </div>
                          </div>
                        </Td>
                        <Td>
                          <Truncate className="text-ink">{app.scholarshipName}</Truncate>
                          <Truncate className="text-xs text-ink-subtle">
                            {`${formTypeLabel(app.applicationFormType)}${!adminOffice && isOfficeApp(app) ? ` · from ${officeName(app.office)}` : ''}`}
                          </Truncate>
                        </Td>
                        <Td className="hidden lg:table-cell"><Truncate className="font-mono text-xs">{app.referenceCode}</Truncate></Td>
                        <Td className="whitespace-nowrap tabular-nums">{formatShortDate(app.createdAt)}</Td>
                        <Td>
                          <div className="flex flex-col items-start gap-1">
                            <StatusBadge status={app.status} />
                            <RoutingNote app={app} adminOffice={adminOffice} />
                          </div>
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
                const name = applicantName(app);
                return (
                  <li key={app._id}>
                    <button type="button" onClick={() => onOpen(app)} className="flex w-full items-start gap-3 p-4 text-left hover:bg-surface-muted focus-visible:-outline-offset-2">
                      <Avatar name={name} avatarUrl={app.avatarUrl} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-medium text-ink">{name}</p>
                          <StatusBadge status={app.status} />
                        </div>
                        <p className="mt-0.5 truncate text-xs text-ink-muted">{app.scholarshipName}</p>
                        <p className="mt-0.5 text-xs text-ink-subtle tabular-nums">{app.studentNumber} · {formatShortDate(app.createdAt)}</p>
                      </div>
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
    </>
  );
}

// Secondary line under the status: whether an office has sent it on, or
// whether the AdSO overrode the office.
function RoutingNote({ app, adminOffice }: { app: AdminApplication; adminOffice: string | null }) {
  if (adminOffice) {
    return app.forwardedAt
      ? <span className="flex items-center gap-1 text-xs text-ink-muted"><Send className="size-3" aria-hidden />Sent to AdSO</span>
      : <span className="text-xs text-ink-subtle">Not sent yet</span>;
  }
  if (isOfficeApp(app) && app.decisionOffice === 'LSO') {
    return <span className="flex items-center gap-1 text-xs text-warning-fg"><ShieldCheck className="size-3" aria-hidden />AdSO override</span>;
  }
  return null;
}

// Office admins only: sends every application the office hasn't sent yet,
// whatever its status (POST /api/applications/forward).
function SendToAdsoCard({ applications, getToken, onSent, statusTabs }: {
  applications: AdminApplication[];
  getToken: () => Promise<string | null>;
  onSent: () => Promise<void>;
  statusTabs: { key: AppStatus | 'All'; label: string }[];
}) {
  const [confirming, setConfirming] = useState(false);
  const [isForwarding, setIsForwarding] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  const unsent = applications.filter(a => !a.forwardedAt);
  const unsentSummary = statusTabs
    .filter(t => t.key !== 'All')
    .map(t => [t.label.toLowerCase(), unsent.filter(a => a.status === t.key).length] as const)
    .filter(([, c]) => c > 0);
  const lastForwardedAt = applications.reduce<string | null>(
    (latest, a) => (a.forwardedAt && (!latest || a.forwardedAt > latest) ? a.forwardedAt : latest), null
  );

  const send = async () => {
    setIsForwarding(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/applications/forward`, {
        method: 'POST',
        headers: await authHeaders(getToken, true)
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Failed to send applications to the AdSO.');
      setResult(`Sent ${plural(body.forwarded ?? 0, 'application')} to the AdSO.`);
      setConfirming(false);
      await onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send applications to the AdSO.');
    } finally {
      setIsForwarding(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-accent-subtle text-accent">
          <Send className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">
            {unsent.length > 0 ? `${plural(unsent.length, 'application')} not yet sent to the AdSO` : 'Everything has been sent to the AdSO'}
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">
            {unsent.length > 0
              ? 'Approved applications go to the AdSO automatically. This sends the rest, whatever their status. Your decisions stand unless the AdSO overrides them.'
              : lastForwardedAt ? `Last sent ${formatDateTime(lastForwardedAt)}. Approved applications are sent automatically.` : 'Approved applications are sent automatically.'}
          </p>
          {result && (
            <p role="status" className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-success-fg">
              <CheckCircle2 className="size-4" aria-hidden />{result}
            </p>
          )}
        </div>
        <Button
          variant="primary"
          icon={Send}
          disabled={unsent.length === 0}
          onClick={() => { setResult(''); setError(''); setConfirming(true); }}
        >
          Send to AdSO
        </Button>
      </div>

      {confirming && (
        <ConfirmDialog
          title={`Send ${plural(unsent.length, 'application')} to the AdSO?`}
          description="The AdSO will see them right away. Your decisions stand unless the AdSO overrides them."
          confirmLabel="Send to AdSO"
          confirmIcon={Send}
          onConfirm={send}
          onCancel={() => setConfirming(false)}
          busy={isForwarding}
          error={error}
        >
          <ul className="divide-y divide-line rounded-control ring-1 ring-inset ring-line">
            {unsentSummary.map(([label, count]) => (
              <li key={label} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="capitalize text-ink-muted">{label}</span>
                <span className="font-medium text-ink tabular-nums">{count}</span>
              </li>
            ))}
          </ul>
        </ConfirmDialog>
      )}
    </Card>
  );
}
