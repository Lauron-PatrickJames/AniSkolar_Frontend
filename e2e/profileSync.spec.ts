import { expect, test } from '@playwright/test';
import { GRANT_PROFILE_MAP, SFAG_PROFILE_MAP, STANDARD_PROFILE_MAP, changesToPayload, profileChangesFromForm } from '../src/utils/profileSync';
import type { GrantApplicationDetails, StudentProfile } from '../src/types';

// Form → profile: what "Save these details to your profile?" offers after
// a submission. No browser needed; runs once.
test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'Logic only: once is enough.'); });

const newStudent = (extra: Partial<StudentProfile> = {}): StudentProfile => ({
  studentNumber: '202312345', name: 'Juan Dela Cruz', firstName: 'Juan', lastName: 'Dela Cruz',
  course: 'BSIT', college: 'CICS', yearLevel: '2nd Year', email: 'dja1234@dlsud.edu.ph', gpa: '3.25', ...extra,
} as StudentProfile);

const sfagForm = (over: Record<string, unknown> = {}) => ({
  personalInfo: { firstName: 'JUAN', lastName: 'DELA CRUZ', middleInitial: 'S', suffix: '', studentNumber: '202312345', course: 'BSIT', yearLevel: '2nd Year', placeOfBirth: 'DASMARIÑAS', dateOfBirth: '2005-03-01', age: '21', civilStatus: 'SINGLE', gender: 'Male', nationality: 'FILIPINO', isPwd: false, religion: 'ROMAN CATHOLIC', specifyReligion: '' },
  contactSchool: { streetAddress: '12 Rizal St.', municipality: 'DASMARIÑAS CITY', province: 'CAVITE', country: 'PHILIPPINES', mobileNo: '0917 123 4567', landlineNo: '', email: '', secondarySchool: '', schoolAddress: '', schoolType: 'Public' as const },
  parentsGuardian: {
    father: { fullName: 'JOSE DELA CRUZ', occupation: '', company: '', companyTel: '', monthlyIncome: '', isSoloParent: false },
    mother: { fullName: 'MARIA DELA CRUZ', occupation: '', company: '', companyTel: '', monthlyIncome: '', isSoloParent: false },
    guardian: { fullName: 'MARIA DELA CRUZ', occupation: '', monthlyIncome: '', relationship: 'MOTHER', contactNo: '' },
  },
  ...over,
});

test('SFAG: new details are offered in the profile’s own format', () => {
  const offer = profileChangesFromForm(SFAG_PROFILE_MAP, sfagForm(), newStudent());
  const byKey = Object.fromEntries(offer.map(c => [c.key, c]));
  // Unchanged (case aside): not offered.
  expect(byKey.firstName).toBeUndefined();
  expect(byKey.yearLevel).toBeUndefined();
  // Capitals and lists become the profile's values.
  expect(byKey.civilStatus.changes).toEqual({ civilStatus: 'Single' });
  expect(byKey.nationality.changes).toEqual({ nationality: 'Filipino' });
  expect(byKey.province.changes).toEqual({ province: 'Cavite' });
  expect(byKey.cityMunicipality.changes).toEqual({ cityMunicipality: 'City of Dasmariñas' });
  expect(byKey.mobileNumber.changes).toEqual({ mobileNumber: '09171234567' });
  expect(byKey.fatherName.to).toBe('Jose Dela Cruz');
  // New to the profile: no "from".
  expect(byKey.placeOfBirth.from).toBe('');
  // The guardian is the mother: saved as such.
  expect(byKey.guardian.changes).toEqual({ guardianType: 'mother' });
  // An empty form field never clears the profile.
  expect(byKey.telephoneNumber).toBeUndefined();
});

test('a different value shows old → new', () => {
  const offer = profileChangesFromForm(SFAG_PROFILE_MAP, sfagForm(), newStudent({ mobileNumber: '09998887777' }));
  const mobile = offer.find(c => c.key === 'mobileNumber')!;
  expect(mobile.from).toBe('0999 888 7777');
  expect(mobile.to).toBe('0917 123 4567');
});

test('confirmed identity, verified GPA and the program are never offered', () => {
  const student = newStudent({
    identityConfirmedAt: '2026-11-01', placeOfBirth: 'Imus', dateOfBirth: '2005-03-01', civilStatus: 'Single', nationality: 'Filipino',
    verification: { gpa: { verifiedAt: '2026-11-02' } },
  });
  const offer = profileChangesFromForm(STANDARD_PROFILE_MAP, { firstName: 'Juan', middleName: 'Santos', lastName: 'Cruz', phone: '09171234567', yearLevel: '2nd Year', gpa: '3.80' }, student);
  const keys = offer.map(c => c.key);
  expect(keys).not.toContain('lastName');   // confirmed and set
  expect(keys).toContain('middleName');     // confirmed, but empty: filling in is allowed
  expect(keys).not.toContain('gpa');        // verified by the office
  expect(keys).toContain('mobileNumber');
});

test('a guardian who isn’t a parent needs a relationship, and saves as "other"', () => {
  const form = { ...sfagForm() };
  form.parentsGuardian = { ...form.parentsGuardian, guardian: { fullName: 'ANA REYES', occupation: '', monthlyIncome: '', relationship: 'AUNT', contactNo: '0918 222 3333' } };
  const guardian = profileChangesFromForm(SFAG_PROFILE_MAP, form, newStudent()).find(c => c.key === 'guardian')!;
  expect(guardian.to).toBe('Ana Reyes (Aunt)');
  expect(guardian.changes).toEqual({ guardianType: 'other', guardianName: 'Ana Reyes', guardianRelationship: 'Aunt', guardianContactNo: '09182223333' });
});

test('grant form, and only the chosen rows are sent', () => {
  const form = {
    personalInfo: { firstName: 'Juan', middleName: 'Santos', lastName: 'Dela Cruz', citizenship: 'Filipino', civilStatus: 'Single', dateOfBirth: '', placeOfBirth: '', yearLevel: '2nd Year' },
    contactSchool: { streetAddress: '', municipality: '', province: '', landlineNo: '', mobileNo: '09171234567' },
    parentsGuardian: { father: { name: '' }, mother: { name: '' }, guardian: { name: '', relationship: '', address: '', landlineNo: '', mobileNo: '' } },
  } as unknown as GrantApplicationDetails;
  const offer = profileChangesFromForm(GRANT_PROFILE_MAP, form, newStudent());
  expect(offer.map(c => c.key).sort()).toEqual(['civilStatus', 'middleName', 'mobileNumber', 'nationality']);
  expect(changesToPayload(offer.filter(c => c.key !== 'nationality'))).toEqual({ middleName: 'Santos', civilStatus: 'Single', mobileNumber: '09171234567' });
});
