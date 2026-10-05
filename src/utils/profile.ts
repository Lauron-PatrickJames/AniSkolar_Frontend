import { GuardianType, StudentProfile, VerificationGroup } from '../types';
import { collegeName, findProgram } from '../data/programs';

// Display and validation helpers for the student profile. The backend
// (routes/students.js) validates and normalizes the same fields.

// --- Phone numbers ---------------------------------------------------------------

// Philippine mobile -> 09XXXXXXXXX, or null. Accepts 09XXXXXXXXX,
// +639XXXXXXXXX or 639XXXXXXXXX, with spaces or dashes. Same rule as the
// server's normalizePhMobile.
export function normalizePhMobile(value: string): string | null {
  const m = value.replace(/[\s-]/g, '').match(/^(?:\+?63|0)(9\d{9})$/);
  return m ? `0${m[1]}` : null;
}

// Any contact number: a PH mobile is normalized; otherwise 7–15 digits with
// the usual punctuation (landlines) are accepted as typed.
export function isValidContactNumber(value: string): boolean {
  if (normalizePhMobile(value)) return true;
  const digits = value.replace(/\D/g, '').length;
  return /^[\d\s()+-]+$/.test(value.trim()) && digits >= 7 && digits <= 15;
}

// "09499434733" -> "0949 943 4733"; anything else is shown as stored.
export function formatPhone(value?: string | null): string {
  if (!value) return '';
  const mobile = normalizePhMobile(value);
  return mobile ? `${mobile.slice(0, 4)} ${mobile.slice(4, 7)} ${mobile.slice(7)}` : value;
}

// --- Dates ---------------------------------------------------------------------------

// Stored dates are midnight UTC; show the calendar date, e.g. "January 20, 2005".
export function formatLongDate(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

// "2005-01-20" for a stored date, or ''.
export function toIsoDate(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

// --- Address ---------------------------------------------------------------------------

// Street; city, province ZIP; country — one entry per line, empty parts left out.
export function addressLines(s: Pick<StudentProfile, 'homeAddress' | 'cityMunicipality' | 'province' | 'zipCode' | 'country'>): string[] {
  const line2 = [s.cityMunicipality, [s.province, s.zipCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [s.homeAddress, line2, s.country].map(p => (p ?? '').trim()).filter(Boolean);
}

// --- Program ---------------------------------------------------------------------------

// Program name, code and college for display. Older profiles may have a
// free-text course that isn't in the list; it's shown as stored.
export function programDetails(s: Pick<StudentProfile, 'programCode' | 'course' | 'college'>) {
  const program = findProgram(s.programCode);
  return {
    program,
    name: program?.name ?? s.course ?? '',
    code: program?.code ?? s.programCode ?? '',
    college: program ? collegeName(program.college) : collegeName(s.college),
  };
}

// --- Guardian ---------------------------------------------------------------------------

const same = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

// Who the guardian is. Profiles saved before guardianType existed are
// matched by name against the parents.
export function guardianTypeOf(s: Pick<StudentProfile, 'guardianType' | 'guardianName' | 'fatherName' | 'motherName'>): GuardianType | '' {
  if (s.guardianType) return s.guardianType;
  if (same(s.guardianName, s.fatherName)) return 'father';
  if (same(s.guardianName, s.motherName)) return 'mother';
  return s.guardianName ? 'other' : '';
}

// --- Verification ------------------------------------------------------------------------

export const VERIFICATION_GROUP_LABELS: Record<VerificationGroup, string> = {
  program: 'Program',
  enrollment: 'Year level and section',
  gpa: 'GPA',
};

export const OFFICE_NAMES: Record<string, string> = { LSO: 'AdSO', POLCA: 'POLCA Office', ALUMNI: 'Alumni Office' };

export function verificationOf(s: StudentProfile, group: VerificationGroup) {
  const v = s.verification?.[group];
  return v?.verifiedAt ? v : null;
}

// "Verified by AdSO on January 20, 2026".
export function verificationText(s: StudentProfile, group: VerificationGroup): string {
  const v = verificationOf(s, group);
  if (!v) return 'Self-reported';
  return `Verified by ${OFFICE_NAMES[v.office ?? ''] ?? v.office ?? 'the office'} on ${formatLongDate(v.verifiedAt)}`;
}

export function openCorrectionRequest(s: StudentProfile, group: VerificationGroup) {
  return (s.correctionRequests ?? []).find(r => r.group === group && r.status === 'open') ?? null;
}

// --- GPA ---------------------------------------------------------------------------------

export function formatGpa(value?: string | number | null): string {
  if (value === undefined || value === null || value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : String(value);
}
