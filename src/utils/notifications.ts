import { StudentProfile, Application, Announcement } from '../types';
import { formatDay, formatTime } from '../data/officeForms';

// An application's date as the student reads it ("November 13, 2026",
// Manila time). Already-readable text (e.g. "Just now") is kept as is.
const readableDate = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' });
};

export interface NotificationItem {
  id: string;
  text: string;
  time: string;
  isRead: boolean;
  // Which scholarship this notification is about, if any — lets the UI
  // navigate straight to the relevant scholarship when clicked. Absent for
  // notifications that aren't tied to a specific scholarship (e.g. welcome).
  scholarshipId?: string;
  // For the preview pop-up: a short title, the application's status and
  // the office's message to the student (if any).
  title: string;
  status?: string;
  note?: string;
  // A student page to open instead of a scholarship (e.g. 'duty-hours').
  page?: string;
  kind?: 'announcement';
  postedBy?: string;
  // When it happened (ms), for newest-first order; 0 = no date.
  at?: number;
}

// This semester's duty hours, for the "hours done / evaluated" notices
// (SFAG scholars; App.tsx loads it from GET /api/duty-hours/mine).
export interface DutyNotice {
  termKey: string;      // e.g. "2026|1st Semester"
  termLabel: string;    // e.g. "1st Semester, A.Y. 2026–2027"
  office: string | null;
  complete: boolean;
  evaluated: boolean;
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

// What each status means, worded so "we received it" and "you're
// approved" can't be mistaken for each other (panel, Nov 2026).
function statusTitle(scholarshipName: string, status: string): string {
  switch (status) {
    case 'Under Evaluation': return `Application received: ${scholarshipName}`;
    case 'Approved': return `Approved: you’re a ${scholarshipName} scholar`;
    case 'Rejected': return `Not approved: ${scholarshipName}`;
    case 'Needs Revision': return `Changes needed: ${scholarshipName}`;
    default: return scholarshipName;
  }
}

function statusMessage(scholarshipName: string, status: string): string {
  switch (status) {
    case 'Under Evaluation':
      return `We received your application for the ${scholarshipName}. The office is now reviewing it. You're not a scholar yet; we'll notify you here once there's a decision.`;
    case 'Approved':
      return `Congratulations! The office reviewed and approved your application. You are now a ${scholarshipName} scholar. See My Scholarship for what's next.`;
    case 'Rejected':
      return `The office reviewed your application for the ${scholarshipName} and couldn't approve it this cycle.`;
    case 'Needs Revision':
      return `Your application for the ${scholarshipName} needs changes before the office can decide. Check what the office asked for and resubmit.`;
    default:
      return `Your application for the ${scholarshipName}: ${status}.`;
  }
}

const timeOf = (value?: string | null) => {
  const t = value ? Date.parse(value) : NaN;
  return Number.isNaN(t) ? 0 : t;
};

// Notifications can't be cleared any more (View all keeps every one);
// ones cleared before stay hidden from the bell only.
// Announcements notify for this long after they're published (at most
// this many, newest first), and never from before the student signed up.
const ANNOUNCEMENT_DAYS = 30;
const MAX_ANNOUNCEMENTS = 10;

export function buildNotifications(student: StudentProfile, applications: Application[], duty?: DutyNotice | null, { includeCleared = false, announcements = [] as Announcement[] } = {}): NotificationItem[] {
  const cleared = includeCleared ? new Set<string>() : getIds(CLEARED_PREFIX, student.studentNumber);
  const read = getIds(READ_PREFIX, student.studentNumber);
  const items: NotificationItem[] = [];

  // New/first-time student — no applications yet, hasn't dismissed the welcome message
  if (applications.length === 0 && !cleared.has('welcome')) {
    items.push({
      id: 'welcome',
      title: 'Welcome to AniSkolar',
      text: `Welcome to AniSkolar, ${student.name.split(' ')[0] || 'there'}! Explore available scholarships to get started.`,
      time: 'Just now',
      isRead: read.has('welcome'),
      at: Number.MAX_SAFE_INTEGER,
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
    // A decision is dated by when it was made; "received" by submission.
    const when = app.status === 'Under Evaluation' ? app.submittedAt : (app.reviewedAt || app.submittedAt);
    items.push({
      id,
      title: statusTitle(app.scholarshipName, app.status),
      text: app.status === 'Approved' && app.awardedDirectly
        ? `The office added you as a ${app.scholarshipName} scholar. See My Scholarship for the details.`
        : statusMessage(app.scholarshipName, app.status),
      time: readableDate(when ?? undefined),
      at: timeOf(when),
      isRead: read.has(id),
      scholarshipId: app.scholarshipId,
      status: app.status,
      note: app.reviewNote?.trim() || undefined,
    });
    // Decided: the "received" notice stays too, so the two are separate
    // steps (an office-added scholar never applied, so has none).
    const receivedId = `app-${app.id}-Under Evaluation`;
    if (app.status !== 'Under Evaluation' && !app.awardedDirectly && !cleared.has(receivedId)) {
      items.push({
        id: receivedId,
        title: statusTitle(app.scholarshipName, 'Under Evaluation'),
        text: `We received your application for the ${app.scholarshipName} and the office reviewed it.`,
        time: readableDate(app.submittedAt),
        at: timeOf(app.submittedAt),
        isRead: true,
        scholarshipId: app.scholarshipId,
        status: 'Received',
      });
    }
  });

  // An interview set (or moved) by the office (POLCA): one per schedule,
  // while the application is still being decided.
  applications.forEach(app => {
    if (!app.interview || !(app.status === 'Under Evaluation' || app.status === 'Needs Revision')) return;
    const { mode, date, time, venue } = app.interview;
    const id = `interview-${app.id}-${mode ?? ''}-${date}-${time ?? ''}-${venue ?? ''}`;
    if (cleared.has(id)) return;
    const when = `${formatDay(date)}${time ? `, ${formatTime(time)}` : ''}`;
    items.unshift({
      id,
      page: 'applications',
      title: `Interview: ${app.scholarshipName}`,
      text: `You're scheduled for an ${mode === 'online' ? 'online ' : mode === 'onsite' ? 'onsite ' : ''}interview on ${when}${venue ? (mode === 'online' ? '. The link is in My Applications' : ` at ${venue}`) : ''}. ${mode === 'online' ? 'Join' : 'Please come'} on time; if you can't make it, message the office.`,
      time: when,
      isRead: read.has(id),
      scholarshipId: app.scholarshipId,
      at: timeOf(app.reviewedAt) || timeOf(app.submittedAt),
    });
  });

  // Duty hours complete: the office head evaluates next; then evaluated.
  if (duty?.complete) {
    const id = `duty-${duty.evaluated ? 'evaluated' : 'done'}-${duty.termKey}`;
    if (!cleared.has(id)) {
      items.unshift({
        id,
        page: 'duty-hours',
        title: duty.evaluated ? 'Your office evaluated you' : 'Duty hours completed',
        text: duty.evaluated
          ? `${duty.office ?? 'Your office'} has evaluated your duty for the ${duty.termLabel}. Open Duty Hours to see your ratings and their remarks. It goes into your renewal for next semester.`
          : `You've completed your duty hours for the ${duty.termLabel}. ${duty.office ? `The head of ${duty.office}` : 'Your office'} has been asked to evaluate you; it goes into your renewal. Nothing else to do for duty hours this semester.`,
        time: duty.termLabel,
        isRead: read.has(id),
        // Undated: it's about now, so it goes on top.
        at: Number.MAX_SAFE_INTEGER,
      });
    }
  }

  // New announcements (office and, for SFAG scholars, their duty office's).
  const since = Math.max(
    Date.now() - ANNOUNCEMENT_DAYS * 86_400_000,
    Date.parse((student as { createdAt?: string }).createdAt ?? '') || 0,
  );
  const recent = announcements
    .filter(a => a.publishedAt && Date.parse(a.publishedAt) >= since)
    .sort((a, b) => Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!))
    .slice(0, MAX_ANNOUNCEMENTS)
    .filter(a => !cleared.has(`ann-${a.id}`));
  items.unshift(...recent.map(a => ({
    id: `ann-${a.id}`,
    page: 'announcements',
    title: a.title,
    text: a.description || a.content.slice(0, 280),
    time: a.date,
    isRead: read.has(`ann-${a.id}`),
    at: timeOf(a.publishedAt),
    status: undefined,
    note: undefined,
    kind: 'announcement' as const,
    postedBy: a.postedBy ?? undefined,
  })));

  // Latest first (stable, so same-time items keep their order).
  return items.map((n, i) => [n, i] as const).sort(([a, i], [b, j]) => (b.at ?? 0) - (a.at ?? 0) || i - j).map(([n]) => n);
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
