import { DocumentSlot, GpaRequirement, Scholarship, ScholarshipOffice, ScholarshipOverride } from '../types';
import { EligibilityRules, documentTexts, ruleLines } from './requirementCatalog';

// Display names for the offices that review scholarships. Scholarships
// without an `office` belong to the LSO.
export const OFFICE_LABELS: Record<ScholarshipOffice, string> = {
  LSO: 'Admissions and Scholarship Office (AdSO)',
  POLCA: 'POLCA Office',
  ALUMNI: 'Alumni Office'
};

export const OFFICE_SHORT_LABELS: Record<ScholarshipOffice, string> = {
  LSO: 'AdSO',
  POLCA: 'POLCA',
  ALUMNI: 'Alumni Office'
};

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
// (dlsud.edu.ph/admissions/scholarship).
const SCHOLARSHIP_OFFICE_PROVIDER = {
  name: 'De La Salle University-Dasmariñas',
  office: 'Admissions and Scholarship Office (AdSO)',
  address: 'Ayuntamiento De Gonzalez Bldg., De La Salle University-Dasmariñas, Brgy. Fatima 1, Dasmariñas City, Cavite 4114',
  contact: [
    'scholarship@dlsud.edu.ph · AdSOsecretary@dlsud.edu.ph',
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
      'Good moral standing for the whole scholarship period'
    ],
    gpaRequirement: { stage: 'keep', minGpa: 2.5, noFailingGrade: true },
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
      'Related to an alumnus/alumna of DLSU-EAC, DLSU-Aguinaldo, or DLSU-Dasmariñas, up to the 2nd degree of consanguinity (parent, sibling, grandparent, or grandchild)'
    ],
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
    // Assumed — neither the official page nor the AdSO's list (Oct 2026)
    // gives the documents. The AdSO should confirm these.
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
    provider: SCHOLARSHIP_OFFICE_PROVIDER,
    applicationMode: 'info',
    availNote: 'Awarded to recruited varsity players. Players are evaluated by their coach and approved by the Sports Development Office (SDO) Director — there is no online application.',
    targetApplicants: 'Recruited varsity players',
    description: 'The Athletic Scholarship is for recruited varsity players. It recognizes students committed to their sport while keeping a strong academic record, in basketball, volleyball, athletics (track and field), badminton, table tennis, swimming, and chess.',
    benefits: [
      'Tuition fee discount (by percentage)',
      'Full matriculation fee discount',
      'Free food and accommodation for recruited athletes'
    ],
    eligibilityCriteria: { applicantType: 'any' },
    rules: { applicantType: 'any' },
    customEligibility: [
      'Incoming varsity players evaluated and recommended by the coach, or current varsity members with at least satisfactory performance in the coach\'s evaluation',
      'Approved by the Sports Development Office (SDO) Director'
    ],
    scheduleLabel: 'Varsity tryouts',
    schedule: 'To be announced. Tryout dates are posted in Announcements.',
    process: [
      'Step 1: Try out for or get recruited into a DLSU-D varsity team. Tryout dates are posted in Announcements.',
      'Step 2: Your coach evaluates you — a recommendation for incoming players, an endorsement for current members.',
      'Step 3: The SDO Director approves the scholarship.'
    ],
    deadline: 'Contact the AdSO for the current schedule',
    status: 'Open'
  },
  {
    id: 's8',
    name: 'Vicissitude Scholarship Program',
    category: 'Leadership',
    provider: SCHOLARSHIP_OFFICE_PROVIDER,
    applicationMode: 'info',
    availNote: 'Granted to members of the Vicissitude Editorial Board and Staff based on their performance rating — there is no online application.',
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
    process: [
      'Step 1: Join the Vicissitude Editorial Board or Staff.',
      'Step 2: Complete your duty hours: 200 for Editorial Board members, 125 for Editorial Staff members.',
      'Step 3: Your performance is evaluated (60% by the Vicissitude Coordinator and the Graphics Design and Layout Artist, 40% by the Editorial Board). Editorial Staff members also need a good staff evaluation rating.',
      'Step 4: Your discount is set by your rating.'
    ],
    deadline: 'Contact the AdSO for the current schedule',
    status: 'Open'
  },
  {
    id: 's10',
    name: '267th NROTC Scholarship',
    category: 'Leadership',
    provider: SCHOLARSHIP_OFFICE_PROVIDER,
    applicationMode: 'info',
    availNote: 'Granted to officers of the 267th NROTC unit on the recommendation of the Commandant and the ROTC Coordinator — there is no online application.',
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
    process: [
      'Step 1: Earn your rank and stay on active duty in the 267th NROTC unit.',
      'Step 2: The Commandant and the ROTC Coordinator recommend qualified officers.'
    ],
    deadline: 'Contact the AdSO for the current schedule',
    status: 'Open'
  },
  {
    // Offered by the University Student Government, separate from the
    // AdSO's SFAG. Applied for through the USG's own online form, so it's
    // listed for information (AdSO list, Oct 2026).
    id: 's11',
    name: 'USG Student Financial Aid Grant',
    category: 'Financial',
    provider: {
      name: 'University Student Government (USG), De La Salle University-Dasmariñas',
      office: 'University Student Government',
      address: 'De La Salle University-Dasmariñas, Dasmariñas City, Cavite'
    },
    applicationMode: 'info',
    availNote: 'Offered by the University Student Government each semester through its own online form (bit.ly/USGSFAG) — not through AniSkolar. The USG reviews the applications.',
    targetApplicants: 'Continuing DLSU-D students',
    description: 'The University Student Government\'s Student Financial Aid Grant is offered each semester, separate from the SFAG of the Admissions and Scholarship Office. The latest call was for the 2nd semester of AY 2025–2026 (applications April 6–13, 2026).',
    benefits: [
      'Financial aid from the University Student Government'
    ],
    eligibilityCriteria: { applicantType: 'continuing' },
    rules: { applicantType: 'continuing', minGpa: 2, noFailingGrade: true },
    customEligibility: [
      'Bona fide DLSU-D student with at least one semester of residency',
      'The GPA and no-failing-grades rules apply to the previous semester',
      'No other existing internal scholarship grant from DLSU-D or its benefactors',
      'Not found guilty of any major offense'
    ],
    customDocuments: [
      'Application letter addressed to the University Student Government',
      'Financial Aid Grant Application Form',
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
      'Step 1: Submit all documents through the USG\'s online form during the application period.',
      'Step 2: The USG verifies your documents within 72 hours. If one is inaccurate, you have two days from notification to resubmit.',
      'Step 3: Verified applicants are told their on-site submission schedule, where the application slot is confirmed.',
      'Step 4: Wait for the final list of shortlisted applicants.'
    ],
    deadline: 'Each semester; see the USG\'s announcements',
    status: 'Open'
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

// Fills in what's generated from the rules and documents: the text
// students read, the applicant-type filter and the GPA rule.
export function deriveScholarship(source: ScholarshipSource): Scholarship {
  const rules = source.rules ?? {};
  const slotBased = !!source.documentSlots?.length;
  const applicantType = rules.applicantType ?? 'any';
  return {
    ...source,
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
  'status', 'deadline', 'description', 'benefits', 'process', 'submissionNote', 'schedule',
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
  if (o.description) merged.description = o.description;
  if (o.benefits?.length) merged.benefits = o.benefits;
  if (o.process?.length) merged.process = o.process;
  if (o.submissionNote) merged.submissionNote = o.submissionNote;
  if (o.schedule && source.scheduleLabel) merged.schedule = o.schedule;
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
