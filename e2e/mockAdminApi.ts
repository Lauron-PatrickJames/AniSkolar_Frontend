import type { Page, Route } from '@playwright/test';
import { API } from './mockApi';

// A fake API for the admin console tests. Three applications from
// fictional students; every other admin request gets an empty answer.
// Nothing reaches the real backend.

const standard = (n: number, first: string, last: string) => ({
  firstName: first, lastName: last, email: `${first.toLowerCase()}${n}@dlsud.edu.ph`, phone: '09170000000',
  studentNumber: `20230000${n}`, program: 'Bachelor of Science in Information Technology', yearLevel: '3rd Year', gpa: '1.75',
});

export const APPLICATIONS = [
  {
    _id: 'a1', studentNumber: '202300001', scholarshipId: 's2', scholarshipName: 'Entrance Scholarship', applicationFormType: 'standard',
    office: 'LSO', documents: [], referenceCode: 'ENT-2026-0001', status: 'Under Evaluation', createdAt: '2026-11-02T02:00:00.000Z',
    standardInfo: standard(1, 'Maria', 'Santos'), history: [{ status: 'Submitted', at: '2026-11-02T02:00:00.000Z' }],
  },
  {
    _id: 'a2', studentNumber: '202300002', scholarshipId: 's5', scholarshipName: 'Academic Scholarship', applicationFormType: 'standard',
    office: 'LSO', documents: [], referenceCode: 'ACA-2026-0002', status: 'Approved', createdAt: '2026-10-20T02:00:00.000Z',
    reviewedAt: '2026-10-25T02:00:00.000Z', standardInfo: standard(2, 'Jose', 'Reyes'),
  },
  {
    _id: 'a3', studentNumber: '202300003', scholarshipId: 's2', scholarshipName: 'Entrance Scholarship', applicationFormType: 'standard',
    office: 'LSO', documents: [], referenceCode: 'ENT-2026-0003', status: 'Needs Revision', createdAt: '2026-10-28T02:00:00.000Z',
    reviewNote: 'Upload a clearer copy of your grades.', standardInfo: standard(3, 'Ana', 'Garcia'),
  },
];

// An office's announcement waiting for the AdSO's approval.
export const PENDING_ANNOUNCEMENT = {
  id: 'an-pending', title: 'POLCA scholars’ orientation', date: 'November 10, 2026',
  description: 'Orientation for new POLCA scholars on Friday.', content: 'Orientation for new POLCA scholars is on Friday at 2 PM in the ICTC lobby.',
  category: 'Event', scholarshipId: 's3', office: 'POLCA', dutyOffice: null, status: 'pending',
  review: { requestedStatus: 'published', requestedAt: '2026-11-10T02:00:00.000Z', requestedBy: 'polca@dlsud.edu.ph', decision: null, decidedAt: null, decidedBy: null, note: null },
  isPinned: false, publishedAt: null, scheduledFor: null, createdBy: 'polca@dlsud.edu.ph', createdAt: '2026-11-10T02:00:00.000Z', updatedAt: '2026-11-10T02:00:00.000Z',
  images: [], fbEnabled: false, fbStatus: 'not_posted', fbPostId: null, fbPermalink: null, fbError: null, fbLastSyncedAt: null,
  emailEnabled: true, emailAudience: 'scholars', emailStatus: 'not_sent', emailTotal: 0, emailSent: 0,
};

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

// decisions: each "approve" / "return" the AdSO sends.
export async function mockAdminApi(page: Page, { decisions = [] as string[] } = {}) {
  let pending = [PENDING_ANNOUNCEMENT];
  await page.route(`${API}/api/**`, route => {
    const { pathname } = new URL(route.request().url());
    const decided = pathname.match(/^\/api\/announcements\/([^/]+)\/(approve|return)$/);
    if (decided && route.request().method() === 'POST') {
      decisions.push(decided[2]);
      pending = pending.filter(a => a.id !== decided[1]);
      return json(route, { announcement: { ...PENDING_ANNOUNCEMENT, status: decided[2] === 'approve' ? 'published' : 'draft' } });
    }
    if (route.request().method() !== 'GET') return json(route, { ok: true });
    switch (pathname) {
      case '/api/applications': return json(route, { applications: APPLICATIONS });
      case '/api/scholarships': case '/api/scholarships/admin': return json(route, { scholarships: [] });
      case '/api/announcements': case '/api/announcements/feed': return json(route, { announcements: [] });
      case '/api/announcements/review': return json(route, { announcements: pending });
      case '/api/messages/admin/unread': return json(route, { unread: 0 });
      case '/api/messages/admin/threads': return json(route, { threads: [] });
      case '/api/reply-templates': return json(route, { templates: [] });
      case '/api/students': return json(route, { students: [], total: 0 });
      case '/api/renewals/admin/periods': return json(route, { periods: [] });
      case '/api/fse': return json(route, { reports: [] });
      case '/api/automation':
        return json(route, {
          settings: { dutyReminders: true, officeHeadReminders: true, deadlineReminders: true, updatedBy: null, updatedAt: null },
          lastRuns: {},
          outbox: { queued: 0, sentLast7Days: 0, failedLast7Days: 0, perMinute: 10, mailEnabled: false },
        });
      case '/api/automation/outbox': return json(route, { emails: [] });
      default: return json(route, {});
    }
  });
}
