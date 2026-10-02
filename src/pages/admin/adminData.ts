import { OFFICE_LABELS, OFFICE_SHORT_LABELS } from '../../data/scholarships';
import { PolcaAdminFields } from '../../types';

// Types and pure helpers shared by every admin page. Shapes mirror
// models/Application.js as returned by GET /api/applications.

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

export type AppStatus = 'Under Evaluation' | 'Approved' | 'Rejected' | 'Needs Revision';

export const STATUS_OPTIONS: AppStatus[] = ['Under Evaluation', 'Needs Revision', 'Approved', 'Rejected'];

// A history entry is one lifecycle event on an application: initial
// submission, a student resubmission after revision was requested, an
// office sending it to the AdSO, or an admin review decision. Populated
// server-side; pre-migration applications may have no history at all.
export type HistoryStatus = AppStatus | 'Submitted' | 'Resubmitted' | 'Forwarded to LSO';

export interface HistoryEntry {
  status: HistoryStatus;
  note?: string;
  // 'student', 'system' (automatic events), or the admin's email.
  changedBy?: string;
  // Admin entries recorded since these fields were added: display name and
  // office code ('LSO', 'POLCA', 'ALUMNI'). Older entries lack them.
  changedByName?: string;
  changedByOffice?: string;
  changedAt: string;
}

export interface AdminDocument {
  docType: string;
  slotKey?: string;
  variant?: string;
  fileId: string;
  filename: string;
  mimetype: string;
  size: number;
}

export interface StandardInfo {
  firstName: string;
  // Added with separate name parts; older applications don't have it.
  middleName?: string;
  lastName: string;
  email: string;
  phone: string;
  studentNumber: string;
  program: string;
  yearLevel: string;
  gpa: string;
}

export interface SfagPersonalInfo {
  lastName: string; firstName: string; middleInitial: string; suffix: string;
  studentNumber: string; course: string; yearLevel: string;
  placeOfBirth: string; dateOfBirth: string; age: string; civilStatus: string;
  gender: string; nationality: string; isPwd: boolean; religion: string; specifyReligion: string;
  email?: string;
}

export interface SfagContactSchool {
  streetAddress: string; municipality: string; province: string; country: string;
  mobileNo: string; landlineNo: string; email: string;
  secondarySchool: string; schoolAddress: string; schoolType: string;
}

export interface SfagParent {
  fullName: string; occupation: string; company: string; companyTel: string;
  monthlyIncome: string; isSoloParent: boolean;
}

export interface SfagGuardian {
  fullName: string; occupation: string; monthlyIncome: string;
  relationship: string; contactNo: string;
}

export interface SfagParentsGuardian { father: SfagParent; mother: SfagParent; guardian: SfagGuardian; }

export interface SfagSibling {
  id: string; fullName: string; socialStatus: string; civilStatus: string; age: string;
  schoolOrCompany: string; schoolType: string; tuitionOrIncome: string; isDlsudScholar: boolean;
}

export interface SfagAssetsExpenses {
  houseAndLot: string; automobile: string; incomeSources: string;
  combinedNonTaxableIncome: string; affidavitNonFilingIncomeTax: string;
  waterBill: string; electricityBill: string; telephoneBill: string;
  mobilePhoneBill: string; internetBill: string; amortizationHouse: string; amortizationAuto: string;
}

export interface SfagAgreement { certifyConsulted: boolean; certifyAccuracy: boolean; }

export type FormType = 'standard' | 'sfag' | 'polca' | 'alumni';

export interface AdminApplication {
  _id: string;
  studentNumber: string;
  avatarUrl?: string;
  scholarshipId: string;
  scholarshipName: string;
  applicationFormType: FormType;
  office?: string;
  documents: AdminDocument[];
  referenceCode: string;
  status: AppStatus;
  reviewNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  history?: HistoryEntry[];
  standardInfo?: StandardInfo;
  personalInfo?: SfagPersonalInfo;
  contactSchool?: SfagContactSchool;
  parentsGuardian?: SfagParentsGuardian;
  siblings?: SfagSibling[];
  assetsExpenses?: SfagAssetsExpenses;
  agreement?: SfagAgreement;
  // Grant-form (POLCA / Alumni) only, rendered via toGrantDetails.
  eligibilityAnswers?: Record<string, unknown>;
  evaluationSheet?: Record<string, unknown>;
  adminFields?: PolcaAdminFields;
  // Set once a POLCA / Alumni office sends the application to the AdSO.
  forwardedAt?: string | null;
  forwardedBy?: string;
  // Office that recorded the current status; 'LSO' on an office
  // application means the AdSO overrode the office's decision.
  decisionOffice?: string;
  // Staff-only notes (POST /:id/internal-notes); never sent to applicants.
  internalNotes?: InternalNote[];
}

export interface InternalNote {
  text: string;
  by?: string;       // admin email
  byName?: string;
  office?: string;   // office code
  at: string;
}

// --- Applicant fields ------------------------------------------------------

// SFAG and the grant forms (POLCA / Alumni) keep the applicant's name,
// course and year level on personalInfo and the mobile number on
// contactSchool; only the standard form uses standardInfo.
function usesSectionForm(app: AdminApplication): boolean {
  return app.applicationFormType !== 'standard';
}

// The applicant's full name as submitted: first, middle (or the SFA
// form's middle initial) and last, joined from the separate fields — the
// raw value, for search and exports; display it with titleCaseName().
export function applicantName(app: AdminApplication): string {
  const join = (...parts: (string | undefined)[]) => parts.map(p => (p ?? '').trim()).filter(Boolean).join(' ');
  if (usesSectionForm(app) && app.personalInfo) {
    const p = app.personalInfo as SfagPersonalInfo & { middleName?: string };
    return join(p.firstName, p.middleName || p.middleInitial, p.lastName) || 'Unknown applicant';
  }
  if (app.standardInfo) {
    return join(app.standardInfo.firstName, app.standardInfo.middleName, app.standardInfo.lastName) || 'Unknown applicant';
  }
  return 'Unknown applicant';
}

export function applicantEmail(app: AdminApplication): string {
  if (!usesSectionForm(app)) return app.standardInfo?.email ?? '';
  // Grant forms store the email with the student data.
  return app.contactSchool?.email || app.personalInfo?.email || '';
}

export function applicantPhone(app: AdminApplication): string {
  return usesSectionForm(app) ? app.contactSchool?.mobileNo ?? '' : app.standardInfo?.phone ?? '';
}

export function applicantProgram(app: AdminApplication): string {
  return usesSectionForm(app) ? app.personalInfo?.course ?? '' : app.standardInfo?.program ?? '';
}

export function applicantYearLevel(app: AdminApplication): string {
  return usesSectionForm(app) ? app.personalInfo?.yearLevel ?? '' : app.standardInfo?.yearLevel ?? '';
}

// --- Offices -----------------------------------------------------------------

// Applications that belong to an office other than the AdSO (POLCA, Alumni).
export function isOfficeApp(app: { office?: string }): boolean {
  return !!app.office && app.office !== 'LSO';
}

export function officeName(office?: string): string {
  return (office && OFFICE_LABELS[office as keyof typeof OFFICE_LABELS]) || office || 'office';
}

// Sentence-case labels for history entries. 'Forwarded to LSO' is the
// stored value; it reads as "Sent to AdSO" (office name from the config).
export function historyLabel(status: HistoryStatus): string {
  switch (status) {
    case 'Forwarded to LSO': return `Sent to ${OFFICE_SHORT_LABELS.LSO}`;
    case 'Under Evaluation': return 'Under evaluation';
    case 'Needs Revision': return 'Needs revision';
    default: return status;
  }
}

export const FORM_TYPE_LABELS: Record<FormType, string> = {
  standard: 'Entrance form',
  sfag: 'SFA Grant form',
  polca: 'POLCA form',
  alumni: 'Alumni form'
};

export function formTypeLabel(type: string): string {
  return FORM_TYPE_LABELS[type as FormType] ?? type;
}

// --- Formatting --------------------------------------------------------------

function parse(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(iso?: string | null): string {
  const d = parse(iso);
  return d ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
}

export function formatShortDate(iso?: string | null): string {
  const d = parse(iso);
  return d ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
}

export function formatDateTime(iso?: string | null): string {
  const d = parse(iso);
  return d
    ? d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '—';
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function plural(count: number, noun: string, pluralNoun = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : pluralNoun}`;
}

export function documentUrl(fileId: string): string {
  return `${API_BASE_URL}/api/applications/documents/${fileId}`;
}

// Philippine academic-year convention: June through May. A submission in
// March 2026 falls in AY 2025–2026; one in September 2026 in AY 2026–2027.
// Derived from createdAt, since Application has no separate cycle field.
// Mirrored in the backend's utils/academicYear.js (used by the CSV export).
export function academicYearOf(iso: string): string {
  const d = parse(iso);
  if (!d) return 'Unknown';
  const startYear = d.getMonth() >= 5 ? d.getFullYear() : d.getFullYear() - 1;
  return `AY ${startYear}–${startYear + 1}`;
}

// "AY 2026–2027" → "2026–27", for compact table cells.
export function shortAcademicYear(label: string): string {
  const m = label.match(/(\d{4})–\d{2}(\d{2})$/);
  return m ? `${m[1]}–${m[2]}` : label;
}

// The distinct academic years (cycles) a set of applications was submitted
// in, oldest first.
export function academicCycles(applications: { createdAt: string }[]): string[] {
  return Array.from(new Set(applications.map(a => academicYearOf(a.createdAt)))).sort();
}

// A returning scholar applied in 2+ distinct academic years. Several
// applications within one cycle is still a first-time scholar. The list,
// the counts and the detail page all use this; the backend export uses the
// same rule (utils/academicYear.js).
export function isReturningScholar(applications: { createdAt: string }[]): boolean {
  return academicCycles(applications).length >= 2;
}

// Names are often stored in capitals ("JUAN DELA CRUZ"). Shows them in title
// case; a name typed in mixed case ("Juan de la Cruz") is kept as typed.
// Keep the raw value for search and exports.
export function titleCaseName(raw: string): string {
  const s = (raw ?? '').trim().replace(/\s+/g, ' ');
  const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (!letters || (letters !== letters.toUpperCase() && letters !== letters.toLowerCase())) return s;
  return s
    .toLowerCase()
    .replace(/(^|[\s\-'’(])([a-zà-ÿ])/g, (_m, before: string, ch: string) => before + ch.toUpperCase())
    .replace(/\b(Ii|Iii|Iv|Vi|Vii|Viii)\b/g, m => m.toUpperCase());
}

// --- Requests ----------------------------------------------------------------

export async function authHeaders(getToken: () => Promise<string | null>, json = false): Promise<Record<string, string>> {
  const token = await getToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

// The API returns Mongo's _id; keep the same string shape the list uses so
// merges by id match.
export function normalizeApplication(raw: AdminApplication): AdminApplication {
  const id = raw._id as unknown as { toString?: () => string } | string;
  return { ...raw, _id: typeof id === 'string' ? id : id?.toString?.() ?? String(id) };
}
