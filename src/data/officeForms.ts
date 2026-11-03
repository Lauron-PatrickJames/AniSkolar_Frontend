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
}

export interface AssessmentResult {
  headline: string;     // e.g. "75% tuition discount"
  lines: string[];      // how it was worked out
  tone: 'success' | 'warning' | 'danger' | 'neutral';
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
  // Who decides, shown to students and on the approve button.
  approver: string;
  assessmentTitle: string;
  assessment: AssessmentField[];
  result: (values: OfficeAnswers, answers: OfficeAnswers) => AssessmentResult | null;
}

const num = (v: unknown) => (v === undefined || v === null || v === '' ? null : Number(v));
const peso = (n: number) => `₱${n.toLocaleString('en-PH')}`;

const SPORTS = ['Basketball', 'Volleyball', 'Athletics (track and field)', 'Badminton', 'Table tennis', 'Swimming', 'Chess'];

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
  if (rating >= 4.75) return 100;
  if (rating >= 4.5) return 75;
  if (rating >= 4.25) return 50;
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
  s10: {
    stepLabel: 'NROTC',
    intro: 'The amount depends on your rank in the 267th NROTCU.',
    questions: [
      { key: 'rank', label: 'Your rank', type: 'select', options: ROTC_RANKS.map(r => ({ value: r.value, label: r.label })) },
      { key: 'activeDuty', label: 'I actively perform my assigned duties, including 20 duty hours a week in the 267th NROTCU', type: 'confirm' },
    ],
    approver: 'Commandant / ROTC Coordinator',
    assessmentTitle: 'Financial assistance',
    assessment: [
      { key: 'amount', label: 'Amount (₱)', hint: 'Filled from the rank; change it if the ROTC fund can’t cover it', type: 'number', min: 0, max: 100000, step: 1 },
    ],
    result: (v, a) => {
      const rank = ROTC_RANKS.find(r => r.value === a.rank);
      const amount = num(v.amount) ?? rank?.amount ?? null;
      if (amount === null) return null;
      return { headline: peso(amount), lines: [rank ? `${rank.label}: ${peso(rank.amount)} by the guidelines` : '', 'Subject to the availability of the ROTC fund'].filter(Boolean), tone: 'success' };
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
