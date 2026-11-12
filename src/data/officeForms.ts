// Office-specific parts of the standard application form, for the
// scholarships whose office decides on its own criteria: an extra step of
// questions for the student, the documents those answers call for, who
// approves, and what the office records while deciding (its points,
// rating, rank or schedule) with the result worked out. Mirrors
// OFFICE_FORMS in the backend's data/officeForms.js (same keys and
// option values).

export type OfficeAnswers = Record<string, string | number | boolean | undefined>;

export interface OfficeQuestion {
  key: string;
  label: string;
  hint?: string;
  type: 'choice' | 'select' | 'number' | 'text' | 'confirm';
  options?: { value: string; label: string; hint?: string }[];
  min?: number;
  max?: number;
  placeholder?: string;
  showIf?: { key: string; value: string };
}

export interface AssessmentField {
  key: string;
  label: string;
  hint?: string;
  type: 'number' | 'choice' | 'bool' | 'date' | 'time';
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  // Filled from the student's answer when the office hasn't set it.
  fromAnswer?: string;
  // Or worked out from the answers (e.g. the amount for an ROTC rank).
  defaultFrom?: (answers: OfficeAnswers) => number | undefined;
}

export interface AssessmentResult {
  headline: string;     // e.g. "75% tuition discount"
  lines: string[];      // how it was worked out
  tone: 'success' | 'warning' | 'danger' | 'neutral';
}

// A number the office can change on the scholarship's page (an amount or
// a level), e.g. the ROTC amount for each rank. Same keys and ranges as
// numbers in the backend's data/officeForms.js.
export interface OfficeNumber {
  key: string;
  label: string;
  default: number;
  min: number;
  max: number;
  step: number;
  kind: 'peso' | 'rating';
}

export interface OfficeForm {
  // The form step's name and what it's for.
  stepLabel: string;
  intro: string;
  questions: OfficeQuestion[];
  // The documents to upload for these answers (replaces the scholarship's
  // list); absent = the scholarship's own documents.
  documents?: (answers: OfficeAnswers) => string[];
  // The academic profile doesn't ask for a GPA (e.g. the SDO's).
  noGpa?: boolean;
  // Scholarships the office adds itself (directAward): the wording of the
  // Add a scholar dialog. Same as award in the backend's officeForms.js.
  award?: {
    who: string;            // 'player', 'officer'
    detailsTitle: string;   // the step with the questions
    // 'discount': pick a tuition discount (SDO); 'assessment': the
    // assessment's number fields, filled from the answers (ROTC).
    grant: 'discount' | 'assessment';
    messagePlaceholder: string;
  };
  // Who decides, shown to students and on the approve button.
  approver: string;
  assessmentTitle: string;
  assessment: AssessmentField[];
  result: (values: OfficeAnswers, answers: OfficeAnswers) => AssessmentResult | null;
  // Amounts or levels the office can change (Scholarships → the scholarship).
  numbersTitle?: string;
  numbersHint?: string;
  numbers?: OfficeNumber[];
}

// The offices' saved numbers by scholarship (App.tsx and the Scholarships
// page set them from the scholarships' settings).
let savedNumbers: Record<string, Record<string, number>> = {};
export function setOfficeNumbers(overrides: { id: string; officeNumbers?: Record<string, number> }[], replace = true): void {
  const next = Object.fromEntries(overrides.filter(o => o.officeNumbers).map(o => [o.id, o.officeNumbers!]));
  savedNumbers = replace ? next : { ...savedNumbers, ...next };
}
// A scholarship's number: the office's, or the default.
export function officeNumber(scholarshipId: string, key: string): number {
  const saved = savedNumbers[scholarshipId]?.[key];
  if (typeof saved === 'number') return saved;
  return OFFICE_FORMS[scholarshipId]?.numbers?.find(n => n.key === key)?.default ?? 0;
}

// CBAASG (Ordinance No. 01, s. 2021–2022): the same documents and
// interviews for both of its scholarships. The tax exemption certificate
// is optional, so it's asked for only when the student has one.
const CBAA_DEPARTMENTS = ['ABD', 'ACD', 'BMD', 'MKD'].map(d => ({ value: d, label: d }));
const TAX_EXEMPTION: OfficeQuestion = {
  key: 'taxExemption', label: 'Do you have a Certificate of Tax Exemption?', hint: 'Optional: upload it if you have one.', type: 'choice', options: [
    { value: 'yes', label: 'Yes, I’ll upload it' },
    { value: 'no', label: 'No' },
  ],
};
const CBAASG_DOCUMENTS = [
  'Recommendation letter from your Department Chair',
  'Grades from the previous academic year',
  'Certificate of Registration (COR) for the current semester',
  'Certificate of Indigency or proof of inability to pay the tuition fee',
  'Payslip or ITR supporting your parents’ or guardian’s annual gross income',
];
const cbaasgDocuments = (a: OfficeAnswers) => a.taxExemption === 'yes' ? [...CBAASG_DOCUMENTS, 'Certificate of Tax Exemption'] : CBAASG_DOCUMENTS;
const CBAASG_INTERVIEWS: AssessmentField[] = [
  { key: 'initialInterview', label: 'Initial interview (Executive Board)', type: 'date' },
  { key: 'finalInterview', label: 'Final interview (Dean and Associate Dean)', type: 'date' },
];
function cbaasgInterviews(v: OfficeAnswers): AssessmentResult {
  const day = (k: string) => (v[k] ? formatDay(String(v[k])) : 'not scheduled yet');
  return {
    headline: v.finalInterview ? 'Final interview scheduled' : v.initialInterview ? 'Initial interview scheduled' : 'Screening',
    lines: [`Initial interview: ${day('initialInterview')}`, `Final interview: ${day('finalInterview')}`, 'Send each schedule to the student’s DLSU-D email. Passers sign the contract within 7 days.'],
    tone: v.finalInterview ? 'success' : 'neutral',
  };
}

// CCJESG (Ordinance No. 251125): the most each position can get a semester.
const CCJESG_POSITIONS = [
  { value: 'governor', label: 'Governor', cap: 10000 },
  { value: 'viceGovernor', label: 'Vice Governor', cap: 10000 },
  { value: 'chiefOfStaff', label: 'Chief of Staff (or deputy)', cap: 7000 },
  { value: 'executive', label: 'Executive member (or deputy)', cap: 7000 },
  { value: 'legislative', label: 'Legislative Council member', cap: 6000 },
];

const num = (v: unknown) => (v === undefined || v === null || v === '' ? null : Number(v));
const peso = (n: number) => `₱${n.toLocaleString('en-PH')}`;

const SPORTS = ['Basketball', 'Volleyball', 'Athletics (track and field)', 'Badminton', 'Table tennis', 'Swimming', 'Chess'];

const rankAmount = (rank: string) => officeNumber('s10', rank);

const ROTC_RANKS = [
  { value: 'corps', label: 'Corps Commander', amount: 30000 },
  { value: 'vice', label: 'Vice Corps Commander', amount: 20000 },
  { value: 'second', label: '2nd Class officer', amount: 10000 },
  { value: 'third', label: '3rd Class officer', amount: 10000 },
  { value: 'fourth', label: '4th Class officer', amount: 5000 },
];

const HERALDO_POSITIONS = [
  { value: 'junior', label: 'Junior Staff' },
  { value: 'senior', label: 'Senior Staff' },
  { value: 'section', label: 'Section Editor' },
  { value: 'associate', label: 'Associate Editor' },
  { value: 'managing', label: 'Managing Editor' },
  { value: 'chief', label: 'Editor in Chief' },
];

// The Heraldo Filipino's table of qualifications: each criterion earns 0–5.
function heraldoPoints(v: OfficeAnswers) {
  const ev = num(v.evaluationScore);
  const works = num(v.publishedWorks);
  const hours = num(v.officeHours);
  const merit = v.merit as string | undefined;
  const band = (x: number | null, cuts: [number, number][]) => (x === null ? null : cuts.find(([min]) => x >= min)?.[1] ?? 0);
  return {
    evaluation: band(ev, [[98, 5], [95, 4], [90, 3], [84, 2], [75, 1], [60, 0]]),
    works: band(works, [[6, 5], [5, 4], [4, 3], [3, 2], [2, 1], [0, 0]]),
    hours: band(hours, [[96, 5], [91, 4], [86, 3], [80, 2], [60, 1], [0, 0]]),
    merit: merit === undefined ? null : merit === 'demerit' ? 0 : ({ '3': 5, '2': 4, '1': 3, '0': 2 } as Record<string, number>)[merit] ?? null,
    disqualified: ev !== null && ev < 60,
  };
}

// Vicissitude's Editorial Board discounts by performance rating.
function vicissitudeDiscount(rating: number): number {
  if (rating >= officeNumber('s8', 'rating100')) return 100;
  if (rating >= officeNumber('s8', 'rating75')) return 75;
  if (rating >= officeNumber('s8', 'rating50')) return 50;
  return 25;
}

export const OFFICE_FORMS: Record<string, OfficeForm> = {
  // The SDO has no application: these are the details it records when it
  // adds a player picked from the tryouts (AddScholarDialog).
  s7: {
    stepLabel: 'Varsity',
    intro: 'The Sports Development Office decides with the coach’s evaluation; the SDO Director approves.',
    questions: [
      {
        key: 'playerType', label: 'You are', type: 'choice', options: [
          { value: 'incoming', label: 'An incoming player', hint: 'Recruited, or tried out and recommended by the coach' },
          { value: 'current', label: 'A current varsity member', hint: 'Already on a DLSU-D varsity team' },
        ],
      },
      { key: 'sport', label: 'Sport', type: 'select', options: SPORTS.map(s => ({ value: s, label: s })) },
      { key: 'coach', label: 'Your coach', type: 'text', placeholder: 'Coach’s full name' },
    ],
    documents: a => a.playerType === 'incoming' ? ['Coach\'s evaluation and recommendation']
      : a.playerType === 'current' ? ['Coach\'s evaluation and endorsement'] : [],
    noGpa: true,
    award: { who: 'player', detailsTitle: 'Varsity', grant: 'discount', messagePlaceholder: 'e.g. Welcome to the team! Your discount starts this semester.' },
    approver: 'SDO Director',
    assessmentTitle: 'Scholarship grant',
    assessment: [
      { key: 'tuitionDiscount', label: 'Tuition fee discount (%)', type: 'number', min: 0, max: 100, step: 1 },
      { key: 'matriculation', label: 'Full matriculation fee discount', type: 'bool' },
      { key: 'foodAndLodging', label: 'Free food and accommodation', type: 'bool' },
    ],
    result: v => {
      const pct = num(v.tuitionDiscount);
      if (pct === null) return null;
      const extras = [v.matriculation && 'full matriculation fee discount', v.foodAndLodging && 'free food and accommodation'].filter(Boolean) as string[];
      return { headline: `${pct}% tuition fee discount`, lines: extras.length ? [`Plus ${extras.join(' and ')}`] : [], tone: 'success' };
    },
  },
  s8: {
    stepLabel: 'Vicissitude',
    intro: 'Vicissitude rates your performance and sets your discount from it.',
    questions: [
      {
        key: 'member', label: 'You are on the', type: 'choice', options: [
          { value: 'board', label: 'Editorial Board', hint: '200 duty hours' },
          { value: 'staff', label: 'Editorial Staff', hint: '125 duty hours' },
        ],
      },
      { key: 'position', label: 'Position', type: 'text', placeholder: 'e.g. Photo Editor' },
      { key: 'department', label: 'Your department', type: 'text', placeholder: 'e.g. Department of Information Technology', hint: 'One 25% scholarship is reserved for each department.', showIf: { key: 'member', value: 'staff' } },
      { key: 'dutyHours', label: 'Duty hours completed', type: 'number', min: 0, max: 1000 },
    ],
    approver: 'Vicissitude',
    assessmentTitle: 'Performance rating',
    assessment: [
      { key: 'coordinatorScore', label: 'Coordinator and Layout Artist (60%)', hint: '1.00–5.00', type: 'number', min: 1, max: 5, step: 0.01 },
      { key: 'boardScore', label: 'Editorial Board (40%)', hint: '1.00–5.00', type: 'number', min: 1, max: 5, step: 0.01 },
    ],
    result: (v, a) => {
      if (a.member === 'staff') return { headline: '25% tuition discount', lines: ['Editorial Staff: one 25% scholarship per department, if funds allow'], tone: 'success' };
      const c = num(v.coordinatorScore);
      const b = num(v.boardScore);
      if (c === null || b === null) return null;
      const rating = Math.round((c * 0.6 + b * 0.4) * 100) / 100;
      return { headline: `${vicissitudeDiscount(rating)}% tuition discount`, lines: [`Rating ${rating.toFixed(2)} = ${c.toFixed(2)} × 60% + ${b.toFixed(2)} × 40%`, 'Subject to available funds'], tone: 'success' };
    },
  },
  // No application: the ROTC Office adds each officer every semester.
  s10: {
    stepLabel: 'NROTC',
    intro: 'The amount depends on the officer’s rank in the 267th NROTCU.',
    questions: [
      { key: 'rank', label: 'Rank', type: 'select', options: ROTC_RANKS.map(r => ({ value: r.value, label: r.label })) },
      { key: 'activeDuty', label: 'Actively performs their assigned duties, including 20 duty hours a week', type: 'confirm' },
    ],
    documents: a => a.rank ? ['Recommendation from the Commandant and/or the ROTC Coordinator'] : [],
    award: { who: 'officer', detailsTitle: 'Rank', grant: 'assessment', messagePlaceholder: 'e.g. Congratulations on your rank! Your assistance is for this semester.' },
    numbersTitle: 'Amount for each rank',
    numbersHint: 'Used when adding an officer. Update the benefits above too so students see the same amounts.',
    numbers: ROTC_RANKS.map(r => ({ key: r.value, label: r.label, default: r.amount, min: 0, max: 500000, step: 1, kind: 'peso' as const })),
    approver: 'Commandant or ROTC Coordinator',
    assessmentTitle: 'Financial assistance',
    assessment: [
      { key: 'amount', label: 'Amount (₱)', hint: 'Filled from the rank; change it if the ROTC fund can’t cover it', type: 'number', min: 0, max: 100000, step: 1, defaultFrom: a => (a.rank ? rankAmount(String(a.rank)) : undefined) },
    ],
    result: (v, a) => {
      const rank = ROTC_RANKS.find(r => r.value === a.rank);
      const amount = num(v.amount) ?? (rank ? rankAmount(rank.value) : null);
      if (amount === null) return null;
      return { headline: peso(amount), lines: [rank ? `${rank.label}: ${peso(rankAmount(rank.value))} by the guidelines` : '', 'Subject to the availability of the ROTC fund'].filter(Boolean), tone: 'success' };
    },
  },
  s11: {
    stepLabel: 'Declarations',
    intro: 'The USG verifies your documents within 72 hours, then gives you an on-site submission schedule.',
    questions: [
      { key: 'noOtherScholarship', label: 'I have no other internal scholarship grant from DLSU-D or its benefactors', type: 'confirm' },
      { key: 'noMajorOffense', label: 'I have not been found guilty of any major offense', type: 'confirm' },
    ],
    approver: 'University Student Government',
    assessmentTitle: 'Verification',
    assessment: [
      { key: 'verified', label: 'Documents verified', type: 'bool' },
      { key: 'onsiteDate', label: 'On-site submission date', type: 'date' },
      { key: 'onsiteTime', label: 'Time', type: 'time' },
    ],
    numbersTitle: 'Rating for each discount',
    numbersHint: 'The lowest rating for each discount; below them, 25%. Update the benefits above too.',
    numbers: [
      { key: 'rating100', label: '100% discount from', default: 4.75, min: 1, max: 5, step: 0.01, kind: 'rating' },
      { key: 'rating75', label: '75% discount from', default: 4.5, min: 1, max: 5, step: 0.01, kind: 'rating' },
      { key: 'rating50', label: '50% discount from', default: 4.25, min: 1, max: 5, step: 0.01, kind: 'rating' },
    ],
    result: v => {
      if (!v.verified) return { headline: 'Not verified yet', lines: ['Verify within 72 hours. If a document is wrong, ask for it with “Needs revision”: the student has 2 days to resubmit.'], tone: 'warning' };
      return { headline: 'Verified', lines: [v.onsiteDate ? `On-site submission: ${formatDay(String(v.onsiteDate))}${v.onsiteTime ? `, ${formatTime(String(v.onsiteTime))}` : ''}` : 'Set the on-site submission schedule and tell the student in your decision message.'], tone: 'success' };
    },
  },
  s12: {
    stepLabel: 'Heraldo Filipino',
    intro: 'The Managing Director computes your scholarship points; the Editor in Chief and Publication Adviser validate them.',
    questions: [
      { key: 'position', label: 'Your position', type: 'select', options: HERALDO_POSITIONS },
      { key: 'publishedWorks', label: 'Published works this term', type: 'number', min: 0, max: 500 },
    ],
    approver: 'Editor in Chief and Publication Adviser',
    assessmentTitle: 'Scholarship points',
    assessment: [
      { key: 'evaluationScore', label: 'Evaluation score', hint: '0–100', type: 'number', min: 0, max: 100, step: 0.01 },
      { key: 'publishedWorks', label: 'Published works', type: 'number', min: 0, max: 500, step: 1, fromAnswer: 'publishedWorks' },
      { key: 'officeHours', label: 'Office hours rendered (%)', type: 'number', min: 0, max: 100, step: 0.01 },
      {
        key: 'merit', label: 'Merit points', type: 'choice', options: [
          { value: '3', label: '3' }, { value: '2', label: '2' }, { value: '1', label: '1' }, { value: '0', label: '0' }, { value: 'demerit', label: 'Under demerit' },
        ],
      },
    ],
    result: v => {
      const p = heraldoPoints(v);
      if (p.disqualified) return { headline: 'Disqualified', lines: ['An evaluation score below 60 disqualifies the staff member.'], tone: 'danger' };
      const parts: [string, number | null][] = [['Evaluation', p.evaluation], ['Published works', p.works], ['Office hours', p.hours], ['Merit points', p.merit]];
      const done = parts.filter(([, x]) => x !== null) as [string, number][];
      if (!done.length) return null;
      const total = done.reduce((n, [, x]) => n + x, 0);
      return {
        headline: `${total} of 20 points${done.length < 4 ? ' so far' : ''}`,
        lines: [done.map(([label, x]) => `${label} ${x}`).join(' · '), 'The discount is computed from the points by the Managing Director.'],
        tone: done.length < 4 ? 'neutral' : 'success',
      };
    },
  },
  s13: {
    stepLabel: 'CBAASG',
    intro: 'One scholar is chosen from each CBAA department. The CBAASG screens the applications, then interviews the shortlisted students.',
    questions: [
      { key: 'department', label: 'Your department', type: 'select', options: CBAA_DEPARTMENTS },
      { key: 'noOtherScholarship', label: 'I have no existing scholarship in the university', type: 'confirm' },
      { key: 'noMajorOffense', label: 'I have not committed any major offense', type: 'confirm' },
      TAX_EXEMPTION,
    ],
    documents: cbaasgDocuments,
    approver: 'Dean and Associate Dean of the CBAA',
    assessmentTitle: 'Interviews',
    assessment: CBAASG_INTERVIEWS,
    result: cbaasgInterviews,
  },
  s14: {
    stepLabel: 'CBAASG',
    intro: 'For members of the CBAASG Executive Board and Legislative Council. The CBAASG screens the applications, then interviews the shortlisted officers.',
    questions: [
      {
        key: 'branch', label: 'Your position is in the', type: 'choice', options: [
          { value: 'executive', label: 'Executive Board' },
          { value: 'legislative', label: 'Legislative Council' },
        ],
      },
      { key: 'position', label: 'Your position', type: 'text', max: 100, placeholder: 'e.g. Vice President for Finance' },
      { key: 'activeInvolvement', label: 'I am actively involved in the CBAASG', type: 'confirm' },
      { key: 'noMajorOffense', label: 'I have not committed any major offense', type: 'confirm' },
      TAX_EXEMPTION,
    ],
    documents: cbaasgDocuments,
    approver: 'Dean and Associate Dean of the CBAA',
    assessmentTitle: 'Interviews',
    assessment: CBAASG_INTERVIEWS,
    result: cbaasgInterviews,
  },
  s15: {
    stepLabel: 'Declarations',
    intro: 'The CICSSG confirms your application by email and books your interview.',
    questions: [
      { key: 'noMajorOffense', label: 'I have not been found guilty of any major offense in the Student Handbook, nor sanctioned with suspension', type: 'confirm' },
      { key: 'noAllowanceScholarship', label: 'I am not a recipient of a scholarship with allowances from any DLSU-D sector this academic year', type: 'confirm' },
    ],
    approver: 'CICS Student Government',
    assessmentTitle: 'Interview',
    assessment: [
      { key: 'interviewDate', label: 'Interview date', type: 'date' },
      { key: 'interviewTime', label: 'Time', type: 'time' },
    ],
    result: v => v.interviewDate
      ? { headline: 'Interview booked', lines: [`${formatDay(String(v.interviewDate))}${v.interviewTime ? `, ${formatTime(String(v.interviewTime))}` : ''}`, 'Email the booking to the student. They can reschedule up to one day before.'], tone: 'success' }
      : { headline: 'Not booked yet', lines: ['Confirm the application and book the interview, then email the student.'], tone: 'neutral' },
  },
  s16: {
    stepLabel: 'Declarations',
    intro: 'The CEATSG’s Director of Academics reviews your application; qualified applicants are invited to an interview by email.',
    questions: [
      { key: 'noConcurrentScholarship', label: 'I am not a recipient of any other internally funded scholarship this semester', type: 'confirm' },
    ],
    approver: 'CEATSG Director of Academics',
    assessmentTitle: 'Interview and grant',
    assessment: [
      { key: 'interviewDate', label: 'Interview date', type: 'date' },
      { key: 'interviewTime', label: 'Time', type: 'time' },
      { key: 'grant', label: 'Grant (₱)', hint: 'From the semester’s scholarship fund (set on the scholarship’s page)', type: 'number', min: 0, max: 5000000, step: 1 },
    ],
    result: v => {
      const grant = num(v.grant);
      const interview = v.interviewDate ? `Interview: ${formatDay(String(v.interviewDate))}${v.interviewTime ? `, ${formatTime(String(v.interviewTime))}` : ''}` : 'Interview not scheduled yet';
      if (grant === null) return { headline: v.interviewDate ? 'Interview scheduled' : 'Under review', lines: [interview], tone: 'neutral' };
      const fund = officeNumber('s16', 'fund');
      if (grant > fund) return { headline: peso(grant), lines: [interview, `More than the semester’s ${peso(fund)} fund.`], tone: 'warning' };
      return { headline: peso(grant), lines: [interview, `From the semester’s ${peso(fund)} scholarship fund; unused funds don’t carry over.`], tone: 'success' };
    },
    numbersTitle: 'Scholarship fund',
    numbersHint: 'Set aside each semester for all the grants. Update the benefits above too.',
    numbers: [{ key: 'fund', label: 'Fund each semester', default: 200000, min: 0, max: 5000000, step: 1, kind: 'peso' }],
  },
  s17: {
    stepLabel: 'CCJESG',
    intro: 'Up to 11 officers are chosen each semester. The grant depends on your position and your performance evaluation.',
    questions: [
      { key: 'position', label: 'Your position', type: 'select', options: CCJESG_POSITIONS.map(p => ({ value: p.value, label: p.label })) },
      { key: 'noViolation', label: 'I have no pending or confirmed violation at the college or university level', type: 'confirm' },
      { key: 'activeOfficer', label: 'I attend CCJESG events and meetings and comply with the CCJESG Office Logbook', type: 'confirm' },
    ],
    approver: 'CCJESG Adviser and the CCJE Dean',
    assessmentTitle: 'Interview and evaluation',
    assessment: [
      { key: 'interviewDate', label: 'Interview date', type: 'date' },
      { key: 'evaluationPassed', label: 'Passed the performance evaluation', type: 'bool' },
      { key: 'grant', label: 'Grant (₱)', hint: 'Up to the position’s cap, by performance and available funds', type: 'number', min: 0, max: 500000, step: 1 },
    ],
    numbersTitle: 'Most each position gets a semester',
    numbersHint: 'Used to check the grants. Update the benefits above too.',
    numbers: CCJESG_POSITIONS.map(p => ({ key: p.value, label: p.label, default: p.cap, min: 0, max: 500000, step: 1, kind: 'peso' as const })),
    result: (v, a) => {
      const position = CCJESG_POSITIONS.find(p => p.value === a.position);
      const capOf = (p: typeof position) => (p ? officeNumber('s17', p.value) : 0);
      const cap = position ? `${position.label}: up to ${peso(capOf(position))} a semester` : '';
      const grant = num(v.grant);
      if (v.evaluationPassed === false) return { headline: 'Didn’t pass the evaluation', lines: [cap].filter(Boolean), tone: 'danger' };
      if (grant === null) return { headline: v.interviewDate ? `Interview: ${formatDay(String(v.interviewDate))}` : 'Under review', lines: [cap, 'Credited at the end of the semester, after service and evaluation.'].filter(Boolean), tone: 'neutral' };
      const over = position && grant > capOf(position);
      return { headline: peso(grant), lines: [cap, over ? 'This is more than the position’s cap.' : 'Credited to the tuition account at the end of the semester.'].filter(Boolean), tone: over ? 'warning' : 'success' };
    },
  },
};

const formatDay = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${iso}T00:00:00Z`));
const formatTime = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

export const officeFormFor = (scholarshipId: string): OfficeForm | undefined => OFFICE_FORMS[scholarshipId];

// The questions asked for these answers (follow-ups only once relevant).
export const askedQuestions = (form: OfficeForm, answers: OfficeAnswers) =>
  form.questions.filter(q => !q.showIf || answers[q.showIf.key] === q.showIf.value);

// An answer as the office reads it ("A current varsity member").
export function answerText(q: OfficeQuestion, value: OfficeAnswers[string]): string {
  if (value === undefined || value === '') return '—';
  if (q.type === 'confirm') return value ? 'Yes' : 'No';
  return q.options?.find(o => o.value === value)?.label ?? String(value);
}
