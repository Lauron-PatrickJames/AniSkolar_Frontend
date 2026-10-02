import { StudentProfile } from '../types';

// A student's name parts as stored on their profile: first and last from
// their university (Clerk/Microsoft) account, middle as they entered it.
// Never split `name` to guess these — "Patrick James Lauron" can't tell us
// whether "James" is part of the first or the last name.
export function profileNameParts(student: Pick<StudentProfile, 'firstName' | 'middleName' | 'lastName'>) {
  return {
    firstName: (student.firstName ?? '').trim(),
    middleName: (student.middleName ?? '').trim(),
    lastName: (student.lastName ?? '').trim()
  };
}

// "Santos" → "S." for forms that ask for a middle initial.
export function middleInitialOf(middleName: string): string {
  const first = middleName.trim().charAt(0);
  return first ? `${first.toUpperCase()}.` : '';
}
