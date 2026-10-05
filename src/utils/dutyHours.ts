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
}

export interface SpecialEvent {
  _id?: string;
  name: string;
  hours: number;
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

export interface DutySummary {
  regularHours: number;
  specialHours: number;
  completed: number;
  required: number | null;
  remaining: number | null;
  weeklyNeeded: number | null;
  lastDutyDate: string | null;
}

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const round2 = (n: number) => Math.round(n * 100) / 100;
const utc = (date: string) => new Date(`${date}T00:00:00Z`);

export function isTimeRange(timeIn: string, timeOut: string): boolean {
  return /^\d{2}:\d{2}$/.test(timeIn) && /^\d{2}:\d{2}$/.test(timeOut) && minutes(timeOut) > minutes(timeIn);
}

export function entryHours(e: Pick<DutyEntry, 'timeIn' | 'timeOut'>): number {
  return isTimeRange(e.timeIn, e.timeOut) ? round2((minutes(e.timeOut) - minutes(e.timeIn)) / 60) : 0;
}

export function todayInManila(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(date);
}

export function summarize(log: Pick<DutyLog, 'entries' | 'specialEvents' | 'requiredHours' | 'deadline'>, today = todayInManila()): DutySummary {
  const regular = log.entries.reduce((sum, e) => sum + entryHours(e), 0);
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
