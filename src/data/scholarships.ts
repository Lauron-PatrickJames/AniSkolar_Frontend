import { Scholarship } from '../types';

export const mockScholarships: Scholarship[] = [
  {
    id: 's1',
    name: 'Student Financial Aid (SFA) Grant',
    category: 'Financial',
    description: 'This guideline serves as the basis for approving the student financial aid grant application for new students entering the first semester of A.Y. 2026-2027.',
    benefits: [
      'Financial assistance grant covering a portion of tuition and/or fees, with the specific amount and coverage determined by the Linkages and Scholarship Office (LSO) based on evaluation of the applicant\'s financial need'
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
    status: 'Open'
  },
  {
    id: 's2',
    name: 'Entrance Scholarship',
    category: 'Academic',
    description: 'This scholarship offers financial aid to deserving Grade 7, Grade 11, and Freshman students who rank at the top of their graduating batch.',
    benefits: [
      'Rank 1: 100% Tuition discount (excludes miscellaneous fees)',
      'Rank 2: 50% Tuition discount (excludes miscellaneous fees)'
    ],
    eligibility: [
      'Must be an incoming Grade 7, Grade 11, or Freshman student',
      'Must rank first or second from a batch of at least 100 graduates from a DepEd-recognized school'
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
    status: 'Open'
  }
];