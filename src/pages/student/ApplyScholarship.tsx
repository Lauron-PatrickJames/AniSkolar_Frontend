import React, { useState, useEffect } from 'react';
import { useAuth } from '@clerk/react'; // match whatever package App.tsx imports useAuth from
import {
  Scholarship,
  StudentProfile,
  Application,
  SfagPersonalInfo,
  SfagContactSchool,
  SfagParentsGuardian,
  SfagSibling,
  SfagAssetsExpenses,
  SfagAgreement,
  SfagApplicationDetails
} from '../../types';
import { AlertCircle, CheckCircle, Plus, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import GrantApplication from './GrantApplication';
import { isGrantFormType } from '../../utils/grantForms';
import { OFFICE_LABELS, officeOf } from '../../data/scholarships';
import {
  Block, ChoicePills, FieldError, FileSlotView, Hint, Req, SubHeading, errorInputClass, inputClass, labelClass
} from '../../components/grant-forms/fields';
import {
  BackLink, DraftIndicator, FormBanner, PrivacyNote, RevisionNote, SectionNav, SectionPanel, SectionStatus,
  SubmittedScreen, WizardFooter, WizardHeader, WizardSection
} from '../../components/grant-forms/WizardShell';
import { middleInitialOf, profileNameParts } from '../../utils/names';
import { SfagAnswers, StandardProfileAnswers } from '../../components/grant-forms/StandardAnswersView';

interface ApplyScholarshipProps {
  scholarship: Scholarship;
  student: StudentProfile;
  onBack: () => void;
  onSubmitApplication: (application: Application) => void;
  onResubmitApplication?: (application: Application) => void;
  existingApplication?: Application;
  id?: string;
}

interface UploadedFile {
  docName: string;
  fileName: string;
  fileSize: string;
  file: File; // kept so we can actually send the bytes to the backend on submit
}

// Matches App.tsx's convention: read from Vite env at build time, fall back
// to localhost for local dev. No trailing /api here — each fetch call
// appends its own path (e.g. `${API_BASE_URL}/api/applications`), consistent
// with how App.tsx calls /api/students/me and /api/applications/student/:id.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

// --- Shared option lists --------------------------------------------------
const INCOME_BRACKETS = [
  '₱0 – ₱5,166.65',
  '₱5,166.66 – ₱10,333.30',
  '₱10,333.31 – ₱20,666.60',
  '₱20,666.61 – ₱50,250.00',
  '₱50,250.01 – ₱154,750.00',
  '₱154,750.01 and above'
];

const BILL_BRACKETS = [
  '₱0 – ₱5,321.66',
  '₱5,321.67 – ₱10,643.32',
  '₱10,643.33 – ₱16,394.16',
  '₱16,394.17 – ₱53,767.49',
  '₱53,767.50 and above'
];

const ASSET_BRACKETS = [
  '₱0 – ₱100,000',
  '₱100,001 – ₱300,000',
  '₱300,001 – ₱600,000',
  '₱600,001 and above'
];

const CIVIL_STATUS_OPTIONS = ['SINGLE', 'MARRIED', 'WIDOWED', 'SEPARATED', 'ANNULLED'];
const RELIGION_OPTIONS = ['ROMAN CATHOLIC', 'CHRISTIAN', 'IGLESIA NI CRISTO', 'ISLAM', 'OTHERS'];
const GENDER_OPTIONS = ['Female', 'Male', 'Non-binary', 'Other', 'Prefer not to say'];
const SIBLING_SOCIAL_STATUS_OPTIONS = [
  'STUDYING-ELEMENTARY',
  'STUDYING-HIGHSCHOOL',
  'STUDYING-COLLEGE',
  'WORKING',
  'NOT WORKING',
  'N/A'
];

function mapCivilStatus(status?: string): string {
  if (!status) return 'SINGLE';
  const upper = status.toUpperCase();
  return CIVIL_STATUS_OPTIONS.includes(upper) ? upper : 'SINGLE';
}

function toDateInputValue(value?: string | null): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function calculateAge(dateOfBirth: string): string {
  if (!dateOfBirth) return '';
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) age--;
  return age >= 0 ? String(age) : '';
}

function emptyPersonalInfo(student: StudentProfile): SfagPersonalInfo {
  const names = profileNameParts(student);
  const dateOfBirth = toDateInputValue(student.dateOfBirth);
  return {
    lastName: names.lastName,
    firstName: names.firstName,
    middleInitial: middleInitialOf(names.middleName),
    suffix: '',
    studentNumber: student.studentNumber,
    course: student.course,
    yearLevel: student.yearLevel,
    placeOfBirth: student.placeOfBirth || '',
    dateOfBirth,
    age: calculateAge(dateOfBirth),
    civilStatus: mapCivilStatus(student.civilStatus),
    gender: '',
    nationality: student.nationality || 'FILIPINO',
    isPwd: false,
    religion: 'ROMAN CATHOLIC',
    specifyReligion: ''
  };
}

function emptyContactSchool(student: StudentProfile): SfagContactSchool {
  return {
    streetAddress: student.homeAddress || '',
    municipality: student.cityMunicipality || '',
    province: student.province || '',
    country: student.country || 'PHILIPPINES',
    mobileNo: student.mobileNumber || '',
    landlineNo: student.telephoneNumber || '',
    email: student.email,
    secondarySchool: '',
    schoolAddress: '',
    schoolType: 'Public'
  };
}

function normalizePersonalInfo(personalInfo: SfagPersonalInfo): SfagPersonalInfo {
  const dateOfBirth = toDateInputValue(personalInfo.dateOfBirth);
  return {
    ...personalInfo,
    dateOfBirth,
    age: calculateAge(dateOfBirth)
  };
}

function emptyParentsGuardian(student: StudentProfile): SfagParentsGuardian {
  return {
    father: { fullName: student.fatherName || '', occupation: '', company: '', companyTel: '', monthlyIncome: INCOME_BRACKETS[0], isSoloParent: false },
    mother: { fullName: student.motherName || '', occupation: '', company: '', companyTel: '', monthlyIncome: INCOME_BRACKETS[0], isSoloParent: false },
    guardian: {
      fullName: student.guardianName || '',
      occupation: '',
      monthlyIncome: INCOME_BRACKETS[0],
      relationship: student.guardianRelationship || '',
      contactNo: student.guardianContactNo || ''
    }
  };
}

function emptyAssetsExpenses(): SfagAssetsExpenses {
  return {
    houseAndLot: ASSET_BRACKETS[0],
    automobile: ASSET_BRACKETS[0],
    incomeSources: '',
    combinedNonTaxableIncome: INCOME_BRACKETS[0],
    affidavitNonFilingIncomeTax: INCOME_BRACKETS[0],
    waterBill: BILL_BRACKETS[0],
    electricityBill: BILL_BRACKETS[0],
    telephoneBill: BILL_BRACKETS[0],
    mobilePhoneBill: BILL_BRACKETS[0],
    internetBill: BILL_BRACKETS[0],
    amortizationHouse: BILL_BRACKETS[0],
    amortizationAuto: BILL_BRACKETS[0]
  };
}

// --- Validation helpers -----------------------------------------------------
const REQUIRED_MSG = 'This field is required.';
const TODAY_ISO = new Date().toISOString().split('T')[0];

function isBlank(value?: string | number | null): boolean {
  return value === undefined || value === null || !String(value).trim();
}

// Profile/API values can arrive as numbers or null (e.g. Student.gpa is a
// Number in Mongo); the form keeps every field as a string.
function asText(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// Accepts PH mobile numbers like 09171234567 or +639171234567 (spaces/dashes ok)
function isValidPhMobile(value: string): boolean {
  const digits = value.replace(/[\s-]/g, '');
  return /^(\+63|0)9\d{9}$/.test(digits);
}

function isValidDateOfBirth(value: string): boolean {
  if (!value) return false;
  const dob = new Date(value);
  if (isNaN(dob.getTime())) return false;
  if (dob > new Date()) return false;
  const age = parseInt(calculateAge(value) || '-1', 10);
  return age >= 15 && age <= 100;
}

function isValidGpa(value: string): boolean {
  const n = parseFloat(value);
  if (isNaN(n)) return false;
  return n >= 1.0 && n <= 5.0;
}

function isValidAge(value: string): boolean {
  if (isBlank(value)) return false;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 120;
}

type FieldKind = 'text' | 'email' | 'phone' | 'gpa' | 'date';

function messageForField(value: string, kind: FieldKind): string | undefined {
  if (isBlank(value)) return REQUIRED_MSG;
  switch (kind) {
    case 'email':
      return isValidEmail(value) ? undefined : 'Enter a valid email address.';
    case 'phone':
      return isValidPhMobile(value) ? undefined : 'Use a valid PH mobile number, e.g. 09171234567.';
    case 'gpa':
      return isValidGpa(value) ? undefined : 'Enter a GPA between 1.00 and 5.00.';
    case 'date':
      return isValidDateOfBirth(value) ? undefined : 'Enter a valid date of birth (age 15–100).';
    default:
      return undefined;
  }
}

// --- Draft persistence (survives refresh, not actual browser close) -------
// Keyed per scholarship + student so switching scholarships or accounts
// never shows someone else's half-finished draft. File contents can't be
// restored after a refresh (browser security restriction) — only the
// typed fields and a reminder of which doc names were previously selected.

const DRAFT_STORAGE_PREFIX = 'aniskolar_draft_';

function getDraftKey(scholarshipId: string, studentNumber: string, clerkId?: string) {
  return `${DRAFT_STORAGE_PREFIX}${scholarshipId}_${studentNumber}_${clerkId || '_'}`;
}

interface DraftData {
  currentKey?: string;
  visited?: string[];
  savedAt?: string;
  wizardStep?: number;   // drafts saved before the section layout
  personalInfo: SfagPersonalInfo;
  contactSchool: SfagContactSchool;
  parentsGuardian: SfagParentsGuardian;
  siblings: SfagSibling[];
  assetsExpenses: SfagAssetsExpenses;
  agreement: SfagAgreement;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phone: string;
  program: string;
  yearLevel: string;
  gpa: string;
  previouslyUploadedDocNames: string[];
}

function loadDraft(scholarshipId: string, studentNumber: string, clerkId?: string): Partial<DraftData> | null {
  try {
    const raw = localStorage.getItem(getDraftKey(scholarshipId, studentNumber, clerkId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearDraft(scholarshipId: string, studentNumber: string, clerkId?: string) {
  try {
    localStorage.removeItem(getDraftKey(scholarshipId, studentNumber, clerkId));
  } catch {
    // ignore
  }
}

// Grant-form scholarships (POLCA, Alumni) use their own multi-section
// wizard; everything else goes through the standard / SFAG flow below.
export default function ApplyScholarship(props: ApplyScholarshipProps) {
  if (isGrantFormType(props.scholarship.applicationFormType)) {
    return <GrantApplication {...props} />;
  }
  return <StandardApplyScholarship {...props} />;
}

// --- Wizard sections ----------------------------------------------------------
// Same layout as the POLCA / Alumni wizard (components/grant-forms/WizardShell).

type StdSectionKey =
  | 'profile'
  | 'personal' | 'contact' | 'parents' | 'siblings' | 'assets' | 'agreement'
  | 'documents' | 'review';

const PART_LABELS: Record<string, string> = {
  form: 'Application Form',
  documents: 'Documents',
  review: 'Review & Submit'
};

const SFAG_SECTIONS: (WizardSection & { key: StdSectionKey })[] = [
  { key: 'personal', label: 'Personal Info', part: 'form' },
  { key: 'contact', label: 'Contact & School', part: 'form' },
  { key: 'parents', label: 'Parents & Guardian', part: 'form' },
  { key: 'siblings', label: 'Siblings', part: 'form' },
  { key: 'assets', label: 'Assets & Expenses', part: 'form' },
  { key: 'agreement', label: 'Agreement', part: 'form' },
  { key: 'documents', label: 'Upload Documents', part: 'documents' },
  { key: 'review', label: 'Review & Submit', part: 'review' }
];

const STANDARD_SECTIONS: (WizardSection & { key: StdSectionKey })[] = [
  { key: 'profile', label: 'Personal & Academic Profile', part: 'form' },
  { key: 'documents', label: 'Upload Documents', part: 'documents' },
  { key: 'review', label: 'Review & Submit', part: 'review' }
];

// Drafts saved before the section layout stored a numbered tab instead.
const LEGACY_SFAG_STEPS: Record<number, StdSectionKey> = {
  1: 'personal', 2: 'contact', 3: 'parents', 4: 'siblings', 5: 'assets', 6: 'documents'
};

const YEAR_LEVEL_OPTIONS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'];

function newSibling(): SfagSibling {
  return {
    id: `sib_${Math.random().toString(36).substr(2, 9)}`,
    fullName: '',
    socialStatus: SIBLING_SOCIAL_STATUS_OPTIONS[0],
    civilStatus: 'SINGLE',
    age: '',
    schoolOrCompany: '',
    schoolType: 'Public',
    tuitionOrIncome: '',
    isDlsudScholar: false
  };
}

interface TextFieldOpts {
  key: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  kind?: FieldKind;
  type?: string;
  placeholder?: string;
  className?: string;
  maxLength?: number;
  max?: string;
  disabled?: boolean;
  hint?: React.ReactNode;
}

interface SelectFieldOpts {
  key?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  required?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

function StandardApplyScholarship({
  scholarship,
  student,
  onBack,
  onSubmitApplication,
  onResubmitApplication,
  existingApplication,
  id
}: ApplyScholarshipProps) {
  const { getToken } = useAuth();
  const isSfag = scholarship.applicationFormType === 'sfag';
  const isResubmit = !!existingApplication;
  const sections = isSfag ? SFAG_SECTIONS : STANDARD_SECTIONS;
  const officeLabel = OFFICE_LABELS[officeOf(scholarship)];

  // Load any in-progress draft for this exact scholarship + student combo.
  // Computed once per mount (scholarship/student don't change mid-session).
  // On a resubmit, we deliberately IGNORE any stray localStorage draft —
  // the source of truth is the previously-submitted application the LSO
  // sent back, not a half-finished draft from some earlier session.
  const savedDraft = React.useMemo(
    () => (isResubmit ? null : loadDraft(scholarship.id, student.studentNumber, student.clerkId)),
    [scholarship.id, student.studentNumber, student.clerkId, isResubmit]
  );

  // --- Navigation state ---------------------------------------------------------
  const [currentKey, setCurrentKey] = useState<StdSectionKey>(() => {
    const saved = savedDraft?.currentKey as StdSectionKey | undefined;
    if (saved && sections.some(s => s.key === saved)) return saved;
    const legacy = savedDraft?.wizardStep;
    if (isSfag && legacy && LEGACY_SFAG_STEPS[legacy]) return LEGACY_SFAG_STEPS[legacy];
    if (!isSfag && legacy === 6) return 'documents';
    return sections[0].key;
  });
  const [visited, setVisited] = useState<Set<string>>(() =>
    new Set(isResubmit ? sections.map(s => s.key) : savedDraft?.visited ?? [])
  );
  const [banner, setBanner] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(savedDraft?.savedAt ?? null);

  // --- SFAG form state -------------------------------------------------------------
  const [personalInfo, setPersonalInfo] = useState<SfagPersonalInfo>(() =>
    normalizePersonalInfo(
      existingApplication?.sfagDetails?.personalInfo ?? savedDraft?.personalInfo ?? emptyPersonalInfo(student)
    )
  );
  const [contactSchool, setContactSchool] = useState<SfagContactSchool>(() =>
    existingApplication?.sfagDetails?.contactSchool ?? savedDraft?.contactSchool ?? emptyContactSchool(student)
  );
  const [parentsGuardian, setParentsGuardian] = useState<SfagParentsGuardian>(
    existingApplication?.sfagDetails?.parentsGuardian ?? savedDraft?.parentsGuardian ?? emptyParentsGuardian(student)
  );
  const [siblings, setSiblings] = useState<SfagSibling[]>(
    existingApplication?.sfagDetails?.siblings ?? savedDraft?.siblings ?? []
  );
  const [assetsExpenses, setAssetsExpenses] = useState<SfagAssetsExpenses>(
    existingApplication?.sfagDetails?.assetsExpenses ?? savedDraft?.assetsExpenses ?? emptyAssetsExpenses()
  );
  const [agreement, setAgreement] = useState<SfagAgreement>(
    existingApplication?.sfagDetails?.agreement ?? savedDraft?.agreement ?? { certifyConsulted: false, certifyAccuracy: false }
  );

  // errors: fieldKey -> human readable message. Presence of a key = red highlight.
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fieldClass = (key: string) => (errors[key] ? errorInputClass : inputClass);
  const fieldError = (key: string) => errors[key];
  const clearFieldError = (key: string) => {
    setErrors(prev => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };
  const setFieldErrorMsg = (key: string, msg: string) => {
    setErrors(prev => ({ ...prev, [key]: msg }));
  };
  // Live validation on blur, so mistakes surface before the person tries to move on.
  const validateOnBlur = (key: string, value: string, kind: FieldKind = 'text') => {
    const msg = messageForField(value, kind);
    if (msg) setFieldErrorMsg(key, msg);
    else clearFieldError(key);
  };

  // --- Standard (Entrance) form state --------------------------------------------
  // Applications loaded from the API keep the Entrance answers under
  // standardInfo (see models/Application.js); ones created in this session
  // carry them on personalInfo/program/etc. Read whichever is present.
  const storedStandard: Partial<Record<string, unknown>> =
    (existingApplication as unknown as { standardInfo?: Record<string, unknown> } | undefined)?.standardInfo ?? {};
  const existingPI = existingApplication?.personalInfo;
  // Prefilled from the profile's stored name parts — never split from the
  // full name (see utils/names.ts).
  const profileNames = profileNameParts(student);
  const [firstName, setFirstName] = useState(asText(
    existingPI?.firstName ?? storedStandard.firstName ?? savedDraft?.firstName ?? profileNames.firstName
  ));
  const [middleName, setMiddleName] = useState(asText(
    storedStandard.middleName ?? savedDraft?.middleName ?? profileNames.middleName
  ));
  const [lastName, setLastName] = useState(asText(
    existingPI?.lastName ?? storedStandard.lastName ?? savedDraft?.lastName ?? profileNames.lastName
  ));
  const [email, setEmail] = useState(asText(existingPI?.email ?? storedStandard.email ?? savedDraft?.email ?? student.email));
  const [phone, setPhone] = useState(asText(existingPI?.phone ?? storedStandard.phone ?? savedDraft?.phone ?? student.mobileNumber));
  const studentNumber = student.studentNumber;
  const [program, setProgram] = useState(asText(existingApplication?.program ?? storedStandard.program ?? savedDraft?.program ?? student.course));
  const [yearLevel, setYearLevel] = useState(asText(existingApplication?.yearLevel ?? storedStandard.yearLevel ?? savedDraft?.yearLevel ?? student.yearLevel));
  const [gpa, setGpa] = useState(asText(existingApplication?.gpa ?? storedStandard.gpa ?? savedDraft?.gpa ?? student.gpa));

  const [uploads, setUploads] = useState<Record<string, UploadedFile>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [referenceCode, setReferenceCode] = useState('');

  // Document names already on file from the application being resubmitted —
  // browsers can't restore actual File bytes, so we still need a fresh
  // JPG per requirement, but we can tell the student what's already there.
  // Documents straight from the API are { docType, fileId, ... }; ones built
  // in this session are { name, uploaded }. Accept either shape.
  const previouslySubmittedDocNames = (existingApplication?.documents ?? [])
    .map(d => d as { name?: string; uploaded?: boolean; docType?: string; fileId?: string })
    .filter(d => d.uploaded || d.fileId)
    .map(d => d.name ?? d.docType ?? '')
    .filter(Boolean);

  // Auto-save the draft to localStorage on every relevant change. File
  // contents are intentionally excluded (see previouslyUploadedDocNames)
  // since browsers can't restore actual File objects after a refresh.
  // Skipped entirely during a resubmit — see savedDraft comment above.
  useEffect(() => {
    if (isResubmit || isSuccess) return;
    const now = new Date().toISOString();
    const draft: DraftData = {
      currentKey,
      visited: Array.from(visited),
      savedAt: now,
      personalInfo,
      contactSchool,
      parentsGuardian,
      siblings,
      assetsExpenses,
      agreement,
      firstName,
      middleName,
      lastName,
      email,
      phone,
      program,
      yearLevel,
      gpa,
      previouslyUploadedDocNames: Object.keys(uploads),
    };
    try {
      localStorage.setItem(
        getDraftKey(scholarship.id, student.studentNumber, student.clerkId),
        JSON.stringify(draft)
      );
      setSavedAt(now);
    } catch {
      // Storage can fail (private browsing, quota) — draft just won't persist, form still works
    }
  }, [
    currentKey, visited, personalInfo, contactSchool, parentsGuardian, siblings,
    assetsExpenses, agreement, firstName, middleName, lastName, email, phone, program,
    yearLevel, gpa, uploads, scholarship.id, student.studentNumber, student.clerkId, isResubmit, isSuccess
  ]);

  // --- Uploads ----------------------------------------------------------------------
  const pickFile = (docName: string, file: File) => {
    const isJpeg = file.type === 'image/jpeg' || /\.(jpe?g)$/i.test(file.name);
    if (!isJpeg) {
      setUploadErrors(prev => ({ ...prev, [docName]: 'Only JPG files are allowed. Please convert your file and try again.' }));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadErrors(prev => ({ ...prev, [docName]: 'Each file must be under 10MB.' }));
      return;
    }
    setUploadErrors(prev => ({ ...prev, [docName]: '' }));
    clearFieldError(`doc:${docName}`);
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    setUploads(prev => ({
      ...prev,
      [docName]: { docName, fileName: file.name, fileSize: `${fileSizeMB} MB`, file }
    }));
  };

  const removeFile = (docName: string) => {
    setUploads(prev => {
      const copy = { ...prev };
      delete copy[docName];
      return copy;
    });
  };

  // --- Siblings ---------------------------------------------------------------------
  const updateSibling = (sibId: string, patch: Partial<SfagSibling>) => {
    setSiblings(prev => prev.map(s => (s.id === sibId ? { ...s, ...patch } : s)));
  };

  const removeSibling = (sibId: string) => {
    setSiblings(prev => prev.filter(s => s.id !== sibId));
    setErrors({});
  };

  // --- Validation -------------------------------------------------------------------
  const validateSfagStep = (step: number): Record<string, string> => {
    const errs: Record<string, string> = {};

    if (step === 1) {
      if (isBlank(personalInfo.lastName)) errs.lastName = REQUIRED_MSG;
      if (isBlank(personalInfo.firstName)) errs.firstName = REQUIRED_MSG;
      if (isBlank(personalInfo.placeOfBirth)) errs.placeOfBirth = REQUIRED_MSG;
      if (isBlank(personalInfo.dateOfBirth)) {
        errs.dateOfBirth = REQUIRED_MSG;
      } else if (!isValidDateOfBirth(personalInfo.dateOfBirth)) {
        errs.dateOfBirth = 'Enter a valid date of birth (age 15–100).';
      }
      if (isBlank(personalInfo.nationality)) errs.nationality = REQUIRED_MSG;
      if (isBlank(personalInfo.gender)) errs.gender = REQUIRED_MSG;
      if (personalInfo.religion === 'OTHERS' && isBlank(personalInfo.specifyReligion)) {
        errs.specifyReligion = REQUIRED_MSG;
      }
    }
    if (step === 2) {
      if (isBlank(contactSchool.streetAddress)) errs.streetAddress = REQUIRED_MSG;
      if (isBlank(contactSchool.municipality)) errs.municipality = REQUIRED_MSG;
      if (isBlank(contactSchool.province)) errs.province = REQUIRED_MSG;
      if (isBlank(contactSchool.country)) errs.country = REQUIRED_MSG;
      if (isBlank(contactSchool.mobileNo)) {
        errs.mobileNo = REQUIRED_MSG;
      } else if (!isValidPhMobile(contactSchool.mobileNo)) {
        errs.mobileNo = 'Use a valid PH mobile number, e.g. 09171234567.';
      }
      if (isBlank(contactSchool.email)) {
        errs.email = REQUIRED_MSG;
      } else if (!isValidEmail(contactSchool.email)) {
        errs.email = 'Enter a valid email address.';
      }
      if (isBlank(contactSchool.secondarySchool)) errs.secondarySchool = REQUIRED_MSG;
      if (isBlank(contactSchool.schoolAddress)) errs.schoolAddress = REQUIRED_MSG;
    }
    if (step === 3) {
      // A parent marked N/A because the other is a solo parent is exempt.
      const fatherIsNA = parentsGuardian.mother.isSoloParent;
      const motherIsNA = parentsGuardian.father.isSoloParent;
      if (!fatherIsNA) {
        if (isBlank(parentsGuardian.father.fullName)) errs['father.fullName'] = REQUIRED_MSG;
        if (isBlank(parentsGuardian.father.occupation)) errs['father.occupation'] = REQUIRED_MSG;
        if (isBlank(parentsGuardian.father.company)) errs['father.company'] = REQUIRED_MSG;
        if (isBlank(parentsGuardian.father.companyTel)) errs['father.companyTel'] = REQUIRED_MSG;
      }
      if (!motherIsNA) {
        if (isBlank(parentsGuardian.mother.fullName)) errs['mother.fullName'] = REQUIRED_MSG;
        if (isBlank(parentsGuardian.mother.occupation)) errs['mother.occupation'] = REQUIRED_MSG;
        if (isBlank(parentsGuardian.mother.company)) errs['mother.company'] = REQUIRED_MSG;
        if (isBlank(parentsGuardian.mother.companyTel)) errs['mother.companyTel'] = REQUIRED_MSG;
      }
    }
    if (step === 5) {
      if (isBlank(assetsExpenses.incomeSources)) errs.incomeSources = REQUIRED_MSG;
    }

    return errs;
  };

  const validateStandardFields = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (isBlank(firstName)) errs.firstName = REQUIRED_MSG;
    if (isBlank(lastName)) errs.lastName = REQUIRED_MSG;
    if (isBlank(email)) {
      errs.email = REQUIRED_MSG;
    } else if (!isValidEmail(email)) {
      errs.email = 'Enter a valid email address.';
    }
    if (isBlank(phone)) {
      errs.phone = REQUIRED_MSG;
    } else if (!isValidPhMobile(phone)) {
      errs.phone = 'Use a valid PH mobile number, e.g. 09171234567.';
    }
    if (isBlank(program)) errs.program = REQUIRED_MSG;
    if (isBlank(yearLevel)) errs.yearLevel = REQUIRED_MSG;
    if (isBlank(gpa)) {
      errs.gpa = REQUIRED_MSG;
    } else if (!isValidGpa(gpa)) {
      errs.gpa = 'Enter a GPA between 1.00 and 5.00.';
    }
    return errs;
  };

  const validateSection = (key: StdSectionKey): Record<string, string> => {
    switch (key) {
      case 'profile': return validateStandardFields();
      case 'personal': return validateSfagStep(1);
      case 'contact': return validateSfagStep(2);
      case 'parents': return validateSfagStep(3);
      case 'siblings': {
        const errs: Record<string, string> = {};
        siblings.forEach((sib, i) => {
          if (isBlank(sib.fullName)) errs[`sib.${i}.fullName`] = REQUIRED_MSG;
          if (!isBlank(sib.age) && !isValidAge(sib.age)) errs[`sib.${i}.age`] = 'Enter a valid age (0–120).';
        });
        return errs;
      }
      case 'assets': return validateSfagStep(5);
      case 'agreement': {
        const errs: Record<string, string> = {};
        if (!agreement.certifyConsulted) errs.certifyConsulted = 'Tick the box to certify.';
        if (!agreement.certifyAccuracy) errs.certifyAccuracy = 'Tick the box to certify.';
        return errs;
      }
      case 'documents': {
        // On resubmit, a requirement already on file doesn't force a fresh upload.
        const errs: Record<string, string> = {};
        scholarship.requirements.forEach(req => {
          if (!uploads[req] && !(isResubmit && previouslySubmittedDocNames.includes(req))) {
            errs[`doc:${req}`] = 'Upload a JPG file.';
          }
        });
        return errs;
      }
      case 'review': return {};
    }
  };

  const allErrors = Object.fromEntries(sections.map(s => [s.key, validateSection(s.key)])) as Record<StdSectionKey, Record<string, string>>;
  const hasErrors = (key: StdSectionKey) => Object.keys(allErrors[key]).length > 0;
  const statusOf = (key: string): SectionStatus => {
    const k = key as StdSectionKey;
    if (k === 'review' || !visited.has(k)) return 'todo';
    return hasErrors(k) ? 'error' : 'done';
  };
  const countable = sections.filter(s => s.key !== 'review');
  const doneCount = countable.filter(s => statusOf(s.key) === 'done').length;

  const summarizeMissing = (count: number, key: StdSectionKey): string => {
    if (key === 'documents') return `Please upload all required files. ${count} ${count === 1 ? 'file is' : 'files are'} missing.`;
    const label = count === 1 ? 'field is' : 'fields are';
    const note = key === 'parents' ? ' Use "N/A" for any parent field that does not apply.' : '';
    return `Fill out all required fields. ${count} ${label} missing or invalid.${note}`;
  };

  // --- Navigation -------------------------------------------------------------------
  const currentIndex = sections.findIndex(s => s.key === currentKey);
  const current = sections[currentIndex];
  const prev = currentIndex > 0 ? sections[currentIndex - 1] : null;
  const markVisited = (key: string) => setVisited(prevSet => (prevSet.has(key) ? prevSet : new Set(prevSet).add(key)));

  const goTo = (key: StdSectionKey) => {
    markVisited(currentKey);
    setBanner('');
    setErrors(visited.has(key) ? allErrors[key] : {});
    setCurrentKey(key);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goNext = () => {
    markVisited(currentKey);
    const errs = allErrors[currentKey];
    const count = Object.keys(errs).length;
    if (count > 0) {
      setErrors(errs);
      setBanner(summarizeMissing(count, currentKey));
      return;
    }
    goTo(sections[currentIndex + 1].key);
  };

  const buildSfagDetails = (): SfagApplicationDetails => ({
    personalInfo,
    contactSchool,
    parentsGuardian,
    siblings,
    assetsExpenses,
    agreement
  });

  // Matches your real backend contract: POST /api/applications, multipart/form-data,
  // one "documents" file per requirement (in order), a parallel "documentLabels"
  // JSON array naming each one, plus the form-section payloads as JSON strings.
  // Requires a Clerk bearer token — the Express CSRF middleware in server.js
  // rejects any non-GET request without a valid session (401 otherwise).
  // Returns the saved Mongo document (with _id and referenceCode) on success.
  // On resubmit it PATCHes /api/applications/:id with the same shape instead.
  const submitToServer = async (sfagDetails?: SfagApplicationDetails): Promise<{ _id: string; referenceCode: string }> => {
    const formData = new FormData();
    const labels: string[] = [];

    scholarship.requirements.forEach(req => {
      const entry = uploads[req];
      if (entry) {
        formData.append('documents', entry.file, entry.fileName);
        labels.push(req);
      }
    });
    formData.append('documentLabels', JSON.stringify(labels));

    formData.append('studentNumber', isSfag ? personalInfo.studentNumber : studentNumber);
    formData.append('scholarshipId', scholarship.id);
    formData.append('scholarshipName', scholarship.name);
    formData.append('applicationFormType', isSfag ? 'sfag' : 'standard');

    if (isSfag && sfagDetails) {
      formData.append('personalInfo', JSON.stringify(sfagDetails.personalInfo));
      formData.append('contactSchool', JSON.stringify(sfagDetails.contactSchool));
      formData.append('parentsGuardian', JSON.stringify(sfagDetails.parentsGuardian));
      formData.append('siblings', JSON.stringify(sfagDetails.siblings));
      formData.append('assetsExpenses', JSON.stringify(sfagDetails.assetsExpenses));
      formData.append('agreement', JSON.stringify(sfagDetails.agreement));
    } else {
      formData.append('standardInfo', JSON.stringify({ firstName, middleName, lastName, email, phone, studentNumber, program, yearLevel, gpa }));
    }

    const token = await getToken();

    const url = isResubmit && existingApplication
      ? `${API_BASE_URL}/api/applications/${existingApplication.id}`
      : `${API_BASE_URL}/api/applications`;
    const method = isResubmit ? 'PATCH' : 'POST';

    if (isResubmit) {
      formData.append('status', 'Under Evaluation');
    }

    const response = await fetch(url, {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `Failed to ${isResubmit ? 'resubmit' : 'submit'} application. Please try again.`);
    }
    return body.application;
  };

  const handleSubmit = async () => {
    setVisited(new Set(sections.map(s => s.key)));
    const firstInvalid = sections.find(s => hasErrors(s.key));
    if (firstInvalid) {
      setErrors(allErrors[firstInvalid.key]);
      setCurrentKey(firstInvalid.key);
      setBanner(`Some sections still need attention. Starting with: ${firstInvalid.label}.`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const sfagDetails = isSfag ? buildSfagDetails() : undefined;
    setIsSubmitting(true);
    setBanner('');

    try {
      const saved = await submitToServer(sfagDetails);

      const newApplication: Application = {
        id: saved._id,
        scholarshipId: scholarship.id,
        scholarshipName: scholarship.name,
        personalInfo: isSfag
          ? {
              firstName: personalInfo.firstName,
              lastName: personalInfo.lastName,
              email: contactSchool.email,
              phone: contactSchool.mobileNo,
              studentNumber: personalInfo.studentNumber
            }
          : { firstName, lastName, email, phone, studentNumber },
        program: isSfag ? personalInfo.course : program,
        yearLevel: isSfag ? personalInfo.yearLevel : yearLevel,
        gpa: isSfag ? student.gpa : gpa,
        documents: scholarship.requirements.map(req => ({
          name: req,
          uploaded: true,
          fileName: uploads[req]?.fileName
        })),
        status: 'Under Evaluation',
        submittedAt: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        ...(sfagDetails ? { sfagDetails } : {})
      };

      clearDraft(scholarship.id, student.studentNumber, student.clerkId);
      setReferenceCode(saved.referenceCode || existingApplication?.id.slice(-8).toUpperCase() || '');
      setIsSubmitting(false);
      setIsSuccess(true);
      if (isResubmit && onResubmitApplication) {
        onResubmitApplication(newApplication);
      } else {
        onSubmitApplication(newApplication);
      }
    } catch (err) {
      setIsSubmitting(false);
      setBanner(err instanceof Error ? err.message : `Something went wrong ${isResubmit ? 'resubmitting' : 'submitting'} your application. Please try again.`);
    }
  };

  const handleDiscardDraft = () => {
    if (!window.confirm('Discard your saved answers for this application and start over?')) return;
    clearDraft(scholarship.id, student.studentNumber, student.clerkId);
    window.location.reload();
  };

  // --- Field helpers (called as functions so inputs keep focus) ----------------
  const textField = (o: TextFieldOpts) => (
    <div className={o.className}>
      <label className={labelClass}>{o.label} {o.required && !o.disabled && <Req />}</label>
      <input
        type={o.type ?? 'text'}
        inputMode={o.type === 'tel' ? 'tel' : o.kind === 'gpa' ? 'decimal' : undefined}
        className={o.disabled ? inputClass : fieldClass(o.key)}
        value={o.value}
        max={o.max}
        maxLength={o.maxLength}
        placeholder={o.placeholder}
        disabled={o.disabled}
        onChange={e => { o.onChange(e.target.value); clearFieldError(o.key); }}
        onBlur={o.required && !o.disabled ? e => validateOnBlur(o.key, e.target.value, o.kind ?? 'text') : undefined}
        aria-invalid={!!fieldError(o.key)}
      />
      {fieldError(o.key) ? <FieldError message={fieldError(o.key)} /> : o.hint ? <Hint>{o.hint}</Hint> : null}
    </div>
  );

  const selectField = (o: SelectFieldOpts) => (
    <div className={o.className}>
      <label className={labelClass}>{o.label} {o.required && !o.disabled && <Req />}</label>
      <select
        className={o.key && !o.disabled ? fieldClass(o.key) : inputClass}
        value={o.value}
        disabled={o.disabled}
        onChange={e => { o.onChange(e.target.value); if (o.key) clearFieldError(o.key); }}
      >
        {o.placeholder !== undefined && <option value="">{o.placeholder}</option>}
        {o.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
      {o.key && <FieldError message={fieldError(o.key)} />}
    </div>
  );

  const setPI = (patch: Partial<SfagPersonalInfo>) => setPersonalInfo(p => ({ ...p, ...patch }));
  const setCS = (patch: Partial<SfagContactSchool>) => setContactSchool(c => ({ ...c, ...patch }));
  const setAE = (patch: Partial<SfagAssetsExpenses>) => setAssetsExpenses(a => ({ ...a, ...patch }));

  // --- Success ------------------------------------------------------------------------
  if (isSuccess) {
    return (
      <SubmittedScreen
        isResubmit={isResubmit}
        referenceCode={referenceCode}
        scholarshipName={scholarship.name}
        officeLabel={officeLabel}
        onBack={onBack}
      />
    );
  }

  // --- Sections -------------------------------------------------------------------------
  const renderProfile = () => (
    <div className="space-y-6">
      <Block>
        <SubHeading note="Prefilled from your student profile — please check each entry.">Student Details</SubHeading>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {textField({ key: 'firstName', label: 'First Name', required: true, value: firstName, onChange: setFirstName })}
          {textField({ key: 'middleName', label: 'Middle Name', value: middleName, onChange: setMiddleName })}
          {textField({ key: 'lastName', label: 'Last Name', required: true, value: lastName, onChange: setLastName })}
          {textField({ key: 'email', label: 'Email Address', type: 'email', kind: 'email', required: true, value: email, onChange: setEmail })}
          {textField({ key: 'phone', label: 'Mobile Phone', type: 'tel', kind: 'phone', required: true, placeholder: '09171234567', value: phone, onChange: setPhone })}
          {textField({ key: 'studentNumber', label: 'Student Number', disabled: true, value: studentNumber, onChange: () => {} })}
          {textField({ key: 'program', label: 'Academic Program (Course)', required: true, value: program, onChange: setProgram })}
          {selectField({ key: 'yearLevel', label: 'Year Level', required: true, value: yearLevel, onChange: setYearLevel, options: YEAR_LEVEL_OPTIONS, placeholder: 'Select…' })}
          {textField({ key: 'gpa', label: 'Cumulative GPA', kind: 'gpa', required: true, placeholder: 'e.g. 1.75', value: gpa, onChange: setGpa, hint: 'Scale: 1.00 (highest) – 5.00 (lowest)' })}
        </div>
      </Block>
    </div>
  );

  const renderPersonal = () => (
    <div className="space-y-6">
      <Block>
        <SubHeading note="Prefilled from your student profile — please check each entry.">Name</SubHeading>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {textField({ key: 'lastName', label: 'Last Name', required: true, value: personalInfo.lastName, onChange: v => setPI({ lastName: v }) })}
          {textField({ key: 'firstName', label: 'First Name', required: true, value: personalInfo.firstName, onChange: v => setPI({ firstName: v }) })}
          {textField({ key: 'middleInitial', label: 'M.I.', maxLength: 2, value: personalInfo.middleInitial, onChange: v => setPI({ middleInitial: v }) })}
          {textField({ key: 'suffix', label: 'Suffix', placeholder: 'Jr., III, etc.', value: personalInfo.suffix, onChange: v => setPI({ suffix: v }) })}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          {textField({ key: 'studentNumber', label: 'Student No.', disabled: true, value: personalInfo.studentNumber, onChange: () => {} })}
          {textField({ key: 'course', label: 'Course / Program', value: personalInfo.course, onChange: v => setPI({ course: v }) })}
          {textField({ key: 'yearLevel', label: 'Year Level', value: personalInfo.yearLevel, onChange: v => setPI({ yearLevel: v }) })}
        </div>
      </Block>

      <Block>
        <SubHeading>Basic Information</SubHeading>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {textField({ key: 'placeOfBirth', label: 'Place of Birth', required: true, value: personalInfo.placeOfBirth, onChange: v => setPI({ placeOfBirth: v }) })}
          {textField({
            key: 'dateOfBirth', label: 'Date of Birth', type: 'date', kind: 'date', required: true, max: TODAY_ISO,
            value: personalInfo.dateOfBirth, onChange: v => setPI({ dateOfBirth: v, age: calculateAge(v) })
          })}
          <div>
            <label className={labelClass}>Age</label>
            <div className="px-3.5 py-2.5 rounded-xl text-sm bg-slate-100/70 border border-slate-100 text-slate-600 font-semibold">{personalInfo.age || '—'}</div>
          </div>
          {selectField({ label: 'Civil Status', value: personalInfo.civilStatus, onChange: v => setPI({ civilStatus: v }), options: CIVIL_STATUS_OPTIONS })}
          {selectField({ key: 'gender', label: 'Gender', required: true, value: personalInfo.gender, onChange: v => setPI({ gender: v }), options: GENDER_OPTIONS, placeholder: 'Select…' })}
          {textField({ key: 'nationality', label: 'Nationality', required: true, value: personalInfo.nationality, onChange: v => setPI({ nationality: v }) })}
          {selectField({ label: 'Religion', value: personalInfo.religion, onChange: v => setPI({ religion: v }), options: RELIGION_OPTIONS })}
          {personalInfo.religion === 'OTHERS' &&
            textField({ key: 'specifyReligion', label: 'Specify Religion', required: true, value: personalInfo.specifyReligion, onChange: v => setPI({ specifyReligion: v }) })}
          <div>
            <label className={labelClass}>Person with Disability (PWD)?</label>
            <ChoicePills value={personalInfo.isPwd ? 'Yes' : 'No'} onChange={v => setPI({ isPwd: v === 'Yes' })} options={['Yes', 'No']} />
          </div>
        </div>
      </Block>
    </div>
  );

  const renderContact = () => (
    <div className="space-y-6">
      <Block>
        <SubHeading>Home Address</SubHeading>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {textField({ key: 'streetAddress', label: 'No. / Street / Subdivision / Barangay', required: true, className: 'sm:col-span-3', value: contactSchool.streetAddress, onChange: v => setCS({ streetAddress: v }) })}
          {textField({ key: 'municipality', label: 'Municipality / City', required: true, value: contactSchool.municipality, onChange: v => setCS({ municipality: v }) })}
          {textField({ key: 'province', label: 'Province', required: true, value: contactSchool.province, onChange: v => setCS({ province: v }) })}
          {textField({ key: 'country', label: 'Country', required: true, value: contactSchool.country, onChange: v => setCS({ country: v }) })}
        </div>
      </Block>
      <Block>
        <SubHeading>Contact Details</SubHeading>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {textField({ key: 'mobileNo', label: 'Mobile No.', type: 'tel', kind: 'phone', required: true, placeholder: '09171234567', value: contactSchool.mobileNo, onChange: v => setCS({ mobileNo: v }) })}
          {textField({ key: 'landlineNo', label: 'Landline No.', type: 'tel', value: contactSchool.landlineNo, onChange: v => setCS({ landlineNo: v }) })}
          {textField({ key: 'email', label: 'Email Address', type: 'email', kind: 'email', required: true, value: contactSchool.email, onChange: v => setCS({ email: v }) })}
        </div>
      </Block>
      <Block>
        <SubHeading>Secondary School</SubHeading>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {textField({ key: 'secondarySchool', label: 'Secondary School Attended', required: true, className: 'sm:col-span-2', value: contactSchool.secondarySchool, onChange: v => setCS({ secondarySchool: v }) })}
          <div>
            <label className={labelClass}>Type</label>
            <ChoicePills value={contactSchool.schoolType} onChange={v => setCS({ schoolType: v as 'Public' | 'Private' })} options={['Public', 'Private']} />
          </div>
          {textField({ key: 'schoolAddress', label: 'School Address', required: true, className: 'sm:col-span-3', value: contactSchool.schoolAddress, onChange: v => setCS({ schoolAddress: v }) })}
        </div>
      </Block>
    </div>
  );

  const renderParents = () => (
    <div className="space-y-6">
      <Block>
        <SubHeading note={'Tick "Solo parent" if one parent raises you alone — the other parent is then marked N/A.'}>Parents</SubHeading>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(['father', 'mother'] as const).map(parentKey => {
            const parent = parentsGuardian[parentKey];
            const otherKey = parentKey === 'father' ? 'mother' : 'father';
            const isDisabled = parentsGuardian[otherKey].isSoloParent;
            const setParent = (updates: Partial<typeof parent>) =>
              setParentsGuardian(pg => ({ ...pg, [parentKey]: { ...pg[parentKey], ...updates } }));
            const fk = (name: string) => `${parentKey}.${name}`;

            const handleSoloToggle = (checked: boolean) => {
              setParentsGuardian(pg => {
                if (checked) {
                  return {
                    ...pg,
                    [parentKey]: { ...pg[parentKey], isSoloParent: true },
                    [otherKey]: { ...pg[otherKey], fullName: 'N/A', occupation: 'N/A', company: 'N/A', companyTel: 'N/A', isSoloParent: false }
                  };
                }
                const clear = (v: string) => (v === 'N/A' ? '' : v);
                return {
                  ...pg,
                  [parentKey]: { ...pg[parentKey], isSoloParent: false },
                  [otherKey]: {
                    ...pg[otherKey],
                    fullName: clear(pg[otherKey].fullName),
                    occupation: clear(pg[otherKey].occupation),
                    company: clear(pg[otherKey].company),
                    companyTel: clear(pg[otherKey].companyTel)
                  }
                };
              });
              ['fullName', 'occupation', 'company', 'companyTel'].forEach(f => {
                clearFieldError(`${parentKey}.${f}`);
                clearFieldError(`${otherKey}.${f}`);
              });
            };

            return (
              <div key={parentKey} className="p-4 border border-slate-200 rounded-xl bg-slate-50/40 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{parentKey}</p>
                  {isDisabled && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">N/A (solo parent)</span>
                  )}
                </div>
                {textField({ key: fk('fullName'), label: 'Full Name', required: true, disabled: isDisabled, value: parent.fullName, onChange: v => setParent({ fullName: v }) })}
                {textField({ key: fk('occupation'), label: 'Occupation', required: true, disabled: isDisabled, value: parent.occupation, onChange: v => setParent({ occupation: v }) })}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {textField({ key: fk('company'), label: 'Company', required: true, disabled: isDisabled, value: parent.company, onChange: v => setParent({ company: v }) })}
                  {textField({ key: fk('companyTel'), label: 'Company Tel.', required: true, disabled: isDisabled, value: parent.companyTel, onChange: v => setParent({ companyTel: v }) })}
                </div>
                {selectField({ label: 'Monthly Income', disabled: isDisabled, value: parent.monthlyIncome, onChange: v => setParent({ monthlyIncome: v }), options: INCOME_BRACKETS })}
                <label className={`flex items-center gap-2 text-xs font-semibold ${isDisabled ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 cursor-pointer'}`}>
                  <input type="checkbox" checked={parent.isSoloParent} disabled={isDisabled} onChange={e => handleSoloToggle(e.target.checked)} className="accent-brand-green" />
                  Solo parent
                </label>
              </div>
            );
          })}
        </div>
      </Block>

      <Block>
        <SubHeading note="Optional — only fill this out if a guardian assists with your support.">Guardian</SubHeading>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {textField({ key: 'guardian.fullName', label: 'Full Name', value: parentsGuardian.guardian.fullName, onChange: v => setParentsGuardian(pg => ({ ...pg, guardian: { ...pg.guardian, fullName: v } })) })}
          {textField({ key: 'guardian.relationship', label: 'Relationship', value: parentsGuardian.guardian.relationship, onChange: v => setParentsGuardian(pg => ({ ...pg, guardian: { ...pg.guardian, relationship: v } })) })}
          {textField({ key: 'guardian.occupation', label: 'Occupation', value: parentsGuardian.guardian.occupation, onChange: v => setParentsGuardian(pg => ({ ...pg, guardian: { ...pg.guardian, occupation: v } })) })}
          {selectField({ label: 'Monthly Income', value: parentsGuardian.guardian.monthlyIncome, onChange: v => setParentsGuardian(pg => ({ ...pg, guardian: { ...pg.guardian, monthlyIncome: v } })), options: INCOME_BRACKETS })}
          {textField({ key: 'guardian.contactNo', label: 'Contact No.', type: 'tel', value: parentsGuardian.guardian.contactNo, onChange: v => setParentsGuardian(pg => ({ ...pg, guardian: { ...pg.guardian, contactNo: v } })) })}
        </div>
      </Block>
    </div>
  );

  const renderSiblings = () => (
    <div className="space-y-4">
      <SubHeading note="List all your brothers and sisters. Fill in the school if they are studying, or the employer if working.">Brothers & Sisters</SubHeading>
      {siblings.length === 0 && (
        <p className="text-xs text-slate-400 italic px-1">No siblings added. Skip this step if you are an only child.</p>
      )}
      <AnimatePresence initial={false}>
        {siblings.map((sib, i) => (
          <motion.div
            key={sib.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="p-4 border border-slate-200 rounded-xl bg-slate-50/40 space-y-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Sibling {i + 1}</span>
              <button
                type="button"
                onClick={() => removeSibling(sib.id)}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-500 hover:bg-rose-50 px-2 py-1 rounded-md transition-colors focus:outline-hidden"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              {textField({ key: `sib.${i}.fullName`, label: 'Full Name', required: true, placeholder: 'Last name, First name', className: 'sm:col-span-2', value: sib.fullName, onChange: v => updateSibling(sib.id, { fullName: v }) })}
              {textField({ key: `sib.${i}.age`, label: 'Age', value: sib.age, onChange: v => updateSibling(sib.id, { age: v }) })}
              {selectField({ label: 'Civil Status', value: sib.civilStatus, onChange: v => updateSibling(sib.id, { civilStatus: v }), options: CIVIL_STATUS_OPTIONS })}
              {selectField({ label: 'Status', className: 'sm:col-span-2', value: sib.socialStatus, onChange: v => updateSibling(sib.id, { socialStatus: v }), options: SIBLING_SOCIAL_STATUS_OPTIONS })}
              {textField({ key: `sib.${i}.schoolOrCompany`, label: 'School or Employer', className: 'sm:col-span-2', value: sib.schoolOrCompany, onChange: v => updateSibling(sib.id, { schoolOrCompany: v }) })}
              <div className="sm:col-span-2">
                <label className={labelClass}>School Type</label>
                <ChoicePills value={sib.schoolType} onChange={v => updateSibling(sib.id, { schoolType: v as SfagSibling['schoolType'] })} options={['Public', 'Private', 'N/A']} />
              </div>
              {textField({ key: `sib.${i}.tuitionOrIncome`, label: 'Tuition / Monthly Income', value: sib.tuitionOrIncome, onChange: v => updateSibling(sib.id, { tuitionOrIncome: v }) })}
              <div>
                <label className={labelClass}>DLSU-D Scholar?</label>
                <ChoicePills value={sib.isDlsudScholar ? 'Yes' : 'No'} onChange={v => updateSibling(sib.id, { isDlsudScholar: v === 'Yes' })} options={['Yes', 'No']} />
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setSiblings(prev => [...prev, newSibling()])}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-green hover:text-brand-green-dark bg-brand-green/5 hover:bg-brand-green/10 border border-brand-green/20 px-3.5 py-2 rounded-lg transition-colors focus:outline-hidden"
      >
        <Plus className="w-3.5 h-3.5" />
        Add sibling
      </button>
    </div>
  );

  const BILLS: { key: keyof SfagAssetsExpenses; label: string }[] = [
    { key: 'waterBill', label: 'Water' },
    { key: 'electricityBill', label: 'Electricity' },
    { key: 'telephoneBill', label: 'Telephone' },
    { key: 'mobilePhoneBill', label: 'Mobile Phone' },
    { key: 'internetBill', label: 'Internet' },
    { key: 'amortizationHouse', label: 'Amortization (House)' },
    { key: 'amortizationAuto', label: 'Amortization (Auto)' }
  ];

  const renderAssets = () => (
    <div className="space-y-6">
      <Block>
        <SubHeading>Market Value of Assets</SubHeading>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {selectField({ label: 'House and Lot', value: assetsExpenses.houseAndLot, onChange: v => setAE({ houseAndLot: v }), options: ASSET_BRACKETS })}
          {selectField({ label: 'Automobile', value: assetsExpenses.automobile, onChange: v => setAE({ automobile: v }), options: ASSET_BRACKETS })}
        </div>
      </Block>
      <Block>
        <SubHeading>Income</SubHeading>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {textField({ key: 'incomeSources', label: 'Income Sources', required: true, className: 'sm:col-span-2', placeholder: 'e.g. Salary, small business, remittances', value: assetsExpenses.incomeSources, onChange: v => setAE({ incomeSources: v }) })}
          {selectField({ label: 'Combined Total Non-Taxable Income', value: assetsExpenses.combinedNonTaxableIncome, onChange: v => setAE({ combinedNonTaxableIncome: v }), options: INCOME_BRACKETS })}
          {selectField({ label: 'Affidavit of Non-Filing of Income Tax', value: assetsExpenses.affidavitNonFilingIncomeTax, onChange: v => setAE({ affidavitNonFilingIncomeTax: v }), options: INCOME_BRACKETS })}
        </div>
      </Block>
      <Block>
        <SubHeading>Latest Monthly Bills</SubHeading>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {BILLS.map(b => (
            <React.Fragment key={b.key}>
              {selectField({ label: b.label, value: assetsExpenses[b.key] as string, onChange: v => setAE({ [b.key]: v } as Partial<SfagAssetsExpenses>), options: BILL_BRACKETS })}
            </React.Fragment>
          ))}
        </div>
      </Block>
    </div>
  );

  const renderAgreement = () => {
    const hasError = !!fieldError('certifyConsulted') || !!fieldError('certifyAccuracy');
    const box = (key: 'certifyConsulted' | 'certifyAccuracy', text: string) => (
      <div>
        <label className={`flex items-start gap-2.5 text-xs leading-relaxed cursor-pointer ${fieldError(key) ? 'text-rose-700' : 'text-slate-700'}`}>
          <input
            type="checkbox"
            checked={agreement[key]}
            onChange={e => { setAgreement(a => ({ ...a, [key]: e.target.checked })); clearFieldError(key); }}
            className={`mt-0.5 shrink-0 ${fieldError(key) ? 'accent-rose-500' : 'accent-brand-green'}`}
          />
          <span>{text}</span>
        </label>
        <FieldError message={fieldError(key)} />
      </div>
    );
    return (
      <div className={`border rounded-xl p-4 space-y-4 ${hasError ? 'border-rose-400 bg-rose-50/60' : 'border-amber-300 bg-amber-50/50'}`}>
        {box('certifyConsulted', 'I hereby certify that I have consulted family members with regard to the statements and other information. They are to the best of our knowledge correct and complete. The Student Scholarship Office has my permission to verify the information on this form and at any time revoke my scholarship should, after observing due process, find the information false.')}
        {box('certifyAccuracy', 'This is to certify the veracity and completeness of all information written on this form. I understand that any falsification, misrepresentation or withholding of information shall be a ground for non-processing or exclusion from the Scholarship Office of De La Salle University-Dasmariñas.')}
      </div>
    );
  };

  const restoredDocNames = savedDraft?.previouslyUploadedDocNames ?? [];
  const renderDocuments = () => (
    <div className="space-y-5">
      <p className="text-xs text-slate-500">
        {isResubmit
          ? 'Anything already on file is marked. Re-upload only what the office flagged, or replace any file you want to update.'
          : 'Upload a clear JPG scan or photo for each requirement (max 10MB per file).'}
      </p>
      {restoredDocNames.length > 0 && Object.keys(uploads).length === 0 && (
        <div className="p-4 bg-amber-50 text-amber-800 rounded-xl border border-amber-100 text-xs font-semibold flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>
            Your answers were restored, but browsers can't restore selected files. Please re-select: {restoredDocNames.join(', ')}.
          </span>
        </div>
      )}
      <div className="space-y-3">
        {scholarship.requirements.map(req => (
          <FileSlotView
            key={req}
            label={req}
            required
            selected={uploads[req] ? [uploads[req].file] : []}
            onRecordCount={isResubmit && previouslySubmittedDocNames.includes(req) ? 1 : 0}
            onPick={files => pickFile(req, files[0])}
            onRemove={() => removeFile(req)}
            error={uploadErrors[req] || fieldError(`doc:${req}`)}
          />
        ))}
      </div>
    </div>
  );

  const renderReview = () => (
    <div className="space-y-8">
      <p className="text-xs text-slate-500">Review your answers below. Use the section list to go back and edit anything before submitting.</p>
      {isSfag
        ? <SfagAnswers details={buildSfagDetails()} />
        : <StandardProfileAnswers info={{ firstName, middleName, lastName, email, phone, studentNumber, program, yearLevel, gpa }} />}
      <div className="pt-6 border-t border-slate-100 space-y-2">
        <h4 className="font-display font-bold text-sm text-slate-900 mb-3">Documents</h4>
        {scholarship.requirements.map(req => {
          const selected = uploads[req];
          const onRecord = isResubmit && previouslySubmittedDocNames.includes(req);
          const ok = !!selected || onRecord;
          return (
            <div key={req} className="flex items-start gap-2 text-xs">
              {ok ? <CheckCircle className="w-4 h-4 text-brand-green shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />}
              <span className="text-slate-700">
                <span className="font-semibold">{req}</span>
                <span className="text-slate-400"> — {selected ? selected.fileName : onRecord ? 'on record' : 'missing'}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  const SECTION_RENDERERS: Record<StdSectionKey, () => React.ReactNode> = {
    profile: renderProfile,
    personal: renderPersonal,
    contact: renderContact,
    parents: renderParents,
    siblings: renderSiblings,
    assets: renderAssets,
    agreement: renderAgreement,
    documents: renderDocuments,
    review: renderReview
  };

  return (
    <div id={id} className="space-y-6">
      <BackLink onClick={onBack} />

      <WizardHeader
        scholarshipName={scholarship.name}
        isResubmit={isResubmit}
        subtitle={<>Reviewed by the {officeLabel}</>}
        right={!isResubmit && <DraftIndicator status={savedAt ? 'saved' : 'idle'} savedAt={savedAt} localOnly />}
        doneCount={doneCount}
        total={countable.length}
      />

      {isResubmit && <RevisionNote note={existingApplication?.reviewNote} />}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        <SectionNav
          sections={sections}
          currentKey={currentKey}
          statusOf={statusOf}
          onSelect={key => goTo(key as StdSectionKey)}
          partLabels={PART_LABELS}
        />

        <div className="lg:col-span-3 space-y-4 min-w-0">
          <FormBanner message={banner} />
          <SectionPanel
            partLabel={PART_LABELS[current.part]}
            title={current.label}
            sectionKey={currentKey}
            footer={
              <WizardFooter
                prevLabel={prev?.label}
                onPrev={prev ? () => goTo(prev.key) : undefined}
                onDiscard={!isResubmit ? handleDiscardDraft : undefined}
                isLast={currentKey === 'review'}
                onNext={goNext}
                onSubmit={handleSubmit}
                isSubmitting={isSubmitting}
                submitLabel={isResubmit ? 'Resubmit Application' : 'Submit Application'}
              />
            }
          >
            {SECTION_RENDERERS[currentKey]()}
          </SectionPanel>
          <PrivacyNote officeLabel={officeLabel} />
        </div>
      </div>
    </div>
  );
}
