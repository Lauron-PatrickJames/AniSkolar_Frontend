import type { Page, Route } from '@playwright/test';

// A fake AniSkolar API for the signed-in tests. Every request to the
// backend is answered here, so tests never read or change real data and
// always see the same scholar. Only Clerk (the sign-in itself) is real.
//
// The scholar: an SFAG grantee at 50%, 4th year, duty hours done (63 of 55)
// and evaluated, no renewal open. Fictional names and numbers only.

export const API = process.env.VITE_API_BASE_URL || 'http://localhost:5000';

export const STUDENT = {
  studentNumber: '202300001',
  name: 'Juan Miguel Dela Cruz',
  firstName: 'Juan Miguel',
  lastName: 'Dela Cruz',
  course: 'Bachelor of Science in Information Technology',
  college: 'College of Information and Computer Studies',
  yearLevel: '4th Year',
  email: 'dja1234@dlsud.edu.ph',
  gpa: '1.50',
};

const SFAG = { scholarshipId: 's1', scholarshipName: 'Student Financial Aid Grant (SFAG)' };

const APPLICATION = {
  _id: 'app-1',
  ...SFAG,
  status: 'Approved',
  personalInfo: { firstName: 'Juan Miguel', lastName: 'Dela Cruz', email: STUDENT.email, phone: '', studentNumber: STUDENT.studentNumber },
  program: STUDENT.course,
  yearLevel: STUDENT.yearLevel,
  gpa: STUDENT.gpa,
  documents: [],
  createdAt: '2026-08-01T02:00:00.000Z',
  referenceCode: 'SFAG-2026-0001',
  sfagPercentage: 50,
};

// 12 five-hour duties (60 h) plus a 3-hour event: 63 of the 55 required.
const ENTRIES = Array.from({ length: 12 }, (_, i) => ({
  _id: `d${i}`,
  date: `2026-10-${String(5 + i).padStart(2, '0')}`,
  timeIn: '13:00',
  timeOut: '18:00',
  status: 'confirmed',
}));

const DUTY = {
  current: { academicYear: 2026, term: '1st Semester' },
  terms: [{ academicYear: 2026, term: '1st Semester' }],
  log: {
    studentNumber: STUDENT.studentNumber,
    academicYear: 2026,
    term: '1st Semester',
    officeAssigned: 'Office of the University Registrar',
    deadline: '2026-12-05',
    requiredHours: 55,
    entries: ENTRIES,
    specialEvents: [{ name: 'Assembly', hours: 3 }],
  },
  summary: { regularHours: 60, specialHours: 3, completed: 63, required: 55, remaining: -8, weeklyNeeded: 0, lastDutyDate: '2026-10-16', confirmationRequired: false, waitingHours: 0, waitingCount: 0, flaggedCount: 0 },
  rule: { percentage: 50, yearGroup: 'upper', requiredHours: 55 },
  claims: [],
  events: [],
  evaluated: false,
  evaluation: null,
};

const ANNOUNCEMENTS = [
  { id: 'an1', title: 'No duty on Friday', date: '2026-11-08', description: 'Take note', content: 'Offices are closed on Friday.', category: 'General', imageUrls: [], postedBy: 'Office of the University Registrar' },
  { id: 'an2', title: 'Renewal opens next week', date: '2026-11-05', description: 'Prepare your grades', content: 'Have your Certified True Copy of Grades ready.', category: 'Deadline', imageUrls: [] },
];

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

export async function mockApi(page: Page) {
  await page.route(`${API}/api/**`, route => {
    const { pathname } = new URL(route.request().url());
    switch (pathname) {
      case '/api/students/me': return json(route, { student: STUDENT });
      case '/api/students/me/holdings':
        return json(route, { held: [SFAG], exclusive: SFAG, slotsFull: [], details: [{ ...SFAG, grantPercentage: 50, approvedAt: '2026-10-29T02:00:00.000Z', referenceCode: 'SFAG-2026-0001' }] });
      case '/api/office/me': return json(route, { error: 'Not an office head' }, 404);
      case `/api/applications/student/${STUDENT.studentNumber}`: return json(route, { applications: [APPLICATION] });
      case '/api/scholarships': return json(route, { scholarships: [] });
      case '/api/announcements/feed': return json(route, { announcements: ANNOUNCEMENTS });
      case '/api/announcements/feed/duty': return json(route, { announcements: [] });
      case '/api/duty-hours/mine': return json(route, DUTY);
      case '/api/renewals/mine': return json(route, { available: [], renewals: [] });
      case '/api/messages/mine/unread': return json(route, { unread: 0 });
      case '/api/messages/mine': return json(route, { messages: [] });
      default: return json(route, {});
    }
  });
}
