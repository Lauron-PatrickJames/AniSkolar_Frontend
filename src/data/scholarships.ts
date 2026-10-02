import { DocumentSlot, Scholarship, ScholarshipOffice, ScholarshipOverride } from '../types';

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

export const mockScholarships: Scholarship[] = [
  {
    id: 's1',
    name: 'Student Financial Aid (SFA) Grant',
    eligibilityCriteria: {
      minGpa: undefined, // varies: 85% for freshmen vs 2.50 GPA for upperclassmen — handle in filter below
      applicantType: 'any'
    },
    category: 'Financial',
    provider: {
      ...SCHOLARSHIP_OFFICE_PROVIDER,
      office: 'Office of the Vice President for Global Engagement and External Relations, through the Scholarship Unit'
    },
    description: 'Interested students may apply for financial aid through the Office of the Vice President for Global Engagement and External Relations via the Scholarship Unit. The Scholarship Committee determines the amount of financial aid in the form of tuition discounts.\n\nThis guideline serves as the basis for approving the student financial aid grant application for new students entering the first semester of A.Y. 2026-2027.',
    benefits: [
      'Tuition discount, with the amount of financial aid determined by the Scholarship Committee based on evaluation of the applicant\'s financial need'
    ],
    eligibility: [
      'Must be a Filipino citizen, preferably Catholic, with good moral character, and preferably a graduate of a public school',
      'Incoming freshmen: general average of 85% and above',
      'Upperclassmen: minimum cumulative GPA of 2.50',
      'No failing grades in any subject',
      'Must be enrolled in a minimum of 18 units of subject load, or as prescribed by the course curricula'
    ],
    requirements: [
      'Application Letter from parent/guardian addressed to the Scholarship Coordinator of DLSU-D',
      'One (1) Recommendation Letter from guidance counselor, class adviser, subject teacher, or school principal',
      'Personal Essay with one (1) 2x2 photo taken within the last three months',
      'Updated Certificate of Indigency',
      'Certificate of Income Tax Return (ITR), Affidavit of Non-Filing of ITR, or Employment Contract (for children of OFWs)',
      'Recent utility bills (electric and water), saved in one (1) JPEG file',
      'Picture of Residence (indoor and outdoor view), saved in one (1) JPEG file',
      'Hand-drawn vicinity sketch map with contact information, starting from the most distinguishable barangay landmark to your home'
    ],
    process: [
      'Step 1: Confirm your slot, then accomplish the online scholarship application on the date specified by the office, attaching all required documents in JPEG format.',
      'Step 2: Await notification of your application status via the DLSU-D Student Portal, email, or Schoolbook.'
    ],
    deadline: 'Applications open June 15, 2026',
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
    eligibility: [
      'Must be an incoming Grade 7, Grade 11, or Freshman student',
      'Must have ranked first or second in a batch of at least 100 graduates from any DepEd-recognized school'
    ],
    requirements: [
      'Certificate of Ranking indicating the number of graduates',
      'Grade 6 / Grade 10 Report Card (for incoming Grade 7 / Grade 11), or Grade 12 Report Card / Form 138 (for incoming Freshman)'
    ],
    process: [
      'Step 1: Check your eligibility — confirm your rank and your batch\'s graduate count.',
      'Step 2: Accomplish the Online Scholarship Form, available on the DLSU-D website starting June 1, 2026, and submit it before your scheduled enrollment.',
      'Step 3: Submit the required documents alongside your accomplished online application form.',
      'Step 4: Wait for your application status notification via the DLSU-D Student Portal. If approved, the scholarship is applied to your tuition fee upon enrollment. If disapproved, you may still enroll but will not receive the entrance scholarship discount.'
    ],
    deadline: 'Before scheduled enrollment (form available June 1, 2026)',
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
    eligibility: [
      'High school general average of at least 85, with no grade in the 70s',
      'Proof of financial need, to be evaluated by the scholarship committee',
      'Must not be related by consanguinity to any current member of the POLCA Board'
    ],
    retentionConditions: [
      'Maintain a GPA of at least 2.50',
      'No failing grades',
      'Enrolled in the maximum number of units required by the curriculum',
      'Good moral standing for the whole scholarship period'
    ],
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
    eligibility: [
      'Incoming freshman for SY 2026–2027',
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
      'Tuition discounts exclude miscellaneous, laboratory, and other fees.'
    ],
    eligibilityCriteria: { applicantType: 'continuing' },
    eligibility: [
      'GPA within the top 30% of upperclassmen',
      'No grade lower than 3.25',
      'Enrolled in a minimum of 18 units',
      'At least one (1) semester of residency at DLSU-D'
    ],
    requirements: [],
    process: [
      'Step 1: Keep your grades up — rankings are computed from your GPA at the end of each semester.',
      'Step 2: Qualified students are identified and notified by the AdSO. No application is needed.'
    ],
    deadline: 'Contact the AdSO for the current schedule',
    status: 'Open'
  },
  {
    id: 's6',
    name: 'Employee Benefit Privilege Scholarship Program (EBPSP)',
    category: 'Others',
    provider: SCHOLARSHIP_OFFICE_PROVIDER,
    targetApplicants: 'Legal dependents of DLSU-D and DLSMHSI employees',
    description: 'The Employee Benefit Privilege Scholarship Program grants tuition discounts to the legal dependents of De La Salle University-Dasmariñas (DLSU-D) and De La Salle Medical and Health Sciences Institute (DLSMHSI) employees.',
    benefits: [
      '1st availment: 100% tuition discount',
      '2nd availment: 75% tuition discount',
      '3rd availment: 50% tuition discount',
      '4th availment: 25% tuition discount',
      'Includes waivers for some miscellaneous fees (e.g. medical, dental, and air-conditioning fees)'
    ],
    eligibilityCriteria: { applicantType: 'any' },
    eligibility: [
      'Must be a legal dependent of a DLSU-D or DLSMHSI employee',
      'Must maintain satisfactory academic progress'
    ],
    retentionConditions: [
      'Satisfactory academic progress every semester',
      'The privilege is non-transferable and cannot be deferred'
    ],
    // Assumed — the official page doesn't list the documents. The AdSO
    // should confirm these.
    requirements: [
      'Certificate of employment of the parent/guardian from DLSU-D or DLSMHSI',
      'PSA birth certificate showing your relationship to the employee',
      'Latest report card or certificate of grades'
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
    description: 'The Athletic Scholarship supports varsity players who represent DLSU-D in Basketball, Volleyball, Athletics, Badminton, Table Tennis, Swimming, and Chess.',
    benefits: [
      'Tuition fee discount',
      'Full matriculation fee discount',
      'Free food and accommodation for recruited athletes'
    ],
    eligibilityCriteria: { applicantType: 'any' },
    eligibility: [
      'Must be a recruited varsity player in Basketball, Volleyball, Athletics, Badminton, Table Tennis, Swimming, or Chess',
      'Evaluated by the coach and approved by the SDO Director'
    ],
    requirements: [],
    process: [
      'Step 1: Try out for or get recruited into a DLSU-D varsity team.',
      'Step 2: Your coach evaluates your performance and endorses you.',
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
    description: 'The Vicissitude Scholarship Program grants tuition discounts to members of the Vicissitude Editorial Board and Staff.',
    benefits: [
      'Editorial Board, rating 4.75–5.00: 100% tuition discount',
      'Editorial Board, rating 4.50–4.74: 75% tuition discount',
      'Editorial Board, rating 4.25–4.49: 50% tuition discount',
      'Editorial Board, rating 4.24 and below: 25% tuition discount',
      'Editorial Staff: 25% tuition discount',
      'Training, a pictorial, a graduation picture, and a copy of the yearbook'
    ],
    eligibilityCriteria: { applicantType: 'any' },
    eligibility: [
      'Must be a member of the Vicissitude Editorial Board or Editorial Staff'
    ],
    requirements: [],
    process: [
      'Step 1: Join the Vicissitude Editorial Board or Staff.',
      'Step 2: Your discount is based on your performance rating for the term.'
    ],
    deadline: 'Contact the AdSO for the current schedule',
    status: 'Open'
  },
  {
    id: 's9',
    name: 'Performing Arts Group (PAG) Scholarship',
    category: 'Others',
    provider: SCHOLARSHIP_OFFICE_PROVIDER,
    applicationMode: 'info',
    availNote: 'Granted to active members of the university\'s performing arts groups — there is no online application.',
    targetApplicants: 'Members of DLSU-D performing arts groups',
    description: 'The Performing Arts Group Scholarship supports talented students in singing, dancing, acting, and playing musical instruments who perform for the university.',
    benefits: [
      'Tuition discount for active members of a performing arts group'
    ],
    eligibilityCriteria: { applicantType: 'any' },
    eligibility: [
      'Must be an active member of a DLSU-D performing arts group (singing, dancing, acting, or instruments)'
    ],
    requirements: [],
    process: [
      'Step 1: Audition for and join a DLSU-D performing arts group.',
      'Step 2: Active members are endorsed for the scholarship by their group.'
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
    description: 'The 267th NROTC Scholarship gives financial assistance to officers of the university\'s Naval Reserve Officers Training Corps unit, subject to the availability of the ROTC fund.',
    benefits: [
      'Corps Commander: ₱30,000',
      'Vice Corps Commander: ₱20,000',
      '2nd and 3rd Class officers: ₱10,000',
      '4th Class officers: ₱5,000',
      'Amounts are subject to the availability of the ROTC fund.'
    ],
    eligibilityCriteria: { applicantType: 'continuing' },
    eligibility: [
      'GPA of at least 2.0 with no failing grade',
      'Good moral character',
      'Earned rank and on active duty',
      'Renders at least 20 hours of duty a week',
      'Recommended by the Commandant and the ROTC Coordinator'
    ],
    requirements: [],
    process: [
      'Step 1: Earn your rank and stay on active duty in the 267th NROTC unit.',
      'Step 2: The Commandant and the ROTC Coordinator recommend qualified officers.'
    ],
    deadline: 'Contact the AdSO for the current schedule',
    status: 'Open'
  }
];

// Fields the AdSO can change from the admin Scholarships page. Everything
// else (name, office, form, eligibility rules, documents) is fixed in code.
export const EDITABLE_SCHOLARSHIP_FIELDS = ['status', 'deadline', 'description', 'benefits', 'eligibility', 'process', 'submissionNote'] as const;

// Merges AdSO overrides over the defaults above. Unknown ids are ignored.
export function applyScholarshipOverrides(base: Scholarship[], overrides: ScholarshipOverride[]): Scholarship[] {
  const byId = new Map(overrides.map(o => [o.id, o]));
  return base.map(scholarship => {
    const o = byId.get(scholarship.id);
    if (!o) return scholarship;
    const merged: Scholarship = { ...scholarship };
    if (o.status) merged.status = o.status;
    if (o.deadline) merged.deadline = o.deadline;
    if (o.description) merged.description = o.description;
    if (o.benefits?.length) merged.benefits = o.benefits;
    if (o.eligibility?.length) merged.eligibility = o.eligibility;
    if (o.process?.length) merged.process = o.process;
    if (o.submissionNote) merged.submissionNote = o.submissionNote;
    return merged;
  });
}
