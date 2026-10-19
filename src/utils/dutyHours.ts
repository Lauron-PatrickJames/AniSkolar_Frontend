// Duty hours: shapes from /api/duty-hours (backend routes/dutyHours.js)
// and the sheet's arithmetic. summarize() mirrors utils/dutyHours.js on the
// server — keep the two in sync.

export type DutyTerm = '1st Semester' | '2nd Semester';
export const DUTY_TERMS: DutyTerm[] = ['1st Semester', '2nd Semester'];

export interface DutyEntry {
  _id?: string;
  date: string;     // YYYY-MM-DD
  timeIn: string;   // HH:mm, 24-hour
  timeOut: string;
  // Set by the office head in the office portal; unset = waiting. When the
  // office has a head in AniSkolar, only confirmed duties count.
  status?: 'confirmed' | 'flagged' | null;
  note?: string | null;
  reviewedAt?: string | null;
}

// Event credit counted in the totals: approved claims on credited events
// (added by the server), plus hours typed in on old logs.
export interface SpecialEvent {
  _id?: string;
  name: string;
  hours: number;
  eventId?: string;
}

// An event the scholarship office credits for duty hours (set up by the
// office or by COSA). The credit is the office's call, not the event's
// length. Mirrors the backend's models/DutyEvent.js.
export type EventOrganizer = 'Scholarship office' | 'COSA';
export const EVENT_ORGANIZERS: EventOrganizer[] = ['Scholarship office', 'COSA'];
export interface CreditedEvent {
  _id: string;
  name: string;
  date: string;            // YYYY-MM-DD
  organizer: EventOrganizer;
  creditHours: number;
}

// A scholar's claim to have attended one; only Approved ones count.
export type ClaimStatus = 'Pending' | 'Approved' | 'Rejected';
export interface EventClaim extends CreditedEvent {
  eventId: string;
  status: ClaimStatus;
  note: string | null;
  claimedAt: string | null;
  reviewedAt: string | null;
}

export interface DutyLog {
  _id?: string;
  studentNumber: string;
  academicYear: number;
  term: DutyTerm;
  officeAssigned?: string;
  deadline?: string;          // YYYY-MM-DD
  requiredHours?: number;
  entries: DutyEntry[];
  specialEvents: SpecialEvent[];
  updatedAt?: string;
}

// The scholar's SFAG grant percentage (set by the AdSO on their approved
// application), their year group (from the profile's year level) and, when
// the AdSO has set hours for that pair, the required hours that apply
// instead of the scholar's own.
export interface DutyRule {
  percentage: number | null;
  yearGroup: YearGroup | null;
  requiredHours: number | null;
}

export const GRANT_PERCENTAGES = [100, 75, 50, 25] as const;

// Duty hours differ by year level: 1st–2nd year render more than 3rd year
// and up (5th year counts with 3rd–4th). Same groups as the backend's
// models/DutySetting.js.
export type YearGroup = 'lower' | 'upper';
export const YEAR_GROUPS: { key: YearGroup; label: string }[] = [
  { key: 'lower', label: '1st–2nd year' },
  { key: 'upper', label: '3rd year and up' },
];
export const yearGroupLabel = (g: YearGroup | null) => YEAR_GROUPS.find(y => y.key === g)?.label ?? '';

export interface DutySummary {
  regularHours: number;
  specialHours: number;
  completed: number;
  required: number | null;
  remaining: number | null;
  weeklyNeeded: number | null;
  lastDutyDate: string | null;
  // The office has a head in AniSkolar: only confirmed duties count.
  confirmationRequired?: boolean;
  waitingHours?: number;
  waitingCount?: number;
  flaggedCount?: number;
}

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const round2 = (n: number) => Math.round(n * 100) / 100;
const utc = (date: string) => new Date(`${date}T00:00:00Z`);

export function isTimeRange(timeIn: string, timeOut: string): boolean {
  return /^\d{2}:\d{2}$/.test(timeIn) && /^\d{2}:\d{2}$/.test(timeOut) && minutes(timeOut) > minutes(timeIn);
}

// When duty may be rendered (AdSO, Oct 2026): Monday–Thursday 8:00 AM–6:00
// PM, Friday 8:00 AM–5:00 PM, never across the 12:00–1:00 PM lunch break,
// and at least 1.5 hours at a time. Returns the reason an entry breaks
// these, or null. Mirrors dutyRuleError in the backend's utils/dutyHours.js.
export const DUTY_RULES_TEXT = 'Mon–Thu 8:00 AM–6:00 PM, Fri 8:00 AM–5:00 PM, not across 12:00–1:00 PM, at least 1.5 hours per duty.';
export function dutyRuleError({ date, timeIn, timeOut }: Pick<DutyEntry, 'date' | 'timeIn' | 'timeOut'>): string | null {
  const day = utc(date).getUTCDay();
  if (day === 0 || day === 6) return 'Duty is only on weekdays (Monday to Friday).';
  const start = minutes(timeIn);
  const end = minutes(timeOut);
  if (start < 8 * 60) return 'Duty starts at 8:00 AM at the earliest.';
  if (day === 5 && end > 17 * 60) return 'Duty ends by 5:00 PM on Fridays.';
  if (end > 18 * 60) return 'Duty ends by 6:00 PM, Monday to Thursday.';
  if (start < 13 * 60 && end > 12 * 60) return "Duty can't include the 12:00–1:00 PM lunch break. Log the morning and the afternoon as separate duties.";
  if (end - start < 90) return 'A duty must be at least 1.5 hours.';
  return null;
}

export function entryHours(e: Pick<DutyEntry, 'timeIn' | 'timeOut'>): number {
  return isTimeRange(e.timeIn, e.timeOut) ? round2((minutes(e.timeOut) - minutes(e.timeIn)) / 60) : 0;
}

export function todayInManila(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(date);
}

// Mirrors summarize() in the backend's utils/dutyHours.js.
export function summarize(
  log: Pick<DutyLog, 'entries' | 'specialEvents' | 'requiredHours' | 'deadline'>,
  today = todayInManila(),
  { confirmationRequired = false }: { confirmationRequired?: boolean } = {},
): DutySummary {
  const counts = (e: DutyEntry) => !confirmationRequired || e.status === 'confirmed';
  const waiting = confirmationRequired ? log.entries.filter(e => !e.status) : [];
  const regular = log.entries.filter(counts).reduce((sum, e) => sum + entryHours(e), 0);
  const special = log.specialEvents.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
  const completed = round2(regular + special);
  const required = log.requiredHours ?? null;
  const remaining = required === null ? null : round2(required - completed);
  let weeklyNeeded: number | null = null;
  if (remaining !== null && log.deadline) {
    if (remaining <= 0) weeklyNeeded = 0;
    else {
      const daysLeft = Math.round((utc(log.deadline).getTime() - utc(today).getTime()) / 86400000) + 1;
      weeklyNeeded = daysLeft > 0 ? round2(remaining / Math.max(1, Math.ceil(daysLeft / 7))) : null;
    }
  }
  const dates = log.entries.map(e => e.date).sort();
  return {
    regularHours: round2(regular), specialHours: round2(special), completed, required, remaining, weeklyNeeded,
    lastDutyDate: dates[dates.length - 1] ?? null,
    confirmationRequired,
    waitingHours: round2(waiting.reduce((sum, e) => sum + entryHours(e), 0)),
    waitingCount: waiting.length,
    flaggedCount: log.entries.filter(e => e.status === 'flagged').length,
  };
}

// Weekly totals of regular duty, Sunday–Saturday like the office's sheet.
// Weeks without duty are left out.
export function weeklyTotals(entries: DutyEntry[]): { start: string; end: string; hours: number }[] {
  const byWeek = new Map<string, number>();
  for (const e of entries) {
    const d = utc(e.date);
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    const start = d.toISOString().slice(0, 10);
    byWeek.set(start, (byWeek.get(start) ?? 0) + entryHours(e));
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([start, hours]) => {
      const end = utc(start);
      end.setUTCDate(end.getUTCDate() + 6);
      return { start, end: end.toISOString().slice(0, 10), hours: round2(hours) };
    });
}

export function sortEntries(entries: DutyEntry[]): DutyEntry[] {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.timeIn.localeCompare(b.timeIn));
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function weekday(date: string): string {
  return WEEKDAYS[utc(date).getUTCDay()];
}

// "September 15" (or "September 15, 2025" with year).
export function formatDutyDate(date: string, withYear = false): string {
  return utc(date).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });
}

// "4:00 PM"
export function format12h(time: string): string {
  const h = Number(time.slice(0, 2));
  const m = time.slice(3, 5);
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

export function formatHours(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : n.toFixed(2);
}

export function termLabel(t: { academicYear: number; term: string }): string {
  return `${t.term}, AY ${t.academicYear}–${t.academicYear + 1}`;
}
