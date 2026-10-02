import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth, useUser } from '@clerk/react';
import { OFFICE_LABELS, OFFICE_SHORT_LABELS } from '../../data/scholarships';
import AdminAnalytics from './AdminAnalytics';
import AdminAnnouncements from './AdminAnnouncements';
import AdminLayout, { Crumb, MainView, VIEW_TITLES } from './AdminLayout';
import AdminScholars from './AdminScholars';
import ApplicationReview from './ApplicationReview';
import ApplicationsList, { DEFAULT_FILTERS, ListFilters } from './ApplicationsList';
import { API_BASE_URL, AdminApplication, applicantName, authHeaders, normalizeApplication } from './adminData';

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

  const [applications, setApplications] = useState<AdminApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [mainView, setMainView] = useState<MainView>('applications');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedScholar, setSelectedScholar] = useState<string | null>(null);
  const [listFilters, setListFilters] = useState<ListFilters>(DEFAULT_FILTERS);

  // Set in the effect body (not only the initializer) so StrictMode's
  // mount → unmount → remount in development leaves it true.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const fetchApplications = useCallback(async () => {
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

  const pendingCount = useMemo(() => applications.filter(a => a.status === 'Under Evaluation').length, [applications]);
  const selected = selectedId ? applications.find(a => a._id === selectedId) ?? null : null;

  // PATCH /:id/status doesn't run the avatarUrl lookup that GET / does, so
  // keep the avatar already in state rather than reverting to initials.
  const mergeApplication = (updated: AdminApplication) => {
    const next = normalizeApplication(updated);
    setApplications(prev => prev.map(a => (a._id === next._id ? { ...next, avatarUrl: next.avatarUrl ?? a.avatarUrl } : a)));
  };

  const navigate = (view: MainView) => {
    setMainView(view);
    setSelectedId(null);
    setSelectedScholar(null);
  };

  const sectionCrumb: Crumb = { label: VIEW_TITLES[mainView], onClick: () => navigate(mainView) };
  const scholarName = selectedScholar
    ? (() => {
        const latest = applications
          .filter(a => a.studentNumber === selectedScholar)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        return latest ? applicantName(latest) : selectedScholar;
      })()
    : null;
  const breadcrumbs: Crumb[] =
    mainView === 'applications' && selected ? [sectionCrumb, { label: applicantName(selected) }]
    : mainView === 'lifecycle' && scholarName ? [sectionCrumb, { label: scholarName }]
    : [{ label: VIEW_TITLES[mainView] }];

  let page: React.ReactNode;
  if (mainView === 'analytics') {
    page = <AdminAnalytics applications={applications} isLoading={isLoading} error={loadError} onRefresh={fetchApplications} />;
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
      />
    );
  } else if (mainView === 'announcements') {
    page = <AdminAnnouncements />;
  } else if (selected) {
    page = (
      <ApplicationReview
        key={selected._id}
        app={selected}
        adminOffice={adminOffice}
        getToken={getToken}
        onBack={() => setSelectedId(null)}
        onUpdated={mergeApplication}
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
        onOpen={app => setSelectedId(app._id)}
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
      breadcrumbs={breadcrumbs}
      pageKey={`${mainView}:${selectedId ?? ''}:${selectedScholar ?? ''}`}
    >
      {page}
    </AdminLayout>
  );
}
