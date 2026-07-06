import { Scholarship } from '../types';

export const mockScholarships: Scholarship[] = [
  {
    id: 's1',
    name: 'Br. Augustine Shield Star Scholarship',
    category: 'Academic',
    description: 'The premier academic scholarship awarded to top-performing students of DLSU-D. Designed to support outstanding scholars who maintain exemplary academic performance and lead in civic duties.',
    benefits: [
      '100% Tuition and Fees discount (including laboratory and miscellaneous)',
      'Monthly living subsidy of ₱5,000',
      'Book allowance of ₱3,000 per semester',
      'Priority registration for courses and general assemblies'
    ],
    eligibility: [
      'Must be a regular student carrying a full course load',
      'Must have a cumulative GPA of 3.75 or higher (out of 4.0)',
      'No grade lower than 3.0 in any academic course',
      'No record of disciplinary infraction'
    ],
    requirements: [
      'Completed Star Scholarship Application Form',
      'Certified True Copy of Grades (TCG) from the preceding semester',
      'Two (2) Letters of Recommendation from College Professors',
      'Certificate of Good Moral Character'
    ],
    process: [
      'Step 1: Submit the online application with all required documents before the deadline.',
      'Step 2: Pre-screening by the Scholarship Committee based on academic standing.',
      'Step 3: Written panel interview and examination for qualified applicants.',
      'Step 4: Final approval from the Vice Chancellor for Academics and notification of results.'
    ],
    deadline: 'July 25, 2026',
    status: 'Open'
  },
  {
    id: 's2',
    name: 'Br. President Financial Assistance Grant',
    category: 'Financial',
    description: 'A comprehensive financial assistance program dedicated to supporting financially challenged yet highly motivated students to pursue higher education at DLSU-D.',
    benefits: [
      '50% to 100% Tuition discount based on family annual gross income',
      'Flexible payment terms for remaining balances',
      'Book store discount of 20% on all required textbooks'
    ],
    eligibility: [
      'Family annual gross income must not exceed ₱350,000',
      'Must maintain a cumulative GPA of 2.50 or higher',
      'No grade of Failure (F) or Incomplete (INC)',
      'Must be a regular student'
    ],
    requirements: [
      'Latest BIR Income Tax Return (ITR) of both parents/guardians, or Certificate of Low Income',
      'Photocopy of latest electric and water utility bills',
      'Statement of grades from the previous school term',
      'Brief essay explaining family financial situation and academic aspirations'
    ],
    process: [
      'Step 1: Fill out the online application and attach financial proof documents.',
      'Step 2: Verification of family income status and house visit/assessment if necessary.',
      'Step 3: Interview with the Social Welfare officer.',
      'Step 4: Award determination and final list release.'
    ],
    deadline: 'July 20, 2026',
    status: 'Closing Soon'
  },
  {
    id: 's3',
    name: 'Green Patriots Athletic Development Program',
    category: 'Athletic',
    description: 'Designed for student-athletes representing DLSU-D in regional and national sports competitions. This grant enables athletes to achieve athletic greatness without compromising academic growth.',
    benefits: [
      '100% Tuition waiver for varsity members playing in major leagues',
      'Free athletic gear, uniform kits, and medical insurance',
      'Exclusive access to sports rehabilitation facilities and trainers',
      'Academic tutoring support program'
    ],
    eligibility: [
      'Must pass physical fitness tests and team tryouts conducted by the Athletics Office',
      'Must maintain a minimum GPA of 2.0 or higher',
      'Must carry at least 15 units of course load per semester',
      'No pending disciplinary cases'
    ],
    requirements: [
      'Endorsement Letter from the Team Head Coach',
      'Recommendation Letter from the Sports Director',
      'Medical clearance certificate from the University Clinic',
      'True Copy of Grades'
    ],
    process: [
      'Step 1: Obtain a varsity endorsement from your coach.',
      'Step 2: Submit the athletic grant form with grades and medical clearance.',
      'Step 3: Athletic Office performance evaluation.',
      'Step 4: Scholarship Board approval.'
    ],
    deadline: 'July 30, 2026',
    status: 'Open'
  },
  {
    id: 's4',
    name: 'St. Mutien Marie Leadership Scholarship',
    category: 'Leadership',
    description: 'Awarded to students who exhibit exemplary leadership qualities through active participation in student councils, recognized organizations, and university-wide civic outreach programs.',
    benefits: [
      '50% Tuition discount for the semester of service',
      'Fully funded leadership training workshops and national conventions',
      'Certificate of Excellence in Student Leadership'
    ],
    eligibility: [
      'Must hold a key officer position in a recognized student organization or Student Council',
      'Must maintain a GPA of 2.75 or higher with no failing marks',
      'Highly active in community service and community-extension programs'
    ],
    requirements: [
      'Certificate of Election or Appointment to the student leadership post',
      'Accomplished Leadership Portfolio detailing community projects and accomplishments',
      'Endorsement from the Student Directory Office',
      'Certified copy of grades'
    ],
    process: [
      'Step 1: Submit application accompanied by leadership portfolio.',
      'Step 2: Leadership panel assessment.',
      'Step 3: Verification of standing from Student Directory Office.',
      'Step 4: Notice of award.'
    ],
    deadline: 'August 05, 2026',
    status: 'Open'
  },
  {
    id: 's5',
    name: 'St. John Baptist de La Salle Diocesan Scholars Program',
    category: 'Others',
    description: 'A collaborative scholarship between DLSU-D and local dioceses, catering to parishioners and church workers who wish to acquire university degrees.',
    benefits: [
      '75% Tuition fee subsidy',
      'Spiritual development seminars and character-building cohorts',
      'Direct service placement opportunities in university community extensions'
    ],
    eligibility: [
      'Must be an active member of an endorsing local diocese/parish',
      'Must maintain a cumulative GPA of 2.50 or higher',
      'Endorsed by the Parish Priest/Bishop'
    ],
    requirements: [
      'Official Bishop/Parish Priest endorsement letter with official seal',
      'Sacramental Certificates (Baptism, Confirmation)',
      'Certificate of Low Income of family',
      'High school report card or latest college transcripts'
    ],
    process: [
      'Step 1: Submit parish endorsement along with grades.',
      'Step 2: Interview with Diocesan Liaison Officer.',
      'Step 3: Background verification and scholarship evaluation.',
      'Step 4: Notice of placement.'
    ],
    deadline: 'July 15, 2026',
    status: 'Closing Soon'
  },
  {
    id: 's6',
    name: 'University Student Assistantship Program',
    category: 'Financial',
    description: 'Provides opportunities for financially needy students to support their education by rendering service hours in various academic and administrative departments within the university.',
    benefits: [
      'Hourly wage credit of ₱100/hour applied directly to tuition and fees',
      'Flexible shift schedules matching academic timetables',
      'Valuable on-campus work experience'
    ],
    eligibility: [
      'Must be a regular student in sophomore year or higher',
      'Must have a GPA of 2.25 or higher',
      'Available to work up to 20 hours per week on campus'
    ],
    requirements: [
      'Student Assistantship Application Form',
      'Class schedule for the current semester',
      'ITR or low-income certification of parents',
      'Two character reference letters from university personnel'
    ],
    process: [
      'Step 1: Submit application and department preference.',
      'Step 2: Department interview and scheduling match.',
      'Step 3: Placement allocation and service contract signing.',
      'Step 4: Commencement of assistantship service.'
    ],
    deadline: 'July 10, 2026',
    status: 'Closing Soon'
  }
];
