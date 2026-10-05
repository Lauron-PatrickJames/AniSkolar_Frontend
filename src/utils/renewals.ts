// Scholarship renewals: shapes returned by /api/renewals (backend
// routes/renewals.js, models/Renewal.js and models/RenewalPeriod.js) and
// the constants both the student and admin pages use.

export type RenewalTerm = '1st Semester' | '2nd Semester';
export const RENEWAL_TERMS: RenewalTerm[] = ['1st Semester', '2nd Semester'];

export type RenewalStatus = 'Under Evaluation' | 'Needs Revision' | 'Renewed' | 'Not Renewed' | 'Not Continuing';
export type RenewalDecision = 'Needs Revision' | 'Renewed' | 'Not Renewed';
export const RENEWAL_DECISIONS: RenewalDecision[] = ['Renewed', 'Needs Revision', 'Not Renewed'];

export const NOT_CONTINUING_REASONS = ['OJT / internship', 'Graduating', 'Transferring', 'Leave of absence', 'Other'] as const;
export type NotContinuingReason = typeof NOT_CONTINUING_REASONS[number];

// Suggested when the AdSO opens a period; it can change the list.
export const DEFAULT_RENEWAL_REQUIREMENTS = ['Certified True Copy of Grades (TCG)'];

export interface RenewalPeriod {
  _id: string;
  scholarshipId: string;
  scholarshipName: string;
  office: string;
  academicYear: number;      // start year: 2026 = AY 2026–2027
  term: RenewalTerm;
  open: boolean;
  deadline?: string;
  minGpa?: number;
  requiresEvaluation: boolean;
  requirements: string[];
  notes?: string;
  updatedAt?: string;
  updatedBy?: string;
  // Admin list only: renewals per status.
  counts?: Partial<Record<RenewalStatus, number>>;
}

export interface RenewalDocument {
  docType: string;
  fileId: string;
  filename: string;
  mimetype: string;
  size: number;
}

export interface RenewalHistoryEntry {
  status: 'Submitted' | 'Resubmitted' | RenewalStatus;
  note?: string;
  changedBy?: string;
  changedByName?: string;
  changedByOffice?: string;
  changedAt: string;
}

export interface RenewalEvaluation {
  scores: Record<string, number>;
  average: number;
  evaluatorName?: string;
  assignedOffice?: string;
  remarks?: string;
  enteredBy?: string;
  enteredAt?: string;
}

export interface Renewal {
  _id: string;
  periodId: string;
  studentNumber: string;
  scholarshipId: string;
  scholarshipName: string;
  office: string;
  academicYear: number;
  term: RenewalTerm;
  continuing: boolean;
  notContinuingReason?: NotContinuingReason;
  notContinuingDetails?: string;
  gpa?: number;
  hasFailingGrade?: boolean;
  documents: RenewalDocument[];
  // Admin responses only; the scholar's copy never includes it.
  evaluation?: RenewalEvaluation;
  status: RenewalStatus;
  reviewNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  history: RenewalHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  // Scholar responses only.
  period?: RenewalPeriod | null;
}

// Department head's Student Assistant evaluation (SFA Grant), rated 1–5.
// Mirrors EVALUATION_ITEMS in the backend's utils/renewals.js. The form has
// 19 items; the copy we have shows these 15 — add the rest in both places.
export const EVALUATION_ITEMS: { key: string; label: string }[] = [
  { key: 'jobKnowledge', label: 'Job knowledge' },
  { key: 'awareness', label: 'Awareness of what to do without constant supervision' },
  { key: 'knowledgeOfDuties', label: 'Knowledge of how to perform duties' },
  { key: 'jobPerformance', label: 'Job performance' },
  { key: 'organization', label: 'Organization' },
  { key: 'accuracy', label: 'Accuracy' },
  { key: 'speed', label: 'Speed' },
  { key: 'neatness', label: 'Neatness' },
  { key: 'attitude', label: 'Attitude' },
  { key: 'initiative', label: 'Initiative' },
  { key: 'conformance', label: 'Conformance to operational policies' },
  { key: 'cooperationCoSa', label: "Cooperation with co-SA's" },
  { key: 'cooperationPublic', label: 'Cooperation with public' },
  { key: 'acceptanceOfSupervision', label: 'Acceptance of supervision' },
  { key: 'reliability', label: 'Reliability and consistency in performance' },
];

// 5 Outstanding … 2 Needs improvement, as the office reads the form. The
// form's label for 1 isn't in our copy.
export const RATING_LABELS: Record<number, string> = {
  5: 'Outstanding',
  4: 'Very satisfactory',
  3: 'Satisfactory',
  2: 'Needs improvement',
  1: 'Poor',
};

// At least "Very satisfactory" on average to renew; below that the scholar
// is interviewed before a decision. Same as PASSING_AVERAGE on the server.
export const PASSING_AVERAGE = 4;

export function ratingLabel(average: number): string {
  return RATING_LABELS[Math.min(5, Math.max(1, Math.floor(average)))];
}

export function academicYearLabel(start: number): string {
  return `AY ${start}–${start + 1}`;
}

export function periodLabel(p: { academicYear: number; term: string }): string {
  return `${p.term}, ${academicYearLabel(p.academicYear)}`;
}

// The academic year (start year) a date falls in: June–May, like
// academicYearOf() in pages/admin/adminData.ts.
export function currentAcademicYear(date = new Date()): number {
  return date.getMonth() >= 5 ? date.getFullYear() : date.getFullYear() - 1;
}

// Whether a reported GPA meets the period's minimum (higher is better).
export function meetsGpa(gpa: number | undefined, minGpa: number | undefined): boolean | null {
  if (gpa === undefined || gpa === null || minGpa === undefined || minGpa === null) return null;
  return gpa >= minGpa;
}

export function formatGpa(gpa?: number | null): string {
  return gpa === undefined || gpa === null ? '—' : gpa.toFixed(2);
}
