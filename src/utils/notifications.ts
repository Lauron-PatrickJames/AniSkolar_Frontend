import { StudentProfile, Application } from '../types';

export interface NotificationItem {
  id: string;
  text: string;
  time: string;
  isRead: boolean;
  // Which scholarship this notification is about, if any — lets the UI
  // navigate straight to the relevant scholarship when clicked. Absent for
  // notifications that aren't tied to a specific scholarship (e.g. welcome).
  scholarshipId?: string;
}

const READ_PREFIX = 'aniskolar_notif_read_';
const CLEARED_PREFIX = 'aniskolar_notif_cleared_';

function getIds(prefix: string, studentNumber: string): Set<string> {
  try {
    const raw = localStorage.getItem(prefix + studentNumber);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveIds(prefix: string, studentNumber: string, ids: Set<string>) {
  try {
    localStorage.setItem(prefix + studentNumber, JSON.stringify([...ids]));
  } catch {
    // storage can fail (private browsing, quota) — notifications just won't persist
  }
}

function statusMessage(scholarshipName: string, status: string): string {
  switch (status) {
    case 'Under Evaluation':
      return `Your application for ${scholarshipName} is under evaluation.`;
    case 'Approved':
      return `Great news! Your application for ${scholarshipName} has been approved.`;
    case 'Rejected':
      return `Your application for ${scholarshipName} was not approved this cycle.`;
    default:
      return `Your application for ${scholarshipName}: ${status}.`;
  }
}

export function buildNotifications(student: StudentProfile, applications: Application[]): NotificationItem[] {
  const cleared = getIds(CLEARED_PREFIX, student.studentNumber);
  const read = getIds(READ_PREFIX, student.studentNumber);
  const items: NotificationItem[] = [];

  // New/first-time student — no applications yet, hasn't dismissed the welcome message
  if (applications.length === 0 && !cleared.has('welcome')) {
    items.push({
      id: 'welcome',
      text: `Welcome to AniSkolar, ${student.name.split(' ')[0] || 'there'}! Explore available scholarships to get started.`,
      time: 'Just now',
      isRead: read.has('welcome')
    });
  }

  // One notification per application *status* — not just per application.
  // The id embeds the current status, so when an admin changes an
  // application from e.g. "Under Evaluation" (already read) to "Rejected",
  // that's a distinct id the student hasn't read yet, instead of silently
  // inheriting the read state of the old status under the same app id.
  applications.forEach(app => {
    const id = `app-${app.id}-${app.status}`;
    if (cleared.has(id)) return;
    items.push({
      id,
      text: statusMessage(app.scholarshipName, app.status),
      time: app.submittedAt,
      isRead: read.has(id),
      scholarshipId: app.scholarshipId
    });
  });

  return items;
}

export function markAllRead(studentNumber: string, ids: string[]) {
  const read = getIds(READ_PREFIX, studentNumber);
  ids.forEach(id => read.add(id));
  saveIds(READ_PREFIX, studentNumber, read);
}

// Marks a single notification read — used when the person clicks an
// individual item, as opposed to the "Mark all read" bulk action.
export function markRead(studentNumber: string, id: string) {
  const read = getIds(READ_PREFIX, studentNumber);
  read.add(id);
  saveIds(READ_PREFIX, studentNumber, read);
}

export function clearAll(studentNumber: string, ids: string[]) {
  const cleared = getIds(CLEARED_PREFIX, studentNumber);
  ids.forEach(id => cleared.add(id));
  saveIds(CLEARED_PREFIX, studentNumber, cleared);
}