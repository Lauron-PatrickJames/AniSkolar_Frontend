import {
  GrantApplicationDetails, GuardianType, ProfileChanges, SfagContactSchool, SfagParentsGuardian, SfagPersonalInfo, StudentProfile
} from '../types';
import { YEAR_LEVELS } from '../data/programs';
import { CITIES_BY_PROVINCE } from '../data/phLocations';
import { CIVIL_STATUS_OPTIONS as PROFILE_CIVIL_STATUS } from '../components/profile/profileForm';
import { formatLongDate, formatPhone, isValidContactNumber, normalizePhMobile, toIsoDate } from './profile';
import { titleCaseName } from './names';

// Application form ↔ profile. Forms are prefilled from the profile; after a
// submission, what the student typed that the profile lacks (or has
// differently) is offered back: "Save these details to your profile?".
// Only fields the student can change are offered (PATCH /api/students/me
// refuses the rest: the program, verified academic groups, confirmed
// identity details), and an empty form value never clears the profile.

// Profile fields an application can fill in.
export type SyncedProfileField =
  | 'firstName' | 'middleName' | 'lastName'
  | 'dateOfBirth' | 'placeOfBirth' | 'nationality' | 'civilStatus'
  | 'homeAddress' | 'cityMunicipality' | 'province' | 'country'
  | 'mobileNumber' | 'telephoneNumber'
  | 'yearLevel' | 'gpa'
  | 'fatherName' | 'motherName';

// One form field and the profile field it fills (checked by the compiler
// against both the form's type and StudentProfile).
interface FieldLink<F> { field: SyncedProfileField & keyof StudentProfile; read: (form: F) => string | undefined }

// Guardian: one row, several profile fields (type, name, relationship,
// contact, address), read from the form's guardian section.
interface GuardianOnForm { name: string; relationship: string; contactNo: string; address?: string; fatherName: string; motherName: string }

export interface FormProfileMap<F> {
  fields: FieldLink<F>[];
  guardian?: (form: F) => GuardianOnForm;
}

// --- The maps, per form ------------------------------------------------------

export interface SfagFormValues { personalInfo: SfagPersonalInfo; contactSchool: SfagContactSchool; parentsGuardian: SfagParentsGuardian }
export const SFAG_PROFILE_MAP: FormProfileMap<SfagFormValues> = {
  fields: [
    { field: 'firstName', read: f => f.personalInfo.firstName },
    { field: 'lastName', read: f => f.personalInfo.lastName },
    // The SFAG form asks for a middle initial only: not the profile's middle name.
    { field: 'dateOfBirth', read: f => f.personalInfo.dateOfBirth },
    { field: 'placeOfBirth', read: f => f.personalInfo.placeOfBirth },
    { field: 'nationality', read: f => f.personalInfo.nationality },
    { field: 'civilStatus', read: f => f.personalInfo.civilStatus },
    { field: 'yearLevel', read: f => f.personalInfo.yearLevel },
    { field: 'homeAddress', read: f => f.contactSchool.streetAddress },
    { field: 'country', read: f => f.contactSchool.country },
    { field: 'province', read: f => f.contactSchool.province },
    { field: 'cityMunicipality', read: f => f.contactSchool.municipality },
    { field: 'mobileNumber', read: f => f.contactSchool.mobileNo },
    { field: 'telephoneNumber', read: f => f.contactSchool.landlineNo },
    { field: 'fatherName', read: f => f.parentsGuardian.father.fullName },
    { field: 'motherName', read: f => f.parentsGuardian.mother.fullName },
  ],
  guardian: f => ({
    name: f.parentsGuardian.guardian.fullName,
    relationship: f.parentsGuardian.guardian.relationship,
    contactNo: f.parentsGuardian.guardian.contactNo,
    fatherName: f.parentsGuardian.father.fullName,
    motherName: f.parentsGuardian.mother.fullName,
  }),
};

export interface StandardFormValues { firstName: string; middleName: string; lastName: string; phone: string; yearLevel: string; gpa: string }
export const STANDARD_PROFILE_MAP: FormProfileMap<StandardFormValues> = {
  fields: [
    { field: 'firstName', read: f => f.firstName },
    { field: 'middleName', read: f => f.middleName },
    { field: 'lastName', read: f => f.lastName },
    { field: 'mobileNumber', read: f => f.phone },
    { field: 'yearLevel', read: f => f.yearLevel },
    { field: 'gpa', read: f => f.gpa },
  ],
};

export const GRANT_PROFILE_MAP: FormProfileMap<GrantApplicationDetails> = {
  fields: [
    { field: 'firstName', read: f => f.personalInfo.firstName },
    { field: 'middleName', read: f => f.personalInfo.middleName },
    { field: 'lastName', read: f => f.personalInfo.lastName },
    { field: 'dateOfBirth', read: f => f.personalInfo.dateOfBirth },
    { field: 'placeOfBirth', read: f => f.personalInfo.placeOfBirth },
    { field: 'nationality', read: f => f.personalInfo.citizenship },
    { field: 'civilStatus', read: f => f.personalInfo.civilStatus },
    { field: 'yearLevel', read: f => f.personalInfo.yearLevel },
    { field: 'homeAddress', read: f => f.contactSchool.streetAddress },
    { field: 'province', read: f => f.contactSchool.province },
    { field: 'cityMunicipality', read: f => f.contactSchool.municipality },
    { field: 'mobileNumber', read: f => f.contactSchool.mobileNo },
    { field: 'telephoneNumber', read: f => f.contactSchool.landlineNo },
    { field: 'fatherName', read: f => f.parentsGuardian.father.name },
    { field: 'motherName', read: f => f.parentsGuardian.mother.name },
  ],
  guardian: f => ({
    name: f.parentsGuardian.guardian.name,
    relationship: f.parentsGuardian.guardian.relationship,
    contactNo: f.parentsGuardian.guardian.mobileNo || f.parentsGuardian.guardian.landlineNo,
    address: f.parentsGuardian.guardian.address,
    fatherName: f.parentsGuardian.father.name,
    motherName: f.parentsGuardian.mother.name,
  }),
};

// --- Comparing ----------------------------------------------------------------

export const PROFILE_FIELD_LABELS: Record<SyncedProfileField | 'guardian', string> = {
  firstName: 'First name', middleName: 'Middle name', lastName: 'Last name',
  dateOfBirth: 'Date of birth', placeOfBirth: 'Place of birth', nationality: 'Nationality', civilStatus: 'Civil status',
  homeAddress: 'Street address', cityMunicipality: 'City / municipality', province: 'Province', country: 'Country',
  mobileNumber: 'Mobile number', telephoneNumber: 'Telephone',
  yearLevel: 'Year level', gpa: 'GPA',
  fatherName: 'Father’s name', motherName: 'Mother’s name',
  guardian: 'Guardian',
};

// A detail the student can save to their profile: what it is now and what
// the form said, and the PATCH /me fields that save it.
export interface ProfileFieldChange {
  key: SyncedProfileField | 'guardian';
  label: string;
  from: string;           // '' when the profile doesn't have it yet
  to: string;
  changes: ProfileChanges;
}

const IDENTITY: SyncedProfileField[] = ['firstName', 'middleName', 'lastName', 'dateOfBirth', 'placeOfBirth', 'nationality', 'civilStatus'];
const tidy = (v: string | undefined) => (v ?? '').trim().replace(/\s+/g, ' ');
// FORMS OFTEN USE CAPITALS; the profile doesn't.
const nameCase = (v: string) => (v && v === v.toUpperCase() ? titleCaseName(v.toLowerCase()) : v);
const ci = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// The form value as the profile stores it, or null when it can't be saved
// as is (not in the profile's lists, not a valid number…).
function canonical(field: SyncedProfileField, raw: string, form: Map<SyncedProfileField, string>): string | null {
  const v = tidy(raw);
  if (!v) return null;
  switch (field) {
    case 'dateOfBirth': return toIsoDate(v) || null;
    case 'civilStatus': return PROFILE_CIVIL_STATUS.find(o => ci(o, v)) ?? null;
    case 'yearLevel': return YEAR_LEVELS.find(y => ci(y, v)) ?? null;
    case 'gpa': {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 && n <= 4 ? n.toFixed(2) : null;
    }
    case 'country': return ci(v, 'Philippines') ? 'Philippines' : nameCase(v);
    case 'province': {
      if (!isPhilippines(form)) return nameCase(v);
      return Object.keys(CITIES_BY_PROVINCE).find(p => ci(p, v)) ?? null;
    }
    case 'cityMunicipality': {
      if (!isPhilippines(form)) return nameCase(v);
      const province = Object.keys(CITIES_BY_PROVINCE).find(p => ci(p, tidy(form.get('province'))));
      // "Dasmariñas City" or "Dasmariñas" is the list's "City of Dasmariñas".
      const bare = (c: string) => c.toLowerCase().replace(/^city of\s+/, '').replace(/\s+city$/, '').trim();
      return province ? CITIES_BY_PROVINCE[province].find(c => ci(c, v)) ?? CITIES_BY_PROVINCE[province].find(c => bare(c) === bare(v)) ?? null : null;
    }
    case 'mobileNumber': return normalizePhMobile(v);
    case 'telephoneNumber': return isValidContactNumber(v) ? v : null;
    case 'homeAddress': return v;
    default: return nameCase(v);
  }
}
const isPhilippines = (form: Map<SyncedProfileField, string>) => { const c = tidy(form.get('country')); return !c || ci(c, 'Philippines'); };

// The profile's value in the same form, for comparing.
function current(field: SyncedProfileField, s: StudentProfile): string {
  const v = s[field];
  if (v === undefined || v === null || v === '') return '';
  if (field === 'dateOfBirth') return toIsoDate(String(v));
  if (field === 'gpa') { const n = Number(v); return Number.isFinite(n) ? n.toFixed(2) : ''; }
  if (field === 'mobileNumber') return normalizePhMobile(String(v)) ?? String(v);
  return tidy(String(v));
}

const same = (field: SyncedProfileField, a: string, b: string) =>
  field === 'telephoneNumber' ? a.replace(/\D/g, '') === b.replace(/\D/g, '') : ci(a, b);

const display = (field: SyncedProfileField, v: string) =>
  !v ? '' : field === 'dateOfBirth' ? formatLongDate(v) : field === 'mobileNumber' || field === 'telephoneNumber' ? formatPhone(v) : v;

// What the student may still change themselves (else PATCH /me refuses).
function editable(field: SyncedProfileField, s: StudentProfile): boolean {
  const confirmed = !!(s.identityConfirmedAt || s.profileConfirmedAt);
  if (IDENTITY.includes(field) && confirmed && current(field, s)) return false;
  if (field === 'yearLevel' && s.verification?.enrollment?.verifiedAt) return false;
  if (field === 'gpa' && s.verification?.gpa?.verifiedAt) return false;
  return true;
}

// Every detail on the submitted form that's missing from the profile or
// different in it, and that the student can save.
export function profileChangesFromForm<F>(map: FormProfileMap<F>, form: F, student: StudentProfile): ProfileFieldChange[] {
  const values = new Map<SyncedProfileField, string>(map.fields.map(l => [l.field, l.read(form) ?? '']));
  const out: ProfileFieldChange[] = [];
  for (const { field } of map.fields) {
    const to = canonical(field, values.get(field) ?? '', values);
    if (to === null || !editable(field, student)) continue;
    const from = current(field, student);
    if (from && same(field, from, to)) continue;
    // The profile keeps a 1st year's empty GPA rather than a form's 0.00.
    if (field === 'gpa' && Number(to) === 0 && !from) continue;
    out.push({ key: field, label: PROFILE_FIELD_LABELS[field], from: display(field, from), to: display(field, to), changes: { [field]: to } });
  }
  const guardian = map.guardian?.(form);
  if (guardian) {
    const change = guardianChange(guardian, student);
    if (change) out.push(change);
  }
  return out;
}

// The guardian on the form: one of the parents, or someone else.
function guardianChange(g: GuardianOnForm, s: StudentProfile): ProfileFieldChange | null {
  const name = nameCase(tidy(g.name));
  if (!name) return null;
  const type: GuardianType = ci(name, tidy(g.fatherName)) ? 'father' : ci(name, tidy(g.motherName)) ? 'mother' : 'other';
  const relationship = type === 'other' ? nameCase(tidy(g.relationship)) : type === 'father' ? 'Father' : 'Mother';
  const contact = tidy(g.contactNo);
  const contactNo = contact && isValidContactNumber(contact) ? (normalizePhMobile(contact) ?? contact) : '';
  // Someone else needs a name and relationship to be saved.
  if (type === 'other' && !relationship) return null;
  const now = s.guardianType;
  const unchanged = now === type && (type !== 'other' || (ci(tidy(s.guardianName), name) && ci(tidy(s.guardianRelationship), relationship)));
  if (unchanged) return null;
  const describe = (n?: string, r?: string) => [n, r && `(${r})`].filter(Boolean).join(' ');
  const changes: ProfileChanges = { guardianType: type };
  if (type === 'other') {
    Object.assign(changes, {
      guardianName: name,
      guardianRelationship: relationship,
      ...(contactNo ? { guardianContactNo: contactNo } : {}),
      ...(g.address?.trim() ? { guardianAddress: tidy(g.address), guardianAddressSameAsHome: false } : {}),
    });
  }
  return {
    key: 'guardian',
    label: PROFILE_FIELD_LABELS.guardian,
    from: now ? describe(now === 'other' ? s.guardianName : now === 'father' ? s.fatherName : s.motherName, now === 'other' ? s.guardianRelationship : now === 'father' ? 'Father' : 'Mother') : '',
    to: describe(name, relationship),
    changes,
  };
}

// The PATCH /me body for the details the student chose to save.
export function changesToPayload(chosen: ProfileFieldChange[]): ProfileChanges {
  return Object.assign({}, ...chosen.map(c => c.changes));
}
