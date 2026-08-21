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
import {
  ArrowLeft, ArrowRight, FileText, CheckCircle, Upload, Trash2, ShieldAlert,
  AlertCircle, User, MapPin, Users, PiggyBank, ClipboardCheck, Plus, ExternalLink,
  Info
} from 'lucide-react';
import { motion } from 'motion/react';

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
  const nameParts = student.name.split(' ');
  const dateOfBirth = toDateInputValue(student.dateOfBirth);
  return {
    lastName: nameParts.length > 1 ? nameParts[nameParts.length - 1] : '',
    firstName: nameParts.slice(0, -1).join(' ') || student.name,
    middleInitial: '',
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
    religion: 'CATHOLIC',
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

function isBlank(value?: string): boolean {
  return !value || !value.trim();
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
  wizardStep: number;
  personalInfo: SfagPersonalInfo;
  contactSchool: SfagContactSchool;
  parentsGuardian: SfagParentsGuardian;
  siblings: SfagSibling[];
  assetsExpenses: SfagAssetsExpenses;
  agreement: SfagAgreement;
  firstName: string;
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

const SFAG_TABS = [
  { step: 1, label: 'Personal Info', icon: User },
  { step: 2, label: 'Contact & School', icon: MapPin },
  { step: 3, label: 'Parents & Guardian', icon: Users },
  { step: 4, label: 'Siblings', icon: Users },
  { step: 5, label: 'Assets, Expenses & Agreement', icon: PiggyBank }
];

const inputClass =
  'block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all placeholder:text-slate-300';
const errorInputClass =
  'block w-full px-3.5 py-2.5 border-2 border-rose-400 rounded-xl text-sm bg-rose-50/60 focus:outline-hidden focus:ring-2 focus:ring-rose-300 focus:border-rose-500 transition-all placeholder:text-rose-300';
const labelClass = 'flex items-center gap-1 text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5';

function Req() {
  return <span className="text-rose-500">*</span>;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-rose-500">
      <AlertCircle className="w-3 h-3 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] text-slate-400">{children}</p>;
}

export default function ApplyScholarship({
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

  // Load any in-progress draft for this exact scholarship + student combo.
  // Computed once per mount (scholarship/student don't change mid-session).
  // On a resubmit, we deliberately IGNORE any stray localStorage draft —
  // the source of truth is the previously-submitted application the LSO
  // sent back, not a half-finished draft from some earlier session.
  const savedDraft = React.useMemo(
    () => (isResubmit ? null : loadDraft(scholarship.id, student.studentNumber, student.clerkId)),
    [scholarship.id, student.studentNumber, student.clerkId, isResubmit]
  );

  // --- SFAG multi-step wizard state ---------------------------------------
  const [wizardStep, setWizardStep] = useState<number>(savedDraft?.wizardStep ?? 1);
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
  const [sfagFormError, setSfagFormError] = useState('');

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

  const [siblingDraft, setSiblingDraft] = useState({
    fullName: '',
    socialStatus: SIBLING_SOCIAL_STATUS_OPTIONS[0],
    civilStatus: 'SINGLE',
    age: '',
    schoolOrCompany: '',
    schoolType: 'Public' as 'Public' | 'Private' | 'N/A',
    tuitionOrIncome: '',
    isDlsudScholar: false
  });
  const [siblingDraftError, setSiblingDraftError] = useState('');

  // --- Shared state (both flows) ------------------------------------------
  const [firstName, setFirstName] = useState(
    existingApplication?.personalInfo.firstName ?? savedDraft?.firstName ?? (student.name.split(' ')[0] || '')
  );
  const [lastName, setLastName] = useState(
    existingApplication?.personalInfo.lastName ?? savedDraft?.lastName ?? (student.name.split(' ').slice(1).join(' ') || '')
  );
  const [email, setEmail] = useState(existingApplication?.personalInfo.email ?? savedDraft?.email ?? student.email);
  const [phone, setPhone] = useState(existingApplication?.personalInfo.phone ?? savedDraft?.phone ?? (student.mobileNumber || ''));
  const [studentNumber, setStudentNumber] = useState(student.studentNumber);
  const [program, setProgram] = useState(existingApplication?.program ?? savedDraft?.program ?? student.course);
  const [yearLevel, setYearLevel] = useState(existingApplication?.yearLevel ?? savedDraft?.yearLevel ?? student.yearLevel);
  const [gpa, setGpa] = useState(existingApplication?.gpa ?? savedDraft?.gpa ?? student.gpa);

  const [uploads, setUploads] = useState<Record<string, UploadedFile>>({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [referenceCode, setReferenceCode] = useState('');

  // Document names already on file from the application being resubmitted —
  // browsers can't restore actual File bytes, so we still need a fresh
  // JPG per requirement, but we can tell the student what's already there.
  const previouslySubmittedDocNames = existingApplication?.documents
    .filter(d => d.uploaded)
    .map(d => d.name) ?? [];

  // Auto-save the draft to localStorage on every relevant change. File
  // contents are intentionally excluded (see previouslyUploadedDocNames)
  // since browsers can't restore actual File objects after a refresh.
  // Skipped entirely during a resubmit — see savedDraft comment above.
  useEffect(() => {
    if (isResubmit) return;
    const draft: DraftData = {
      wizardStep,
      personalInfo,
      contactSchool,
      parentsGuardian,
      siblings,
      assetsExpenses,
      agreement,
      firstName,
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
    } catch {
      // Storage can fail (private browsing, quota) — draft just won't persist, form still works
    }
  }, [
    wizardStep, personalInfo, contactSchool, parentsGuardian, siblings,
    assetsExpenses, agreement, firstName, lastName, email, phone, program,
    yearLevel, gpa, uploads, scholarship.id, student.studentNumber, student.clerkId, isResubmit
  ]);

  const handleFileChange = (docName: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const isJpeg = file.type === 'image/jpeg' || /\.(jpe?g)$/i.test(file.name);
      if (!isJpeg) {
        setFormError('Only JPG files are allowed. Please convert your file and try again.');
        e.target.value = '';
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setFormError('Each file must be under 10MB.');
        e.target.value = '';
        return;
      }
      setFormError('');
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      setUploads(prev => ({
        ...prev,
        [docName]: { docName, fileName: file.name, fileSize: `${fileSizeMB} MB`, file }
      }));
    }
  };

  const removeFile = (docName: string) => {
    setUploads(prev => {
      const copy = { ...prev };
      delete copy[docName];
      return copy;
    });
  };

  const addSibling = () => {
    if (isBlank(siblingDraft.fullName)) {
      setSiblingDraftError('Enter the sibling\u2019s full name.');
      return;
    }
    if (!isBlank(siblingDraft.age) && !isValidAge(siblingDraft.age)) {
      setSiblingDraftError('Enter a valid age (0–120).');
      return;
    }
    setSiblingDraftError('');
    const newSibling: SfagSibling = {
      id: `sib_${Math.random().toString(36).substr(2, 9)}`,
      ...siblingDraft
    };
    setSiblings(prev => [...prev, newSibling]);
    setSiblingDraft({
      fullName: '',
      socialStatus: SIBLING_SOCIAL_STATUS_OPTIONS[0],
      civilStatus: 'SINGLE',
      age: '',
      schoolOrCompany: '',
      schoolType: 'Public',
      tuitionOrIncome: '',
      isDlsudScholar: false
    });
  };

  const removeSibling = (sibId: string) => {
    setSiblings(prev => prev.filter(s => s.id !== sibId));
  };

  interface StepValidation {
    fields: string[];
    errors: Record<string, string>;
  }

  const validateSfagStep = (step: number): StepValidation => {
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

    return { fields: Object.keys(errs), errors: errs };
  };

  const summarizeMissing = (count: number, extraNote?: string): string => {
    const label = count === 1 ? 'field is' : 'fields are';
    return `Fill out all required fields. ${count} ${label} missing or invalid.${extraNote ? ` ${extraNote}` : ''}`;
  };

  const validateStepsUpTo = (uptoStep: number): StepValidation => {
    let errs: Record<string, string> = {};
    for (let s = 1; s <= uptoStep; s++) {
      errs = { ...errs, ...validateSfagStep(s).errors };
    }
    return { fields: Object.keys(errs), errors: errs };
  };

  const goToSfagStep = (nextStep: number) => {
    if (nextStep > wizardStep) {
      const { fields, errors: stepErrors } = validateStepsUpTo(nextStep - 1);
      if (fields.length > 0) {
        const touchesParents = nextStep - 1 >= 3;
        setSfagFormError(summarizeMissing(fields.length, touchesParents ? 'Use "N/A" for any parent field that does not apply.' : undefined));
        setErrors(stepErrors);
        return;
      }
    }
    setSfagFormError('');
    setErrors({});
    setWizardStep(nextStep);
  };

  const buildSfagDetails = (): SfagApplicationDetails => ({
    personalInfo,
    contactSchool,
    parentsGuardian,
    siblings,
    assetsExpenses,
    agreement
  });

  const handleSfagAgreementNext = () => {
    const cumulative = validateStepsUpTo(5);
    const errs = { ...cumulative.errors };
    if (!agreement.certifyConsulted) errs.certifyConsulted = REQUIRED_MSG;
    if (!agreement.certifyAccuracy) errs.certifyAccuracy = REQUIRED_MSG;
    const fields = Object.keys(errs);

    if (fields.length > 0) {
      setSfagFormError(summarizeMissing(fields.length, 'Check both certification boxes before proceeding to document upload.'));
      setErrors(errs);
      return;
    }
    setSfagFormError('');
    setErrors({});
    setWizardStep(6);
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

  // Matches your real backend contract: POST /api/applications, multipart/form-data,
  // one "documents" file per requirement (in order), a parallel "documentLabels"
  // JSON array naming each one, plus the form-section payloads as JSON strings.
  // Requires a Clerk bearer token — the Express CSRF middleware in server.js
  // rejects any non-GET request without a valid session (401 otherwise).
  // Returns the saved Mongo document (with _id and referenceCode) on success.
  //
  // NOTE on resubmission: this assumes a matching PATCH /api/applications/:id
  // endpoint exists (or can be added) that accepts the same multipart shape
  // and flips status back to 'Under Evaluation' server-side, clearing any
  // reviewNote. If your backend doesn't have that route yet, this is the
  // one place that needs the actual endpoint name/contract swapped in.
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
      formData.append('standardInfo', JSON.stringify({ firstName, lastName, email, phone, studentNumber, program, yearLevel, gpa }));
    }

    const token = await getToken();

    const url = isResubmit && existingApplication
      ? `${API_BASE_URL}/api/applications/${existingApplication.id}`
      : `${API_BASE_URL}/api/applications`;
    const method = isResubmit ? 'PATCH' : 'POST';

    if (isResubmit) {
      // Explicit, in case the backend needs the client to say so rather
      // than inferring "PATCH means back to review" on its own.
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

  const submitFinal = async (sfagDetails?: SfagApplicationDetails) => {
    // On resubmit, a requirement already on file (from the prior submission)
    // doesn't force a fresh re-upload — only newly-missing ones block.
    const missingDocs = scholarship.requirements.filter(
      req => !uploads[req] && !(isResubmit && previouslySubmittedDocNames.includes(req))
    );
    if (missingDocs.length > 0) {
      setFormError(`Please upload all required files. Missing: ${missingDocs.slice(0, 2).join(', ')}${missingDocs.length > 2 ? ' and others.' : '.'}`);
      return;
    }

    if (!isSfag) {
      const errs = validateStandardFields();
      if (Object.keys(errs).length > 0) {
        setFormError('Fill out all required fields correctly.');
        setErrors(errs);
        return;
      }
    }

    setIsSubmitting(true);
    setFormError('');

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

      // in submitFinal, after successful submit:
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
      setFormError(err instanceof Error ? err.message : `Something went wrong ${isResubmit ? 'resubmitting' : 'submitting'} your application. Please try again.`);
    }
  };

  const handleStandardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    submitFinal();
  };

  const handleSfagFinalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    submitFinal(buildSfagDetails());
  };

  const handleDiscardDraft = () => {
    clearDraft(scholarship.id, student.studentNumber, student.clerkId);
    window.location.reload();
  };

  // --- Success screen (shared) ---------------------------------------------
  if (isSuccess) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 md:p-12 text-center max-w-xl mx-auto space-y-6 shadow-xl my-8">
        <div className="w-16 h-16 rounded-full bg-emerald-100 text-brand-green flex items-center justify-center mx-auto shadow-md">
          <CheckCircle className="w-10 h-10" />
        </div>
        <div className="space-y-2">
          <h2 className="font-display font-black text-2xl text-slate-900 tracking-tight">
            {isResubmit ? 'Application Resubmitted Successfully!' : 'Application Submitted Successfully!'}
          </h2>
          {referenceCode && (
            <p className="text-xs font-semibold text-brand-green uppercase tracking-wider">Reference Code: {referenceCode}</p>
          )}
        </div>
        <p className="text-sm text-slate-500 leading-relaxed max-w-sm mx-auto">
          {isResubmit
            ? <>Your updated application for the <strong>{scholarship.name}</strong> has been sent back to the Linkages and Scholarship Office (LSO) for another review.</>
            : <>Your application for the <strong>{scholarship.name}</strong> has been received by the Linkages and Scholarship Office (LSO).</>}
        </p>
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-left text-xs text-slate-500 space-y-2">
          <p><strong>What happens next?</strong></p>
          <p>1. LSO Officers will verify your uploaded grades and certifications.</p>
          <p>2. Keep an eye on your email and the Portal notifications tab for updates.</p>
          <p>3. Do not re-submit unless requested by the coordinators.</p>
        </div>
        <button
          onClick={onBack}
          className="inline-flex items-center space-x-1 font-display font-bold uppercase text-xs tracking-wider text-white bg-brand-green hover:bg-brand-green-dark px-6 py-3.5 rounded-xl transition-all shadow-md shadow-emerald-900/10 focus:outline-hidden"
        >
          <span>Return to Dashboard</span>
        </button>
      </div>
    );
  }

  // --- Document upload step (shared by both flows) --------------------------
  const renderDocumentUpload = (onSubmit: (e: React.FormEvent) => void, backLabel: string, onBackClick: () => void) => (
    <form onSubmit={onSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-xs">
          <h3 className="font-display font-bold text-base text-slate-900 border-b border-slate-100 pb-2 mb-4">
            Upload Required Documents
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            {isResubmit
              ? 'Review the requirements below. Anything already on file is marked — re-upload only what the LSO flagged, or replace any file if you\u2019d like to update it.'
              : 'Please review the requirements below and upload a JPG scan or photo for each item.'}
          </p>

          {savedDraft?.previouslyUploadedDocNames && savedDraft.previouslyUploadedDocNames.length > 0 && Object.keys(uploads).length === 0 && (
            <div className="p-4 bg-amber-50 text-amber-800 rounded-xl border border-amber-100 text-xs font-semibold flex items-start gap-2 mb-4">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Your typed information was restored, but for security reasons browsers can't restore
                selected files after a refresh. Please re-select: {savedDraft.previouslyUploadedDocNames.join(', ')}.
              </span>
            </div>
          )}

          {formError && (
            <div className="p-4 bg-rose-50 text-rose-800 rounded-xl border border-rose-100 text-xs font-bold flex items-center gap-2 mb-4">
              <AlertCircle className="w-4 h-4 text-rose-600" />
              <span>{formError}</span>
            </div>
          )}

          <div className="space-y-4">
            {scholarship.requirements.map((req, idx) => {
              const uploadedFile = uploads[req];
              const alreadyOnFile = isResubmit && !uploadedFile && previouslySubmittedDocNames.includes(req);
              return (
                <div key={idx} className="p-3 border border-slate-200 rounded-xl space-y-2 bg-slate-50/30">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-slate-700 leading-snug">{req}</p>
                    {alreadyOnFile && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                        On file
                      </span>
                    )}
                  </div>
                  {uploadedFile ? (
                    <div className="flex items-center justify-between p-2 bg-emerald-50 rounded-lg border border-emerald-100 text-xs">
                      <div className="flex items-center space-x-2 truncate">
                        <FileText className="w-4 h-4 text-brand-green shrink-0" />
                        <div className="truncate">
                          <p className="font-semibold text-slate-800 truncate leading-tight">{uploadedFile.fileName}</p>
                          <span className="text-[10px] text-slate-400 block">{uploadedFile.fileSize}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(req)}
                        className="p-1.5 text-rose-500 hover:bg-rose-100 rounded-md transition-colors"
                        title="Remove File"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center border-2 border-dashed border-slate-200 hover:border-brand-green/40 hover:bg-brand-green/5 rounded-lg p-3 cursor-pointer transition-colors text-xs text-slate-500 font-semibold gap-1.5">
                      <Upload className="w-4 h-4 text-slate-400" />
                      <span>{alreadyOnFile ? 'Replace File (optional)' : 'Select JPG File'}</span>
                      <input
                        type="file"
                        accept=".jpg,.jpeg,image/jpeg"
                        onChange={(e) => handleFileChange(req, e)}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBackClick}
            className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-500 hover:text-brand-green transition-colors focus:outline-hidden"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{backLabel}</span>
          </button>
          {!isResubmit && (
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="text-xs font-bold text-rose-500 hover:text-rose-600 transition-colors focus:outline-hidden"
            >
              Discard draft and start over
            </button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full font-display font-bold uppercase text-xs tracking-wider text-white bg-brand-green hover:bg-brand-green-dark px-5 py-4 rounded-xl transition-all duration-200 shadow-md shadow-emerald-900/10 flex items-center justify-center space-x-1.5 focus:outline-hidden disabled:opacity-50"
          >
            <span>{isSubmitting ? (isResubmit ? 'Resubmitting Application...' : 'Submitting Application...') : (isResubmit ? 'Resubmit Application' : 'Submit Application')}</span>
          </button>
        </div>

        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-2.5">
          <ShieldAlert className="w-4.5 h-4.5 text-slate-400 shrink-0 mt-0.5" />
          <div className="text-[10px] text-slate-500 leading-relaxed">
            <span className="font-bold">Privacy Certification:</span> Linkages and Scholarship Office (LSO) complies with the Philippine Data Privacy Act of 2012. Information submitted is kept confidential and utilized solely for scholarship scoring.
          </div>
        </div>
      </div>
    </form>
  );

  // --- Standard (non-SFAG) single-page form --------------------------------
  if (!isSfag) {
    if (wizardStep === 6) {
      return (
        <div id={id} className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-xs">
            <h2 className="font-display font-black text-xl md:text-2xl text-slate-900 tracking-tight">
              {isResubmit ? 'Resubmit Application: ' : 'Application Form: '}<span className="text-brand-green">{scholarship.name}</span>
            </h2>
          </div>
          {renderDocumentUpload(handleStandardSubmit, 'Back to Personal Info', () => setWizardStep(0))}
        </div>
      );
    }

    return (
      <div id={id} className="space-y-6">
        <button
          onClick={onBack}
          className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-500 hover:text-brand-green transition-colors focus:outline-hidden"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Scholarship Details</span>
        </button>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-xs">
          <h2 className="font-display font-black text-xl md:text-2xl text-slate-900 tracking-tight">
            {isResubmit ? 'Resubmit Application: ' : 'Application Form: '}<span className="text-brand-green">{scholarship.name}</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {isResubmit
              ? 'Update whatever the LSO flagged, then continue to documents.'
              : 'Complete the forms below and upload digital files. Please review your profiles carefully before submission.'}
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setFormError('');
            const errs = validateStandardFields();
            if (Object.keys(errs).length > 0) {
              setFormError('Fill out all required fields correctly.');
              setErrors(errs);
              return;
            }
            setErrors({});
            setWizardStep(6);
          }}
          className="space-y-6"
        >
          <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-xs space-y-6">
            <h3 className="font-display font-bold text-base text-slate-900 border-b border-slate-100 pb-2 mb-4">
              Personal & Academic Profile
            </h3>

            {formError && (
              <div className="p-4 bg-rose-50 text-rose-800 rounded-xl border border-rose-100 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>First Name <Req /></label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => { setFirstName(e.target.value); clearFieldError('firstName'); }}
                  onBlur={(e) => validateOnBlur('firstName', e.target.value, 'text')}
                  className={fieldClass('firstName')}
                  aria-invalid={!!fieldError('firstName')}
                />
                <FieldError message={fieldError('firstName')} />
              </div>
              <div>
                <label className={labelClass}>Last Name <Req /></label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => { setLastName(e.target.value); clearFieldError('lastName'); }}
                  onBlur={(e) => validateOnBlur('lastName', e.target.value, 'text')}
                  className={fieldClass('lastName')}
                  aria-invalid={!!fieldError('lastName')}
                />
                <FieldError message={fieldError('lastName')} />
              </div>
              <div>
                <label className={labelClass}>Email Address <Req /></label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }}
                  onBlur={(e) => validateOnBlur('email', e.target.value, 'email')}
                  className={fieldClass('email')}
                  aria-invalid={!!fieldError('email')}
                />
                <FieldError message={fieldError('email')} />
              </div>
              <div>
                <label className={labelClass}>Mobile Phone <Req /></label>
                <input
                  type="tel"
                  inputMode="tel"
                  placeholder="09171234567"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); clearFieldError('phone'); }}
                  onBlur={(e) => validateOnBlur('phone', e.target.value, 'phone')}
                  className={fieldClass('phone')}
                  aria-invalid={!!fieldError('phone')}
                />
                <FieldError message={fieldError('phone')} />
              </div>
              <div>
                <label className={labelClass}>Student Number</label>
                <input type="text" value={studentNumber} disabled className={`${inputClass} bg-slate-50/20 text-slate-500 cursor-not-allowed`} />
              </div>
              <div>
                <label className={labelClass}>Academic Program (Course) <Req /></label>
                <input
                  type="text"
                  value={program}
                  onChange={(e) => { setProgram(e.target.value); clearFieldError('program'); }}
                  onBlur={(e) => validateOnBlur('program', e.target.value, 'text')}
                  className={fieldClass('program')}
                  aria-invalid={!!fieldError('program')}
                />
                <FieldError message={fieldError('program')} />
              </div>
              <div>
                <label className={labelClass}>Year Level <Req /></label>
                <select
                  value={yearLevel}
                  onChange={(e) => { setYearLevel(e.target.value); clearFieldError('yearLevel'); }}
                  className={fieldClass('yearLevel')}
                >
                  <option value="1st Year">1st Year</option>
                  <option value="2nd Year">2nd Year</option>
                  <option value="3rd Year">3rd Year</option>
                  <option value="4th Year">4th Year</option>
                  <option value="5th Year">5th Year</option>
                </select>
                <FieldError message={fieldError('yearLevel')} />
              </div>
              <div>
                <label className={labelClass}>Cumulative GPA <Req /></label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 1.75"
                  value={gpa}
                  onChange={(e) => { setGpa(e.target.value); clearFieldError('gpa'); }}
                  onBlur={(e) => validateOnBlur('gpa', e.target.value, 'gpa')}
                  className={fieldClass('gpa')}
                  aria-invalid={!!fieldError('gpa')}
                />
                {fieldError('gpa') ? <FieldError message={fieldError('gpa')} /> : <Hint>Scale: 1.00 (highest) – 5.00 (lowest)</Hint>}
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center">
            {!isResubmit ? (
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="text-xs font-bold text-rose-500 hover:text-rose-600 transition-colors focus:outline-hidden"
              >
                Discard draft and start over
              </button>
            ) : <span />}
            <button
              type="submit"
              className="inline-flex items-center space-x-1.5 font-display font-bold uppercase text-xs tracking-wider text-white bg-brand-green hover:bg-brand-green-dark px-6 py-3.5 rounded-xl transition-all shadow-md shadow-emerald-900/10 focus:outline-hidden"
            >
              <span>Next: Upload Documents</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    );
  }

  // --- SFAG detailed 5-tab wizard + document upload -------------------------
  if (wizardStep === 6) {
    return (
      <div id={id} className="space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-xs">
          <h2 className="font-display font-black text-xl md:text-2xl text-slate-900 tracking-tight">
            {isResubmit ? 'Resubmit Application: ' : 'Application Form: '}<span className="text-brand-green">{scholarship.name}</span>
          </h2>
        </div>
        {renderDocumentUpload(handleSfagFinalSubmit, 'Back to Assets, Expenses & Agreement', () => setWizardStep(5))}
      </div>
    );
  }

  const progressPct = Math.round(((wizardStep - 1) / 5) * 100);

  return (
    <div id={id} className="space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-500 hover:text-brand-green transition-colors focus:outline-hidden"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Scholarship Details</span>
      </button>

      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-2.5">
        <AlertCircle className="w-4.5 h-4.5 text-yellow-600 shrink-0 mt-0.5" />
        <p className="text-xs text-yellow-800 leading-relaxed">
          {isResubmit ? (
            <><strong>You're editing a previously submitted application.</strong> Update whatever the LSO flagged, then work back through to Upload Documents to resubmit.</>
          ) : (
            <><strong>Fill out all required fields.</strong> Fields marked <Req /> are mandatory. Use "N/A" where not applicable. Information cannot be changed after submission.</>
          )}
        </p>
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs px-6 py-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Application Progress</span>
          <span className="text-[11px] font-bold text-brand-green">{progressPct}% Complete</span>
        </div>
        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-green rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="flex overflow-x-auto border-b border-slate-100">
          {SFAG_TABS.map(tab => {
            const isActive = wizardStep === tab.step;
            const isComplete = wizardStep > tab.step;
            return (
              <button
                key={tab.step}
                type="button"
                onClick={() => goToSfagStep(tab.step)}
                className={`flex items-center gap-2 px-5 py-4 text-xs font-bold whitespace-nowrap border-b-2 transition-colors focus:outline-hidden ${
                  isActive
                    ? 'border-brand-green text-brand-green bg-brand-green/5'
                    : isComplete
                    ? 'border-transparent text-slate-500 hover:text-brand-green hover:bg-slate-50'
                    : 'border-transparent text-slate-400 hover:bg-slate-50'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                  isActive ? 'bg-brand-green text-white' : isComplete ? 'bg-brand-green/80 text-white' : 'bg-slate-200 text-slate-500'
                }`}>
                  {isComplete ? <CheckCircle className="w-3 h-3" /> : tab.step}
                </span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="p-6 md:p-8">
          {sfagFormError && (
            <div className="p-4 bg-rose-50 text-rose-800 rounded-xl border border-rose-100 text-xs font-bold flex items-center gap-2 mb-6">
              <AlertCircle className="w-4 h-4 text-rose-600" />
              <span>{sfagFormError}</span>
            </div>
          )}

          {/* --- Tab 1: Personal Info --- */}
          {wizardStep === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="font-display font-bold text-sm text-brand-green uppercase tracking-wider mb-3">Name</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <label className={labelClass}>Last Name <Req /></label>
                    <input
                      className={fieldClass('lastName')}
                      value={personalInfo.lastName}
                      onChange={e => { setPersonalInfo(p => ({ ...p, lastName: e.target.value })); clearFieldError('lastName'); }}
                      onBlur={e => validateOnBlur('lastName', e.target.value, 'text')}
                      aria-invalid={!!fieldError('lastName')}
                    />
                    <FieldError message={fieldError('lastName')} />
                  </div>
                  <div>
                    <label className={labelClass}>First Name <Req /></label>
                    <input
                      className={fieldClass('firstName')}
                      value={personalInfo.firstName}
                      onChange={e => { setPersonalInfo(p => ({ ...p, firstName: e.target.value })); clearFieldError('firstName'); }}
                      onBlur={e => validateOnBlur('firstName', e.target.value, 'text')}
                      aria-invalid={!!fieldError('firstName')}
                    />
                    <FieldError message={fieldError('firstName')} />
                  </div>
                  <div>
                    <label className={labelClass}>M.I.</label>
                    <input className={inputClass} value={personalInfo.middleInitial} onChange={e => setPersonalInfo(p => ({ ...p, middleInitial: e.target.value }))} maxLength={2} />
                  </div>
                  <div>
                    <label className={labelClass}>Suffix</label>
                    <input className={inputClass} placeholder="Jr., III, etc." value={personalInfo.suffix} onChange={e => setPersonalInfo(p => ({ ...p, suffix: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                  <div>
                    <label className={labelClass}>Student No.</label>
                    <input className={`${inputClass} bg-slate-50/20 text-slate-500 cursor-not-allowed`} value={personalInfo.studentNumber} disabled />
                  </div>
                  <div>
                    <label className={labelClass}>Course / Program</label>
                    <input className={inputClass} value={personalInfo.course} onChange={e => setPersonalInfo(p => ({ ...p, course: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelClass}>Year Level</label>
                    <input className={inputClass} value={personalInfo.yearLevel} onChange={e => setPersonalInfo(p => ({ ...p, yearLevel: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-display font-bold text-sm text-brand-green uppercase tracking-wider mb-3 border-t border-slate-100 pt-6">Basic Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className={labelClass}>Place of Birth <Req /></label>
                    <input
                      className={fieldClass('placeOfBirth')}
                      value={personalInfo.placeOfBirth}
                      onChange={e => { setPersonalInfo(p => ({ ...p, placeOfBirth: e.target.value })); clearFieldError('placeOfBirth'); }}
                      onBlur={e => validateOnBlur('placeOfBirth', e.target.value, 'text')}
                      aria-invalid={!!fieldError('placeOfBirth')}
                    />
                    <FieldError message={fieldError('placeOfBirth')} />
                  </div>
                  <div>
                    <label className={labelClass}>Date of Birth <Req /></label>
                    <input
                      type="date"
                      max={TODAY_ISO}
                      className={fieldClass('dateOfBirth')}
                      value={personalInfo.dateOfBirth}
                      onChange={e => {
                        const dob = e.target.value;
                        setPersonalInfo(p => ({ ...p, dateOfBirth: dob, age: calculateAge(dob) }));
                        clearFieldError('dateOfBirth');
                      }}
                      onBlur={e => validateOnBlur('dateOfBirth', e.target.value, 'date')}
                      aria-invalid={!!fieldError('dateOfBirth')}
                    />
                    <FieldError message={fieldError('dateOfBirth')} />
                  </div>
                  <div>
                    <label className={labelClass}>Age</label>
                    <input
                      className={`${inputClass} bg-slate-50/20 text-slate-500 cursor-not-allowed`}
                      value={personalInfo.age}
                      disabled
                      placeholder="Auto-calculated"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 items-start">
                  <div>
                    <label className={labelClass}>Civil Status</label>
                    <select className={inputClass} value={personalInfo.civilStatus} onChange={e => setPersonalInfo(p => ({ ...p, civilStatus: e.target.value }))}>
                      {CIVIL_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Gender <Req /></label>
                    <select
                      className={fieldClass('gender')}
                      value={personalInfo.gender}
                      onChange={e => { setPersonalInfo(p => ({ ...p, gender: e.target.value })); clearFieldError('gender'); }}
                    >
                      <option value="">Select</option>
                      {GENDER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <FieldError message={fieldError('gender')} />
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <label className={labelClass}>Nationality <Req /></label>
                      <input
                        className={fieldClass('nationality')}
                        value={personalInfo.nationality}
                        onChange={e => { setPersonalInfo(p => ({ ...p, nationality: e.target.value })); clearFieldError('nationality'); }}
                        onBlur={e => validateOnBlur('nationality', e.target.value, 'text')}
                        aria-invalid={!!fieldError('nationality')}
                      />
                      <FieldError message={fieldError('nationality')} />
                    </div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 pt-6 shrink-0">
                      <input type="checkbox" checked={personalInfo.isPwd} onChange={e => setPersonalInfo(p => ({ ...p, isPwd: e.target.checked }))} className="accent-brand-green" />
                      PWD?
                    </label>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className={labelClass}>Religion</label>
                    <select className={inputClass} value={personalInfo.religion} onChange={e => setPersonalInfo(p => ({ ...p, religion: e.target.value }))}>
                      {RELIGION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  {personalInfo.religion === 'OTHERS' && (
                    <div>
                      <label className={labelClass}>Specify Religion <Req /></label>
                      <input
                        className={fieldClass('specifyReligion')}
                        value={personalInfo.specifyReligion}
                        onChange={e => { setPersonalInfo(p => ({ ...p, specifyReligion: e.target.value })); clearFieldError('specifyReligion'); }}
                        onBlur={e => validateOnBlur('specifyReligion', e.target.value, 'text')}
                        aria-invalid={!!fieldError('specifyReligion')}
                      />
                      <FieldError message={fieldError('specifyReligion')} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* --- Tab 2: Contact & School --- */}
          {wizardStep === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="font-display font-bold text-sm text-brand-green uppercase tracking-wider mb-3">Home Address</h3>
                <div>
                  <label className={labelClass}>No. / Street / Subdivision / Barangay <Req /></label>
                  <input
                    className={fieldClass('streetAddress')}
                    value={contactSchool.streetAddress}
                    onChange={e => { setContactSchool(c => ({ ...c, streetAddress: e.target.value })); clearFieldError('streetAddress'); }}
                    onBlur={e => validateOnBlur('streetAddress', e.target.value, 'text')}
                    aria-invalid={!!fieldError('streetAddress')}
                  />
                  <FieldError message={fieldError('streetAddress')} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                  <div>
                    <label className={labelClass}>Municipality / City <Req /></label>
                    <input
                      className={fieldClass('municipality')}
                      value={contactSchool.municipality}
                      onChange={e => { setContactSchool(c => ({ ...c, municipality: e.target.value })); clearFieldError('municipality'); }}
                      onBlur={e => validateOnBlur('municipality', e.target.value, 'text')}
                      aria-invalid={!!fieldError('municipality')}
                    />
                    <FieldError message={fieldError('municipality')} />
                  </div>
                  <div>
                    <label className={labelClass}>Province <Req /></label>
                    <input
                      className={fieldClass('province')}
                      value={contactSchool.province}
                      onChange={e => { setContactSchool(c => ({ ...c, province: e.target.value })); clearFieldError('province'); }}
                      onBlur={e => validateOnBlur('province', e.target.value, 'text')}
                      aria-invalid={!!fieldError('province')}
                    />
                    <FieldError message={fieldError('province')} />
                  </div>
                  <div>
                    <label className={labelClass}>Country <Req /></label>
                    <input
                      className={fieldClass('country')}
                      value={contactSchool.country}
                      onChange={e => { setContactSchool(c => ({ ...c, country: e.target.value })); clearFieldError('country'); }}
                      onBlur={e => validateOnBlur('country', e.target.value, 'text')}
                      aria-invalid={!!fieldError('country')}
                    />
                    <FieldError message={fieldError('country')} />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-6">
                <h3 className="font-display font-bold text-sm text-brand-green uppercase tracking-wider mb-3">Contact Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className={labelClass}>Mobile No. <Req /></label>
                    <input
                      type="tel"
                      inputMode="tel"
                      placeholder="09171234567"
                      className={fieldClass('mobileNo')}
                      value={contactSchool.mobileNo}
                      onChange={e => { setContactSchool(c => ({ ...c, mobileNo: e.target.value })); clearFieldError('mobileNo'); }}
                      onBlur={e => validateOnBlur('mobileNo', e.target.value, 'phone')}
                      aria-invalid={!!fieldError('mobileNo')}
                    />
                    <FieldError message={fieldError('mobileNo')} />
                  </div>
                  <div>
                    <label className={labelClass}>Landline No.</label>
                    <input className={inputClass} value={contactSchool.landlineNo} onChange={e => setContactSchool(c => ({ ...c, landlineNo: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelClass}>Email Address <Req /></label>
                    <input
                      type="email"
                      className={fieldClass('email')}
                      value={contactSchool.email}
                      onChange={e => { setContactSchool(c => ({ ...c, email: e.target.value })); clearFieldError('email'); }}
                      onBlur={e => validateOnBlur('email', e.target.value, 'email')}
                      aria-invalid={!!fieldError('email')}
                    />
                    <FieldError message={fieldError('email')} />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-6">
                <h3 className="font-display font-bold text-sm text-brand-green uppercase tracking-wider mb-3">Secondary School</h3>
                <div>
                  <label className={labelClass}>Secondary School Attended <Req /></label>
                  <input
                    className={fieldClass('secondarySchool')}
                    value={contactSchool.secondarySchool}
                    onChange={e => { setContactSchool(c => ({ ...c, secondarySchool: e.target.value })); clearFieldError('secondarySchool'); }}
                    onBlur={e => validateOnBlur('secondarySchool', e.target.value, 'text')}
                    aria-invalid={!!fieldError('secondarySchool')}
                  />
                  <FieldError message={fieldError('secondarySchool')} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-4">
                  <div className="sm:col-span-3">
                    <label className={labelClass}>School Address <Req /></label>
                    <input
                      className={fieldClass('schoolAddress')}
                      value={contactSchool.schoolAddress}
                      onChange={e => { setContactSchool(c => ({ ...c, schoolAddress: e.target.value })); clearFieldError('schoolAddress'); }}
                      onBlur={e => validateOnBlur('schoolAddress', e.target.value, 'text')}
                      aria-invalid={!!fieldError('schoolAddress')}
                    />
                    <FieldError message={fieldError('schoolAddress')} />
                  </div>
                  <div>
                    <label className={labelClass}>Type</label>
                    <select className={inputClass} value={contactSchool.schoolType} onChange={e => setContactSchool(c => ({ ...c, schoolType: e.target.value as 'Public' | 'Private' }))}>
                      <option value="Public">Public</option>
                      <option value="Private">Private</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* --- Tab 3: Parents & Guardian --- */}
          {wizardStep === 3 && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {(['father', 'mother'] as const).map(parentKey => {
                  const parent = parentsGuardian[parentKey];
                  const otherKey = parentKey === 'father' ? 'mother' : 'father';
                  const isDisabled = parentsGuardian[otherKey].isSoloParent;
                  const setParent = (updates: Partial<typeof parent>) =>
                    setParentsGuardian(pg => ({ ...pg, [parentKey]: { ...pg[parentKey], ...updates } }));
                  const disabledInputClass = `${inputClass} bg-slate-50/40 text-slate-400 cursor-not-allowed`;
                  const fk = (name: string) => `${parentKey}.${name}`;

                  const handleSoloToggle = (checked: boolean) => {
                    setParentsGuardian(pg => {
                      if (checked) {
                        return {
                          ...pg,
                          [parentKey]: { ...pg[parentKey], isSoloParent: true },
                          [otherKey]: {
                            ...pg[otherKey],
                            fullName: 'N/A',
                            occupation: 'N/A',
                            company: 'N/A',
                            companyTel: 'N/A',
                            isSoloParent: false
                          }
                        };
                      }
                      return {
                        ...pg,
                        [parentKey]: { ...pg[parentKey], isSoloParent: false },
                        [otherKey]: {
                          ...pg[otherKey],
                          fullName: pg[otherKey].fullName === 'N/A' ? '' : pg[otherKey].fullName,
                          occupation: pg[otherKey].occupation === 'N/A' ? '' : pg[otherKey].occupation,
                          company: pg[otherKey].company === 'N/A' ? '' : pg[otherKey].company,
                          companyTel: pg[otherKey].companyTel === 'N/A' ? '' : pg[otherKey].companyTel
                        }
                      };
                    });
                    ['fullName', 'occupation', 'company', 'companyTel'].forEach(f => {
                      clearFieldError(`${parentKey}.${f}`);
                      clearFieldError(`${otherKey}.${f}`);
                    });
                  };

                  return (
                    <div key={parentKey} className="rounded-xl border border-slate-200 overflow-hidden">
                      <div className="bg-brand-green text-white px-4 py-2.5 font-display font-bold text-xs uppercase tracking-wider flex items-center justify-between gap-2">
                        <span>{parentKey}</span>
                        {isDisabled && (
                          <span className="text-[10px] font-semibold bg-white/15 px-2 py-0.5 rounded-full normal-case tracking-normal">
                            N/A (solo parent)
                          </span>
                        )}
                      </div>
                      <div className="p-4 space-y-3">
                        <div>
                          <label className={labelClass}>Full Name {!isDisabled && <Req />}</label>
                          <input
                            className={isDisabled ? disabledInputClass : fieldClass(fk('fullName'))}
                            value={parent.fullName}
                            disabled={isDisabled}
                            onChange={e => { setParent({ fullName: e.target.value }); clearFieldError(fk('fullName')); }}
                            onBlur={e => !isDisabled && validateOnBlur(fk('fullName'), e.target.value, 'text')}
                            aria-invalid={!!fieldError(fk('fullName'))}
                          />
                          <FieldError message={fieldError(fk('fullName'))} />
                        </div>
                        <div>
                          <label className={labelClass}>Occupation {!isDisabled && <Req />}</label>
                          <input
                            className={isDisabled ? disabledInputClass : fieldClass(fk('occupation'))}
                            value={parent.occupation}
                            disabled={isDisabled}
                            onChange={e => { setParent({ occupation: e.target.value }); clearFieldError(fk('occupation')); }}
                            onBlur={e => !isDisabled && validateOnBlur(fk('occupation'), e.target.value, 'text')}
                            aria-invalid={!!fieldError(fk('occupation'))}
                          />
                          <FieldError message={fieldError(fk('occupation'))} />
                        </div>
                        <div>
                          <label className={labelClass}>Company {!isDisabled && <Req />}</label>
                          <input
                            className={isDisabled ? disabledInputClass : fieldClass(fk('company'))}
                            value={parent.company}
                            disabled={isDisabled}
                            onChange={e => { setParent({ company: e.target.value }); clearFieldError(fk('company')); }}
                            onBlur={e => !isDisabled && validateOnBlur(fk('company'), e.target.value, 'text')}
                            aria-invalid={!!fieldError(fk('company'))}
                          />
                          <FieldError message={fieldError(fk('company'))} />
                        </div>
                        <div>
                          <label className={labelClass}>Company Tel. {!isDisabled && <Req />}</label>
                          <input
                            className={isDisabled ? disabledInputClass : fieldClass(fk('companyTel'))}
                            value={parent.companyTel}
                            disabled={isDisabled}
                            onChange={e => { setParent({ companyTel: e.target.value }); clearFieldError(fk('companyTel')); }}
                            onBlur={e => !isDisabled && validateOnBlur(fk('companyTel'), e.target.value, 'text')}
                            aria-invalid={!!fieldError(fk('companyTel'))}
                          />
                          <FieldError message={fieldError(fk('companyTel'))} />
                        </div>
                        <div>
                          <label className={labelClass}>Monthly Income</label>
                          <select
                            className={isDisabled ? disabledInputClass : inputClass}
                            value={parent.monthlyIncome}
                            disabled={isDisabled}
                            onChange={e => setParent({ monthlyIncome: e.target.value })}
                          >
                            {INCOME_BRACKETS.map(b => <option key={b} value={b}>{b}</option>)}
                          </select>
                        </div>
                        <label className={`flex items-center gap-1.5 text-xs font-semibold ${isDisabled ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 cursor-pointer'}`}>
                          <input
                            type="checkbox"
                            checked={parent.isSoloParent}
                            disabled={isDisabled}
                            onChange={e => handleSoloToggle(e.target.checked)}
                            className="accent-brand-green"
                          />
                          Solo Parent?
                        </label>
                      </div>

                    </div>
                  );
                })}
              </div>

              <div className="border-t border-slate-100 pt-6">
                <h3 className="font-display font-bold text-sm text-brand-green uppercase tracking-wider mb-3">Guardian's Information</h3>
                <p className="text-[11px] text-slate-400 mb-3">Optional — only fill this out if a guardian assists with your support.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Full Name</label>
                    <input className={inputClass} value={parentsGuardian.guardian.fullName} onChange={e => setParentsGuardian(pg => ({ ...pg, guardian: { ...pg.guardian, fullName: e.target.value } }))} />
                  </div>
                  <div>
                    <label className={labelClass}>Occupation</label>
                    <input className={inputClass} value={parentsGuardian.guardian.occupation} onChange={e => setParentsGuardian(pg => ({ ...pg, guardian: { ...pg.guardian, occupation: e.target.value } }))} />
                  </div>
                  <div>
                    <label className={labelClass}>Monthly Income</label>
                    <select className={inputClass} value={parentsGuardian.guardian.monthlyIncome} onChange={e => setParentsGuardian(pg => ({ ...pg, guardian: { ...pg.guardian, monthlyIncome: e.target.value } }))}>
                      {INCOME_BRACKETS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Relationship</label>
                    <input className={inputClass} value={parentsGuardian.guardian.relationship} onChange={e => setParentsGuardian(pg => ({ ...pg, guardian: { ...pg.guardian, relationship: e.target.value } }))} />
                  </div>
                  <div>
                    <label className={labelClass}>Contact No.</label>
                    <input className={inputClass} value={parentsGuardian.guardian.contactNo} onChange={e => setParentsGuardian(pg => ({ ...pg, guardian: { ...pg.guardian, contactNo: e.target.value } }))} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* --- Tab 4: Siblings --- */}
          {wizardStep === 4 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-sm text-brand-green uppercase tracking-wider">Brothers & Sisters</h3>
                <span className="text-[11px] text-slate-400">Optional — add one row per sibling, if any.</span>
              </div>

              {siblings.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-emerald-50 text-left text-slate-700">
                        <th className="p-3 font-bold">Name</th>
                        <th className="p-3 font-bold">Status</th>
                        <th className="p-3 font-bold">Civil</th>
                        <th className="p-3 font-bold">Age</th>
                        <th className="p-3 font-bold">School/Company</th>
                        <th className="p-3 font-bold">Type</th>
                        <th className="p-3 font-bold">Tuition/Salary</th>
                        <th className="p-3 font-bold">DLSU-D</th>
                        <th className="p-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {siblings.map(sib => (
                        <tr key={sib.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="p-3 font-semibold text-slate-800">{sib.fullName}</td>
                          <td className="p-3 text-slate-600">{sib.socialStatus}</td>
                          <td className="p-3 text-slate-600">{sib.civilStatus}</td>
                          <td className="p-3 text-slate-600">{sib.age}</td>
                          <td className="p-3 text-slate-600">{sib.schoolOrCompany}</td>
                          <td className="p-3 text-slate-600">{sib.schoolType}</td>
                          <td className="p-3 text-slate-600">{sib.tuitionOrIncome}</td>
                          <td className="p-3 text-slate-600">{sib.isDlsudScholar ? 'Yes' : 'No'}</td>
                          <td className="p-3">
                            <button type="button" onClick={() => removeSibling(sib.id)} className="p-1.5 text-rose-500 hover:bg-rose-100 rounded-md transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-brand-green-dark uppercase tracking-wider">+ Add a Sibling</p>
                {siblingDraftError && (
                  <div className="p-2.5 bg-rose-50 text-rose-700 rounded-lg border border-rose-100 text-[11px] font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{siblingDraftError}</span>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <input
                    placeholder="Last name, First name"
                    className={siblingDraftError && isBlank(siblingDraft.fullName) ? errorInputClass : inputClass}
                    value={siblingDraft.fullName}
                    onChange={e => { setSiblingDraft(d => ({ ...d, fullName: e.target.value })); setSiblingDraftError(''); }}
                  />
                  <select className={inputClass} value={siblingDraft.socialStatus} onChange={e => setSiblingDraft(d => ({ ...d, socialStatus: e.target.value }))}>
                    {SIBLING_SOCIAL_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <select className={inputClass} value={siblingDraft.civilStatus} onChange={e => setSiblingDraft(d => ({ ...d, civilStatus: e.target.value }))}>
                    {CIVIL_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <input
                    placeholder="Age"
                    inputMode="numeric"
                    className={siblingDraftError && !isBlank(siblingDraft.age) && !isValidAge(siblingDraft.age) ? errorInputClass : inputClass}
                    value={siblingDraft.age}
                    onChange={e => { setSiblingDraft(d => ({ ...d, age: e.target.value })); setSiblingDraftError(''); }}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
                  <input placeholder="Name of school or employer" className={inputClass} value={siblingDraft.schoolOrCompany} onChange={e => setSiblingDraft(d => ({ ...d, schoolOrCompany: e.target.value }))} />
                  <select className={inputClass} value={siblingDraft.schoolType} onChange={e => setSiblingDraft(d => ({ ...d, schoolType: e.target.value as 'Public' | 'Private' | 'N/A' }))}>
                    <option value="Public">Public</option>
                    <option value="Private">Private</option>
                    <option value="N/A">N/A</option>
                  </select>
                  <input placeholder="Tuition / Monthly Income" className={inputClass} value={siblingDraft.tuitionOrIncome} onChange={e => setSiblingDraft(d => ({ ...d, tuitionOrIncome: e.target.value }))} />
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <input type="checkbox" checked={siblingDraft.isDlsudScholar} onChange={e => setSiblingDraft(d => ({ ...d, isDlsudScholar: e.target.checked }))} className="accent-brand-green" />
                    DLSU-D Scholar?
                  </label>
                </div>
                <button
                  type="button"
                  onClick={addSibling}
                  className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white bg-brand-green hover:bg-brand-green-dark px-4 py-2.5 rounded-lg transition-colors focus:outline-hidden"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Sibling</span>
                </button>
              </div>
            </div>
          )}

          {/* --- Tab 5: Assets, Expenses & Agreement --- */}
          {wizardStep === 5 && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-2.5">
                <Info className="w-4.5 h-4.5 text-blue-600 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-800">
                  Assets and Expenses fields apply to <strong>Student Financial Aid Grant</strong> applicants only.
                </p>
              </div>

              <div>
                <h3 className="font-display font-bold text-sm text-brand-green uppercase tracking-wider mb-3">Market Value of Assets</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>House and Lot</label>
                    <select className={inputClass} value={assetsExpenses.houseAndLot} onChange={e => setAssetsExpenses(a => ({ ...a, houseAndLot: e.target.value }))}>
                      {ASSET_BRACKETS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Automobile</label>
                    <select className={inputClass} value={assetsExpenses.automobile} onChange={e => setAssetsExpenses(a => ({ ...a, automobile: e.target.value }))}>
                      {ASSET_BRACKETS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-6">
                <h3 className="font-display font-bold text-sm text-brand-green uppercase tracking-wider mb-3">Income Sources</h3>
                <div>
                  <label className={labelClass}>Income Sources <Req /></label>
                  <input
                    className={fieldClass('incomeSources')}
                    value={assetsExpenses.incomeSources}
                    onChange={e => { setAssetsExpenses(a => ({ ...a, incomeSources: e.target.value })); clearFieldError('incomeSources'); }}
                    onBlur={e => validateOnBlur('incomeSources', e.target.value, 'text')}
                    aria-invalid={!!fieldError('incomeSources')}
                  />
                  <FieldError message={fieldError('incomeSources')} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className={labelClass}>Combined Total Non-Taxable Income</label>
                    <select className={inputClass} value={assetsExpenses.combinedNonTaxableIncome} onChange={e => setAssetsExpenses(a => ({ ...a, combinedNonTaxableIncome: e.target.value }))}>
                      {INCOME_BRACKETS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Affidavit of Non-Filing of Income Tax</label>
                    <select className={inputClass} value={assetsExpenses.affidavitNonFilingIncomeTax} onChange={e => setAssetsExpenses(a => ({ ...a, affidavitNonFilingIncomeTax: e.target.value }))}>
                      {INCOME_BRACKETS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-6">
                <h3 className="font-display font-bold text-sm text-brand-green uppercase tracking-wider mb-3">Latest Monthly Bills</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className={labelClass}>Water</label>
                    <select className={inputClass} value={assetsExpenses.waterBill} onChange={e => setAssetsExpenses(a => ({ ...a, waterBill: e.target.value }))}>
                      {BILL_BRACKETS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Electricity</label>
                    <select className={inputClass} value={assetsExpenses.electricityBill} onChange={e => setAssetsExpenses(a => ({ ...a, electricityBill: e.target.value }))}>
                      {BILL_BRACKETS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Telephone</label>
                    <select className={inputClass} value={assetsExpenses.telephoneBill} onChange={e => setAssetsExpenses(a => ({ ...a, telephoneBill: e.target.value }))}>
                      {BILL_BRACKETS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Mobile Phone</label>
                    <select className={inputClass} value={assetsExpenses.mobilePhoneBill} onChange={e => setAssetsExpenses(a => ({ ...a, mobilePhoneBill: e.target.value }))}>
                      {BILL_BRACKETS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Internet</label>
                    <select className={inputClass} value={assetsExpenses.internetBill} onChange={e => setAssetsExpenses(a => ({ ...a, internetBill: e.target.value }))}>
                      {BILL_BRACKETS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Amortization (House)</label>
                    <select className={inputClass} value={assetsExpenses.amortizationHouse} onChange={e => setAssetsExpenses(a => ({ ...a, amortizationHouse: e.target.value }))}>
                      {BILL_BRACKETS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Amortization (Auto)</label>
                    <select className={inputClass} value={assetsExpenses.amortizationAuto} onChange={e => setAssetsExpenses(a => ({ ...a, amortizationAuto: e.target.value }))}>
                      {BILL_BRACKETS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-6 space-y-4">
                <h3 className="font-display font-bold text-sm text-brand-green uppercase tracking-wider">Agreement</h3>
                <button type="button" className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-green hover:text-brand-green-dark underline focus:outline-hidden">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Read Scholarship Application Guidelines and Procedures
                </button>

                <div className={`border rounded-xl p-4 space-y-3 ${
                  fieldError('certifyConsulted') || fieldError('certifyAccuracy')
                    ? 'border-rose-400 bg-rose-50/60'
                    : 'border-amber-300 bg-amber-50/50'
                }`}>
                  <label className={`flex items-start gap-2.5 text-xs leading-relaxed cursor-pointer rounded-lg p-1 -m-1 ${
                    fieldError('certifyConsulted') ? 'text-rose-700' : 'text-slate-700'
                  }`}>
                    <input
                      type="checkbox"
                      checked={agreement.certifyConsulted}
                      onChange={e => { setAgreement(a => ({ ...a, certifyConsulted: e.target.checked })); clearFieldError('certifyConsulted'); }}
                      className={`mt-0.5 shrink-0 ${fieldError('certifyConsulted') ? 'accent-rose-500' : 'accent-brand-green'}`}
                    />
                    <span>
                      I hereby certify that I have consulted family members with regard to the statements and other information.
                      They are to the best of our knowledge correct and complete. The Student Scholarship Office has my permission
                      to verify the information on this form and at any time revoke my scholarship should, after observing due
                      process, find the information false.
                    </span>
                  </label>
                  <label className={`flex items-start gap-2.5 text-xs leading-relaxed cursor-pointer rounded-lg p-1 -m-1 ${
                    fieldError('certifyAccuracy') ? 'text-rose-700' : 'text-slate-700'
                  }`}>
                    <input
                      type="checkbox"
                      checked={agreement.certifyAccuracy}
                      onChange={e => { setAgreement(a => ({ ...a, certifyAccuracy: e.target.checked })); clearFieldError('certifyAccuracy'); }}
                      className={`mt-0.5 shrink-0 ${fieldError('certifyAccuracy') ? 'accent-rose-500' : 'accent-brand-green'}`}
                    />
                    <span>
                      This is to certify the veracity and completeness of all information written on this form. I understand
                      that any falsification, misrepresentation or withholding of information shall be a ground for
                      non-processing or exclusion from the Scholarship Office of De La Salle University-Dasmariñas.
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Tab footer navigation */}
          <div className="flex justify-between items-center pt-6 mt-6 border-t border-slate-100">
            {wizardStep > 1 ? (
              <button
                type="button"
                onClick={() => goToSfagStep(wizardStep - 1)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-brand-green bg-slate-50 hover:bg-slate-100 border border-slate-200 px-4 py-2.5 rounded-lg transition-colors focus:outline-hidden"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{SFAG_TABS[wizardStep - 2].label}</span>
              </button>
            ) : !isResubmit ? (
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="text-xs font-bold text-rose-500 hover:text-rose-600 transition-colors focus:outline-hidden"
              >
                Discard draft and start over
              </button>
            ) : <span />}

            {wizardStep < 5 ? (
              <button
                type="button"
                onClick={() => goToSfagStep(wizardStep + 1)}
                className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white bg-brand-green hover:bg-brand-green-dark px-5 py-2.5 rounded-lg transition-colors focus:outline-hidden"
              >
                <span>{SFAG_TABS[wizardStep].label}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSfagAgreementNext}
                className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white bg-brand-green hover:bg-brand-green-dark px-5 py-2.5 rounded-lg transition-colors focus:outline-hidden"
              >
                <span>Next: Upload Documents</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}