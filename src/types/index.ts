export interface Scholarship {
  id: string;
  name: string;
  category: 'Academic' | 'Financial' | 'Athletic' | 'Leadership' | 'Others';
  description: string;
  benefits: string[];
  eligibility: string[]; // keep as-is for display
  eligibilityCriteria?: {
    yearLevels?: string[];       // e.g. ['1st Year'] — omit if open to all
    minGpa?: number;             // lower number = better GPA in your scale
    maxGpa?: number;
    applicantType?: 'incoming' | 'continuing' | 'any';
    // --- Apply-time rules (checked in the application form, see
    // checkApplyEligibility in utils/eligibility.ts). These need answers
    // the student profile doesn't hold, so they can't filter the list.
    minHsGeneralAverage?: number;  // e.g. 85
    minHsSubjectGrade?: number;    // e.g. 80 = "no grade in the 70s"
    requiresNoBoardRelation?: boolean;
    alumniRelation?: {
      institutions: string[];
      relationships: string[];     // allowed degrees of consanguinity
    };
  };
  // Conditions a grantee must keep while holding the scholarship. Shown on
  // the details page only; never used to block an application.
  retentionConditions?: string[];
  requirements: string[];
  process: string[];
  deadline: string;
  status: 'Open' | 'Closed' | 'Closing Soon';
  // Determines which application form the applicant fills out.
  // 'sfag'     -> the full 5-tab detailed form (personal, contact/school,
  //               parents & guardian, siblings, assets/expenses & agreement)
  //               modeled on the real SFA Grant application, then document
  //               upload.
  // 'standard' -> the original short form (personal/academic fields) then
  //               document upload. Defaults to 'standard' if omitted, so
  //               existing scholarship entries don't need to specify this.
  // 'polca' / 'alumni' -> the grant-form wizard (GrantApplication.tsx):
  //               shared application-form sections, the POLCA evaluation
  //               sheet (polca only), slot-based document upload, drafts.
  applicationFormType?: ApplicationFormType;

  // Which office reviews the grant. Omitted = LSO. Office-scoped admins
  // only see their own office's applications.
  office?: ScholarshipOffice;
  provider?: {
    name: string;
    office?: string;
    address: string;
    contact?: string[];
  };
  formId?: string;            // e.g. "Scholarship Form No. 002"
  guidelinesNote?: string;    // e.g. "Approved by the Board of Trustees, July 20, 2024"
  targetApplicants?: string;
  submissionNote?: string;
  // Structured requirements for the grant-form flows. `requirements`
  // above is derived from these for display.
  documentSlots?: DocumentSlot[];
}

// AdSO-edited content for a scholarship (GET /api/scholarships), merged
// over the defaults in src/data/scholarships.ts by applyScholarshipOverrides.
export interface ScholarshipOverride {
  id: string;
  status?: Scholarship['status'];
  deadline?: string;
  description?: string;
  benefits?: string[];
  eligibility?: string[];
  process?: string[];
  submissionNote?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type ApplicationFormType = 'standard' | 'sfag' | 'polca' | 'alumni';
export type ScholarshipOffice = 'LSO' | 'POLCA' | 'ALUMNI';

// One requirement in a grant-form scholarship's document checklist.
export interface DocumentSlot {
  key: string;                 // stable id, mirrored in backend data/scholarships.js
  label: string;
  hint?: string;
  // 'form' = produced by the in-app form itself (nothing to upload).
  source?: 'upload' | 'form';
  // 'form' = the upload input lives inside a form section (2x2 photo,
  // utility bills) instead of the Documents step.
  placement?: 'documents' | 'form';
  multiple?: boolean;
  maxFiles?: number;
  // Several accepted document types for one slot; the student picks one.
  variants?: string[];
  optional?: boolean;
  // Conditional requirement (e.g. electricity bill only if they have electricity).
  requiredWhen?: (details: GrantApplicationDetails) => boolean;
}

export interface Announcement {
  id: string;
  title: string;
  date: string;
  description: string;
  content: string;
  category: 'General' | 'Update' | 'Deadline' | 'Event';
  // From GET /api/announcements/feed: the announcement's image (a path on
  // the API server) and, when it was posted to the Facebook Page, its link.
  imageUrl?: string | null;
  fbPermalink?: string | null;
}

// --- Detailed SFA Grant application schema ------------------------------
// Mirrors the real 5-tab SFA Grant application form: Personal Info,
// Contact & School, Parents & Guardian, Siblings, and Assets/Expenses &
// Agreement. Used only when Scholarship.applicationFormType === 'sfag'.

export interface SfagPersonalInfo {
  lastName: string;
  firstName: string;
  middleInitial: string;
  suffix: string;
  studentNumber: string;
  course: string;
  yearLevel: string;
  placeOfBirth: string;
  dateOfBirth: string;
  age: string;
  civilStatus: string;
  gender: string;
  nationality: string;
  isPwd: boolean;
  religion: string;
  specifyReligion: string;
}

export interface SfagContactSchool {
  streetAddress: string;
  municipality: string;
  province: string;
  country: string;
  mobileNo: string;
  landlineNo: string;
  email: string;
  secondarySchool: string;
  schoolAddress: string;
  schoolType: 'Public' | 'Private';
}

export interface SfagParentInfo {
  fullName: string;
  occupation: string;
  company: string;
  companyTel: string;
  monthlyIncome: string;
  isSoloParent: boolean;
}

export interface SfagGuardianInfo {
  fullName: string;
  occupation: string;
  monthlyIncome: string;
  relationship: string;
  contactNo: string;
}

export interface SfagParentsGuardian {
  father: SfagParentInfo;
  mother: SfagParentInfo;
  guardian: SfagGuardianInfo;
}

export interface SfagSibling {
  id: string;
  fullName: string;
  socialStatus: string;
  civilStatus: string;
  age: string;
  schoolOrCompany: string;
  schoolType: 'Public' | 'Private' | 'N/A';
  tuitionOrIncome: string;
  isDlsudScholar: boolean;
}

export interface SfagAssetsExpenses {
  houseAndLot: string;
  automobile: string;
  incomeSources: string;
  combinedNonTaxableIncome: string;
  affidavitNonFilingIncomeTax: string;
  waterBill: string;
  electricityBill: string;
  telephoneBill: string;
  mobilePhoneBill: string;
  internetBill: string;
  amortizationHouse: string;
  amortizationAuto: string;
}

export interface SfagAgreement {
  certifyConsulted: boolean;
  certifyAccuracy: boolean;
}

export interface SfagApplicationDetails {
  personalInfo: SfagPersonalInfo;
  contactSchool: SfagContactSchool;
  parentsGuardian: SfagParentsGuardian;
  siblings: SfagSibling[];
  assetsExpenses: SfagAssetsExpenses;
  agreement: SfagAgreement;
}

// --- Grant-form applications (POLCA / Alumni) ----------------------------
// Stored on the backend in the same section fields as the SFAG form
// (personalInfo, contactSchool, parentsGuardian, siblings, assetsExpenses,
// agreement) plus eligibilityAnswers and, for POLCA, evaluationSheet.
// Peso amounts are plain numbers; format them with formatPeso().

export type YesNo = 'Yes' | 'No' | 'N/A' | '';

export interface GrantStudentData {
  lastName: string;
  firstName: string;
  middleName: string;
  studentNumber: string;
  course: string;
  yearLevel: string;
  dateOfBirth: string;
  placeOfBirth: string;
  civilStatus: string;
  gender: string;
  citizenship: string;
  religion: string;
  email: string;
  secondarySchool: string;
  secondarySchoolType: 'Public' | 'Private' | '';
}

export interface GrantParentInfo {
  name: string;
  occupation: string;
  monthlyIncome: number;
}

export interface GrantGuardianInfo {
  name: string;
  relationship: string;
  address: string;
  landlineNo: string;
  mobileNo: string;
}

export interface GrantParentsGuardian {
  father: GrantParentInfo;
  mother: GrantParentInfo;
  guardian: GrantGuardianInfo;
}

export interface GrantContact {
  streetAddress: string;
  barangay: string;
  municipality: string;
  province: string;
  landlineNo: string;
  mobileNo: string;
}

export interface GrantSibling {
  id: string;
  name: string;
  civilStatus: string;
  age: number;
  school: string;          // if studying
  yearLevel: string;       // if studying
  schoolType: 'Public' | 'Private' | 'N/A';
  company: string;         // if employed
}

export interface GrantFinancialInfo {
  houseTenure: 'Owned' | 'Rented' | 'Mortgaged' | '';
  houseValue: string;            // VALUE_BRACKETS
  hasAutomobile: YesNo;
  automobileValue: string;       // VALUE_BRACKETS
  familyIncomeBracket: string;   // combined family monthly income
  monthlyExpensesBracket: string;
}

export interface GrantCertification {
  agreed: boolean;
  applicantName: string;
  parentGuardianName: string;
}

export interface GrantEligibilityAnswers {
  // POLCA
  hsGeneralAverage?: number | null;
  lowestHsGrade?: number | null;
  notRelatedToBoardMember?: boolean;
  // Alumni
  alumnusName?: string;
  relationship?: string;
  institution?: string;
  batchYear?: string;
}

// --- POLCA evaluation sheet (Financial Aid Grantee Personal Information Sheet)

export interface SchoolRecord {
  schoolName: string;
  address: string;
  yearGraduated: string;
  type: 'Public' | 'Semi-Private' | 'Private' | '';
}

export interface FinancingSource {
  checked: boolean;
  specify: string;
  amountPerSem: number;
}

export interface HouseholdMember {
  name: string;
  age: number;
  highestDegree: string;
  school: string;
  employer: string;
  jobTitle: string;
  grossIncome: number;   // monthly
  living: 'Yes' | 'Yes - abroad' | 'No' | 'N/A' | '';
}

export interface EarningSibling {
  id: string;
  name: string;
  age: number;
  highestDegree: string;
  school: string;
  civilStatus: string;
  childrenCount: number;
  employer: string;
  jobTitle: string;
  grossIncome: number;
  livingWithFamily: 'Yes' | 'No - abroad' | 'No' | '';
}

export interface NonEarningSibling {
  id: string;
  name: string;
  age: number;
  civilStatus: string;
  childrenCount: number;
  isStudying: YesNo;
  highestLevel: string;
  school: string;
  withScholarship: YesNo;
}

export interface OtherContributor {
  id: string;
  name: string;
  relationship: string;
  contributionType: 'Monetary' | 'In Kind' | 'Etc.' | '';
  averageMonthly: number;
}

export interface VehicleEntry {
  count: number;
  models: string[];    // year/model of each, one per vehicle
}

export interface RealEstateEntry {
  id: string;
  kind: 'Residential' | 'Non-residential / Agricultural' | '';
  areaSqm: number;
  location: string;
  marketValue: number;
  earnsIncome: YesNo;
  monthlyIncome: number;
}

export interface EvaluationSheet {
  education: { elementary: SchoolRecord; juniorHigh: SchoolRecord; seniorHigh: SchoolRecord };
  boarding: { isBoarding: YesNo; monthlyFee: number };
  employment: { isEmployed: YesNo; type: 'Full time' | 'Part time' | ''; company: string; address: string; telNo: string };
  financing: {
    parents: boolean;
    relatives: boolean;
    self: boolean;
    otherScholarship: FinancingSource;
    educationalPlan: FinancingSource;
    others: FinancingSource;
  };
  memberships: {
    none: boolean;
    sportsCountryClub: boolean;
    serviceOrg: boolean;
    professionalAssociation: boolean;
    businessOrg: boolean;
    others: boolean;
    othersSpecify: string;
  };
  travel: {
    hasPassport: YesNo;
    passportDateIssued: string;   // the passport number is deliberately not collected
    traveledAbroad: YesNo;
    numberOfTrips: number;
    financedBy: 'Family' | 'Others' | '';
  };
  family: {
    coResiding: {
      father: boolean; mother: boolean; guardian: boolean; spouse: boolean;
      children: number; brothers: number; sisters: number; others: number;
    };
    parentsSeparated: YesNo;
    father: HouseholdMember;
    mother: HouseholdMember;
    spouse: HouseholdMember;
    guardian: HouseholdMember;
    earningSiblings: EarningSibling[];
    nonEarningSiblings: NonEarningSibling[];
    otherContributors: OtherContributor[];
  };
  assets: {
    incomeSources: string[];
    incomeSourcesOther: string;
    electricity: { has: YesNo; lastBill: number };
    water: { has: YesNo; lastBill: number };
    cableTv: YesNo;
    internet: YesNo;
    house: { status: string; monthlyAmount: number; othersSpecify: string };
    floorAreaSqm: number;
    bedrooms: number;
    bathrooms: number;
    vehicles: Record<string, VehicleEntry>;
    hasCreditCards: YesNo;
    realEstate: RealEstateEntry[];
    boarders: { has: YesNo; monthlyIncome: number };
  };
  statements: {
    applicant: { agreed: boolean; name: string; date: string };
    parent: { agreed: boolean; name: string; date: string };
  };
}

export interface GrantApplicationDetails {
  personalInfo: GrantStudentData;
  contactSchool: GrantContact;
  parentsGuardian: GrantParentsGuardian;
  siblings: GrantSibling[];
  assetsExpenses: GrantFinancialInfo;
  agreement: GrantCertification;
  eligibilityAnswers: GrantEligibilityAnswers;
  evaluationSheet?: EvaluationSheet;   // POLCA only
}

// A document as stored on the backend (models/Application.js).
export interface StoredDocument {
  docType: string;
  slotKey?: string;
  variant?: string;
  fileId: string;
  filename: string;
  mimetype?: string;
  size?: number;
}

// POLCA "For POLCA use only" box. Admin-only — never returned to students.
export interface PolcaAdminFields {
  dateReceived?: string;
  receivedBy?: string;
  applicantType?: 'New' | 'Old';
  gpa?: number;
  updatedBy?: string;
  updatedAt?: string;
}

export interface Application {
  id: string;
  scholarshipId: string;
  scholarshipName: string;
  personalInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    studentNumber: string;
  };
  program: string;
  yearLevel: string;
  gpa: string;
  documents: { name: string; uploaded: boolean; fileName?: string }[];
  status: 'Under Evaluation' | 'Approved' | 'Rejected' | 'Needs Revision';
  reviewNote?: string;
  submittedAt: string;
  // Present only for applications submitted through the detailed SFA
  // Grant form (applicationFormType === 'sfag'). Holds the full 5-tab
  // dataset in addition to the summary fields above.
  sfagDetails?: SfagApplicationDetails;
  applicationFormType?: ApplicationFormType;
  office?: ScholarshipOffice;
  // Present only for grant-form applications ('polca' / 'alumni'),
  // mapped from the stored sections in App.tsx's toFrontendApplication.
  grantDetails?: GrantApplicationDetails;
  storedDocuments?: StoredDocument[];
}

export interface StudentProfile {
  studentNumber: string;
  // The Clerk user id this profile is linked to (models/Student.js's
  // clerkId field). Used to scope browser-local state (e.g. the
  // in-progress application draft in ApplyScholarship.tsx) per account,
  // so switching Clerk accounts on the same browser/device can never
  // inherit another account's localStorage data even without an
  // intervening logout.
  clerkId?: string;
  name: string;
  course: string;
  college: string;
  yearLevel: string;
  email: string;
  gpa: string;
  avatarUrl?: string;

  // Personal Details
  programCode?: string;
  section?: string;
  dateOfBirth?: string;
  nationality?: string;
  placeOfBirth?: string;
  civilStatus?: string;

  // Contact Information
  homeAddress?: string;
  cityMunicipality?: string;
  province?: string;
  zipCode?: string;
  country?: string;
  telephoneNumber?: string;
  mobileNumber?: string;

  // Parents / Guardian Information
  fatherName?: string;
  motherName?: string;
  guardianName?: string;
  guardianRelationship?: string;
  guardianAddress?: string;
  guardianContactNo?: string;
}