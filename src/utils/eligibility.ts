import { GpaRequirement, GrantEligibilityAnswers, Scholarship, StudentProfile } from '../types';

// Hides scholarships the student can't take at all (e.g. freshman-only
// grants for upperclassmen). GPA rules don't hide anything: the profile
// GPA may be out of date, so a low one is shown as a warning instead
// (profileGpaWarning).
export function isEligible(scholarship: Scholarship, student: StudentProfile): boolean {
  const criteria = scholarship.eligibilityCriteria;
  if (!criteria) return true;

  if (criteria.yearLevels && !criteria.yearLevels.includes(student.yearLevel)) {
    return false;
  }

  return true;
}

export function getAvailableScholarships(all: Scholarship[], student: StudentProfile): Scholarship[] {
  return all.filter(s => s.status !== 'Closed' && isEligible(s, student));
}

// --- GPA rules ------------------------------------------------------------------
// DLSU-D grades run 0.00–4.00, higher is better; 0.00 is a failing grade.
// Used by the GPA calculator (what-if, from the grades entered) and by
// Explore / the dashboard (from the GPA in the student's profile).

export const FAILING_GRADE = 0;

export interface GpaFigures {
  gpa?: number | null;
  lowestGrade?: number | null;  // unknown for the profile GPA
}

export type GpaCheckStatus = 'meets' | 'below' | 'unknown' | 'not-applicable';

export interface GpaCheck {
  status: GpaCheckStatus;
  // Why it falls short (status 'below').
  reasons: string[];
}

export function toGpaNumber(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

// Upperclassmen; a missing year level counts as continuing so the rule
// still shows.
export function isContinuingStudent(student: Pick<StudentProfile, 'yearLevel'>): boolean {
  return !/^1st/i.test(student.yearLevel ?? '');
}

export function describeGpaRequirement(req: GpaRequirement): string {
  const parts: string[] = [];
  if (req.minGpa !== undefined) parts.push(`GPA of at least ${req.minGpa.toFixed(2)}`);
  if (req.minGrade !== undefined) parts.push(`no grade lower than ${req.minGrade.toFixed(2)}`);
  if (req.noFailingGrade && req.minGrade === undefined) parts.push('no failing grade');
  const text = parts.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function checkGpaRequirement(req: GpaRequirement, figures: GpaFigures, opts: { continuing?: boolean } = {}): GpaCheck {
  if (req.continuingOnly && opts.continuing === false) return { status: 'not-applicable', reasons: [] };
  const gpa = toGpaNumber(figures.gpa);
  const lowest = toGpaNumber(figures.lowestGrade);
  const reasons: string[] = [];
  let unknown = false;

  if (req.minGpa !== undefined) {
    if (gpa === null) unknown = true;
    else if (gpa < req.minGpa) reasons.push(`GPA ${gpa.toFixed(2)} is below the ${req.minGpa.toFixed(2)} minimum`);
  }
  if (req.minGrade !== undefined) {
    if (lowest === null) unknown = true;
    else if (lowest < req.minGrade) reasons.push(`a grade of ${lowest.toFixed(2)} is below the ${req.minGrade.toFixed(2)} floor`);
  }
  if (req.noFailingGrade && req.minGrade === undefined) {
    if (lowest === null) unknown = true;
    else if (lowest <= FAILING_GRADE) reasons.push('there is a failing grade');
  }

  if (reasons.length) return { status: 'below', reasons };
  return { status: unknown ? 'unknown' : 'meets', reasons: [] };
}

// The GPA a grantee must keep each semester, or undefined. Pre-fills the
// minimum GPA when the AdSO opens a renewal period.
export function retentionMinGpa(scholarship: Pick<Scholarship, 'gpaRequirement'>): number | undefined {
  const req = scholarship.gpaRequirement;
  return req && (req.stage === 'keep' || req.keepToo) ? req.minGpa : undefined;
}

// A short warning when the profile GPA is below what a scholarship needs to
// apply, or null. Only the GPA is known here, not individual grades.
export function profileGpaWarning(scholarship: Scholarship, student: StudentProfile): string | null {
  const req = scholarship.gpaRequirement;
  if (!req || req.stage !== 'apply' || req.minGpa === undefined) return null;
  const gpa = toGpaNumber(student.gpa);
  if (gpa === null) return null;
  const check = checkGpaRequirement({ ...req, minGrade: undefined, noFailingGrade: false }, { gpa }, { continuing: isContinuingStudent(student) });
  return check.status === 'below' ? `Your profile GPA (${gpa.toFixed(2)}) is below the ${req.minGpa.toFixed(2)} minimum.` : null;
}

// Apply-time rules — the ones that need answers the profile doesn't have
// (HS grades, board-member relation, alumni relation). Returns the reasons
// the applicant doesn't qualify; an empty list means eligible. Retention
// conditions are never checked here. The backend re-checks the same rules
// on submit (utils/grantForms.js).
export function checkApplyEligibility(scholarship: Scholarship, answers: GrantEligibilityAnswers): string[] {
  const criteria = scholarship.eligibilityCriteria;
  if (!criteria) return [];
  const reasons: string[] = [];

  if (criteria.minHsGeneralAverage !== undefined) {
    const avg = answers.hsGeneralAverage;
    if (typeof avg === 'number' && avg < criteria.minHsGeneralAverage) {
      reasons.push(`A high school general average of at least ${criteria.minHsGeneralAverage} is required.`);
    }
  }
  if (criteria.minHsSubjectGrade !== undefined) {
    const lowest = answers.lowestHsGrade;
    if (typeof lowest === 'number' && lowest < criteria.minHsSubjectGrade) {
      reasons.push(`No high school grade may be below ${criteria.minHsSubjectGrade} (no grade in the 70s).`);
    }
  }
  if (criteria.requiresNoBoardRelation && answers.notRelatedToBoardMember !== true) {
    reasons.push('Applicants must not be related by consanguinity to any current board member.');
  }
  if (criteria.alumniRelation) {
    const { relationships, institutions } = criteria.alumniRelation;
    if (answers.relationship && !relationships.includes(answers.relationship)) {
      reasons.push('The alumnus/alumna must be related to you up to the 2nd degree of consanguinity.');
    }
    if (answers.institution && !institutions.includes(answers.institution)) {
      reasons.push(`The alumnus/alumna must have graduated from ${institutions.join(', ')}.`);
    }
  }

  return reasons;
}
