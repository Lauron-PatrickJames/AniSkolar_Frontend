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
const DATA_STORAGE_KEY = 'aniskolar_data';
const SESSION_STORAGE_KEY = 'aniskolar_session';

// Change this when you deploy the backend somewhere other than localhost
const API_BASE_URL = 'http://localhost:5000';

interface PersistedData {
  student: StudentProfile;
  // applications removed — now sourced live from MongoDB per logged-in student, not cached locally
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
      student: parsed.student ?? defaultStudent
    };
  } catch {
    return {
      student: defaultStudent
    };
  }
}

function loadPersistedSession(): PersistedSession {
  try {
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

interface HistoryEntryState {
  page: string;
  scholarshipId: string | null;
  loggedIn: boolean;
}

export default function App() {
  const initialData = loadPersistedData();
  const initialSession = loadPersistedSession();

  const [isLoggedIn, setIsLoggedIn] = useState(initialSession.isLoggedIn);
  const [currentPage, setCurrentPage] = useState<string>(initialSession.currentPage);
  const [selectedScholarshipId, setSelectedScholarshipId] = useState<string | null>(initialSession.selectedScholarshipId);

  const [student, setStudent] = useState<StudentProfile>(initialData.student);
  const [applications, setApplications] = useState<Application[]>([]); // starts empty, gets populated on login

  const isFirstRender = useRef(true);
  const isPopStateUpdate = useRef(false);

  useEffect(() => {
    try {
      const toSave: PersistedData = { student };
      localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      // Storage can fail (private browsing, quota, etc) - fail silently
    }
  }, [student]); // no longer depends on `applications`

  useEffect(() => {
    try {
      const toSave: PersistedSession = { isLoggedIn, currentPage, selectedScholarshipId };
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(toSave));
    } catch {
      // Same fallback as above
    }
  }, [isLoggedIn, currentPage, selectedScholarshipId]);

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
      scholarshipId: selectedScholarshipId,
      loggedIn: isLoggedIn
    };
    window.history.pushState(nextState, '', '');
  }, [currentPage, selectedScholarshipId, isLoggedIn]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage, selectedScholarshipId]);

  // Fetches applications for a given student number from MongoDB. Shared
  // by login and post-submission refresh so both paths stay in sync with
  // the backend instead of trusting local/optimistic state alone.
  const fetchApplicationsForStudent = async (studentNumber: string): Promise<Application[]> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/applications/student/${studentNumber}`);
      const data = await res.json();
      return res.ok ? data.applications : [];
    } catch {
      return [];
    }
  };

  // Login handler — replaces student state entirely with the logged-in
  // account's data and fetches only that student's applications from
  // MongoDB, rather than trusting whatever was left over locally.
  const handleLoginSuccess = async (loggedInStudent: StudentProfile) => {
    setIsLoggedIn(true);
    setStudent(loggedInStudent);

    const studentApplications = await fetchApplicationsForStudent(loggedInStudent.studentNumber);
    setApplications(studentApplications);

    setCurrentPage('dashboard');
  };

  // Logout handler — clears cached auth/profile/application data so the
  // next login (possibly a different account) never starts with leftovers.
  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentPage('landing');
    setSelectedScholarshipId(null);
    setApplications([]);
    localStorage.removeItem('aniskolar_student');
    localStorage.removeItem('aniskolar_token');
    sessionStorage.removeItem('aniskolar_token');
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
    if (!isLoggedIn) {
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

    const refreshed = await fetchApplicationsForStudent(student.studentNumber);
    if (refreshed.length > 0) {
      setApplications(refreshed);
    }
    // if refetch fails or returns empty, the optimistic update above stays as-is
  };

  const handleUpdateProfile = (updated: StudentProfile) => {
    setStudent(updated);
  };

  const activeScholarship = mockScholarships.find(s => s.id === selectedScholarshipId) || mockScholarships[0];

  const renderContent = () => {
    if (!isLoggedIn) {
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