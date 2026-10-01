import { GrantEligibilityAnswers, Scholarship, StudentProfile } from '../types';

export function isEligible(scholarship: Scholarship, student: StudentProfile): boolean {
  const criteria = scholarship.eligibilityCriteria;
  if (!criteria) return true;

  if (criteria.yearLevels && !criteria.yearLevels.includes(student.yearLevel)) {
    return false;
  }

  const gpa = parseFloat(student.gpa as unknown as string);
  if (criteria.minGpa !== undefined && !isNaN(gpa) && gpa > criteria.minGpa) {
    return false;
  }

  return true;
}

export function getAvailableScholarships(all: Scholarship[], student: StudentProfile): Scholarship[] {
  return all.filter(s => s.status !== 'Closed' && isEligible(s, student));
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
