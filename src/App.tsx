import React, { useState, useEffect } from 'react';
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

export default function App() {
  // Authentication & Navigation state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentPage, setCurrentPage] = useState<string>('landing');
  const [selectedScholarshipId, setSelectedScholarshipId] = useState<string | null>(null);

  // Core Data States
  const [student, setStudent] = useState<StudentProfile>({
    studentNumber: '2024-10254',
    name: 'Christian Gabriel J. Del Rosario',
    course: 'BS in Computer Science',
    college: 'College of Science and Computer Studies',
    yearLevel: '3rd Year',
    email: 'christian.delrosario@dlsud.edu.ph',
    gpa: '3.68'
  });

  const [applications, setApplications] = useState<Application[]>([]);

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
            <PublicLayout onLoginClick={() => handleNavigate('login')}>
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
            <PublicLayout onLoginClick={() => handleNavigate('login')}>
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
