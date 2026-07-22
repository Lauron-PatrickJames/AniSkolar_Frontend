import React, { useState, useEffect, useRef } from 'react';
import { StudentProfile, Application, Scholarship } from './types';
import { mockScholarships } from './data/scholarships';
import { mockAnnouncements } from './data/announcements';

// Layouts
import PublicLayout from './layouts/PublicLayout';
import StudentLayout from './layouts/StudentLayout';

// Public Pages
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';

// Student Portal Pages
import Dashboard from './pages/student/Dashboard';
import ExploreGrants from './pages/student/ExploreGrants';
import ScholarshipDetails from './pages/student/ScholarshipDetails';
import ApplyScholarship from './pages/student/ApplyScholarship';
import Announcements from './pages/student/Announcements';
import Profile from './pages/student/Profile';
import GPACalculator from './pages/student/GPACalculator';

// --- Persistence helpers -----------------------------------------------
// Two different lifetimes are needed here:
//
// 1. Data worth keeping indefinitely (student profile, submitted
//    applications) -> localStorage. Survives reloads AND closing/
//    reopening the browser entirely.
//
// 2. Navigation/session state (are you logged in, what page are you
//    on) -> sessionStorage. This survives a page reload (F5) so you
//    stay exactly where you were, but is automatically cleared by the
//    browser when the tab/window is closed - so a fresh launch later
//    always starts back at the public landing page, logged out.

const DATA_STORAGE_KEY = 'aniskolar_data';
const SESSION_STORAGE_KEY = 'aniskolar_session';

interface PersistedData {
  student: StudentProfile;
  applications: Application[];
}

interface PersistedSession {
  isLoggedIn: boolean;
  currentPage: string;
  selectedScholarshipId: string | null;
}

const defaultStudent: StudentProfile = {
  studentNumber: '202312345',
  name: 'Christian Gabriel J. Del Rosario',
  course: 'BS in Information Technology',
  college: 'College of Information and Computer Studies',
  yearLevel: '3rd Year',
  email: 'dcj@dlsud.edu.ph',
  gpa: '3.68'
};

function loadPersistedData(): PersistedData {
  try {
    const raw = localStorage.getItem(DATA_STORAGE_KEY);
    if (!raw) throw new Error('no saved data');
    const parsed = JSON.parse(raw);
    return {
      student: parsed.student ?? defaultStudent,
      applications: Array.isArray(parsed.applications) ? parsed.applications : []
    };
  } catch {
    return {
      student: defaultStudent,
      applications: []
    };
  }
}

function loadPersistedSession(): PersistedSession {
  try {
    // sessionStorage is scoped to the current tab/window session - it
    // will simply be empty after the browser/tab has been closed and
    // reopened, which is exactly what makes this "reload keeps you
    // logged in, fresh launch doesn't" behavior work.
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) throw new Error('no active session');
    const parsed = JSON.parse(raw);
    return {
      isLoggedIn: !!parsed.isLoggedIn,
      currentPage: typeof parsed.currentPage === 'string' ? parsed.currentPage : 'landing',
      selectedScholarshipId: parsed.selectedScholarshipId ?? null
    };
  } catch {
    return {
      isLoggedIn: false,
      currentPage: 'landing',
      selectedScholarshipId: null
    };
  }
}

// Shape of the state we stash into each browser history entry so that
// the back/forward buttons can restore it via the popstate event.
interface HistoryEntryState {
  page: string;
  scholarshipId: string | null;
  loggedIn: boolean;
}

export default function App() {
  const initialData = loadPersistedData();
  const initialSession = loadPersistedSession();

  // Authentication & Navigation state
  const [isLoggedIn, setIsLoggedIn] = useState(initialSession.isLoggedIn);
  const [currentPage, setCurrentPage] = useState<string>(initialSession.currentPage);
  const [selectedScholarshipId, setSelectedScholarshipId] = useState<string | null>(initialSession.selectedScholarshipId);

  // Core Data States
  const [student, setStudent] = useState<StudentProfile>(initialData.student);
  const [applications, setApplications] = useState<Application[]>(initialData.applications);

  // Refs used to coordinate the browser History API integration below,
  // without needing to add react-router or restructure navigation.
  const isFirstRender = useRef(true);
  const isPopStateUpdate = useRef(false);

  // Persist student profile and applications indefinitely.
  useEffect(() => {
    try {
      const toSave: PersistedData = { student, applications };
      localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      // Storage can fail (private browsing, quota, etc) - fail silently,
      // the app still works, it just won't survive a reload.
    }
  }, [student, applications]);

  // Persist navigation/session state for the current tab session only.
  useEffect(() => {
    try {
      const toSave: PersistedSession = { isLoggedIn, currentPage, selectedScholarshipId };
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      // Same fallback as above - session just won't survive a reload.
    }
  }, [isLoggedIn, currentPage, selectedScholarshipId]);

  // --- Browser History integration --------------------------------------
  // The app has no real routes/URLs; every "page" is just React state.
  // That means the browser's back/forward buttons have nothing of ours
  // in their history stack, so clicking back leaves the app entirely.
  // To fix that, we push a history entry every time the visible page
  // changes, and listen for popstate (back/forward) to restore state
  // from the entry the user navigated to.

  // One-time setup: seed the initial history entry with the restored
  // session state, and start listening for back/forward navigation.
  useEffect(() => {
    const initialState: HistoryEntryState = {
      page: currentPage,
      scholarshipId: selectedScholarshipId,
      loggedIn: isLoggedIn
    };
    window.history.replaceState(initialState, '', '');

    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as HistoryEntryState | null;
      if (!state) return;
      isPopStateUpdate.current = true;
      setIsLoggedIn(!!state.loggedIn);
      setCurrentPage(state.page || 'landing');
      setSelectedScholarshipId(state.scholarshipId ?? null);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push a new history entry whenever the visible page changes, so the
  // back/forward buttons move within AniSkolar instead of away from it.
  useEffect(() => {
    if (isFirstRender.current) {
      // The very first render already matches the entry we just set
      // via replaceState above - don't push a duplicate.
      isFirstRender.current = false;
      return;
    }
    if (isPopStateUpdate.current) {
      // This change came from the user clicking back/forward, not from
      // in-app navigation - the browser already owns this entry.
      isPopStateUpdate.current = false;
      return;
    }
    const nextState: HistoryEntryState = {
      page: currentPage,
      scholarshipId: selectedScholarshipId,
      loggedIn: isLoggedIn
    };
    window.history.pushState(nextState, '', '');
  }, [currentPage, selectedScholarshipId, isLoggedIn]);

  // Auto scroll to top on page navigation
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage, selectedScholarshipId]);

  // Login handler
  const handleLoginSuccess = (email: string) => {
    setIsLoggedIn(true);
    // Sync email from input (or fallback to default mock)
    setStudent(prev => ({
      ...prev,
      email: email || prev.email
    }));
    setCurrentPage('dashboard');
  };

  // Logout handler
  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentPage('landing');
    setSelectedScholarshipId(null);
  };

  // Navigation router action
  const handleNavigate = (page: string) => {
    setCurrentPage(page);
    if (page !== 'scholarship-details' && page !== 'apply-scholarship') {
      setSelectedScholarshipId(null);
    }
  };

  // View Details trigger
  const handleViewScholarship = (id: string) => {
    setSelectedScholarshipId(id);
    setCurrentPage('scholarship-details');
  };

  // Apply trigger
  const handleApplyScholarship = (id: string) => {
    if (!isLoggedIn) {
      // Force login first
      setCurrentPage('login');
      return;
    }
    setSelectedScholarshipId(id);
    setCurrentPage('apply-scholarship');
  };

  // Submit mock application handler
  const handleSubmitApplication = (newApp: Application) => {
    setApplications(prev => [newApp, ...prev]);
  };

  // Update profile handler
  const handleUpdateProfile = (updated: StudentProfile) => {
    setStudent(updated);
  };

  // Get current active scholarship
  const activeScholarship = mockScholarships.find(s => s.id === selectedScholarshipId) || mockScholarships[0];

  // Router layout binding helper
  const renderContent = () => {
    if (!isLoggedIn) {
      // --- PUBLIC VIEWS ---
      switch (currentPage) {
        case 'login':
          return (
            <LoginPage
              onLoginSuccess={handleLoginSuccess}
              onBackToLanding={() => handleNavigate('landing')}
            />
          );
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
                  // If logged out, scroll them down to scholarships preview
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
      // --- PRIVATE STUDENT PORTAL VIEWS ---
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

      return (
        <StudentLayout
          currentPage={currentPage}
          onNavigate={handleNavigate}
          student={student}
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
                    onViewDetails={handleViewScholarship}
                    onApply={handleApplyScholarship}
                  />
                );
              case 'gpa-calculator':
                return <GPACalculator />;
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