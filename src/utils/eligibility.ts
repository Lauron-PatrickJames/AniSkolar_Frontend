import { Scholarship, StudentProfile } from '../types';

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