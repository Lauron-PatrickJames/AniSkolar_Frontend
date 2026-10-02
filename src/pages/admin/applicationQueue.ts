import { AdminApplication, AppStatus, applicantName, titleCaseName } from './adminData';

// The Applications list's filters, sorting and "waiting" time. The list and
// the detail page's Prev / Next both use filterApplications(), so stepping
// through applications follows exactly what the list shows.

export type StatusTab = AppStatus | 'All';
export type OfficeFilter = 'All' | 'LSO' | 'POLCA' | 'ALUMNI';
export type QueueSort = 'waiting' | 'newest' | 'oldest' | 'name';

export interface ListFilters {
  search: string;
  status: StatusTab;
  scholarship: string;
  // AdSO only: which office the application came through.
  office: OfficeFilter;
  sort: QueueSort;
  page: number;
}

// The review queue: under evaluation, longest waiting first.
export const DEFAULT_FILTERS: ListFilters = {
  search: '', status: 'Under Evaluation', scholarship: 'All', office: 'All', sort: 'waiting', page: 1
};

export const SORT_LABELS: Record<QueueSort, string> = {
  waiting: 'Longest waiting',
  oldest: 'Oldest first',
  newest: 'Newest first',
  name: 'Name (A–Z)'
};

// Days in a queue before the Waiting column highlights an application.
export const WAITING_HIGHLIGHT_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;
const time = (iso?: string | null) => (iso ? new Date(iso).getTime() : NaN);

// When the application last changed status (submitted, resubmitted, a
// decision, or sent to the AdSO) — the start of its current wait.
export function lastStatusChange(app: AdminApplication): string {
  const latest = (app.history ?? []).reduce<string | null>(
    (acc, h) => (!acc || time(h.changedAt) > time(acc) ? h.changedAt : acc),
    null
  );
  return latest ?? app.createdAt;
}

export function waitingDays(app: AdminApplication, now = Date.now()): number {
  const since = time(lastStatusChange(app));
  return Number.isNaN(since) ? 0 : Math.max(0, Math.floor((now - since) / DAY_MS));
}

export function filterApplications(applications: AdminApplication[], filters: ListFilters): AdminApplication[] {
  const q = filters.search.trim().toLowerCase();
  const list = applications.filter(app => {
    if (filters.status !== 'All' && app.status !== filters.status) return false;
    if (filters.scholarship !== 'All' && app.scholarshipId !== filters.scholarship) return false;
    if (filters.office !== 'All' && (app.office || 'LSO') !== filters.office) return false;
    if (q) {
      return applicantName(app).toLowerCase().includes(q) ||
        app.studentNumber.toLowerCase().includes(q) ||
        app.referenceCode.toLowerCase().includes(q);
    }
    return true;
  });
  const byCreated = (a: AdminApplication, b: AdminApplication) => time(a.createdAt) - time(b.createdAt);
  switch (filters.sort) {
    case 'waiting':
      return list.sort((a, b) => time(lastStatusChange(a)) - time(lastStatusChange(b)) || byCreated(a, b));
    case 'oldest':
      return list.sort(byCreated);
    case 'newest':
      return list.sort((a, b) => byCreated(b, a));
    case 'name':
      return list.sort((a, b) => titleCaseName(applicantName(a)).localeCompare(titleCaseName(applicantName(b))) || byCreated(a, b));
  }
}

// --- The tab in the URL (?tab=under-evaluation) --------------------------------

const TAB_SLUGS: Record<StatusTab, string> = {
  'Under Evaluation': 'under-evaluation',
  'Needs Revision': 'needs-revision',
  'Approved': 'approved',
  'Rejected': 'rejected',
  'All': 'all'
};

export function statusTabFromUrl(search = window.location.search): StatusTab | null {
  const slug = new URLSearchParams(search).get('tab');
  const match = (Object.entries(TAB_SLUGS) as [StatusTab, string][]).find(([, s]) => s === slug);
  return match ? match[0] : null;
}

// Keeps the rest of the URL as is; replaceState, so tabs don't pile up in
// the browser history.
export function writeStatusTabToUrl(status: StatusTab) {
  const url = new URL(window.location.href);
  if (url.searchParams.get('tab') === TAB_SLUGS[status]) return;
  url.searchParams.set('tab', TAB_SLUGS[status]);
  window.history.replaceState(window.history.state, '', url);
}

