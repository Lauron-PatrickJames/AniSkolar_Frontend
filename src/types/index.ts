export interface Scholarship {
  id: string;
  name: string;
  category: 'Academic' | 'Financial' | 'Athletic' | 'Leadership' | 'Others';
  description: string;
  benefits: string[];
  eligibility: string[];
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
  applicationFormType?: 'sfag' | 'standard';
}

export interface Announcement {
  id: string;
  title: string;
  date: string;
  description: string;
  content: string;
  category: 'General' | 'Update' | 'Deadline' | 'Event';
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
  status: 'Pending' | 'Approved' | 'Rejected' | 'Under Evaluation';
  submittedAt: string;
  // Present only for applications submitted through the detailed SFA
  // Grant form (applicationFormType === 'sfag'). Holds the full 5-tab
  // dataset in addition to the summary fields above.
  sfagDetails?: SfagApplicationDetails;
}

export interface StudentProfile {
  studentNumber: string;
  name: string;
  course: string;
  college: string;
  yearLevel: string;
  email: string;
  gpa: string;
  avatarUrl?: string;
}