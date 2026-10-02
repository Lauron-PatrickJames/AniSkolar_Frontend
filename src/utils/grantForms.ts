import { profileNameParts } from './names';
// Model for the grant-form application flows (POLCA / DLSU-D Alumni
// Association): option lists, certification texts, the section list per
// scholarship, prefill from the student profile, per-section validation,
// and mapping a stored application back into form values. UI lives in
// components/grant-forms; the wizard is pages/student/GrantApplication.tsx.

import {
  ApplicationFormType,
  DocumentSlot,
  EvaluationSheet,
  GrantApplicationDetails,
  GrantEligibilityAnswers,
  HouseholdMember,
  Scholarship,
  SchoolRecord,
  StudentProfile
} from '../types';
import { checkApplyEligibility } from './eligibility';

export const GRANT_FORM_TYPES: ApplicationFormType[] = ['polca', 'alumni'];

export function isGrantFormType(formType?: string): formType is 'polca' | 'alumni' {
  return formType === 'polca' || formType === 'alumni';
}

// --- Option lists -----------------------------------------------------------

export const CIVIL_STATUS_OPTIONS = ['Single', 'Married', 'Widowed', 'Separated', 'Divorced'];
export const GENDER_OPTIONS = ['Female', 'Male', 'Non-binary', 'Other', 'Prefer not to say'];
export const YEAR_LEVEL_OPTIONS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'];
export const YES_NO = ['Yes', 'No'];
export const YES_NO_NA = ['Yes', 'No', 'N/A'];

// POLCA form, "Assets Owned by the Family" (house and lot, automobile).
export const VALUE_BRACKETS = [
  '₱1,000,000 and up',
  '₱500,000 – ₱999,999',
  '₱100,001 – ₱499,999',
  'Below ₱100,000'
];
export const FAMILY_INCOME_BRACKETS = [
  '₱50,251 – ₱154,750',
  '₱15,918 – ₱50,250',
  '₱5,167 – ₱15,917',
  '₱0 – ₱5,166'
];
export const MONTHLY_EXPENSE_BRACKETS = [
  '₱53,768 – ₱129,990',
  '₱16,395 – ₱53,767',
  '₱5,323 – ₱16,394',
  '₱0 – ₱5,322'
];

export const SCHOOL_TYPES_3: SchoolRecord['type'][] = ['Public', 'Semi-Private', 'Private'];
export const LIVING_STATUS: HouseholdMember['living'][] = ['Yes', 'Yes - abroad', 'No', 'N/A'];
export const SIBLING_LIVING_WITH_FAMILY = ['Yes', 'No - abroad', 'No'];
export const CONTRIBUTION_TYPES = ['Monetary', 'In Kind', 'Etc.'];

export const INCOME_SOURCES = [
  'Business',
  'Practice of profession',
  'Farms / haciendas / fishponds',
  'Real estate rentals',
  'Salaries / wages',
  'Remittances from abroad',
  'Commissions',
  'Investment earnings',
  'Pensions',
  'Others'
];

export const HOUSE_STATUS = {
  ownedFree: 'Owned, not mortgaged',
  ownedMortgaged: 'Owned, mortgaged',
  rented: 'Rented',
  rentFree: 'Rent-free / living with relatives',
  others: 'Others'
} as const;
export const HOUSE_STATUS_OPTIONS = Object.values(HOUSE_STATUS);

export const VEHICLE_TYPES = [
  { key: 'suv', label: 'SUV' },
  { key: 'carVan', label: 'Car / Van' },
  { key: 'auv', label: 'AUV' },
  { key: 'pickup', label: 'Pick-up' },
  { key: 'ownerJeep', label: 'Owner-type jeep' },
  { key: 'truck', label: 'Truck' },
  { key: 'jeepney', label: 'Passenger jeepney' },
  { key: 'motorcycle', label: 'Motorcycle' },
  { key: 'tricycle', label: 'Tricycle' }
];

export const HOUSEHOLD_ROLES = [
  { key: 'father', label: 'Father / Stepfather' },
  { key: 'mother', label: 'Mother / Stepmother' },
  { key: 'spouse', label: 'Spouse' },
  { key: 'guardian', label: 'Legal Guardian' }
] as const;

// --- Certification texts ----------------------------------------------------

// POLCA Form No. 002 wording; the alumni form has no official text yet.
export function certificationText(scholarship: Scholarship): string {
  if (scholarship.applicationFormType === 'polca') {
    return 'I hereby certify that I have consulted family members with regard to the statements and other information. They are to the best of our knowledge correct and complete. POLCA DLSU-Dasmariñas, Inc. has my permission to verify the information on this form and at any time revoke my scholarship should it, after observing due process, find the information false.';
  }
  // TODO: replace with the official alumni scholarship application form's
  // certification once the Alumni Office provides the form.
  return 'I hereby certify that I have consulted family members with regard to the statements and other information. They are to the best of our knowledge correct and complete. The De La Salle Dasmariñas Alumni Association, Inc. has my permission to verify the information on this form and at any time revoke my scholarship should it, after observing due process, find the information false.';
}

export const APPLICANT_STATEMENT =
  'I hereby certify that all the data and information that I have furnished are accurate and complete. I understand that any misinformation and/or withholding of information will automatically disqualify me from receiving any financial assistance and may serve as grounds for disciplinary action from the University. Moreover, I authorize the University to conduct background investigation to verify the veracity and accuracy of the information provided in this application or to obtain additional information on my capacity to pay and I will give my utmost cooperation in this regard. I understand that my refusal to comply with any of the above-mentioned conditions may mean withdrawal of the financial assistance.';

export const PARENT_STATEMENT =
  'I hereby certify that I have read the entire application form and that I certify to the truthfulness and completeness of the information that my son/daughter/dependent has furnished in this application together with all the documents attached. I understand that any misinformation and/or withholding of information will automatically disqualify his/her from receiving financial assistance and may serve as grounds for disciplinary action from the University. I further recognize that in signing this application form, I share with my son/daughter/dependent the responsibility for the truthfulness, accuracy and completeness of the information supplied. Moreover, I authorize the University to conduct background investigation to verify the veracity and accuracy of the information provided in this application or to obtain additional information on my capacity to pay and I will give my utmost cooperation in this regard. I understand that my refusal to comply with any of the above-mentioned conditions may mean withdrawal of the financial assistance.';

// --- Sections ---------------------------------------------------------------

export type GrantPart = 'form' | 'sheet' | 'documents' | 'review';

export type GrantSectionKey =
  | 'eligibility' | 'student' | 'family' | 'siblings' | 'financial' | 'certification'
  | 'ev-education' | 'ev-boarding' | 'ev-employment' | 'ev-financing' | 'ev-memberships'
  | 'ev-travel' | 'ev-family' | 'ev-assets' | 'ev-statements'
  | 'documents' | 'review';

export interface GrantSectionDef {
  key: GrantSectionKey;
  label: string;
  part: GrantPart;
}

export const GRANT_PART_LABELS: Record<GrantPart, string> = {
  form: 'Application Form',
  sheet: 'Evaluation Sheet',
  documents: 'Documents',
  review: 'Review & Submit'
};

const FORM_SECTIONS: GrantSectionDef[] = [
  { key: 'eligibility', label: 'Eligibility', part: 'form' },
  { key: 'student', label: 'Student Data', part: 'form' },
  { key: 'family', label: 'Parents, Contact & Guardian', part: 'form' },
  { key: 'siblings', label: 'Siblings', part: 'form' },
  { key: 'financial', label: 'Financial Information', part: 'form' },
  { key: 'certification', label: 'Certification', part: 'form' }
];

const SHEET_SECTIONS: GrantSectionDef[] = [
  { key: 'ev-education', label: '1. Educational Background', part: 'sheet' },
  { key: 'ev-boarding', label: '2. Boarding House / Dorm', part: 'sheet' },
  { key: 'ev-employment', label: '3. Employment', part: 'sheet' },
  { key: 'ev-financing', label: '4. Who Finances Schooling', part: 'sheet' },
  { key: 'ev-memberships', label: '5. Memberships', part: 'sheet' },
  { key: 'ev-travel', label: '6. Passport & Travel', part: 'sheet' },
  { key: 'ev-family', label: '7. Family Data', part: 'sheet' },
  { key: 'ev-assets', label: '8. Income, Properties & Assets', part: 'sheet' },
  { key: 'ev-statements', label: '9. Statements', part: 'sheet' }
];

export function getGrantSections(scholarship: Scholarship): GrantSectionDef[] {
  return [
    ...FORM_SECTIONS,
    ...(scholarship.applicationFormType === 'polca' ? SHEET_SECTIONS : []),
    { key: 'documents', label: 'Upload Documents', part: 'documents' },
    { key: 'review', label: 'Review & Submit', part: 'review' }
  ];
}

// --- Path helpers (form state is one nested object) ---------------------------

export function getIn(obj: unknown, path: string): any {
  return path.split('.').reduce<any>((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

export function setIn<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split('.');
  const current: any = obj ?? {};
  const copy: any = Array.isArray(current) ? [...current] : { ...current };
  copy[head] = rest.length === 0 ? value : setIn(current[head], rest.join('.'), value);
  return copy;
}

// Deep-merges stored values over defaults so records saved before a field
// existed still have every key the form expects. Arrays come from `stored`.
export function mergeDefaults<T>(defaults: T, stored: unknown): T {
  if (stored === undefined || stored === null) return defaults;
  if (Array.isArray(defaults) || typeof defaults !== 'object' || defaults === null) {
    return stored as T;
  }
  if (typeof stored !== 'object' || Array.isArray(stored)) return defaults;
  const out: any = { ...defaults };
  for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
    out[key] = key in (defaults as object) ? mergeDefaults((defaults as any)[key], value) : value;
  }
  return out;
}

export function newRowId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 11)}`;
}

// --- Defaults & prefill -------------------------------------------------------

export function calculateAge(dateOfBirth: string): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const hadBirthday =
    today.getMonth() > dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
  if (!hadBirthday) age--;
  return age >= 0 ? age : null;
}

function toDateInput(value?: string | null): string {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function emptySchool(): SchoolRecord {
  return { schoolName: '', address: '', yearGraduated: '', type: '' };
}

function emptyMember(): HouseholdMember {
  return { name: '', age: 0, highestDegree: '', school: '', employer: '', jobTitle: '', grossIncome: 0, living: '' };
}

export function emptyEvaluationSheet(): EvaluationSheet {
  const financing = () => ({ checked: false, specify: '', amountPerSem: 0 });
  return {
    education: { elementary: emptySchool(), juniorHigh: emptySchool(), seniorHigh: emptySchool() },
    boarding: { isBoarding: '', monthlyFee: 0 },
    employment: { isEmployed: '', type: '', company: '', address: '', telNo: '' },
    financing: {
      parents: false, relatives: false, self: false,
      otherScholarship: financing(), educationalPlan: financing(), others: financing()
    },
    memberships: {
      none: false, sportsCountryClub: false, serviceOrg: false,
      professionalAssociation: false, businessOrg: false, others: false, othersSpecify: ''
    },
    travel: { hasPassport: '', passportDateIssued: '', traveledAbroad: '', numberOfTrips: 0, financedBy: '' },
    family: {
      coResiding: { father: false, mother: false, guardian: false, spouse: false, children: 0, brothers: 0, sisters: 0, others: 0 },
      parentsSeparated: '',
      father: emptyMember(),
      mother: emptyMember(),
      spouse: emptyMember(),
      guardian: emptyMember(),
      earningSiblings: [],
      nonEarningSiblings: [],
      otherContributors: []
    },
    assets: {
      incomeSources: [],
      incomeSourcesOther: '',
      electricity: { has: '', lastBill: 0 },
      water: { has: '', lastBill: 0 },
      cableTv: '',
      internet: '',
      house: { status: '', monthlyAmount: 0, othersSpecify: '' },
      floorAreaSqm: 0,
      bedrooms: 0,
      bathrooms: 0,
      vehicles: Object.fromEntries(VEHICLE_TYPES.map(v => [v.key, { count: 0, models: [] }])),
      hasCreditCards: '',
      realEstate: [],
      boarders: { has: '', monthlyIncome: 0 }
    },
    statements: {
      applicant: { agreed: false, name: '', date: '' },
      parent: { agreed: false, name: '', date: '' }
    }
  };
}

function emptyDetails(scholarship: Scholarship): GrantApplicationDetails {
  const eligibilityAnswers: GrantEligibilityAnswers = scholarship.applicationFormType === 'polca'
    ? { hsGeneralAverage: null, lowestHsGrade: null, notRelatedToBoardMember: false }
    : { alumnusName: '', relationship: '', institution: '', batchYear: '' };
  return {
    eligibilityAnswers,
    personalInfo: {
      lastName: '', firstName: '', middleName: '', studentNumber: '', course: '', yearLevel: '',
      dateOfBirth: '', placeOfBirth: '', civilStatus: '', gender: '', citizenship: '', religion: '',
      email: '', secondarySchool: '', secondarySchoolType: ''
    },
    parentsGuardian: {
      father: { name: '', occupation: '', monthlyIncome: 0 },
      mother: { name: '', occupation: '', monthlyIncome: 0 },
      guardian: { name: '', relationship: '', address: '', landlineNo: '', mobileNo: '' }
    },
    contactSchool: { streetAddress: '', barangay: '', municipality: '', province: '', landlineNo: '', mobileNo: '' },
    siblings: [],
    assetsExpenses: {
      houseTenure: '', houseValue: '', hasAutomobile: '', automobileValue: '',
      familyIncomeBracket: '', monthlyExpensesBracket: ''
    },
    agreement: { agreed: false, applicantName: '', parentGuardianName: '' },
    ...(scholarship.applicationFormType === 'polca' ? { evaluationSheet: emptyEvaluationSheet() } : {})
  };
}

// Fresh form values, prefilled from the student profile wherever the
// profile already has the field.
export function initialGrantValues(scholarship: Scholarship, student: StudentProfile): GrantApplicationDetails {
  const base = emptyDetails(scholarship);
  // Stored name parts only — never split from the full name.
  const names = profileNameParts(student);
  const civilStatus = CIVIL_STATUS_OPTIONS.find(o => o.toLowerCase() === (student.civilStatus || '').toLowerCase()) ?? '';
  base.personalInfo = {
    ...base.personalInfo,
    lastName: names.lastName,
    firstName: names.firstName,
    middleName: names.middleName,
    studentNumber: student.studentNumber,
    course: student.course || '',
    yearLevel: student.yearLevel || '',
    dateOfBirth: toDateInput(student.dateOfBirth),
    placeOfBirth: student.placeOfBirth || '',
    civilStatus,
    citizenship: student.nationality || '',
    email: student.email || ''
  };
  base.contactSchool = {
    ...base.contactSchool,
    streetAddress: student.homeAddress || '',
    municipality: student.cityMunicipality || '',
    province: student.province || '',
    landlineNo: student.telephoneNumber || '',
    mobileNo: student.mobileNumber || ''
  };
  base.parentsGuardian.father.name = student.fatherName || '';
  base.parentsGuardian.mother.name = student.motherName || '';
  base.parentsGuardian.guardian = {
    ...base.parentsGuardian.guardian,
    name: student.guardianName || '',
    relationship: student.guardianRelationship || '',
    address: student.guardianAddress || '',
    mobileNo: student.guardianContactNo || ''
  };
  return base;
}

// Maps a stored application document (raw from the API) back into form
// values, filling any missing keys from the defaults.
export function toGrantDetails(doc: any, scholarship: Scholarship): GrantApplicationDetails {
  const defaults = emptyDetails(scholarship);
  return mergeDefaults(defaults, {
    personalInfo: doc.personalInfo,
    contactSchool: doc.contactSchool,
    parentsGuardian: doc.parentsGuardian,
    siblings: doc.siblings ?? [],
    assetsExpenses: doc.assetsExpenses,
    agreement: doc.agreement,
    eligibilityAnswers: doc.eligibilityAnswers,
    ...(doc.evaluationSheet ? { evaluationSheet: doc.evaluationSheet } : {})
  });
}

export function coResidingTotal(sheet: EvaluationSheet): number {
  const c = sheet.family.coResiding;
  return [c.father, c.mother, c.guardian, c.spouse].filter(Boolean).length +
    (c.children || 0) + (c.brothers || 0) + (c.sisters || 0) + (c.others || 0);
}

// --- Documents ----------------------------------------------------------------

export function uploadSlots(scholarship: Scholarship): DocumentSlot[] {
  return (scholarship.documentSlots ?? []).filter(slot => slot.source !== 'form');
}

export function isSlotRequired(slot: DocumentSlot, values: GrantApplicationDetails): boolean {
  if (slot.source === 'form' || slot.optional) return false;
  return slot.requiredWhen ? slot.requiredWhen(values) : true;
}

// --- Validation ---------------------------------------------------------------

export type FieldErrors = Record<string, string>;

export interface GrantValidationContext {
  scholarship: Scholarship;
  values: GrantApplicationDetails;
  // Slot key -> number of files selected now plus already on record.
  fileCounts: Record<string, number>;
  variants: Record<string, string>;
}

const REQUIRED = 'This field is required.';
const CURRENT_YEAR = new Date().getFullYear();

function blank(value: unknown): boolean {
  return typeof value !== 'string' || !value.trim();
}

function requireText(errs: FieldErrors, values: object, path: string) {
  if (blank(getIn(values, path))) errs[path] = REQUIRED;
}

function requireChoice(errs: FieldErrors, values: object, path: string) {
  if (blank(getIn(values, path))) errs[path] = 'Select an option.';
}

function requireNonNegative(errs: FieldErrors, values: object, path: string) {
  const n = getIn(values, path);
  if (typeof n !== 'number' || Number.isNaN(n) || n < 0) errs[path] = 'Enter 0 or a positive number.';
}

function isPhMobile(value: string): boolean {
  return /^(\+63|0)9\d{9}$/.test(value.replace(/[\s-]/g, ''));
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isYearOrNA(value: string): boolean {
  const v = value.trim();
  if (/^n\/?a$/i.test(v)) return true;
  return /^\d{4}$/.test(v) && Number(v) >= 1900 && Number(v) <= CURRENT_YEAR;
}

function requireFile(errs: FieldErrors, ctx: GrantValidationContext, slotKey: string) {
  const slot = ctx.scholarship.documentSlots?.find(s => s.key === slotKey);
  if (!slot || !isSlotRequired(slot, ctx.values)) return;
  if (!(ctx.fileCounts[slotKey] > 0)) errs[`doc.${slotKey}`] = 'Upload a JPG file.';
}

export function validateGrantSection(key: GrantSectionKey, ctx: GrantValidationContext): FieldErrors {
  const errs: FieldErrors = {};
  const v = ctx.values;
  const sheet = v.evaluationSheet;

  switch (key) {
    case 'eligibility': {
      const a = v.eligibilityAnswers;
      const criteria = ctx.scholarship.eligibilityCriteria;
      if (criteria?.minHsGeneralAverage !== undefined) {
        const avg = a.hsGeneralAverage;
        const lowest = a.lowestHsGrade;
        if (typeof avg !== 'number') errs['eligibilityAnswers.hsGeneralAverage'] = REQUIRED;
        else if (avg < 60 || avg > 100) errs['eligibilityAnswers.hsGeneralAverage'] = 'Enter a grade between 60 and 100.';
        if (typeof lowest !== 'number') errs['eligibilityAnswers.lowestHsGrade'] = REQUIRED;
        else if (lowest < 60 || lowest > 100) errs['eligibilityAnswers.lowestHsGrade'] = 'Enter a grade between 60 and 100.';
        else if (typeof avg === 'number' && lowest > avg) errs['eligibilityAnswers.lowestHsGrade'] = 'Your lowest grade can’t be higher than your general average.';
      }
      if (criteria?.requiresNoBoardRelation && !a.notRelatedToBoardMember) {
        errs['eligibilityAnswers.notRelatedToBoardMember'] = 'You must make this declaration to apply.';
      }
      if (criteria?.alumniRelation) {
        requireText(errs, v, 'eligibilityAnswers.alumnusName');
        requireChoice(errs, v, 'eligibilityAnswers.relationship');
        requireChoice(errs, v, 'eligibilityAnswers.institution');
        if (blank(a.batchYear)) errs['eligibilityAnswers.batchYear'] = REQUIRED;
        else if (!/^\d{4}$/.test(a.batchYear!.trim()) || Number(a.batchYear) < 1900 || Number(a.batchYear) > CURRENT_YEAR) {
          errs['eligibilityAnswers.batchYear'] = 'Enter a 4-digit year.';
        }
      }
      // Only report "not eligible" once the inputs themselves are valid.
      if (Object.keys(errs).length === 0) {
        const reasons = checkApplyEligibility(ctx.scholarship, a);
        if (reasons.length) errs.eligibility = reasons.join(' ');
      }
      break;
    }
    case 'student': {
      for (const f of ['lastName', 'firstName', 'course', 'placeOfBirth', 'citizenship', 'religion', 'secondarySchool']) {
        requireText(errs, v, `personalInfo.${f}`);
      }
      for (const f of ['yearLevel', 'civilStatus', 'gender', 'secondarySchoolType']) {
        requireChoice(errs, v, `personalInfo.${f}`);
      }
      const dob = v.personalInfo.dateOfBirth;
      const age = calculateAge(dob);
      if (blank(dob)) errs['personalInfo.dateOfBirth'] = REQUIRED;
      else if (age === null || age < 14 || age > 100) errs['personalInfo.dateOfBirth'] = 'Enter a valid date of birth.';
      if (blank(v.personalInfo.email)) errs['personalInfo.email'] = REQUIRED;
      else if (!isEmail(v.personalInfo.email)) errs['personalInfo.email'] = 'Enter a valid email address.';
      requireFile(errs, ctx, 'photo2x2');
      break;
    }
    case 'family': {
      for (const who of ['father', 'mother']) {
        requireText(errs, v, `parentsGuardian.${who}.name`);
        requireText(errs, v, `parentsGuardian.${who}.occupation`);
        requireNonNegative(errs, v, `parentsGuardian.${who}.monthlyIncome`);
      }
      for (const f of ['streetAddress', 'barangay', 'municipality', 'province']) {
        requireText(errs, v, `contactSchool.${f}`);
      }
      const mobile = v.contactSchool.mobileNo;
      if (blank(mobile)) errs['contactSchool.mobileNo'] = REQUIRED;
      else if (!isPhMobile(mobile)) errs['contactSchool.mobileNo'] = 'Use a valid PH mobile number, e.g. 09171234567.';
      const g = v.parentsGuardian.guardian;
      if (!blank(g.name)) {
        requireText(errs, v, 'parentsGuardian.guardian.relationship');
        if (!blank(g.mobileNo) && !isPhMobile(g.mobileNo)) {
          errs['parentsGuardian.guardian.mobileNo'] = 'Use a valid PH mobile number, e.g. 09171234567.';
        }
      }
      break;
    }
    case 'siblings':
      v.siblings.forEach((sib, i) => {
        if (blank(sib.name)) errs[`siblings.${i}.name`] = REQUIRED;
        if (sib.age < 0 || sib.age > 120) errs[`siblings.${i}.age`] = 'Enter a valid age.';
      });
      break;
    case 'financial':
      requireChoice(errs, v, 'assetsExpenses.houseTenure');
      requireChoice(errs, v, 'assetsExpenses.houseValue');
      requireChoice(errs, v, 'assetsExpenses.hasAutomobile');
      if (v.assetsExpenses.hasAutomobile === 'Yes') requireChoice(errs, v, 'assetsExpenses.automobileValue');
      requireChoice(errs, v, 'assetsExpenses.familyIncomeBracket');
      requireChoice(errs, v, 'assetsExpenses.monthlyExpensesBracket');
      break;
    case 'certification':
      if (!v.agreement.agreed) errs['agreement.agreed'] = 'Tick the box to certify.';
      requireText(errs, v, 'agreement.applicantName');
      requireText(errs, v, 'agreement.parentGuardianName');
      break;

    // --- Evaluation sheet (POLCA) ---
    case 'ev-education':
      for (const level of ['elementary', 'juniorHigh', 'seniorHigh']) {
        const base = `evaluationSheet.education.${level}`;
        requireText(errs, v, `${base}.schoolName`);
        requireText(errs, v, `${base}.address`);
        requireChoice(errs, v, `${base}.type`);
        const year = getIn(v, `${base}.yearGraduated`) as string;
        if (blank(year)) errs[`${base}.yearGraduated`] = REQUIRED;
        else if (!isYearOrNA(year)) errs[`${base}.yearGraduated`] = 'Enter a 4-digit year or N/A.';
      }
      break;
    case 'ev-boarding':
      requireChoice(errs, v, 'evaluationSheet.boarding.isBoarding');
      if (sheet?.boarding.isBoarding === 'Yes') requireNonNegative(errs, v, 'evaluationSheet.boarding.monthlyFee');
      break;
    case 'ev-employment':
      requireChoice(errs, v, 'evaluationSheet.employment.isEmployed');
      if (sheet?.employment.isEmployed === 'Yes') {
        requireChoice(errs, v, 'evaluationSheet.employment.type');
        requireText(errs, v, 'evaluationSheet.employment.company');
        requireText(errs, v, 'evaluationSheet.employment.address');
      }
      break;
    case 'ev-financing': {
      const f = sheet!.financing;
      const any = f.parents || f.relatives || f.self || f.otherScholarship.checked || f.educationalPlan.checked || f.others.checked;
      if (!any) errs['evaluationSheet.financing'] = 'Select at least one.';
      for (const k of ['otherScholarship', 'educationalPlan', 'others'] as const) {
        if (f[k].checked) {
          requireText(errs, v, `evaluationSheet.financing.${k}.specify`);
          requireNonNegative(errs, v, `evaluationSheet.financing.${k}.amountPerSem`);
        }
      }
      break;
    }
    case 'ev-memberships': {
      const m = sheet!.memberships;
      const any = m.none || m.sportsCountryClub || m.serviceOrg || m.professionalAssociation || m.businessOrg || m.others;
      if (!any) errs['evaluationSheet.memberships'] = 'Select at least one, or "None".';
      if (m.others) requireText(errs, v, 'evaluationSheet.memberships.othersSpecify');
      break;
    }
    case 'ev-travel':
      requireChoice(errs, v, 'evaluationSheet.travel.hasPassport');
      if (sheet?.travel.hasPassport === 'Yes') requireText(errs, v, 'evaluationSheet.travel.passportDateIssued');
      requireChoice(errs, v, 'evaluationSheet.travel.traveledAbroad');
      if (sheet?.travel.traveledAbroad === 'Yes') {
        if (!(sheet.travel.numberOfTrips >= 1)) errs['evaluationSheet.travel.numberOfTrips'] = 'Enter the number of trips.';
        requireChoice(errs, v, 'evaluationSheet.travel.financedBy');
      }
      break;
    case 'ev-family': {
      const fam = sheet!.family;
      requireChoice(errs, v, 'evaluationSheet.family.parentsSeparated');
      for (const role of ['father', 'mother']) {
        requireText(errs, v, `evaluationSheet.family.${role}.name`);
        requireChoice(errs, v, `evaluationSheet.family.${role}.living`);
      }
      for (const role of ['spouse', 'guardian'] as const) {
        if (!blank(fam[role].name)) requireChoice(errs, v, `evaluationSheet.family.${role}.living`);
      }
      fam.earningSiblings.forEach((_, i) => requireText(errs, v, `evaluationSheet.family.earningSiblings.${i}.name`));
      fam.nonEarningSiblings.forEach((_, i) => requireText(errs, v, `evaluationSheet.family.nonEarningSiblings.${i}.name`));
      fam.otherContributors.forEach((_, i) => {
        requireText(errs, v, `evaluationSheet.family.otherContributors.${i}.name`);
        requireChoice(errs, v, `evaluationSheet.family.otherContributors.${i}.contributionType`);
      });
      break;
    }
    case 'ev-assets': {
      const a = sheet!.assets;
      if (a.incomeSources.length === 0) errs['evaluationSheet.assets.incomeSources'] = 'Select at least one.';
      if (a.incomeSources.includes('Others')) requireText(errs, v, 'evaluationSheet.assets.incomeSourcesOther');
      for (const util of ['electricity', 'water'] as const) {
        requireChoice(errs, v, `evaluationSheet.assets.${util}.has`);
        if (a[util].has === 'Yes') requireNonNegative(errs, v, `evaluationSheet.assets.${util}.lastBill`);
      }
      requireFile(errs, ctx, 'electricityBill');
      requireFile(errs, ctx, 'waterBill');
      requireChoice(errs, v, 'evaluationSheet.assets.cableTv');
      requireChoice(errs, v, 'evaluationSheet.assets.internet');
      requireChoice(errs, v, 'evaluationSheet.assets.house.status');
      if (a.house.status === HOUSE_STATUS.others) requireText(errs, v, 'evaluationSheet.assets.house.othersSpecify');
      for (const f of ['floorAreaSqm', 'bedrooms', 'bathrooms']) requireNonNegative(errs, v, `evaluationSheet.assets.${f}`);
      requireChoice(errs, v, 'evaluationSheet.assets.hasCreditCards');
      a.realEstate.forEach((_, i) => {
        requireChoice(errs, v, `evaluationSheet.assets.realEstate.${i}.kind`);
        requireText(errs, v, `evaluationSheet.assets.realEstate.${i}.location`);
      });
      requireChoice(errs, v, 'evaluationSheet.assets.boarders.has');
      break;
    }
    case 'ev-statements':
      for (const who of ['applicant', 'parent']) {
        if (!getIn(v, `evaluationSheet.statements.${who}.agreed`)) errs[`evaluationSheet.statements.${who}.agreed`] = 'Tick the box to certify.';
        requireText(errs, v, `evaluationSheet.statements.${who}.name`);
      }
      break;

    case 'documents':
      for (const slot of uploadSlots(ctx.scholarship).filter(s => s.placement !== 'form')) {
        if (isSlotRequired(slot, v) && !(ctx.fileCounts[slot.key] > 0)) errs[`doc.${slot.key}`] = 'Upload at least one JPG file.';
        if (slot.variants && ctx.fileCounts[slot.key] > 0 && blank(ctx.variants[slot.key])) {
          errs[`docVariant.${slot.key}`] = 'Select which document you are uploading.';
        }
      }
      break;
    case 'review':
      break;
  }
  return errs;
}
