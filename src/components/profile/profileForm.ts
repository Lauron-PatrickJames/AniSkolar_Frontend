import { GuardianType, ProfileSectionKey, StudentProfile } from '../../types';
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
  firstName: string;            // prefilled from the university account; may be corrected at sign-up
  lastName: string;
  middleName: string;
  nameSuffix: string;           // '', Jr., Sr., II, III, IV, V
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
  fatherDeceased: boolean;
  motherName: string;
  motherContactNo: string;
  motherDeceased: boolean;
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
export const NAME_SUFFIXES = ['Jr.', 'Sr.', 'II', 'III', 'IV', 'V'];

// Letters (any language), spaces, hyphens, apostrophes and periods.
export const NAME_PATTERN = /^\p{L}[\p{L}\p{M}\s.'’-]*$/u;

export function emptyDraft(): ProfileDraft {
  return {
    programCode: '', yearLevel: '', section: '', gpa: '',
    firstName: '', lastName: '', middleName: '', nameSuffix: '', dateOfBirth: '', placeOfBirth: '', nationality: 'Filipino', civilStatus: '',
    homeAddress: '', cityMunicipality: '', province: '', zipCode: '', country: PHILIPPINES,
    mobileNumber: '', telephoneNumber: '',
    fatherName: '', fatherContactNo: '', fatherDeceased: false, motherName: '', motherContactNo: '', motherDeceased: false,
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
    firstName: text(s.firstName),
    lastName: text(s.lastName),
    middleName: text(s.middleName),
    nameSuffix: text(s.nameSuffix),
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
    fatherDeceased: !!s.fatherDeceased,
    motherName: text(s.motherName),
    motherContactNo: formatPhone(s.motherContactNo),
    motherDeceased: !!s.motherDeceased,
    guardianType: guardianTypeOf(s),
    guardianName: text(s.guardianName),
    guardianRelationship: text(s.guardianRelationship),
    guardianContactNo: formatPhone(s.guardianContactNo),
    guardianAddress: text(s.guardianAddress),
    guardianAddressSameAsHome: !!s.guardianAddressSameAsHome,
  };
}

// Which section each field is in (for error dots, "go to first error" and
// saving one section at a time). Same sections as the backend's
// utils/profileCompletion.js.
export type DraftSection = ProfileSectionKey;
export const SECTION_FIELDS: Record<DraftSection, DraftField[]> = {
  academic: ['programCode', 'yearLevel', 'section', 'gpa'],
  personal: ['firstName', 'lastName', 'middleName', 'nameSuffix', 'dateOfBirth', 'placeOfBirth', 'nationality', 'civilStatus'],
  contact: ['homeAddress', 'country', 'province', 'cityMunicipality', 'zipCode', 'mobileNumber', 'telephoneNumber'],
  family: ['fatherName', 'fatherContactNo', 'fatherDeceased', 'motherName', 'motherContactNo', 'motherDeceased', 'guardianType', 'guardianName', 'guardianRelationship', 'guardianContactNo', 'guardianAddress', 'guardianAddressSameAsHome'],
};
export const ALL_SECTIONS = Object.keys(SECTION_FIELDS) as DraftSection[];

// Sections whose values differ between two drafts (what a save sends).
export function changedSections(before: ProfileDraft, after: ProfileDraft): DraftSection[] {
  return ALL_SECTIONS.filter(s => SECTION_FIELDS[s].some(f => before[f] !== after[f]));
}

// Living parents, both listed: no guardian needed (as the backend's
// profile completion counts it).
export const needsGuardian = (d: Pick<ProfileDraft, 'fatherName' | 'fatherDeceased' | 'motherName' | 'motherDeceased'>) =>
  !(d.fatherName.trim() && !d.fatherDeceased && d.motherName.trim() && !d.motherDeceased);

const isPh = (d: ProfileDraft) => !d.country || d.country === PHILIPPINES;

// Every problem with the draft, by field. Required fields are checked only
// in `sections` (the ones being saved; all by default), so a student can
// save one section while others are still empty; a value that's filled in
// is always checked. Required: everything except the telephone, the name
// suffix, a 1st year's GPA (incoming freshmen have none yet), a deceased
// parent's contact number, and the guardian when both parents are listed.
// Same fields as the backend's utils/profileCompletion.js.
export function validateDraft(d: ProfileDraft, { sections = ALL_SECTIONS }: { sections?: DraftSection[] } = {}): DraftErrors {
  const e: DraftErrors = {};
  const checked = new Set(sections.flatMap(s => SECTION_FIELDS[s]));
  const need = (field: DraftField, message: string) => {
    const v = d[field];
    if (checked.has(field) && typeof v === 'string' && !v.trim()) e[field] = message;
  };
  need('programCode', 'Choose your program.');
  if (d.programCode && !findProgram(d.programCode)) e.programCode = 'Choose your program from the list.';
  need('yearLevel', 'Choose your year level.');
  need('section', 'Enter your section.');
  if (d.yearLevel !== '1st Year') need('gpa', 'Enter your cumulative GPA.');
  need('firstName', 'Enter your first name.');
  need('lastName', 'Enter your last name.');
  for (const f of ['firstName', 'middleName', 'lastName'] as const) {
    if (d[f].trim() && !NAME_PATTERN.test(d[f].trim())) e[f] = 'Use letters only (spaces, hyphens, apostrophes and periods are fine).';
  }
  need('middleName', 'Enter your middle name.');
  need('dateOfBirth', 'Select your date of birth.');
  need('placeOfBirth', 'Enter your place of birth.');
  need('nationality', 'Enter your nationality.');
  need('civilStatus', 'Choose your civil status.');
  need('mobileNumber', 'Enter your mobile number.');
  need('homeAddress', 'Enter your street address.');
  need('province', isPh(d) ? 'Choose your province.' : 'Enter your state or province.');
  need('cityMunicipality', 'Choose your city or municipality.');
  need('zipCode', 'Enter your ZIP code.');
  need('fatherName', 'Enter your father’s full name.');
  if (!d.fatherDeceased) need('fatherContactNo', 'Enter your father’s contact number, or tick “Deceased”.');
  need('motherName', 'Enter your mother’s full name.');
  if (!d.motherDeceased) need('motherContactNo', 'Enter your mother’s contact number, or tick “Deceased”.');
  if (checked.has('guardianType') && !d.guardianType && needsGuardian(d)) e.guardianType = 'Choose who your guardian is.';
  if (d.guardianType === 'other') {
    need('guardianContactNo', 'Enter your guardian’s contact number.');
    if (!d.guardianAddressSameAsHome) need('guardianAddress', 'Enter your guardian’s address.');
  }
  if (d.nameSuffix && !NAME_SUFFIXES.includes(d.nameSuffix)) e.nameSuffix = 'Choose a suffix from the list.';

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

  if (d.guardianType === 'father' && d.fatherDeceased) e.guardianType = 'Your father is marked deceased; choose another guardian.';
  if (d.guardianType === 'mother' && d.motherDeceased) e.guardianType = 'Your mother is marked deceased; choose another guardian.';
  if (d.guardianType === 'other') {
    need('guardianName', 'Enter your guardian’s name.');
    need('guardianRelationship', 'Enter how they’re related to you.');
  }
  return e;
}

export function errorsIn(errors: DraftErrors, section: DraftSection): DraftField[] {
  return SECTION_FIELDS[section].filter(f => errors[f]);
}

// The request body for POST /complete-profile and PATCH /me. Phone numbers
// go as typed (the server normalizes them); "same as father / mother" and
// "same as my home address" are resolved by the server. `sections` limits
// it to those sections' fields (PATCH /me takes partial updates).
export function draftToPayload(d: ProfileDraft, sections: DraftSection[] = ALL_SECTIONS) {
  const payload = fullPayload(d);
  const keep = new Set<string>(sections.flatMap(s => SECTION_FIELDS[s]));
  return Object.fromEntries(Object.entries(payload).filter(([k]) => keep.has(k))) as Partial<ReturnType<typeof fullPayload>>;
}

function fullPayload(d: ProfileDraft) {
  const ph = isPh(d);
  return {
    programCode: d.programCode,
    yearLevel: d.yearLevel,
    section: d.section.trim().toUpperCase(),
    gpa: d.gpa.trim() ? Number(d.gpa).toFixed(2) : '',
    firstName: d.firstName.trim().replace(/\s+/g, ' '),
    lastName: d.lastName.trim().replace(/\s+/g, ' '),
    middleName: d.middleName.trim(),
    nameSuffix: d.nameSuffix,
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
    fatherContactNo: d.fatherDeceased ? '' : d.fatherContactNo.trim(),
    fatherDeceased: d.fatherDeceased,
    motherName: d.motherName.trim(),
    motherContactNo: d.motherDeceased ? '' : d.motherContactNo.trim(),
    motherDeceased: d.motherDeceased,
    guardianType: d.guardianType,
    guardianName: d.guardianType === 'other' ? d.guardianName.trim() : '',
    guardianRelationship: d.guardianType === 'other' ? d.guardianRelationship.trim() : '',
    guardianContactNo: d.guardianType === 'other' ? d.guardianContactNo.trim() : '',
    guardianAddress: d.guardianType === 'other' && !d.guardianAddressSameAsHome ? d.guardianAddress.trim() : '',
    guardianAddressSameAsHome: d.guardianType === 'other' && d.guardianAddressSameAsHome,
  };
}
