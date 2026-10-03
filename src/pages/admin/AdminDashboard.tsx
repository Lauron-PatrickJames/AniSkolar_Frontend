import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth, useUser } from '@clerk/react';
import { OFFICE_LABELS, OFFICE_SHORT_LABELS } from '../../data/scholarships';
import { ScholarshipOffice } from '../../types';
import AdminAnalytics from './AdminAnalytics';
import AdminAnnouncements from './AdminAnnouncements';
import FseReportPage from './FseReportPage';
import ScholarshipsManager from './ScholarshipsManager';
import AdminLayout, { Crumb, MainView, VIEW_TITLES } from './AdminLayout';
import AdminScholars from './AdminScholars';
import ApplicationReview from './ApplicationReview';
import ApplicationsList, { DEFAULT_FILTERS, ListFilters } from './ApplicationsList';
import { filterApplications, statusTabFromUrl, writeStatusTabToUrl } from './applicationQueue';
import { API_BASE_URL, AdminApplication, applicantName, authHeaders, normalizeApplication, titleCaseName } from './adminData';

interface AdminDashboardProps {
  onLogout: () => void;
}

// Admin entry point: loads applications once for every section, owns the
// current view/selection, and renders it inside AdminLayout.
export default function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const { getToken } = useAuth();
  const { user } = useUser();
  // Office admins (publicMetadata.office, e.g. "POLCA") only get their
  // office's applications from the API; this just labels the view and
  // limits the scholarship filter to match.
  const adminOfficeRaw = (user?.publicMetadata as { office?: string } | undefined)?.office?.trim().toUpperCase();
  // 'ADSO' is the main office (sees its own applications plus whatever the
  // other offices send); the server refuses admins without an office.
  const adminOffice = adminOfficeRaw && adminOfficeRaw !== 'ADSO' ? adminOfficeRaw : null;
  const officeLabel = adminOffice
    ? (OFFICE_LABELS[adminOffice as keyof typeof OFFICE_LABELS] ?? adminOffice)
    : adminOfficeRaw === 'ADSO' ? OFFICE_SHORT_LABELS.LSO : 'No office assigned';

  // Announcements, scholarship management and the FSE report are the
  // AdSO's alone; the server enforces the same rule.
  const isAdso = adminOfficeRaw === 'ADSO';
  const hiddenViews: MainView[] = isAdso ? [] : ['announcements', 'scholarships', 'fse'];

  const [applications, setApplications] = useState<AdminApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [mainView, setMainView] = useState<MainView>('applications');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedScholar, setSelectedScholar] = useState<string | null>(null);
  // Scholarship open in the Scholarships page's detail view.
  const [selectedScholarship, setSelectedScholarship] = useState<string | null>(null);
  // The Applications tab is remembered in the URL (?tab=…).
  const [listFilters, setListFilters] = useState<ListFilters>(() => ({ ...DEFAULT_FILTERS, status: statusTabFromUrl() ?? DEFAULT_FILTERS.status }));
  // The list order when an application was opened, for Prev / Next. A
  // snapshot, so an application that leaves the tab after a decision
  // still has a "next".
  const [queueIds, setQueueIds] = useState<string[]>([]);

  // Set in the effect body (not only the initializer) so StrictMode's
  // mount → unmount → remount in development leaves it true.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const lastFetch = useRef(0);
  const fetchApplications = useCallback(async () => {
    lastFetch.current = Date.now();
    setIsLoading(true);
    setLoadError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/applications`, { headers: await authHeaders(getToken) });
      if (response.status === 403) {
        throw new Error((await response.json().catch(() => ({}))).error || 'This account does not have admin access.');
      }
      if (!response.ok) throw new Error('The server returned an error while loading applications.');
      const body = await response.json();
      if (mounted.current) setApplications(body.applications ?? []);
    } catch (err) {
      if (mounted.current) setLoadError(err instanceof Error ? err.message : 'Something went wrong loading applications.');
    } finally {
      if (mounted.current) setIsLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchApplications();
    // Load once on mount; later loads are explicit (Refresh / Try again).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The Applications pages refetch when the admin returns to the tab (other
  // pages handle their own); at most every 30 seconds.
  useEffect(() => {
    if (mainView !== 'applications') return;
    const onFocus = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetch.current > 30_000) fetchApplications();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [mainView, fetchApplications]);

  useEffect(() => {
    if (mainView === 'applications') writeStatusTabToUrl(listFilters.status);
  }, [mainView, listFilters.status]);

  const pendingCount = useMemo(() => applications.filter(a => a.status === 'Under Evaluation').length, [applications]);
  const selected = selectedId ? applications.find(a => a._id === selectedId) ?? null : null;

  // PATCH /:id/status doesn't run the avatarUrl lookup that GET / does, so
  // keep the avatar already in state rather than reverting to initials.
  // After a change, show the server's copy right away, then refetch.
  const mergeApplication = (updated: AdminApplication) => {
    const next = normalizeApplication(updated);
    setApplications(prev => prev.map(a => (a._id === next._id ? { ...next, avatarUrl: next.avatarUrl ?? a.avatarUrl } : a)));
    fetchApplications();
  };

  const openApplication = (id: string, queue: string[]) => {
    setQueueIds(queue);
    setSelectedId(id);
  };

  const navigate = (view: MainView) => {
    if (hiddenViews.includes(view)) return;
    setMainView(view);
    setSelectedId(null);
    setSelectedScholar(null);
    setSelectedScholarship(null);
  };

  const sectionCrumb: Crumb = { label: VIEW_TITLES[mainView], onClick: () => navigate(mainView) };
  const scholarName = selectedScholar
    ? (() => {
        const latest = applications
          .filter(a => a.studentNumber === selectedScholar)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        return latest ? titleCaseName(applicantName(latest)) : selectedScholar;
      })()
    : null;
  // Every page has its own heading, so the top bar shows no title on the
  // list pages; detail views (an application, a scholar) show a breadcrumb
  // back to their list.
  const breadcrumbs: Crumb[] =
    mainView === 'applications' && selected ? [sectionCrumb, { label: titleCaseName(applicantName(selected)) }]
    : mainView === 'lifecycle' && scholarName ? [sectionCrumb, { label: scholarName }]
    : [];

  // Opens the Applications list filtered to one scholarship.
  const viewApplicationsFor = (scholarshipId: string) => {
    navigate('applications');
    setListFilters({ ...DEFAULT_FILTERS, status: 'All', scholarship: scholarshipId });
  };

  // Prev / Next within the snapshot, skipping applications that are gone.
  const existingIds = new Set(applications.map(a => a._id));
  const queue = queueIds.filter(id => existingIds.has(id) || id === selectedId);
  const queueIndex = selectedId ? queue.indexOf(selectedId) : -1;
  const prevId = queueIndex > 0 ? queue[queueIndex - 1] : null;
  const nextId = queueIndex >= 0 && queueIndex < queue.length - 1 ? queue[queueIndex + 1] : null;

  let page: React.ReactNode;
  if (mainView === 'fse' && isAdso) {
    page = <FseReportPage getToken={getToken} />;
  } else if (mainView === 'analytics') {
    page = (
      <AdminAnalytics
        applications={applications}
        isLoading={isLoading}
        error={loadError}
        onRefresh={fetchApplications}
        ownOffice={(adminOffice ?? 'LSO') as ScholarshipOffice}
        onViewScholarship={viewApplicationsFor}
      />
    );
  } else if (mainView === 'lifecycle') {
    page = (
      <AdminScholars
        applications={applications}
        isLoading={isLoading}
        error={loadError}
        getToken={getToken}
        apiBaseUrl={API_BASE_URL}
        onRefresh={fetchApplications}
        selectedStudentNumber={selectedScholar}
        onSelectStudent={setSelectedScholar}
        onOpenApplication={applicationId => {
          navigate('applications');
          // Opened from a scholar, not the list: no Prev / Next.
          openApplication(applicationId, []);
        }}
      />
    );
  } else if (mainView === 'announcements' && isAdso) {
    page = <AdminAnnouncements />;
  } else if (mainView === 'scholarships' && isAdso) {
    page = (
      <ScholarshipsManager
        ownOffice="LSO"
        selectedId={selectedScholarship}
        onSelect={setSelectedScholarship}
        onViewApplications={viewApplicationsFor}
      />
    );
  } else if (selected) {
    page = (
      <ApplicationReview
        key={selected._id}
        app={selected}
        adminOffice={adminOffice}
        getToken={getToken}
        onBack={() => setSelectedId(null)}
        onUpdated={mergeApplication}
        position={queueIndex >= 0 ? { index: queueIndex, total: queue.length } : null}
        onPrev={prevId ? () => setSelectedId(prevId) : undefined}
        onNext={nextId ? () => setSelectedId(nextId) : undefined}
        onOpenScholar={studentNumber => { navigate('lifecycle'); setSelectedScholar(studentNumber); }}
        onAdminFieldsSaved={adminFields => setApplications(prev => prev.map(a => (a._id === selected._id ? { ...a, adminFields } : a)))}
      />
    );
  } else {
    page = (
      <ApplicationsList
        applications={applications}
        isLoading={isLoading}
        loadError={loadError}
        onReload={fetchApplications}
        onOpen={app => openApplication(app._id, filterApplications(applications, listFilters).map(a => a._id))}
        filters={listFilters}
        onFiltersChange={setListFilters}
        adminOffice={adminOffice}
        officeLabel={officeLabel}
      />
    );
  }

  return (
    <AdminLayout
      currentView={mainView}
      onNavigate={navigate}
      onLogout={onLogout}
      adminEmail={user?.primaryEmailAddress?.emailAddress}
      officeLabel={officeLabel}
      pendingCount={pendingCount}
      hiddenViews={hiddenViews}
      breadcrumbs={breadcrumbs}
      pageKey={`${mainView}:${selectedId ?? ''}:${selectedScholar ?? ''}:${selectedScholarship ?? ''}`}
    >
      {page}
    </AdminLayout>
  );
}
