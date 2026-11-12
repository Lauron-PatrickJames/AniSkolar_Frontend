import { DocumentSlot, GpaRequirement, Scholarship, ScholarshipOffice, ScholarshipOverride } from '../types';
import { EligibilityRules, documentTexts, ruleLines } from './requirementCatalog';
import { isSfagOpenAllYear } from '../utils/eligibility';
import { PROGRAMS } from './programs';

// Every CBAA program: the CBAASG scholarships are for CBAA students only.
const CBAA_PROGRAMS = PROGRAMS.filter(p => p.college === 'CBAA').map(p => p.code);
// Every CICS program: Padayon Pioneers is for CICS students only.
const CICS_PROGRAMS = PROGRAMS.filter(p => p.college === 'CICS').map(p => p.code);
// Every CEAT program: the CEAT Financial Aid Scholarship is for CEAT students only.
const CEAT_PROGRAMS = PROGRAMS.filter(p => p.college === 'CEAT').map(p => p.code);
// Every CCJE program: the CCJESG officers' grant is for CCJE students only.
const CCJE_PROGRAMS = PROGRAMS.filter(p => p.college === 'CCJE').map(p => p.code);

// The offices that run scholarships (mirrors the backend's data/offices.js).
// Each has its own admin accounts and handles its scholarships entirely;
// the AdSO sees their approved scholars. Scholarships without an `office`
// belong to the AdSO ('LSO').
export const OFFICES: { code: ScholarshipOffice; name: string; short: string }[] = [
  { code: 'LSO', name: 'Admissions and Scholarship Office (AdSO)', short: 'AdSO' },
  { code: 'POLCA', name: 'POLCA Office', short: 'POLCA' },
  { code: 'ALUMNI', name: 'Alumni Office', short: 'Alumni Office' },
  { code: 'SDO', name: 'Sports Development Office (SDO)', short: 'SDO' },
  { code: 'VICISSITUDE', name: 'Vicissitude', short: 'Vicissitude' },
  { code: 'ROTC', name: 'ROTC Office (267th NROTCU)', short: 'ROTC' },
  { code: 'USG', name: 'University Student Government (USG)', short: 'USG' },
  { code: 'HERALDO', name: 'Heraldo Filipino', short: 'Heraldo Filipino' },
  { code: 'CICSSG', name: 'CICS Student Government', short: 'CICSSG' },
  { code: 'CBAASG', name: 'CBAA Student Government', short: 'CBAASG' },
  { code: 'COEDSG', name: 'COEd Student Government', short: 'COEDSG' },
  { code: 'CCJESG', name: 'CCJE Student Government', short: 'CCJESG' },
  { code: 'CEATSG', name: 'CEAT Student Government', short: 'CEATSG' },
  { code: 'CTHMSG', name: 'CTHM Student Government', short: 'CTHMSG' },
  { code: 'COSSG', name: 'COS Student Government', short: 'COSSG' },
];

export const OFFICE_LABELS = Object.fromEntries(OFFICES.map(o => [o.code, o.name])) as Record<ScholarshipOffice, string>;
export const OFFICE_SHORT_LABELS = Object.fromEntries(OFFICES.map(o => [o.code, o.short])) as Record<ScholarshipOffice, string>;

// Info-only scholarships are listed but can't be applied for online.
export function acceptsOnlineApplications(scholarship: Pick<Scholarship, 'applicationMode'>): boolean {
  return (scholarship.applicationMode ?? 'online') === 'online';
}

// How an office is named next to a person or in a sentence: "AdSO",
// "POLCA Office", "Alumni Office". The single source for office names in
// activity history; never build them from stored codes.
export function officeDisplayName(office: string | null | undefined): string {
  if (!office || office === 'LSO') return OFFICE_SHORT_LABELS.LSO;
  return OFFICE_LABELS[office as ScholarshipOffice] ?? office;
}

export function officeOf(scholarship: Pick<Scholarship, 'office'>): ScholarshipOffice {
  return scholarship.office ?? 'LSO';
}

// Requirement labels for the details page / cards: every slot except the
// uploads that live inside a form section (2x2 photo, utility bills).
function requirementLabels(slots: DocumentSlot[]): string[] {
  return slots.filter(slot => slot.placement !== 'form').map(slot => slot.label);
}

// Contact details from the official scholarship page
// (dlsud.edu.ph/scholarship).
const officeProvider = (office: string, contact?: string[]) => ({
  name: 'De La Salle University-Dasmariñas',
  office,
  address: 'De La Salle University-Dasmariñas, Dasmariñas City, Cavite 4115',
  ...(contact ? { contact } : {})
});

const SCHOLARSHIP_OFFICE_PROVIDER = {
  name: 'De La Salle University-Dasmariñas',
  office: 'Admissions and Scholarship Office (AdSO)',
  address: 'Ayuntamiento De Gonzalez Bldg., De La Salle University-Dasmariñas, Brgy. Fatima 1, Dasmariñas City, Cavite 4115',
  contact: [
    'scholarship@dlsud.edu.ph · AdSO_admissions@dlsud.edu.ph',
    'Cavite +63 (46) 481.1900 · Manila +63 (2) 8779.5180 · local 3029'
  ]
};

export const ALUMNI_INSTITUTIONS = ['DLSU-EAC', 'DLSU-Aguinaldo', 'DLSU-Dasmariñas'];
// Up to the 2nd degree of consanguinity.
export const ALUMNI_RELATIONSHIPS = ['Parent', 'Sibling', 'Grandparent', 'Grandchild'];

export const INCOME_PROOF_VARIANTS = [
  "Parents' latest ITR",
  'Affidavit of Non-filing of ITR',
  'Employment contract (for children of OFWs)'
];

// Slot keys are mirrored in the backend's data/scholarships.js, which
// re-checks the required ones on submit.
const POLCA_DOCUMENT_SLOTS: DocumentSlot[] = [
  { key: 'polcaForm', label: 'Accomplished POLCA application form', source: 'form', hint: 'Generated from the Application Form sections of this wizard.' },
  { key: 'evaluationSheet', label: 'Accomplished 7-page evaluation sheet', source: 'form', hint: 'Generated from the Evaluation Sheet sections of this wizard.' },
  { key: 'parentLetter', label: 'Letter from parent/guardian supporting the need for financial assistance' },
  { key: 'personalEssay', label: 'Personal essay with a 2x2 picture taken within the last 3 months' },
  { key: 'indigency', label: 'Certificate of indigency' },
  { key: 'incomeProof', label: "Parents' latest ITR, Affidavit of Non-filing of ITR, or employment contract (for children of OFWs)", variants: INCOME_PROOF_VARIANTS },
  { key: 'shsGrades', label: 'Photocopy of Senior HS grades / GPA for the last semester' },
  { key: 'recommendationLetter', label: 'Recommendation letter for financial assistance from the HS principal or guidance counselor' },
  { key: 'residencePictures', label: 'Pictures of the residence (indoor and outdoor)', multiple: true, maxFiles: 6, hint: 'Upload at least one indoor and one outdoor photo.' },
  { key: 'vicinityMap', label: 'Hand-drawn vicinity sketch map with contact information' },
  { key: 'entranceTestResult', label: 'DLSU-D entrance test result' },
  // Uploaded inside the form sections, not the Documents step.
  { key: 'photo2x2', label: '2x2 photo (taken within the last 3 months)', placement: 'form' },
  {
    key: 'electricityBill',
    label: 'Latest electricity bill',
    placement: 'form',
    requiredWhen: d => d.evaluationSheet?.assets.electricity.has === 'Yes'
  },
  {
    key: 'waterBill',
    label: 'Latest piped water bill',
    placement: 'form',
    requiredWhen: d => d.evaluationSheet?.assets.water.has === 'Yes'
  }
];

const ALUMNI_DOCUMENT_SLOTS: DocumentSlot[] = [
  { key: 'alumniForm', label: 'Accomplished alumni scholarship application form', source: 'form', hint: 'Generated from the Application Form sections of this wizard.' },
  { key: 'psaBirthCertificate', label: 'PSA birth certificate (printed on PSA security paper)' },
  { key: 'parentLetter', label: 'Letter from parents/guardian supporting the need for financial assistance' },
  { key: 'incomeProof', label: "Parents' latest ITR or affidavit of non-filing of ITR", variants: INCOME_PROOF_VARIANTS.slice(0, 2) },
  { key: 'employmentCertificate', label: "Parents' certificate of employment" },
  { key: 'grade12Card', label: 'Photocopy of Grade 12 report card' },
  { key: 'honorsActivities', label: 'Honors/awards/recognition and extracurricular activities in Senior High School', multiple: true, maxFiles: 8, optional: true, hint: 'Upload all that apply. Leave empty if you have none.' },
  { key: 'vicinityMap', label: 'Vicinity sketch of residence' },
  { key: 'entranceTestResult', label: 'DLSU-D entrance test result' },
  { key: 'proofOfRelation', label: 'Proof of relation with the alumnus/alumna', hint: 'e.g. PSA birth certificates showing the relationship.' }
];

// A scholarship as written below: eligibility rules and documents are
// picked from the shared catalog (data/requirementCatalog.ts), and the
// `eligibility` / `requirements` text students read is generated from them
// (deriveScholarship). POLCA and Alumni keep their own upload slots.
type ScholarshipSource = Omit<Scholarship, 'eligibility' | 'requirements'> & { requirements?: string[] };

const BUILT_IN_SCHOLARSHIPS: ScholarshipSource[] = [
  {
    id: 's1',
    name: 'Student Financial Aid Grant (SFAG)',
    eligibilityCriteria: {
      applicantType: 'any'
    },
    gpaRequirement: {
      stage: 'apply',
      minGpa: 2.5,
      noFailingGrade: true,
      continuingOnly: true,
      // Confirmed by the AdSO: grantees keep a 2.50 GPA every semester to renew.
      keepToo: true,
      note: 'Incoming freshmen qualify with a general average of 85% instead.'
    },
    retentionConditions: [
      'Maintain a GPA of at least 2.50 every semester',
      'No failing grades'
    ],
    category: 'Financial',
    // Contact as printed on the AdSO's A.Y. 2026-2027 SFAG guidelines.
    provider: {
      ...SCHOLARSHIP_OFFICE_PROVIDER,
      contact: ['scholarship@dlsud.edu.ph', '(046) 481-1900 local 3126']
    },
    // From the AdSO's A.Y. 2026-2027 SFAG guidelines.
    description: 'The Student Financial Aid Grant (SFAG) scholarship supports College students. While priority courses are listed, applicants from other programs are welcome.\n\nAccepted grantees render duty hours in their assigned office, with their hours based on their scholarship percentage. The percentage approved is based on the criteria set and approved by the University.',
    benefits: [
      'Tuition discount of 100%, 75%, 50%, or 25% for qualified grantees of A.Y. 2026-2027',
      'Tuition excludes miscellaneous, laboratory, and other fees',
      '25% grantees may also hold another internally funded scholarship that provides financial assistance not exceeding ₱10,000'
    ],
    rules: { applicantType: 'any', minGpa: 2.5, noFailingGrade: true, minHsAverage: 85, minUnits: 18, residencySemesters: 1, filipino: true, noBalance: true },
    customEligibility: [
      'Must be a College student',
      'Preferably Catholic, with good moral character, and preferably a graduate of a public school',
      'Priority courses — College of Education: Bachelor of Secondary Education, Bachelor of Special Needs Education, Bachelor of Early Childhood Education; College of Criminal Justice Education: BS in Criminology; College of Business Administration and Accountancy: BSBA Major in Economics; College of Science: BS in Applied Mathematics; College of Engineering, Architecture and Technology: BS in Environmental and Sanitary Engineering (EnSE). Applicants from other programs are welcome.',
    ],
    documentKeys: ['applicationLetter', 'recommendationLetter', 'personalEssay', 'indigency', 'incomeProof', 'utilityBills', 'residencePictures', 'vicinityMap'],
    process: [
      'Step 1: Confirm your slot. The online scholarship application comes after slot confirmation.',
      'Step 2: Accomplish the online scholarship application on the date set by the office, attaching all required documents in JPEG format.',
      'Step 3: Await notification of your application status via the DLSU-D Student Portal, email, or Schoolbook.',
      'No new applicants are accommodated during the second semester. The office reserves the right to reject or decline applications.'
    ],
    deadline: 'Applications open June 16 – July 3, 2026',
    opensOn: '2026-06-16',
    closesOn: '2026-07-03',
    status: 'Open',
    applicationFormType: 'sfag'
  },
  {
    id: 's2',
    name: 'Entrance Scholarship',
    eligibilityCriteria: {
      yearLevels: ['1st Year'], // Grade 7 / Grade 11 don't apply to college portal anyway
      applicantType: 'incoming'
    },
    category: 'Academic',
    provider: SCHOLARSHIP_OFFICE_PROVIDER,
    description: 'Entrance scholarships are awarded to students who ranked first and second in a batch of at least 100 graduates from any DepEd-recognized school. This scholarship offers financial aid to deserving Grade 7, Grade 11, and Freshman students who rank at the top of their graduating batch.',
    benefits: [
      'Rank 1: 100% tuition discount',
      'Rank 2: 50% tuition discount',
      'Tuition discounts exclude miscellaneous, laboratory, and other fees. The entrance scholarship is valid for one (1) semester only.'
    ],
    rules: { applicantType: 'incoming' },
    customEligibility: [
      'Must have ranked first or second in a batch of at least 100 graduates from any DepEd-recognized school'
    ],
    documentKeys: ['rankingCertificate'],
    customDocuments: [
      'Grade 6 / Grade 10 Report Card (for incoming Grade 7 / Grade 11), or Grade 12 Report Card / Form 138 (for incoming Freshman)'
    ],
    process: [
      'Step 1: Check your eligibility — confirm your rank and your batch\'s graduate count.',
      'Step 2: Confirm your slot. The online application comes after slot confirmation.',
      'Step 3: Accomplish the online scholarship form with all required fields and documents before your scheduled enrollment. Submit early to avoid processing delays.',
      'Step 4: Wait for your application status notification via the DLSU-D Student Portal. If approved, the scholarship is applied to your tuition fee upon enrollment. If disapproved, you may still enroll but will not receive the entrance scholarship discount.'
    ],
    deadline: 'Applications open June 1–20, 2026',
    opensOn: '2026-06-01',
    closesOn: '2026-06-20',
    status: 'Open',
    applicationFormType: 'standard'
  },
  {
    id: 's3',
    name: 'POLCA Scholarship (PSEF)',
    office: 'POLCA',
    category: 'Financial',
    provider: {
      name: 'Parents Organization of De La Salle University-Dasmariñas Inc. (POLCA)',
      office: 'POLCA Office',
      address: 'Francisco Barzaga Hall, DLSU-D Campus, Fatima 1, Dasmariñas City, Cavite'
    },
    formId: 'Scholarship Form No. 002 (PSEF Scholarship Application Form)',
    guidelinesNote: 'POLCA Scholarship Guidelines, as approved by the Board of Trustees on July 20, 2024.',
    targetApplicants: 'Incoming freshmen (1st year)',
    description: 'The POLCA Scholarship Educational Fund (PSEF) extends financial assistance to deserving high school graduates who intend to take undergraduate courses at De La Salle University-Dasmariñas.',
    benefits: [
      'Financial assistance for undergraduate studies at DLSU-D, with the amount and coverage determined by the POLCA scholarship committee'
    ],
    eligibilityCriteria: {
      yearLevels: ['1st Year'],
      applicantType: 'incoming',
      minHsGeneralAverage: 85,
      minHsSubjectGrade: 80,
      requiresNoBoardRelation: true
    },
    rules: { applicantType: 'incoming', minHsAverage: 85 },
    customEligibility: [
      'No high school grade in the 70s',
      'Proof of financial need, to be evaluated by the scholarship committee',
      'Must not be related by consanguinity to any current member of the POLCA Board'
    ],
    retentionConditions: [
      'Maintain a GPA of at least 2.50',
      'No failing grades',
      'Enrolled in the maximum number of units required by the curriculum',
      'Good moral standing for the whole scholarship period',
      'No renewals: the scholarship continues until you graduate'
    ],
    gpaRequirement: { stage: 'keep', minGpa: 2.5, noFailingGrade: true },
    // POLCA takes 2 scholars per college and keeps them until they
    // graduate (Oct 2026 — to confirm with POLCA). Mirrors the backend.
    noRenewal: true,
    slotsPerCollege: 2,
    documentSlots: POLCA_DOCUMENT_SLOTS,
    requirements: requirementLabels(POLCA_DOCUMENT_SLOTS),
    process: [
      'Step 1: Confirm you meet the qualifications (HS general average of at least 85 with no grade in the 70s, and no relation to a POLCA board member).',
      'Step 2: Fill out the POLCA Application Form (Form No. 002) and the 7-page evaluation sheet online. Your progress is saved as a draft, so you can finish across sessions.',
      'Step 3: Upload the required documents as JPG files and submit.',
      'Step 4: The POLCA scholarship committee evaluates your application and proof of financial need. Watch the Student Portal for status updates.'
    ],
    deadline: 'Before scheduled enrollment, SY 2026–2027',
    status: 'Open',
    applicationFormType: 'polca'
  },
  {
    id: 's4',
    name: 'DLSU-D Alumni Association Scholarship',
    office: 'ALUMNI',
    category: 'Financial',
    provider: {
      name: 'De La Salle Dasmariñas Alumni Association, Inc.',
      office: 'Alumni Office',
      address: '1F Severino de las Alas Building, DLSU-D, Dasmariñas City, Cavite',
      contact: [
        'Tel. +63 (2) 779.5180 / +63 (46) 481.1900 loc. 3036',
        'Telefax (+6346) 481.1933',
        'alumni@dlsud.edu.ph'
      ]
    },
    targetApplicants: 'Incoming freshmen for SY 2026–2027',
    description: 'The De La Salle Dasmariñas Alumni Association, Inc. Scholarship Program is open to incoming freshmen for SY 2026–2027 who are related to an alumnus or alumna of DLSU-EAC, DLSU-Aguinaldo, or DLSU-Dasmariñas, up to the 2nd degree of consanguinity.',
    benefits: [
      'Financial assistance from the De La Salle Dasmariñas Alumni Association, Inc., with the amount and coverage determined by the Association'
    ],
    eligibilityCriteria: {
      yearLevels: ['1st Year'],
      applicantType: 'incoming',
      alumniRelation: {
        institutions: ALUMNI_INSTITUTIONS,
        relationships: ALUMNI_RELATIONSHIPS
      }
    },
    rules: { applicantType: 'incoming' },
    customEligibility: [
      'Related to an alumnus/alumna of DLSU-EAC, DLSU-Aguinaldo, or DLSU-Dasmariñas, up to the 2nd degree of consanguinity (parent, sibling, grandparent, or grandchild)',
      'Only 2 scholars at a time for the whole campus; a slot opens when a current scholar graduates'
    ],
    retentionConditions: ['No renewals: the scholarship continues until you graduate'],
    // 2 scholars campus-wide, kept until they graduate; no renewals
    // (Oct 2026). Mirrors the backend.
    noRenewal: true,
    totalSlots: 2,
    documentSlots: ALUMNI_DOCUMENT_SLOTS,
    requirements: requirementLabels(ALUMNI_DOCUMENT_SLOTS),
    submissionNote: 'Submit complete requirements to the Alumni Office.',
    process: [
      'Step 1: Confirm your relation to a DLSU-EAC, DLSU-Aguinaldo, or DLSU-Dasmariñas alumnus/alumna (up to the 2nd degree of consanguinity).',
      'Step 2: Fill out the alumni scholarship application form online and upload the required documents as JPG files.',
      'Step 3: Submit the complete requirements to the Alumni Office, 1F Severino de las Alas Building.',
      'Step 4: Wait for your application status notification via the Student Portal.'
    ],
    deadline: 'Before scheduled enrollment, SY 2026–2027',
    status: 'Open',
    applicationFormType: 'alumni'
  },
  {
    id: 's5',
    handledBy: 'Admissions and Scholarship Office (AdSO)',
    name: 'Academic Scholarship',
    category: 'Academic',
    provider: SCHOLARSHIP_OFFICE_PROVIDER,
    applicationMode: 'info',
    availNote: 'Awarded automatically by academic ranking each semester. There is no application — qualified students are identified from their grades.',
    targetApplicants: 'Upperclassmen',
    description: 'The Academic Scholarship recognizes upperclassmen whose GPA ranks in the top 30% of their college. Discounts are allocated by rank, both overall and per college.',
    benefits: [
      'Top 5 overall: 100% tuition discount',
      'Per college — Top 1: 75% tuition discount',
      'Per college — Top 2–3: 50% tuition discount',
      'Per college — Top 4–5: 25% tuition discount',
      'Per college — Top 6: 10% tuition discount',
      'Tuition discounts exclude miscellaneous, laboratory, and other fees, and apply for one semester.'
    ],
    eligibilityCriteria: { applicantType: 'continuing' },
    gpaRequirement: {
      stage: 'apply',
      minGrade: 3.25,
      continuingOnly: true,
      note: 'Awarded to the top 30% of upperclassmen by GPA, so meeting the grade floor alone doesn’t guarantee it.'
    },
    rules: { applicantType: 'continuing', minUnits: 18, residencySemesters: 1 },
    customEligibility: [
      'GPA within the top 30% for the semester, computed to four decimal places from Registrar records',
      'No grade lower than 3.25 in any subject'
    ],
    process: [
      'Step 1: Keep your grades up — rankings are computed from your GPA at the end of each semester.',
      'Step 2: Qualified students are identified and notified by the AdSO. No application is needed.'
    ],
    deadline: 'Contact the AdSO for the current schedule',
    status: 'Open'
  },
  {
    id: 's6',
    name: 'Enhanced Brother President Scholarship Program (EBPSP)',
    category: 'Others',
    provider: SCHOLARSHIP_OFFICE_PROVIDER,
    targetApplicants: 'Legal dependents of DLSU-D and DLSMHSI employees',
    description: 'The Enhanced Brother President Scholarship Program grants tuition discounts to the legal dependents (children) of De La Salle University-Dasmariñas (DLSU-D) and De La Salle Medical and Health Sciences Institute (DLSMHSI) employees, up to four children per employee.',
    benefits: [
      '1st availment: 100% tuition discount',
      '2nd availment: 75% tuition discount',
      '3rd availment: 50% tuition discount',
      '4th availment: 25% tuition discount',
      'Includes waivers for some miscellaneous fees (e.g. medical, dental, and air-conditioning fees)'
    ],
    eligibilityCriteria: { applicantType: 'any' },
    rules: { applicantType: 'any' },
    customEligibility: [
      'Must be a legal dependent (child) of a DLSU-D or DLSMHSI employee, up to four children per employee',
      'Must maintain satisfactory academic progress'
    ],
    retentionConditions: [
      'Satisfactory academic progress every semester',
      'The privilege is non-transferable and cannot be deferred'
    ],
    // Confirmed with the AdSO (Oct 2026); the official page doesn't list
    // the documents.
    documentKeys: ['reportCard'],
    customDocuments: [
      'Certificate of employment of the parent/guardian from DLSU-D or DLSMHSI',
      'PSA birth certificate showing your relationship to the employee'
    ],
    process: [
      'Step 1: Confirm that your parent/guardian is a DLSU-D or DLSMHSI employee.',
      'Step 2: Fill out the online application and upload the required documents as JPG files.',
      'Step 3: Wait for your application status notification via the Student Portal. If approved, the discount is applied upon enrollment.'
    ],
    deadline: 'Before scheduled enrollment',
    status: 'Open',
    applicationFormType: 'standard'
  },
  {
    id: 's7',
    name: 'Athletic Scholarship',
    category: 'Athletic',
    office: 'SDO',
    provider: officeProvider('Sports Development Office (SDO)'),
    targetApplicants: 'Recruited varsity players',
    description: 'The Athletic Scholarship is for recruited varsity players. It recognizes students committed to their sport while keeping a strong academic record, in basketball, volleyball, athletics (track and field), badminton, table tennis, swimming, and chess.',
    benefits: [
      'Tuition fee discount (by percentage)',
      'Full matriculation fee discount',
      'Free food and accommodation for recruited athletes'
    ],
    // No application and no renewals: the coaches pick players from the
    // tryouts and the SDO adds them (Nov 2026).
    applicationMode: 'info',
    directAward: true,
    noRenewal: true,
    handledBy: 'Sports Development Office (SDO)',
    availNote: 'There’s no application. Players are picked from the varsity tryouts: the coach evaluates and recommends you (or endorses you, if you’re already on the team), the SDO Director approves, and the SDO adds you as a scholar in AniSkolar.',
    eligibilityCriteria: { applicantType: 'any' },
    rules: { applicantType: 'any' },
    customEligibility: [
      'Incoming varsity players evaluated and recommended by the coach, or current varsity members with at least satisfactory performance in the coach\'s evaluation',
      'Approved by the Sports Development Office (SDO) Director'
    ],
    scheduleLabel: 'Varsity tryouts',
    schedule: 'To be announced. Tryout dates are posted in Announcements.',
    // One of the two, by player (data/officeForms.ts asks which).
    customDocuments: [
      'Coach\'s evaluation and recommendation (incoming players)',
      'Coach\'s evaluation and endorsement (current varsity members)'
    ],
    process: [
      'Step 1: Try out for a varsity team. Tryout dates are posted in Announcements.',
      'Step 2: The coach evaluates you and recommends you (incoming players) or endorses you (current members).',
      'Step 3: The SDO Director approves, and the SDO adds you as a scholar. You’ll see it under My Scholarship.'
    ],
    deadline: 'Picked from the varsity tryouts',
    status: 'Open',
    applicationFormType: 'standard'
  },
  {
    id: 's8',
    name: 'Vicissitude Scholarship Program',
    category: 'Leadership',
    office: 'VICISSITUDE',
    provider: officeProvider('Vicissitude'),
    targetApplicants: 'Vicissitude Editorial Board and Staff',
    description: 'The Vicissitude Scholarship Program supports the students who produce the university yearbook: members of the Vicissitude Editorial Board (EB) and Editorial Staff (ES). Discounts cover tuition only and depend on available funds.',
    benefits: [
      'Editorial Board, rating 4.75–5.00: 100% tuition discount',
      'Editorial Board, rating 4.50–4.74: 75% tuition discount',
      'Editorial Board, rating 4.25–4.49: 50% tuition discount',
      'Editorial Board, rating 4.24 and below: 25% tuition discount (EB members are guaranteed at least 25%)',
      'Editorial Staff: one 25% scholarship reserved for each department',
      'Free skills training (writing, editing, photography, graphics, layout), a free pictorial, and for graduating members a free graduation picture and yearbook copy'
    ],
    eligibilityCriteria: { applicantType: 'any' },
    rules: { applicantType: 'any', minGpa: 1.5, noFailingGrade: true },
    customEligibility: [
      'Must be a member of the Vicissitude Editorial Board or Editorial Staff',
      'No major violations under the Student Handbook (2023-2027)'
    ],
    customDocuments: [
      'Performance evaluation (60% from the Vicissitude Coordinator and the Graphics Design and Layout Artist, 40% from the Editorial Board)',
      'Record of completed duty hours (200 for Editorial Board members, 125 for Editorial Staff members)'
    ],
    process: [
      'Step 1: Join the Vicissitude Editorial Board or Staff and complete your duty hours (200 for the Editorial Board, 125 for the Editorial Staff).',
      'Step 2: Apply here with your performance evaluation and duty hours record.',
      'Step 3: Vicissitude rates your performance and sets your discount.'
    ],
    deadline: 'Set by Vicissitude',
    status: 'Closed',
    applicationFormType: 'standard'
  },
  {
    id: 's10',
    name: '267th NROTC Scholarship',
    category: 'Leadership',
    office: 'ROTC',
    provider: officeProvider('ROTC Office (267th NROTCU)'),
    targetApplicants: 'Officers of the 267th NROTC unit',
    description: 'The 267th NROTC Scholarship gives financial assistance to officers of the university\'s Naval Reserve Officers Training Corps unit (NROTCU), under Student Handbook section 17.1.4, which allows tuition discounts of up to 100% for ROTC officers. Failing to meet the guidelines forfeits the benefits.',
    benefits: [
      'Corps Commander: ₱30,000',
      'Vice Corps Commander: ₱20,000',
      '2nd and 3rd Class officers: ₱10,000',
      '4th Class officers: ₱5,000',
      'Amounts are subject to the availability of the ROTC fund.'
    ],
    eligibilityCriteria: { applicantType: 'continuing' },
    gpaRequirement: {
      stage: 'apply',
      minGpa: 2.0,
      noFailingGrade: true,
      continuingOnly: true,
      audience: 'NROTC officers',
      note: 'Also requires an earned rank, active duty and a recommendation.'
    },
    rules: { applicantType: 'continuing', minGpa: 2, noFailingGrade: true },
    customEligibility: [
      'Officer of the 267th NROTCU holding an entitled rank',
      'The GPA may be a general grade average of 2.0 or its equivalent; no failing grade in academic or non-academic subjects for the semester',
      'Good moral character',
      'Actively performs assigned duties, including 20 duty hours a week in the 267th NROTCU',
      'Recommended by the Commandant and/or the ROTC Coordinator'
    ],
    customDocuments: [
      'Recommendation from the Commandant and/or the ROTC Coordinator'
    ],
    process: [
      'Step 1: Earn your rank and stay on active duty in the 267th NROTCU (20 duty hours a week).',
      'Step 2: Apply here with the recommendation of the Commandant and/or the ROTC Coordinator.',
      'Step 3: The ROTC Office reviews and approves it.'
    ],
    deadline: 'Set by the ROTC Office',
    status: 'Closed',
    applicationFormType: 'standard'
  },
  {
    // Offered by the University Student Government, separate from the
    // AdSO's SFAG. From the USG's call and FAQs for the 2nd semester of
    // AY 2025–2026.
    id: 's11',
    name: 'USG Student Financial Aid Grant',
    category: 'Financial',
    office: 'USG',
    provider: officeProvider('University Student Government (USG)'),
    targetApplicants: 'DLSU-D students with at least one semester of residency (first-year students can apply for the 2nd semester)',
    description: 'The University Student Government\'s Student Financial Aid Grant is offered each semester, separate from the SFAG of the Admissions and Scholarship Office. Each scholar gets ₱15,000, credited directly to their student account. For the 2nd semester of AY 2025–2026 (applications April 6–13, 2026), 35 students were chosen as grantees.',
    benefits: [
      '₱15,000 per scholar, credited directly to your student account',
      'No duty hours to render',
      '35 grantees in the latest call (2nd semester, AY 2025–2026)'
    ],
    eligibilityCriteria: { applicantType: 'continuing' },
    rules: { applicantType: 'continuing', minGpa: 2, noFailingGrade: true },
    customEligibility: [
      'Bona fide DLSU-D student with at least one semester of residency (first-year students can apply for the 2nd semester)',
      'The GPA and no-failing-grades rules apply to the previous semester',
      'No other existing internal scholarship grant from DLSU-D or its benefactors in the same semester. A partial (percentage) internal scholarship still counts; one that was valid only for the previous semester doesn\'t',
      'Not found guilty of any major offense'
    ],
    customDocuments: [
      'Application letter addressed to the University Student Government (template from the USG)',
      'Financial Aid Grant Application Form (template from the USG)',
      'Certificate of Registration (COR) for the current semester',
      'Copy of grades from the previous semester',
      'Parents\' Income Tax Return (ITR) or Certificate of Non-Filing of ITR, and/or Certificate of Indigency',
      'Photograph of the applicant\'s house with the applicant and parent/guardian',
      'One copy each of the monthly electricity and water bills for the three months before the application period',
      'Clear copy of your DLSU-D ID or, if not yet issued, a valid government-issued photo ID',
      'Clear copy of the parent/guardian\'s valid government-issued ID',
      'SWAFO clearance certifying no major offense (may follow if the request for clearance is attached and dated within the application period)'
    ],
    process: [
      'Step 1: Apply here during the USG\'s application period, with all the documents. Applications must start online: on-site submission comes only after verification.',
      'Step 2: The USG verifies your documents within 72 hours. If one is inaccurate, you have two days from notification to resubmit.',
      'Step 3: Verified applicants get an application number and their on-site submission schedule; the slot is confirmed on-site.',
      'Step 4: Wait for the final list of shortlisted applicants. Grants aren\'t first-come, first-served: every applicant is screened against the criteria.'
    ],
    deadline: 'Each semester (latest: April 6–13, 2026)',
    status: 'Closed',
    applicationFormType: 'standard'
  },
  {
    id: 's12',
    name: 'Heraldo Filipino Scholarship',
    category: 'Leadership',
    office: 'HERALDO',
    provider: officeProvider('Heraldo Filipino'),
    targetApplicants: 'Heraldo Filipino Editorial Staff, from Junior Staff to Editor in Chief',
    // From the Heraldo Filipino's scholarship guidelines (Nov 2026).
    description: 'Service scholarships in the form of tuition discounts for the Editorial Staff of the Heraldo Filipino, the official student publication, from Junior Staff to Editor in Chief. There is no fixed discount: the amount is computed from scholarship points earned on four criteria.',
    benefits: [
      'Tuition discount of varying amount, based on your scholarship points',
      'Evaluation score: 98–100 = 5 pts, 95–97 = 4, 90–94 = 3, 84–89 = 2, 75–83 = 1, 60–74 = 0',
      'Published works: 6 or more = 5 pts, 5 = 4, 4 = 3, 3 = 2, 2 = 1, 0–1 = 0',
      'Office hours rendered: 96–100% = 5 pts, 91–95% = 4, 86–90% = 3, 80–85% = 2, 60–79% = 1, below 60% = 0',
      'Merit points: 3 = 5 pts, 2 = 4, 1 = 3, 0 = 2; under demerit = 0'
    ],
    eligibilityCriteria: { applicantType: 'any' },
    rules: { applicantType: 'any' },
    customEligibility: [
      'Member of the Heraldo Filipino Editorial Staff (Junior Staff to Editor in Chief)',
      'An evaluation score below 60 disqualifies you from the scholarship'
    ],
    customDocuments: [],
    process: [
      'Step 1: Complete all your requirements as a member of the Editorial Staff.',
      'Step 2: The Managing Director computes your scholarship points from the table of qualifications.',
      'Step 3: The Editor in Chief and the Publication Adviser validate the computation.',
      'Step 4: The Managing Director releases the list of qualified scholars and each one\'s discount.'
    ],
    deadline: 'To be announced by the Heraldo Filipino',
    status: 'Closed',
    applicationFormType: 'standard'
  },
  // From CBAASG Ordinance No. 01, s. 2021–2022, funded each semester by
  // the CBAASC Trust Fund. Both are for CBAA students only.
  {
    id: 's13',
    name: 'CBAASG Achie Scholarship',
    category: 'Financial',
    office: 'CBAASG',
    provider: officeProvider('CBAA Student Government (CBAASG)'),
    targetApplicants: 'Continuing CBAA students in need of financial assistance',
    description: 'A full scholarship from the CBAA Student Government for deserving CBAA students who need financial assistance. One student from each CBAA department (ABD, ACD, BMD and MKD) is chosen, and the scholarship continues every semester for as long as the scholar keeps the qualifications.',
    benefits: [
      'Full scholarship: tuition, miscellaneous and other fees, every semester',
      'One scholar from each CBAA department: ABD, ACD, BMD and MKD',
      'Continues for as long as you keep the qualifications',
      'Funded each semester by the CBAASC Trust Fund'
    ],
    eligibilityCriteria: { applicantType: 'continuing' },
    gpaRequirement: { stage: 'apply', minGpa: 3.25, minGrade: 2.75, continuingOnly: true, keepToo: true },
    rules: { applicantType: 'continuing', minGpa: 3.25, programs: CBAA_PROGRAMS },
    customEligibility: [
      'No grade lower than 2.75 (83%–85%)',
      'At least one year of residency in any CBAA program',
      'No existing scholarship in the university',
      'No major offense',
      'The scholarship is forfeited for a grade below the requirement, a failing grade, any offense in the Student Handbook, parents’ or guardian’s gross income above ₱300,000 a year, or shifting to another college'
    ],
    customDocuments: [],
    process: [
      'Step 1: Apply here with the documents, including a recommendation letter from your Department Chair.',
      'Step 2: The CBAASG screens the applications against its criteria and sends your interview schedule to your DLSU-D email.',
      'Step 3: Initial interview with the CBAASG Executive Board (academic credentials, affiliations, interests and leadership).',
      'Step 4: Final interview with the Dean and Associate Dean of the CBAA.',
      'Step 5: Passers are notified by DLSU-D email and must acknowledge and sign the scholarship contract within 7 days.'
    ],
    deadline: 'To be announced by the CBAASG',
    status: 'Closed',
    applicationFormType: 'standard'
  },
  {
    id: 's14',
    name: 'CBAASG Officers’ Partial Scholarship',
    category: 'Leadership',
    office: 'CBAASG',
    provider: officeProvider('CBAA Student Government (CBAASG)'),
    targetApplicants: 'Members of the CBAASG Executive Board and Legislative Council',
    description: 'A partial scholarship from the CBAA Student Government for its officers: members of the Executive Board and the Legislative Council who are actively involved in the CBAASG. It continues every semester for as long as the officer keeps the qualifications.',
    benefits: [
      '25% of tuition, miscellaneous and other fees, every semester',
      'Continues for as long as you keep the qualifications',
      'Funded each semester by the CBAASC Trust Fund'
    ],
    eligibilityCriteria: { applicantType: 'continuing' },
    gpaRequirement: { stage: 'apply', minGpa: 3.0, minGrade: 2.5, continuingOnly: true, keepToo: true, audience: 'CBAASG officers' },
    rules: { applicantType: 'continuing', minGpa: 3.0, programs: CBAA_PROGRAMS },
    customEligibility: [
      'No grade lower than 2.50',
      'Holds an Executive or Legislative position and is actively involved in the CBAASG',
      'No major offense',
      'The scholarship is forfeited for a grade below the requirement, a failing grade, any offense, or resigning as a CBAASG officer'
    ],
    customDocuments: [],
    process: [
      'Step 1: Apply here with the documents, including a recommendation letter from your Department Chair.',
      'Step 2: The CBAASG screens the applications against its criteria and sends your interview schedule to your DLSU-D email.',
      'Step 3: Initial interview with the CBAASG Executive Board.',
      'Step 4: Final interview with the Dean and Associate Dean of the CBAA.',
      'Step 5: Passers are notified by DLSU-D email and must acknowledge and sign the scholarship contract within 7 days.'
    ],
    deadline: 'To be announced by the CBAASG',
    status: 'Closed',
    applicationFormType: 'standard'
  },
  {
    // From the CICS Student Government's call for applications (last call
    // ran until December 31, 2024).
    id: 's15',
    name: 'Padayon Pioneers: CICS Student Financial Aid Grant',
    category: 'Financial',
    office: 'CICSSG',
    provider: officeProvider('CICS Student Government (CICSSG)'),
    targetApplicants: 'Continuing CICS students with financial constraints',
    description: 'The CICS Student Government’s financial aid grant for students of the College of Information and Computer Studies. Two grantees receive 50% of their overall tuition and other fees, up to ₱50,000.',
    benefits: [
      '50% of overall tuition and other fees, up to ₱50,000',
      'Two grantees'
    ],
    totalSlots: 2,
    eligibilityCriteria: { applicantType: 'continuing' },
    rules: { applicantType: 'continuing', minGpa: 3.0, noFailingGrade: true, programs: CICS_PROGRAMS },
    customEligibility: [
      'Bona fide CICS student enrolled in the current academic year, with at least one semester completed in college',
      'Academic load of at least 75% of the units prescribed in the curriculum for the semester',
      'The GPA (3.00, 86%) and no-failing-grades rules apply to the previous semester. Applicants with in-progress grades may be considered with a recommendation letter from their adviser or professor',
      'Not found guilty of any major offense in the DLSU-D Student Handbook, and never sanctioned with suspension',
      'Not a recipient of a scholarship with allowances from any DLSU-D sector in the same academic year',
      'Proof of financial incapacity or constraints (ITR, proof of billing)'
    ],
    customDocuments: [
      'Completed application form provided by the CICS Student Government',
      'Letter of intent signed by you and your parent or guardian, addressed to the CICS Dean through the CICS Associate Dean',
      'Certificate of Registration (COR) for the current semester and academic year',
      'Copy of grades from the previous semester',
      'Letter of recommendation signed by the guidance counselor, your class adviser, or a professor of your choice',
      'Income Tax Return (ITR), Certificate of Employment, Affidavit of Non-Filing of ITR, or Employment Contract (for children of OFWs)',
      'Proof of billing: water and electricity bills for the last two months',
      'One inside and one outside photo of your house'
    ],
    process: [
      'Step 1: Apply here with all the documents (or submit them on-site at PCH102, Monday to Friday, 8:00 AM–5:00 PM, in a long brown envelope).',
      'Step 2: Wait for the CICSSG’s confirmation email and interview booking.',
      'Step 3: Attend your interview. To reschedule, tell the CICSSG at least one day before.',
      'Step 4: Wait for the result of your application.'
    ],
    deadline: 'To be announced by the CICSSG (last call: until December 31, 2024)',
    status: 'Closed',
    applicationFormType: 'standard'
  },
  {
    // CEATSG Ordinance No. 02, s. 2025–2026 (the CEAT Scholarship
    // Continuation Amendment Ordinance). The numbers (minimum GPA, maximum
    // failing units, minimum load, residency) are set each semester by a
    // Scholarship Criteria Resolution: the office sets them here when it
    // opens the scholarship.
    id: 's16',
    name: 'CEAT Financial Aid Scholarship',
    category: 'Financial',
    office: 'CEATSG',
    provider: officeProvider('CEAT Student Government (CEATSG)'),
    targetApplicants: 'Bona fide CEAT students',
    description: 'The CEAT Student Government’s financial aid scholarship for bona fide students of the College of Engineering, Architecture, and Technology, offered each semester. Up to ₱200,000 is set aside each semester for the grants of the qualified and selected students.',
    benefits: [
      'Financial aid from the CEATSG scholarship fund, offered every semester',
      'Up to ₱200,000 in grants each semester, shared among the selected scholars'
    ],
    eligibilityCriteria: { applicantType: 'continuing' },
    rules: { applicantType: 'continuing', programs: CEAT_PROGRAMS },
    customEligibility: [
      'Bona fide CEAT student',
      'Meets the minimum residency, minimum GPA, maximum failing units and minimum unit load for the semester, as set by the CEATSG’s Scholarship Criteria Resolution (published with each call for applications)',
      'Not a recipient of any concurrent internally funded scholarship',
      'Not meeting the required GPA or the maximum failing units sends your application to reconsideration'
    ],
    customDocuments: [
      'Certificate of Registration (COR) or any proof of registration for the current semester',
      'Soft copy of your grades from the previous semester',
      'Parents’ latest Income Tax Return (ITR) or affidavit of non-filing of ITR',
      'Written application from you and your parent or guardian, addressed to the Governor of the CEATSG',
      'Latest electricity and water billing statements',
      'Sketch or Google Map of your residence (vicinity map)',
      'Photos of your household (interior and exterior)'
    ],
    process: [
      'Step 1: Apply here with all the documents, including your written application to the Governor of the CEATSG.',
      'Step 2: The CEATSG’s Director of Academics reviews the applications against the semester’s criteria.',
      'Step 3: Qualified applicants get a confirmation email and an invitation to the interview.',
      'Step 4: The final list of scholarship grantees is emailed to all applicants.'
    ],
    deadline: 'Each semester, announced by the CEATSG',
    status: 'Closed',
    applicationFormType: 'standard'
  },
  {
    // CCJESG Ordinance No. 251125: a performance-based grant for its
    // officers, from the CCJESG Trust Fund, each semester.
    id: 's17',
    name: 'CCJESG Officers’ Financial Grant',
    category: 'Leadership',
    office: 'CCJESG',
    provider: officeProvider('CCJE Student Government (CCJESG)'),
    targetApplicants: 'Officers of the CCJE Student Government',
    description: 'A performance-based financial grant for the officers of the College of Criminal Justice Education Student Government, from the CCJESG Trust Fund. It is credited to your tuition account at the end of each semester, after you complete your service and pass the evaluation. Up to 11 officers are chosen each semester.',
    benefits: [
      'Governor and Vice Governor: up to ₱10,000 each per semester',
      'Chief of Staff (including deputy) and Executive members (including deputies): up to ₱7,000 per semester',
      'Legislative Council members: up to ₱6,000 per semester',
      'Credited to your tuition account at the end of the semester, never in cash',
      'The actual amount depends on your performance evaluation and the available funds; it may be reduced proportionally if the Trust Fund is short'
    ],
    totalSlots: 11,
    eligibilityCriteria: { applicantType: 'continuing' },
    gpaRequirement: { stage: 'apply', minGpa: 3.0, noFailingGrade: true, continuingOnly: true, audience: 'CCJESG officers' },
    rules: { applicantType: 'continuing', minGpa: 3.0, noFailingGrade: true, programs: CCJE_PROGRAMS },
    customEligibility: [
      'Officer of the CCJESG and a bona fide student enrolled in a CCJE program',
      'No failing grade in any subject during the previous academic year',
      'At least the minimum units required for your year level',
      'Not found guilty of any major offense against the faculty, professors or the college student government, and no pending or confirmed violation at the college or university level',
      'Meets the qualifications for your position and the CCJESG ordinances and executive orders',
      'Present at CCJESG events, complying with the CCJESG Office Logbook (Ordinance No. 240007), and attending meetings called by the Governor, Vice Governor or Adviser',
      'Passes the interview and evaluation by the Implementing Officers (recorded for transparency) and the CCJE community’s organizational performance evaluation',
      'May be received with other scholarships, subject to the university’s policy on scholarship stacking and financial aid limits',
      'The grant is revoked (and, if already credited, may have to be refunded) for false information, failing your duties or the qualifications, resigning or not completing your term without valid reason, or misconduct. If you resign mid-semester, the grant is prorated or revoked'
    ],
    customDocuments: [
      'Recommendation letter from your Department Chair, or an application letter addressed to the Dean and routed through the CCJESG Governor',
      'Copy of your grades',
      'Certificate of Registration (COR)',
      'Certificate of Indigency'
    ],
    process: [
      'Step 1: Apply here with the documents.',
      'Step 2: Approved applicants are notified by Outlook email of an interview with the CCJESG Adviser and the Implementing Officers (the Governor and Vice Governor, with the Chief of Staff).',
      'Step 3: The oversight committee (the CCJESG Adviser and the Dean) reviews the applications within 5 to 7 operating days.',
      'Step 4: Results are sent to your student Outlook email. The grant is credited at the end of the semester, after your service and evaluation.'
    ],
    deadline: 'Each semester, announced by the CCJESG',
    status: 'Closed',
    applicationFormType: 'standard'
  }
];

// The GPA rule the calculator, Explore and the dashboard check, with the
// ticked "Minimum GPA" / "No failing grades" rules in place of the code
// defaults. Other parts (stage, notes, minimum grade) stay as written.
function deriveGpaRequirement(base: GpaRequirement | undefined, rules: EligibilityRules): GpaRequirement | undefined {
  const minGpa = rules.minGpa;
  const noFailingGrade = rules.noFailingGrade || undefined;
  if (minGpa === undefined) {
    // Unticked: an apply-time GPA floor goes; retention ('keep') rules stay.
    if (!base) return undefined;
    if (base.stage === 'keep') return base;
    const rest: GpaRequirement = { ...base, minGpa: undefined, noFailingGrade };
    return rest.minGrade !== undefined || rest.noFailingGrade || rest.note ? rest : undefined;
  }
  if (!base) return { stage: 'apply', minGpa, noFailingGrade, continuingOnly: rules.applicantType !== 'incoming' };
  return { ...base, stage: 'apply', minGpa, noFailingGrade, keepToo: base.keepToo || base.stage === 'keep' || undefined };
}

// Dates are picked (YYYY-MM-DD, Manila time), never typed.
const DAY = 86_400_000;
const todayInManila = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
const utcDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts }).format(utcDate(iso));
export const formatDate = (iso: string) => fmt(iso, { month: 'long', day: 'numeric', year: 'numeric' });

// "June 16 – July 3, 2026", "June 1–20, 2026", "Until July 3, 2026".
export function formatPeriod(opensOn?: string, closesOn?: string): string {
  if (opensOn && closesOn) {
    const [a, b] = [utcDate(opensOn), utcDate(closesOn)];
    if (a.getUTCFullYear() !== b.getUTCFullYear()) return `${formatDate(opensOn)} – ${formatDate(closesOn)}`;
    if (a.getUTCMonth() === b.getUTCMonth()) return `${fmt(opensOn, { month: 'long', day: 'numeric' })}–${fmt(closesOn, { day: 'numeric' })}, ${b.getUTCFullYear()}`;
    return `${fmt(opensOn, { month: 'long', day: 'numeric' })} – ${formatDate(closesOn)}`;
  }
  if (closesOn) return `Until ${formatDate(closesOn)}`;
  if (opensOn) return `Opens ${formatDate(opensOn)}`;
  return '';
}

// "Friday, November 7, 2026, 4:00 PM, at the University Gym".
export function formatSchedule(on?: string, time?: string, venue?: string): string {
  if (!on) return '';
  const parts = [fmt(on, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })];
  if (time) {
    const [h, m] = time.split(':').map(Number);
    parts.push(`${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`);
  }
  return parts.join(', ') + (venue?.trim() ? `, at ${venue.trim()}` : '');
}

// null while applications are accepted by date; otherwise why not.
// Mirrors windowError() in the backend's utils/scholarshipDates.js.
// Why each scholarship can't be applied for right now, as the backend
// enforces it (GET /api/scholarships → applyBlocks), with the dates it
// worked from. Used while a scholarship's dates match those (an admin who
// just changed them sees the local answer until the list reloads).
export interface ServerApplyBlock { message: string | null; opensOn: string | null; closesOn: string | null }
let serverApplyBlocks: Record<string, ServerApplyBlock> = {};
export function setServerApplyBlocks(blocks: unknown): void {
  serverApplyBlocks = blocks && typeof blocks === 'object' ? blocks as Record<string, ServerApplyBlock> : {};
}

export function applicationWindow(s: { id: string; opensOn?: string; closesOn?: string }): string | null {
  const server = serverApplyBlocks[s.id];
  if (server && (server.opensOn ?? null) === (s.opensOn ?? null) && (server.closesOn ?? null) === (s.closesOn ?? null)) return server.message;
  if (s.id === 's1' && isSfagOpenAllYear()) return null;
  const today = todayInManila();
  if (s.opensOn && today < s.opensOn) return `Applications open on ${formatDate(s.opensOn)}.`;
  if (s.closesOn && today > s.closesOn) return `Applications closed on ${formatDate(s.closesOn)}.`;
  return null;
}

// The status students see: closed outside the picked dates, "Closing Soon"
// in the last 7 days.
function effectiveStatus(source: ScholarshipSource): Scholarship['status'] {
  if (source.status === 'Closed' || applicationWindow(source)) return 'Closed';
  const daysLeft = source.closesOn ? (utcDate(source.closesOn).getTime() - utcDate(todayInManila()).getTime()) / DAY : null;
  if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 7) return 'Closing Soon';
  return source.status;
}

// Fills in what's generated from the rules and documents: the text
// students read, the applicant-type filter and the GPA rule.
export function deriveScholarship(source: ScholarshipSource): Scholarship {
  const rules = source.rules ?? {};
  const slotBased = !!source.documentSlots?.length;
  const applicantType = rules.applicantType ?? 'any';
  return {
    ...source,
    deadline: formatPeriod(source.opensOn, source.closesOn) || source.deadline || 'To be announced',
    schedule: formatSchedule(source.scheduleOn, source.scheduleTime, source.scheduleVenue) || source.schedule,
    status: effectiveStatus(source),
    setStatus: source.setStatus ?? source.status,
    rules,
    customEligibility: source.customEligibility ?? [],
    // Slot-based forms: their slots are the documents (for the matrix).
    documentKeys: slotBased ? source.documentSlots!.map(slot => slot.key) : source.documentKeys ?? [],
    customDocuments: slotBased ? [] : source.customDocuments ?? [],
    eligibility: [...ruleLines(rules), ...(source.customEligibility ?? [])],
    requirements: slotBased ? source.requirements ?? requirementLabels(source.documentSlots!) : documentTexts(source.documentKeys, source.customDocuments),
    eligibilityCriteria: {
      ...source.eligibilityCriteria,
      applicantType,
      yearLevels: applicantType === 'incoming' ? ['1st Year'] : undefined,
    },
    gpaRequirement: deriveGpaRequirement(source.gpaRequirement, rules),
  };
}

// The built-in scholarships (their special forms are in code), followed by
// any the AdSO created (registerCustomScholarships). Mutated in place so
// every screen that looks a scholarship up by id finds the new ones.
export const mockScholarships: Scholarship[] = BUILT_IN_SCHOLARSHIPS.map(deriveScholarship);

// Fields the AdSO can change from the admin Scholarships page. Name,
// office and application form are fixed for the built-in scholarships.
export const EDITABLE_SCHOLARSHIP_FIELDS = [
  'status', 'deadline', 'opensOn', 'closesOn', 'description', 'benefits', 'process', 'submissionNote',
  'schedule', 'scheduleOn', 'scheduleTime', 'scheduleVenue',
  'rules', 'customEligibility', 'documentKeys', 'customDocuments'
] as const;

// Scholarships created by the AdSO: the standard application form (or
// info only), with everything else from the override.
function customSource(o: ScholarshipOverride): ScholarshipSource {
  return {
    id: o.id,
    custom: true,
    name: o.name || 'Untitled scholarship',
    office: o.office ?? 'LSO',
    category: o.category ?? 'Others',
    applicationMode: o.applicationMode ?? 'online',
    availNote: o.availNote,
    handledBy: o.handledBy,
    referenceCode: o.referenceCode,
    provider: SCHOLARSHIP_OFFICE_PROVIDER,
    description: '',
    benefits: [],
    process: [],
    deadline: '',
    status: 'Closed',
    applicationFormType: 'standard',
  };
}

function mergeOverride(source: ScholarshipSource, o: ScholarshipOverride | undefined): ScholarshipSource {
  if (!o) return source;
  const merged: ScholarshipSource = { ...source };
  if (o.status) merged.status = o.status;
  if (o.deadline) merged.deadline = o.deadline;
  // Picked dates replace the code's (and any typed deadline).
  if (o.opensOn || o.closesOn) { merged.opensOn = o.opensOn; merged.closesOn = o.closesOn; }
  if (o.description) merged.description = o.description;
  if (o.benefits?.length) merged.benefits = o.benefits;
  if (o.process?.length) merged.process = o.process;
  if (o.submissionNote) merged.submissionNote = o.submissionNote;
  if (o.schedule && source.scheduleLabel) merged.schedule = o.schedule;
  if (o.scheduleOn && source.scheduleLabel) Object.assign(merged, { scheduleOn: o.scheduleOn, scheduleTime: o.scheduleTime, scheduleVenue: o.scheduleVenue });
  if (o.rules) merged.rules = o.rules;
  if (o.customEligibility) merged.customEligibility = o.customEligibility;
  if (!source.documentSlots?.length) {
    if (o.documentKeys) merged.documentKeys = o.documentKeys;
    if (o.customDocuments) merged.customDocuments = o.customDocuments;
  }
  return merged;
}

// The code version of a built-in scholarship, before any AdSO edits (what
// "reset to default" goes back to).
export function builtInSource(id: string): Scholarship | undefined {
  const source = BUILT_IN_SCHOLARSHIPS.find(s => s.id === id);
  return source ? deriveScholarship(source) : undefined;
}

// Defaults for a scholarship: the code version for built-ins, a blank
// standard-form scholarship for ones the AdSO created.
export function scholarshipDefaults(o: ScholarshipOverride): Scholarship {
  return builtInSource(o.id) ?? deriveScholarship(customSource(o));
}

// Merges AdSO overrides over the defaults, and adds the scholarships the
// AdSO created. Overrides for unknown built-in ids are ignored.
export function applyScholarshipOverrides(base: Scholarship[], overrides: ScholarshipOverride[]): Scholarship[] {
  const byId = new Map(overrides.map(o => [o.id, o]));
  const builtIn = base
    .filter(s => !s.custom)
    .map(s => {
      const source = BUILT_IN_SCHOLARSHIPS.find(b => b.id === s.id);
      return source ? deriveScholarship(mergeOverride(source, byId.get(s.id))) : s;
    });
  const custom = overrides.filter(o => o.custom).map(o => deriveScholarship(mergeOverride(customSource(o), o)));
  return [...builtIn, ...custom];
}

// Makes the AdSO's scholarships known to every lookup by id
// (mockScholarships.find(...)), e.g. in application lists and history.
export function registerCustomScholarships(all: Scholarship[]): void {
  const custom = all.filter(s => s.custom);
  for (let i = mockScholarships.length - 1; i >= 0; i--) {
    if (mockScholarships[i].custom) mockScholarships.splice(i, 1);
  }
  mockScholarships.push(...custom);
}

// Scholarships without an online application: the office students go to.
export function handlingOffice(s: { handledBy?: string; office?: ScholarshipOffice }): string {
  return s.handledBy?.trim() || OFFICE_LABELS[s.office ?? 'LSO'];
}
