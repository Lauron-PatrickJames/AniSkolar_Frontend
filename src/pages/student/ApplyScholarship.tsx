import React, { useState } from 'react';
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
  AlertCircle, User, MapPin, Users, PiggyBank, ClipboardCheck, Plus, ExternalLink
} from 'lucide-react';
import { motion } from 'motion/react';

interface ApplyScholarshipProps {
  scholarship: Scholarship;
  student: StudentProfile;
  onBack: () => void;
  onSubmitApplication: (application: Application) => void;
  id?: string;
}

interface UploadedFile {
  docName: string;
  fileName: string;
  fileSize: string;
}

// --- Shared option lists --------------------------------------------------
// NOTE: The monthly income / expense brackets below reproduce only the
// specific values that were visible in the reference screenshots of the
// real SFA Grant form (the dropdowns themselves weren't expanded, so the
// full official bracket ladder isn't confirmed). Verify the complete list
// of brackets against the live system before relying on this for real
// evaluations - these are placeholders sized to look plausible, not a
// verified official schedule.
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
const RELIGION_OPTIONS = ['CATHOLIC', 'CHRISTIAN', 'IGLESIA NI CRISTO', 'ISLAM', 'OTHERS'];
const GENDER_OPTIONS = ['Female', 'Male', 'Non-binary', 'Other', 'Prefer not to say'];
const SIBLING_SOCIAL_STATUS_OPTIONS = [
  'STUDYING-ELEMENTARY',
  'STUDYING-HIGHSCHOOL',
  'STUDYING-COLLEGE',
  'WORKING',
  'NOT WORKING',
  'N/A'
];

function emptyPersonalInfo(student: StudentProfile): SfagPersonalInfo {
  const nameParts = student.name.split(' ');
  return {
    lastName: nameParts.length > 1 ? nameParts[nameParts.length - 1] : '',
    firstName: nameParts.slice(0, -1).join(' ') || student.name,
    middleInitial: '',
    suffix: '',
    studentNumber: student.studentNumber,
    course: student.course,
    yearLevel: student.yearLevel,
    placeOfBirth: '',
    dateOfBirth: '',
    age: '',
    civilStatus: 'SINGLE',
    gender: '',
    nationality: 'FILIPINO',
    isPwd: false,
    religion: 'CATHOLIC',
    specifyReligion: ''
  };
}

function emptyContactSchool(student: StudentProfile): SfagContactSchool {
  return {
    streetAddress: '',
    municipality: '',
    province: '',
    country: 'PHILIPPINES',
    mobileNo: '',
    landlineNo: '',
    email: student.email,
    secondarySchool: '',
    schoolAddress: '',
    schoolType: 'Public'
  };
}

function emptyParentsGuardian(): SfagParentsGuardian {
  return {
    father: { fullName: '', occupation: '', company: '', companyTel: '', monthlyIncome: INCOME_BRACKETS[0], isSoloParent: false },
    mother: { fullName: '', occupation: '', company: '', companyTel: '', monthlyIncome: INCOME_BRACKETS[0], isSoloParent: false },
    guardian: { fullName: '', occupation: '', monthlyIncome: INCOME_BRACKETS[0], relationship: '', contactNo: '' }
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

const SFAG_TABS = [
  { step: 1, label: 'Personal Info', icon: User },
  { step: 2, label: 'Contact & School', icon: MapPin },
  { step: 3, label: 'Parents & Guardian', icon: Users },
  { step: 4, label: 'Siblings', icon: Users },
  { step: 5, label: 'Assets, Expenses & Agreement', icon: PiggyBank }
];

const inputClass =
  'block w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all';
const errorInputClass =
  'block w-full px-3.5 py-2.5 border-2 border-rose-400 rounded-lg text-sm bg-rose-50/60 focus:outline-hidden focus:ring-2 focus:ring-rose-300 focus:border-rose-500 transition-all';
const labelClass = 'block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5';

// Result of validating a step: a human-readable message plus the exact
// field keys that are missing, so the offending inputs can be highlighted.
interface StepValidation {
  message: string;
  fields: string[];
}

export default function ApplyScholarship({
  scholarship,
  student,
  onBack,
  onSubmitApplication,
  id
}: ApplyScholarshipProps) {
  const isSfag = scholarship.applicationFormType === 'sfag';

  // --- SFAG multi-step wizard state ---------------------------------------
  // Step 1-5 = the detailed form tabs, step 6 = document upload (shared
  // logic with the standard flow below).
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [personalInfo, setPersonalInfo] = useState<SfagPersonalInfo>(() => emptyPersonalInfo(student));
  const [contactSchool, setContactSchool] = useState<SfagContactSchool>(() => emptyContactSchool(student));
  const [parentsGuardian, setParentsGuardian] = useState<SfagParentsGuardian>(emptyParentsGuardian);
  const [siblings, setSiblings] = useState<SfagSibling[]>([]);
  const [assetsExpenses, setAssetsExpenses] = useState<SfagAssetsExpenses>(emptyAssetsExpenses);
  const [agreement, setAgreement] = useState<SfagAgreement>({ certifyConsulted: false, certifyAccuracy: false });
  const [sfagFormError, setSfagFormError] = useState('');

  // Tracks which field keys currently need to be highlighted red because
  // they failed the last validation pass. Shared between the SFAG wizard
  // and the standard form since only one of the two ever renders for a
  // given scholarship. Cleared on every successful step change and as
  // each individual field is edited.
  const [missingFields, setMissingFields] = useState<Set<string>>(new Set());
  const fieldClass = (key: string) => (missingFields.has(key) ? errorInputClass : inputClass);
  const clearFieldError = (key: string) => {
    setMissingFields(prev => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  // New sibling draft row
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

  // --- Shared state (both flows use these for the standard/simple form
  // and for document upload) --------------------------------------------
  const [firstName, setFirstName] = useState(student.name.split(' ')[0] || '');
  const [lastName, setLastName] = useState(student.name.split(' ').slice(1).join(' ') || '');
  const [email, setEmail] = useState(student.email);
  const [phone, setPhone] = useState('+63 917 123 4567');
  const [studentNumber, setStudentNumber] = useState(student.studentNumber);
  const [program, setProgram] = useState(student.course);
  const [yearLevel, setYearLevel] = useState(student.yearLevel);
  const [gpa, setGpa] = useState(student.gpa);

  const [uploads, setUploads] = useState<Record<string, UploadedFile>>({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleFileChange = (docName: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      setUploads(prev => ({
        ...prev,
        [docName]: { docName, fileName: file.name, fileSize: `${fileSizeMB} MB` }
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
    if (!siblingDraft.fullName.trim()) return;
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

  // Validate the currently active SFAG tab. Returns a message plus the
  // list of field keys that are missing, so every offending input can be
  // highlighted at once (not just the first one found).
  const validateSfagStep = (step: number): StepValidation => {
    const fields: string[] = [];

    if (step === 1) {
      if (!personalInfo.lastName) fields.push('lastName');
      if (!personalInfo.firstName) fields.push('firstName');
      if (!personalInfo.placeOfBirth) fields.push('placeOfBirth');
      if (!personalInfo.dateOfBirth) fields.push('dateOfBirth');
      if (!personalInfo.nationality) fields.push('nationality');
      if (personalInfo.religion === 'OTHERS' && !personalInfo.specifyReligion) fields.push('specifyReligion');
    }
    if (step === 2) {
      if (!contactSchool.streetAddress) fields.push('streetAddress');
      if (!contactSchool.municipality) fields.push('municipality');
      if (!contactSchool.province) fields.push('province');
      if (!contactSchool.country) fields.push('country');
      if (!contactSchool.mobileNo) fields.push('mobileNo');
      if (!contactSchool.email) fields.push('email');
      if (!contactSchool.secondarySchool) fields.push('secondarySchool');
      if (!contactSchool.schoolAddress) fields.push('schoolAddress');
    }
    if (step === 3) {
      if (!parentsGuardian.father.fullName) fields.push('father.fullName');
      if (!parentsGuardian.mother.fullName) fields.push('mother.fullName');
    }

    if (fields.length === 0) return { message: '', fields: [] };

    if (step === 3) {
      return {
        message: 'Fill out all required fields. Use "N/A" for any parent field that does not apply, rather than leaving it blank.',
        fields
      };
    }
    return { message: 'Fill out all required fields.', fields };
  };

  const goToSfagStep = (nextStep: number) => {
    // Only block forward navigation on validation errors; allow going back freely.
    if (nextStep > wizardStep) {
      const { message, fields } = validateSfagStep(wizardStep);
      if (fields.length > 0) {
        setSfagFormError(message);
        setMissingFields(new Set(fields));
        return;
      }
    }
    setSfagFormError('');
    setMissingFields(new Set());
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
    const fields: string[] = [];
    if (!agreement.certifyConsulted) fields.push('certifyConsulted');
    if (!agreement.certifyAccuracy) fields.push('certifyAccuracy');
    if (fields.length > 0) {
      setSfagFormError('Fill out all required fields. Check both certification boxes before proceeding to document upload.');
      setMissingFields(new Set(fields));
      return;
    }
    setSfagFormError('');
    setMissingFields(new Set());
    setWizardStep(6); // move to shared document upload step
  };

  const submitFinal = (sfagDetails?: SfagApplicationDetails) => {
    const missingDocs = scholarship.requirements.filter(req => !uploads[req]);
    if (missingDocs.length > 0) {
      setFormError(`Please upload all required files. Missing: ${missingDocs.slice(0, 2).join(', ')}${missingDocs.length > 2 ? ' and others.' : '.'}`);
      return;
    }

    if (!isSfag) {
      const fields: string[] = [];
      if (!firstName) fields.push('firstName');
      if (!lastName) fields.push('lastName');
      if (!email) fields.push('email');
      if (!studentNumber) fields.push('studentNumber');
      if (!program) fields.push('program');
      if (!yearLevel) fields.push('yearLevel');
      if (!gpa) fields.push('gpa');
      if (fields.length > 0) {
        setFormError('Fill out all required fields.');
        setMissingFields(new Set(fields));
        return;
      }
    }

    setIsSubmitting(true);

    setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true);

      const newApplication: Application = {
        id: `app_${Math.random().toString(36).substr(2, 9)}`,
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

      onSubmitApplication(newApplication);
    }, 1500);
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

  // --- Success screen (shared) ---------------------------------------------
  if (isSuccess) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 md:p-12 text-center max-w-xl mx-auto space-y-6 shadow-xl my-8">
        <div className="w-16 h-16 rounded-full bg-emerald-100 text-brand-green flex items-center justify-center mx-auto shadow-md">
          <CheckCircle className="w-10 h-10" />
        </div>
        <div className="space-y-2">
          <h2 className="font-display font-black text-2xl text-slate-900 tracking-tight">Application Submitted Successfully!</h2>
          <p className="text-xs font-semibold text-brand-green uppercase tracking-wider">Reference Code: DLSU-D-SFAO-{Math.floor(Math.random() * 900000 + 100000)}</p>
        </div>
        <p className="text-sm text-slate-500 leading-relaxed max-w-sm mx-auto">
          Your application for the <strong>{scholarship.name}</strong> has been received by the Scholarship and Financial Assistance Office (SFAO).
        </p>
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-left text-xs text-slate-500 space-y-2">
          <p><strong>What happens next?</strong></p>
          <p>1. SFAO Officers will verify your uploaded grades and certifications.</p>
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
            Please review the requirements below and upload a digital scan or photo for each item.
          </p>

          {formError && (
            <div className="p-4 bg-rose-50 text-rose-800 rounded-xl border border-rose-100 text-xs font-bold flex items-center gap-2 mb-4">
              <AlertCircle className="w-4 h-4 text-rose-600" />
              <span>{formError}</span>
            </div>
          )}

          <div className="space-y-4">
            {scholarship.requirements.map((req, idx) => {
              const uploadedFile = uploads[req];
              return (
                <div key={idx} className="p-3 border border-slate-200 rounded-xl space-y-2 bg-slate-50/30">
                  <p className="text-xs font-bold text-slate-700 leading-snug">{req}</p>
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
                    <label className="flex items-center justify-center border-2 border-dashed border-slate-200 hover:border-brand-green/40 hover:bg-brand-green/2 rounded-lg p-3 cursor-pointer transition-colors text-xs text-slate-500 font-semibold gap-1.5">
                      <Upload className="w-4 h-4 text-slate-400" />
                      <span>Select Document</span>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
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

        <button
          type="button"
          onClick={onBackClick}
          className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-500 hover:text-brand-green transition-colors focus:outline-hidden"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{backLabel}</span>
        </button>
      </div>

      <div className="space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full font-display font-bold uppercase text-xs tracking-wider text-white bg-brand-green hover:bg-brand-green-dark px-5 py-4 rounded-xl transition-all duration-200 shadow-md shadow-emerald-900/10 flex items-center justify-center space-x-1.5 focus:outline-hidden disabled:opacity-50"
          >
            <span>{isSubmitting ? 'Submitting Application...' : 'Submit Application'}</span>
          </button>
        </div>

        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-2.5">
          <ShieldAlert className="w-4.5 h-4.5 text-slate-400 shrink-0 mt-0.5" />
          <div className="text-[10px] text-slate-500 leading-relaxed">
            <span className="font-bold">Privacy Certification:</span> SFAO complies with the Philippine Data Privacy Act of 2012. Information submitted is kept confidential and utilized solely for scholarship scoring.
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
              Application Form: <span className="text-brand-green">{scholarship.name}</span>
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
            Application Form: <span className="text-brand-green">{scholarship.name}</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Complete the forms below and upload digital files. Please review your profiles carefully before submission.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setFormError('');
            const fields: string[] = [];
            if (!firstName) fields.push('firstName');
            if (!lastName) fields.push('lastName');
            if (!email) fields.push('email');
            if (!studentNumber) fields.push('studentNumber');
            if (!program) fields.push('program');
            if (!yearLevel) fields.push('yearLevel');
            if (!gpa) fields.push('gpa');
            if (fields.length > 0) {
              setFormError('Fill out all required fields.');
              setMissingFields(new Set(fields));
              return;
            }
            setMissingFields(new Set());
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
                <label className={labelClass}>First Name</label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => { setFirstName(e.target.value); clearFieldError('firstName'); }}
                  className={fieldClass('firstName')}
                />
              </div>
              <div>
                <label className={labelClass}>Last Name</label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => { setLastName(e.target.value); clearFieldError('lastName'); }}
                  className={fieldClass('lastName')}
                />
              </div>
              <div>
                <label className={labelClass}>Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); clearFieldError('email'); }}
                  className={fieldClass('email')}
                />
              </div>
              <div>
                <label className={labelClass}>Mobile Phone</label>
                <input type="text" required value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Student Number</label>
                <input type="text" required value={studentNumber} disabled className={`${inputClass} bg-slate-50/20 text-slate-500 cursor-not-allowed`} />
              </div>
              <div>
                <label className={labelClass}>Academic Program (Course)</label>
                <input
                  type="text"
                  required
                  value={program}
                  onChange={(e) => { setProgram(e.target.value); clearFieldError('program'); }}
                  className={fieldClass('program')}
                />
              </div>
              <div>
                <label className={labelClass}>Year Level</label>
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
              </div>
              <div>
                <label className={labelClass}>Cumulative GPA</label>
                <input
                  type="text"
                  required
                  value={gpa}
                  onChange={(e) => { setGpa(e.target.value); clearFieldError('gpa'); }}
                  className={fieldClass('gpa')}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
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
            Application Form: <span className="text-brand-green">{scholarship.name}</span>
          </h2>
        </div>
        {renderDocumentUpload(handleSfagFinalSubmit, 'Back to Assets, Expenses & Agreement', () => setWizardStep(5))}
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

      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-2.5">
        <AlertCircle className="w-4.5 h-4.5 text-yellow-600 shrink-0 mt-0.5" />
        <p className="text-xs text-yellow-800 leading-relaxed">
          <strong>Fill out all required fields.</strong> Use "N/A" where not applicable. Information cannot be changed after submission.
        </p>
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
                    ? 'border-brand-green text-brand-green'
                    : isComplete
                    ? 'border-transparent text-slate-500 hover:text-brand-green'
                    : 'border-transparent text-slate-400'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                  isActive || isComplete ? 'bg-brand-green text-white' : 'bg-slate-200 text-slate-500'
                }`}>
                  {tab.step}
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
                    <label className={labelClass}>Last Name</label>
                    <input
                      className={fieldClass('lastName')}
                      value={personalInfo.lastName}
                      onChange={e => { setPersonalInfo(p => ({ ...p, lastName: e.target.value })); clearFieldError('lastName'); }}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>First Name</label>
                    <input
                      className={fieldClass('firstName')}
                      value={personalInfo.firstName}
                      onChange={e => { setPersonalInfo(p => ({ ...p, firstName: e.target.value })); clearFieldError('firstName'); }}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>M.I.</label>
                    <input className={inputClass} value={personalInfo.middleInitial} onChange={e => setPersonalInfo(p => ({ ...p, middleInitial: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelClass}>Suffix</label>
                    <input className={inputClass} value={personalInfo.suffix} onChange={e => setPersonalInfo(p => ({ ...p, suffix: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                  <div>
                    <label className={labelClass}>Student No.</label>
                    <input className={inputClass} value={personalInfo.studentNumber} disabled />
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
                    <label className={labelClass}>Place of Birth *</label>
                    <input
                      className={fieldClass('placeOfBirth')}
                      value={personalInfo.placeOfBirth}
                      onChange={e => { setPersonalInfo(p => ({ ...p, placeOfBirth: e.target.value })); clearFieldError('placeOfBirth'); }}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Date of Birth *</label>
                    <input
                      type="date"
                      className={fieldClass('dateOfBirth')}
                      value={personalInfo.dateOfBirth}
                      onChange={e => { setPersonalInfo(p => ({ ...p, dateOfBirth: e.target.value })); clearFieldError('dateOfBirth'); }}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Age</label>
                    <input className={inputClass} value={personalInfo.age} onChange={e => setPersonalInfo(p => ({ ...p, age: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 items-end">
                  <div>
                    <label className={labelClass}>Civil Status</label>
                    <select className={inputClass} value={personalInfo.civilStatus} onChange={e => setPersonalInfo(p => ({ ...p, civilStatus: e.target.value }))}>
                      {CIVIL_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Gender</label>
                    <select className={inputClass} value={personalInfo.gender} onChange={e => setPersonalInfo(p => ({ ...p, gender: e.target.value }))}>
                      <option value="">Select</option>
                      {GENDER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <label className={labelClass}>Nationality *</label>
                      <input
                        className={fieldClass('nationality')}
                        value={personalInfo.nationality}
                        onChange={e => { setPersonalInfo(p => ({ ...p, nationality: e.target.value })); clearFieldError('nationality'); }}
                      />
                    </div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 pb-2.5 shrink-0">
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
                      <label className={labelClass}>Specify Religion</label>
                      <input
                        className={fieldClass('specifyReligion')}
                        value={personalInfo.specifyReligion}
                        onChange={e => { setPersonalInfo(p => ({ ...p, specifyReligion: e.target.value })); clearFieldError('specifyReligion'); }}
                      />
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
                  <label className={labelClass}>No. / Street / Subdivision / Barangay *</label>
                  <input
                    className={fieldClass('streetAddress')}
                    value={contactSchool.streetAddress}
                    onChange={e => { setContactSchool(c => ({ ...c, streetAddress: e.target.value })); clearFieldError('streetAddress'); }}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                  <div>
                    <label className={labelClass}>Municipality / City *</label>
                    <input
                      className={fieldClass('municipality')}
                      value={contactSchool.municipality}
                      onChange={e => { setContactSchool(c => ({ ...c, municipality: e.target.value })); clearFieldError('municipality'); }}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Province *</label>
                    <input
                      className={fieldClass('province')}
                      value={contactSchool.province}
                      onChange={e => { setContactSchool(c => ({ ...c, province: e.target.value })); clearFieldError('province'); }}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Country *</label>
                    <input
                      className={fieldClass('country')}
                      value={contactSchool.country}
                      onChange={e => { setContactSchool(c => ({ ...c, country: e.target.value })); clearFieldError('country'); }}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-6">
                <h3 className="font-display font-bold text-sm text-brand-green uppercase tracking-wider mb-3">Contact Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className={labelClass}>Mobile No. *</label>
                    <input
                      className={fieldClass('mobileNo')}
                      value={contactSchool.mobileNo}
                      onChange={e => { setContactSchool(c => ({ ...c, mobileNo: e.target.value })); clearFieldError('mobileNo'); }}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Landline No.</label>
                    <input className={inputClass} value={contactSchool.landlineNo} onChange={e => setContactSchool(c => ({ ...c, landlineNo: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelClass}>Email Address *</label>
                    <input
                      type="email"
                      className={fieldClass('email')}
                      value={contactSchool.email}
                      onChange={e => { setContactSchool(c => ({ ...c, email: e.target.value })); clearFieldError('email'); }}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-6">
                <h3 className="font-display font-bold text-sm text-brand-green uppercase tracking-wider mb-3">Secondary School</h3>
                <div>
                  <label className={labelClass}>Secondary School Attended *</label>
                  <input
                    className={fieldClass('secondarySchool')}
                    value={contactSchool.secondarySchool}
                    onChange={e => { setContactSchool(c => ({ ...c, secondarySchool: e.target.value })); clearFieldError('secondarySchool'); }}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-4">
                  <div className="sm:col-span-3">
                    <label className={labelClass}>School Address *</label>
                    <input
                      className={fieldClass('schoolAddress')}
                      value={contactSchool.schoolAddress}
                      onChange={e => { setContactSchool(c => ({ ...c, schoolAddress: e.target.value })); clearFieldError('schoolAddress'); }}
                    />
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
                  const setParent = (updates: Partial<typeof parent>) =>
                    setParentsGuardian(pg => ({ ...pg, [parentKey]: { ...pg[parentKey], ...updates } }));
                  const fullNameKey = `${parentKey}.fullName`;
                  return (
                    <div key={parentKey} className="rounded-xl border border-slate-200 overflow-hidden">
                      <div className="bg-brand-green text-white px-4 py-2.5 font-display font-bold text-xs uppercase tracking-wider">
                        {parentKey}
                      </div>
                      <div className="p-4 space-y-3">
                        <div>
                          <label className={labelClass}>Full Name *</label>
                          <input
                            className={fieldClass(fullNameKey)}
                            value={parent.fullName}
                            onChange={e => { setParent({ fullName: e.target.value }); clearFieldError(fullNameKey); }}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Occupation *</label>
                          <input className={inputClass} value={parent.occupation} onChange={e => setParent({ occupation: e.target.value })} />
                        </div>
                        <div>
                          <label className={labelClass}>Company *</label>
                          <input className={inputClass} value={parent.company} onChange={e => setParent({ company: e.target.value })} />
                        </div>
                        <div>
                          <label className={labelClass}>Company Tel. *</label>
                          <input className={inputClass} value={parent.companyTel} onChange={e => setParent({ companyTel: e.target.value })} />
                        </div>
                        <div>
                          <label className={labelClass}>Monthly Income</label>
                          <select className={inputClass} value={parent.monthlyIncome} onChange={e => setParent({ monthlyIncome: e.target.value })}>
                            {INCOME_BRACKETS.map(b => <option key={b} value={b}>{b}</option>)}
                          </select>
                        </div>
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                          <input type="checkbox" checked={parent.isSoloParent} onChange={e => setParent({ isSoloParent: e.target.checked })} className="accent-brand-green" />
                          Solo Parent?
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-slate-100 pt-6">
                <h3 className="font-display font-bold text-sm text-brand-green uppercase tracking-wider mb-3">Guardian's Information</h3>
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
              <h3 className="font-display font-bold text-sm text-brand-green uppercase tracking-wider">Brothers & Sisters</h3>

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
                        <tr key={sib.id}>
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
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <input placeholder="Last name, First name" className={inputClass} value={siblingDraft.fullName} onChange={e => setSiblingDraft(d => ({ ...d, fullName: e.target.value }))} />
                  <select className={inputClass} value={siblingDraft.socialStatus} onChange={e => setSiblingDraft(d => ({ ...d, socialStatus: e.target.value }))}>
                    {SIBLING_SOCIAL_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <select className={inputClass} value={siblingDraft.civilStatus} onChange={e => setSiblingDraft(d => ({ ...d, civilStatus: e.target.value }))}>
                    {CIVIL_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <input placeholder="Age" className={inputClass} value={siblingDraft.age} onChange={e => setSiblingDraft(d => ({ ...d, age: e.target.value }))} />
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
                <AlertCircle className="w-4.5 h-4.5 text-blue-600 shrink-0 mt-0.5" />
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
                  <label className={labelClass}>Income Sources *</label>
                  <input className={inputClass} value={assetsExpenses.incomeSources} onChange={e => setAssetsExpenses(a => ({ ...a, incomeSources: e.target.value }))} />
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
                  missingFields.has('certifyConsulted') || missingFields.has('certifyAccuracy')
                    ? 'border-rose-400 bg-rose-50/60'
                    : 'border-amber-300 bg-amber-50/50'
                }`}>
                  <label className={`flex items-start gap-2.5 text-xs leading-relaxed cursor-pointer rounded-lg p-1 -m-1 ${
                    missingFields.has('certifyConsulted') ? 'text-rose-700' : 'text-slate-700'
                  }`}>
                    <input
                      type="checkbox"
                      checked={agreement.certifyConsulted}
                      onChange={e => { setAgreement(a => ({ ...a, certifyConsulted: e.target.checked })); clearFieldError('certifyConsulted'); }}
                      className={`mt-0.5 shrink-0 ${missingFields.has('certifyConsulted') ? 'accent-rose-500' : 'accent-brand-green'}`}
                    />
                    <span>
                      I hereby certify that I have consulted family members with regard to the statements and other information.
                      They are to the best of our knowledge correct and complete. The Student Scholarship Office has my permission
                      to verify the information on this form and at any time revoke my scholarship should, after observing due
                      process, find the information false.
                    </span>
                  </label>
                  <label className={`flex items-start gap-2.5 text-xs leading-relaxed cursor-pointer rounded-lg p-1 -m-1 ${
                    missingFields.has('certifyAccuracy') ? 'text-rose-700' : 'text-slate-700'
                  }`}>
                    <input
                      type="checkbox"
                      checked={agreement.certifyAccuracy}
                      onChange={e => { setAgreement(a => ({ ...a, certifyAccuracy: e.target.checked })); clearFieldError('certifyAccuracy'); }}
                      className={`mt-0.5 shrink-0 ${missingFields.has('certifyAccuracy') ? 'accent-rose-500' : 'accent-brand-green'}`}
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
            ) : <div />}

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