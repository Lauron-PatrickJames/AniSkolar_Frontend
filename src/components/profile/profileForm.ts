import { GuardianType, StudentProfile } from '../../types';
import { findProgram } from '../../data/programs';
import { CITIES_BY_PROVINCE } from '../../data/phLocations';
import { formatPhone, guardianTypeOf, isValidContactNumber, normalizePhMobile, toIsoDate } from '../../utils/profile';

// The editable profile as form state (all strings, as typed), with its
// validation and the request body for the API. Used by the first-time
// "Complete your profile" page and the Profile edit dialog. The backend
// (routes/students.js) validates the same rules.

export interface ProfileDraft {
  programCode: string;
  yearLevel: string;
  section: string;
  gpa: string;
  middleName: string;
  dateOfBirth: string;          // YYYY-MM-DD
  placeOfBirth: string;
  nationality: string;
  civilStatus: string;
  homeAddress: string;
  cityMunicipality: string;
  province: string;
  zipCode: string;
  country: string;
  mobileNumber: string;
  telephoneNumber: string;
  fatherName: string;
  fatherContactNo: string;
  motherName: string;
  motherContactNo: string;
  guardianType: GuardianType | '';
  guardianName: string;
  guardianRelationship: string;
  guardianContactNo: string;
  guardianAddress: string;
  guardianAddressSameAsHome: boolean;
}

export type DraftField = keyof ProfileDraft;
export type DraftErrors = Partial<Record<DraftField, string>>;

export const PHILIPPINES = 'Philippines';
export const CIVIL_STATUS_OPTIONS = ['Single', 'Married', 'Widowed', 'Separated', 'Divorced'];

export function emptyDraft(): ProfileDraft {
  return {
    programCode: '', yearLevel: '', section: '', gpa: '',
    middleName: '', dateOfBirth: '', placeOfBirth: '', nationality: 'Filipino', civilStatus: '',
    homeAddress: '', cityMunicipality: '', province: '', zipCode: '', country: PHILIPPINES,
    mobileNumber: '', telephoneNumber: '',
    fatherName: '', fatherContactNo: '', motherName: '', motherContactNo: '',
    guardianType: '', guardianName: '', guardianRelationship: '', guardianContactNo: '', guardianAddress: '',
    guardianAddressSameAsHome: false,
  };
}

const text = (v: unknown) => (v === undefined || v === null ? '' : String(v));

export function draftFromStudent(s: StudentProfile): ProfileDraft {
  const gpa = s.gpa === undefined || s.gpa === null || s.gpa === '' ? '' : Number(s.gpa).toFixed(2);
  return {
    programCode: findProgram(s.programCode)?.code ?? '',
    yearLevel: text(s.yearLevel),
    section: text(s.section),
    gpa: gpa === 'NaN' ? '' : gpa,
    middleName: text(s.middleName),
    dateOfBirth: toIsoDate(s.dateOfBirth),
    placeOfBirth: text(s.placeOfBirth),
    nationality: text(s.nationality),
    civilStatus: text(s.civilStatus),
    homeAddress: text(s.homeAddress),
    cityMunicipality: text(s.cityMunicipality),
    province: text(s.province),
    zipCode: text(s.zipCode),
    country: text(s.country) || PHILIPPINES,
    mobileNumber: formatPhone(s.mobileNumber),
    telephoneNumber: text(s.telephoneNumber),
    fatherName: text(s.fatherName),
    fatherContactNo: formatPhone(s.fatherContactNo),
    motherName: text(s.motherName),
    motherContactNo: formatPhone(s.motherContactNo),
    guardianType: guardianTypeOf(s),
    guardianName: text(s.guardianName),
    guardianRelationship: text(s.guardianRelationship),
    guardianContactNo: formatPhone(s.guardianContactNo),
    guardianAddress: text(s.guardianAddress),
    guardianAddressSameAsHome: !!s.guardianAddressSameAsHome,
  };
}

// Which section each field is in (for error dots and "go to first error").
export type DraftSection = 'academic' | 'personal' | 'contact' | 'family';
export const SECTION_FIELDS: Record<DraftSection, DraftField[]> = {
  academic: ['programCode', 'yearLevel', 'section', 'gpa'],
  personal: ['middleName', 'dateOfBirth', 'placeOfBirth', 'nationality', 'civilStatus'],
  contact: ['homeAddress', 'country', 'province', 'cityMunicipality', 'zipCode', 'mobileNumber', 'telephoneNumber'],
  family: ['fatherName', 'fatherContactNo', 'motherName', 'motherContactNo', 'guardianType', 'guardianName', 'guardianRelationship', 'guardianContactNo', 'guardianAddress'],
};

const isPh = (d: ProfileDraft) => !d.country || d.country === PHILIPPINES;

// Every problem with the draft, by field. `requireAcademic` makes program
// and year level required (first-time setup).
export function validateDraft(d: ProfileDraft, { requireAcademic = false } = {}): DraftErrors {
  const e: DraftErrors = {};
  if (requireAcademic && !d.programCode) e.programCode = 'Choose your program.';
  if (d.programCode && !findProgram(d.programCode)) e.programCode = 'Choose your program from the list.';
  if (requireAcademic && !d.yearLevel) e.yearLevel = 'Choose your year level.';

  if (d.gpa.trim()) {
    const n = Number(d.gpa);
    if (!/^\d(\.\d{1,2})?$/.test(d.gpa.trim()) || n < 0 || n > 4) e.gpa = 'Enter a GPA from 0.00 to 4.00, with up to two decimals.';
  }

  if (d.dateOfBirth) {
    const dob = new Date(`${d.dateOfBirth}T00:00:00`);
    const age = (Date.now() - dob.getTime()) / (365.25 * 86400000);
    if (Number.isNaN(dob.getTime())) e.dateOfBirth = 'Enter a valid date.';
    else if (age < 10 || age > 100) e.dateOfBirth = 'Check the year — this would make you under 10 or over 100.';
  }

  if (isPh(d)) {
    if (d.province && !CITIES_BY_PROVINCE[d.province]) e.province = 'Choose your province from the list.';
    if (d.cityMunicipality && d.province && !CITIES_BY_PROVINCE[d.province]?.includes(d.cityMunicipality)) {
      e.cityMunicipality = 'Choose your city or municipality from the list.';
    }
    if (d.cityMunicipality && !d.province) e.province = 'Choose the province first.';
    if (d.zipCode && !/^\d{4}$/.test(d.zipCode.trim())) e.zipCode = 'ZIP codes in the Philippines have 4 digits.';
  } else if (!d.country.trim()) {
    e.country = 'Enter your country.';
  }

  if (d.mobileNumber.trim() && !normalizePhMobile(d.mobileNumber)) {
    e.mobileNumber = 'Enter a Philippine mobile number, like 0917 123 4567 or +63 917 123 4567.';
  }
  for (const f of ['telephoneNumber', 'fatherContactNo', 'motherContactNo', 'guardianContactNo'] as const) {
    if (d[f].trim() && !isValidContactNumber(d[f])) e[f] = 'Enter a valid phone number.';
  }

  if (d.guardianType === 'father' && !d.fatherName.trim()) e.fatherName = 'Enter your father’s name, or choose another guardian.';
  if (d.guardianType === 'mother' && !d.motherName.trim()) e.motherName = 'Enter your mother’s name, or choose another guardian.';
  if (d.guardianType === 'other') {
    if (!d.guardianName.trim()) e.guardianName = 'Enter your guardian’s name.';
    if (!d.guardianRelationship.trim()) e.guardianRelationship = 'Enter how they’re related to you.';
  }
  return e;
}

export function errorsIn(errors: DraftErrors, section: DraftSection): DraftField[] {
  return SECTION_FIELDS[section].filter(f => errors[f]);
}

// The request body for POST /complete-profile and PATCH /me. Phone numbers
// go as typed (the server normalizes them); "same as father / mother" and
// "same as my home address" are resolved by the server.
export function draftToPayload(d: ProfileDraft) {
  const ph = isPh(d);
  return {
    programCode: d.programCode,
    yearLevel: d.yearLevel,
    section: d.section.trim().toUpperCase(),
    gpa: d.gpa.trim() ? Number(d.gpa).toFixed(2) : '',
    middleName: d.middleName.trim(),
    dateOfBirth: d.dateOfBirth,
    placeOfBirth: d.placeOfBirth.trim(),
    nationality: d.nationality.trim(),
    civilStatus: d.civilStatus || undefined,
    homeAddress: d.homeAddress.trim(),
    cityMunicipality: d.cityMunicipality.trim(),
    province: d.province.trim(),
    zipCode: d.zipCode.trim(),
    country: ph ? PHILIPPINES : d.country.trim(),
    mobileNumber: d.mobileNumber.trim(),
    telephoneNumber: d.telephoneNumber.trim(),
    fatherName: d.fatherName.trim(),
    fatherContactNo: d.fatherContactNo.trim(),
    motherName: d.motherName.trim(),
    motherContactNo: d.motherContactNo.trim(),
    guardianType: d.guardianType,
    guardianName: d.guardianType === 'other' ? d.guardianName.trim() : '',
    guardianRelationship: d.guardianType === 'other' ? d.guardianRelationship.trim() : '',
    guardianContactNo: d.guardianType === 'other' ? d.guardianContactNo.trim() : '',
    guardianAddress: d.guardianType === 'other' && !d.guardianAddressSameAsHome ? d.guardianAddress.trim() : '',
    guardianAddressSameAsHome: d.guardianType === 'other' && d.guardianAddressSameAsHome,
  };
}
