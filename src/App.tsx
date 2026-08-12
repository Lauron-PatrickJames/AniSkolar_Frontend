import React, { useState, useEffect, useRef } from 'react';
import { useUser, useAuth, useClerk } from '@clerk/react';
import { StudentProfile, Application, Scholarship } from './types';
import { mockScholarships } from './data/scholarships';
import { mockAnnouncements } from './data/announcements';

// Layouts
import PublicLayout from './layouts/PublicLayout';
import StudentLayout from './layouts/StudentLayout';

// Public Pages
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import CompleteProfilePage from './pages/CompleteProfilePage';
import AdminDashboard from './pages/AdminDashboard';

// Student Portal Pages
import Dashboard from './pages/student/Dashboard';
import ExploreGrants from './pages/student/ExploreGrants';
import ScholarshipDetails from './pages/student/ScholarshipDetails';
import ApplyScholarship from './pages/student/ApplyScholarship';
import Announcements from './pages/student/Announcements';
import Profile from './pages/student/Profile';
import GPACalculator from './pages/student/GPACalculator';

// --- Persistence helpers -----------------------------------------------
// Only page/navigation state lives here now — WHO is logged in is entirely
// Clerk's responsibility (it persists its own session via cookies), so
// there's no more isLoggedIn flag or cached student profile to keep in sync.
const SESSION_STORAGE_KEY = 'aniskolar_session';

// Reads from Vite's env at build time; falls back to localhost for local
// dev. Set VITE_API_BASE_URL in your .env (or your host's env config) once
// the backend isn't running on localhost anymore.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

interface PersistedSession {
  currentPage: string;
  selectedScholarshipId: string | null;
}

const defaultStudent: StudentProfile = {
  studentNumber: '',
  name: '',
  course: '',
  college: '',
  yearLevel: '',
  email: '',
  gpa: '',
  programCode: '',
  section: '',
  dateOfBirth: '',
  nationality: '',
  placeOfBirth: '',
  civilStatus: '',
  homeAddress: '',
  cityMunicipality: '',
  province: '',
  zipCode: '',
  country: '',
  telephoneNumber: '',
  mobileNumber: '',
  fatherName: '',
  motherName: '',
  guardianName: '',
  guardianRelationship: '',
  guardianAddress: '',
  guardianContactNo: ''
};

function loadPersistedSession(): PersistedSession {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) throw new Error('no active session');
    const parsed = JSON.parse(raw);
    return {
      currentPage: typeof parsed.currentPage === 'string' ? parsed.currentPage : 'landing',
      selectedScholarshipId: parsed.selectedScholarshipId ?? null
    };
  } catch {
    return {
      currentPage: 'landing',
      selectedScholarshipId: null
    };
  }
}

interface HistoryEntryState {
  page: string;
  scholarshipId: string | null;
}

// authPhase drives which screen shows while Clerk resolves who's signed in
// and while we check whether that Clerk account has a linked Student record
// yet (a brand-new sign-up hasn't filled in studentNumber/course/etc).
// 'error' covers the case where the /api/students/me lookup itself failed
// (network error, 5xx, etc) — kept distinct from 'signed-out' so a backend
// hiccup can never silently render the student shell with empty data.
type AuthPhase = 'loading' | 'signed-out' | 'needs-profile' | 'ready' | 'error';

export default function App() {
  const initialSession = loadPersistedSession();

  const { isLoaded: userLoaded, isSignedIn, user } = useUser();
  const { getToken } = useAuth();
  const { signOut } = useClerk();

  const [currentPage, setCurrentPage] = useState<string>(initialSession.currentPage);
  const [selectedScholarshipId, setSelectedScholarshipId] = useState<string | null>(initialSession.selectedScholarshipId);

  const [student, setStudent] = useState<StudentProfile>(defaultStudent);
  const [applications, setApplications] = useState<Application[]>([]);
  const [authPhase, setAuthPhase] = useState<AuthPhase>('loading');

  const isFirstRender = useRef(true);
  const isPopStateUpdate = useRef(false);

  const role = (user?.publicMetadata as { role?: string } | undefined)?.role === 'admin'
    ? 'admin'
    : 'student';

  useEffect(() => {
    try {
      const toSave: PersistedSession = { currentPage, selectedScholarshipId };
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      // Storage can fail (private browsing, quota, etc) - fail silently
    }
  }, [currentPage, selectedScholarshipId]);

  useEffect(() => {
    const initialState: HistoryEntryState = {
      page: currentPage,
      scholarshipId: selectedScholarshipId
    };
    window.history.replaceState(initialState, '', '');

    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as HistoryEntryState | null;
      if (!state) return;
      isPopStateUpdate.current = true;
      setCurrentPage(state.page || 'landing');
      setSelectedScholarshipId(state.scholarshipId ?? null);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (isPopStateUpdate.current) {
      isPopStateUpdate.current = false;
      return;
    }
    const nextState: HistoryEntryState = {
      page: currentPage,
      scholarshipId: selectedScholarshipId
    };
    window.history.pushState(nextState, '', '');
  }, [currentPage, selectedScholarshipId]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage, selectedScholarshipId]);

  // If an auth error is present in the URL (e.g. invalid_domain from the
  // SSO callback), force the signed-out view to the login page so LoginPage
  // can surface the user-facing error banner.
  useEffect(() => {
    if (!userLoaded || isSignedIn) return;
    const authErrorCode = new URLSearchParams(window.location.search).get('error');
    if (authErrorCode) {
      setCurrentPage('login');
    }
  }, [userLoaded, isSignedIn]);

  // Fetches applications for a given student number from MongoDB. Needs a
  // Clerk session token now that /api/applications/student/:studentNumber
  // is auth-protected server-side.
  const fetchApplicationsForStudent = async (studentNumber: string, token: string | null): Promise<Application[]> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/applications/student/${studentNumber}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await res.json();
      return res.ok ? data.applications : [];
    } catch {
      return [];
    }
  };

  // Whenever Clerk's own signed-in state changes (sign-in, sign-up, sign-out,
  // or just Clerk finishing session restore on a fresh page load), sync the
  // rest of the app to match. This replaces the old handleLoginSuccess —
  // there's no callback from LoginPage anymore, this effect is the single
  // source of truth for "what does being signed in mean for this app".
  useEffect(() => {
    if (!userLoaded) {
      setAuthPhase('loading');
      return;
    }

    if (!isSignedIn) {
      setAuthPhase('signed-out');
      setStudent(defaultStudent);
      setApplications([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        // Force-refresh the user object right after sign-in so
        // publicMetadata.role is guaranteed current before we branch on
        // it. Without this, a just-provisioned admin could theoretically
        // read as 'student' for one tick (if publicMetadata propagation
        // to the client lags session creation) and get sent through the
        // student profile-fetch path instead of straight to the admin
        // dashboard. Admin accounts are provisioned manually ahead of
        // time, so this should be rare in practice — this just removes
        // the possibility entirely.
        await user?.reload();
        const freshRole =
          (user?.publicMetadata as { role?: string } | undefined)?.role === 'admin'
            ? 'admin'
            : 'student';

        // Admins don't have a student record — nothing to fetch, nothing
        // to complete. Go straight to ready; AdminDashboard renders
        // unconditionally for this role regardless of currentPage.
        if (freshRole === 'admin') {
          if (!cancelled) setAuthPhase('ready');
          return;
        }

        const token = await getToken();
        const res = await fetch(`${API_BASE_URL}/api/students/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (cancelled) return;

        if (res.status === 404) {
          // Signed in with Clerk, but this is their first time — no
          // studentNumber/course/etc on file yet. Must complete profile
          // before reaching the portal.
          setAuthPhase('needs-profile');
          return;
        }
        if (!res.ok) throw new Error(`Failed to load profile (status ${res.status})`);

        const data = await res.json();
        setStudent(data.student);
        setAuthPhase('ready');

        const apps = await fetchApplicationsForStudent(data.student.studentNumber, token);
        if (!cancelled) setApplications(apps);

        if (currentPage === 'login' || currentPage === 'landing') {
          setCurrentPage('dashboard');
        }
      } catch (err) {
        // A failed profile fetch (network error, 5xx, etc) is NOT the same
        // as being signed out — the Clerk session is still perfectly
        // valid. Route to a dedicated error state instead of 'signed-out',
        // so this can never fall through the top-level guards below and
        // silently render the student shell over empty/default data.
        console.error('Failed to resolve auth state:', err);
        if (!cancelled) setAuthPhase('error');
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLoaded, isSignedIn]);

  // Logout handler — Clerk tears down its own session; we just reset the
  // app-specific state that was derived from it.
  const handleLogout = async () => {
    await signOut();
    setCurrentPage('landing');
    setSelectedScholarshipId(null);
    setApplications([]);
    setStudent(defaultStudent);
  };

  const handleNavigate = (page: string) => {
    setCurrentPage(page);
    if (page !== 'scholarship-details' && page !== 'apply-scholarship') {
      setSelectedScholarshipId(null);
    }
  };

  const handleViewScholarship = (id: string) => {
    setSelectedScholarshipId(id);
    setCurrentPage('scholarship-details');
  };

  const handleApplyScholarship = (id: string) => {
    if (!isSignedIn) {
      setCurrentPage('login');
      return;
    }
    setSelectedScholarshipId(id);
    setCurrentPage('apply-scholarship');
  };

  // Submit handler — optimistically shows the new application immediately,
  // then re-syncs with MongoDB to pick up the authoritative version
  // (e.g. server-generated referenceCode, timestamps).
  const handleSubmitApplication = async (newApp: Application) => {
    setApplications(prev => [newApp, ...prev]);

    const token = await getToken();
    const refreshed = await fetchApplicationsForStudent(student.studentNumber, token);
    if (refreshed.length > 0) {
      setApplications(refreshed);
    }
    // if refetch fails or returns empty, the optimistic update above stays as-is
  };

  // Persists profile edits to the backend (PATCH /api/students/me) instead
  // of only updating local state — previously an edit in Profile.tsx would
  // look saved (toast + updated UI) but vanish on refresh since nothing
  // was ever sent to MongoDB. Falls back to the previous local state if
  // the request fails, so a failed save doesn't silently look successful.
  const handleUpdateProfile = async (updated: StudentProfile) => {
    const previous = student;
    setStudent(updated);

    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/api/students/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(updated)
      });

      if (!res.ok) {
        setStudent(previous);
        return;
      }

      const data = await res.json();
      setStudent(data.student);
    } catch {
      setStudent(previous);
    }
  };

  const activeScholarship = mockScholarships.find(s => s.id === selectedScholarshipId) || mockScholarships[0];

  // Clerk is still figuring out whether there's an existing session —
  // avoid flashing the landing page or dashboard before that's known.
  if (!userLoaded || authPhase === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Signed in with Clerk, but no academic profile in MongoDB yet.
  // (Structurally unreachable for admins — they're set to 'ready'
  // directly in the effect above and never hit the 404 branch.)
  if (isSignedIn && authPhase === 'needs-profile') {
    return (
      <CompleteProfilePage
        onComplete={completedStudent => {
          setStudent(completedStudent);
          setAuthPhase('ready');
          setCurrentPage('dashboard');
        }}
      />
    );
  }

  // Signed in with Clerk, but the /api/students/me lookup itself failed
  // (network error, backend 5xx, etc). Deliberately NOT the student
  // dashboard and NOT the landing page — surfacing this honestly instead
  // of silently rendering an empty portal is the whole point of this state.
  if (isSignedIn && authPhase === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="text-center space-y-4 max-w-sm">
          <p className="font-display font-bold text-slate-900">Couldn't load your profile</p>
          <p className="text-xs text-slate-500 leading-relaxed">
            Something went wrong reaching the server. Please check your connection and try again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center font-display font-bold uppercase text-xs tracking-wider text-white bg-brand-green hover:bg-brand-green-dark px-5 py-3 rounded-xl transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    if (!isSignedIn) {
      switch (currentPage) {
        case 'login':
          return <LoginPage onBackToLanding={() => handleNavigate('landing')} />;
        case 'scholarship-details':
          return (
            <PublicLayout onLoginClick={() => handleNavigate('login')} onLogoClick={() => handleNavigate('landing')}>
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
                <ScholarshipDetails
                  scholarship={activeScholarship}
                  applications={applications}
                  onBack={() => handleNavigate('landing')}
                  onApply={handleApplyScholarship}
                />
              </div>
            </PublicLayout>
          );
        case 'landing':
        default:
          return (
            <PublicLayout onLoginClick={() => handleNavigate('login')} onLogoClick={() => handleNavigate('landing')}>
              <LandingPage
                onLoginClick={() => handleNavigate('login')}
                onExploreClick={() => {
                  const scElem = document.getElementById('scholarships');
                  if (scElem) {
                    scElem.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
                onViewScholarship={handleViewScholarship}
              />
            </PublicLayout>
          );
      }
    } else {
      const pageTitleMap: Record<string, string> = {
        dashboard: 'Student Portal Dashboard',
        explore: 'Scholarship Opportunities',
        'gpa-calculator': 'GPA Calculator',
        'scholarship-details': 'Scholarship Specifications',
        'apply-scholarship': 'Scholarship Digital Application',
        announcements: 'Office Announcements',
        profile: 'Student Profile Verification'
      };

      const title = pageTitleMap[currentPage] || 'Student Portal';

      if (role === 'admin') {
        return <AdminDashboard onLogout={handleLogout} />;
      }

      return (
        <StudentLayout
          currentPage={currentPage}
          onNavigate={handleNavigate}
          student={student}
          applications={applications}
          onLogout={handleLogout}
          pageTitle={title}
        >
          {(() => {
            switch (currentPage) {
              case 'explore':
                return (
                  <ExploreGrants
                    scholarships={mockScholarships}
                    applications={applications}
                    student={student}   // add this line
                    onViewDetails={handleViewScholarship}
                    onApply={handleApplyScholarship}
                  />
                );
              case 'gpa-calculator':
                return <GPACalculator student={student} />;
              case 'scholarship-details':
                return (
                  <ScholarshipDetails
                    scholarship={activeScholarship}
                    applications={applications}
                    onBack={() => handleNavigate('explore')}
                    onApply={handleApplyScholarship}
                  />
                );
              case 'apply-scholarship':
                return (
                  <ApplyScholarship
                    scholarship={activeScholarship}
                    student={student}
                    onBack={() => handleNavigate('scholarship-details')}
                    onSubmitApplication={handleSubmitApplication}
                  />
                );
              case 'announcements':
                return <Announcements announcements={mockAnnouncements} />;
              case 'profile':
                return (
                  <Profile
                    student={student}
                    onUpdateProfile={handleUpdateProfile}
                  />
                );
              case 'dashboard':
              default:
                return (
                  <Dashboard
                    scholarships={mockScholarships}
                    announcements={mockAnnouncements}
                    applications={applications}
                    student={student}
                    onNavigate={handleNavigate}
                    onViewScholarship={handleViewScholarship}
                  />
                );
            }
          })()}
        </StudentLayout>
      );
    }
  };

  return <div className="antialiased text-slate-800">{renderContent()}</div>;
}