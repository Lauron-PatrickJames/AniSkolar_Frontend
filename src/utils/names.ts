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

// Names are often stored in capitals ("JUAN DELA CRUZ"). Shows them in title
// case; a name typed in mixed case ("Juan de la Cruz") is kept as typed.
// For display only: keep the raw value for storage, search and exports.
export function titleCaseName(raw: string): string {
  const s = (raw ?? '').trim().replace(/\s+/g, ' ');
  const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (!letters || (letters !== letters.toUpperCase() && letters !== letters.toLowerCase())) return s;
  return s
    .toLowerCase()
    .replace(/(^|[\s\-'’(])([a-zà-ÿ])/g, (_m, before: string, ch: string) => before + ch.toUpperCase())
    .replace(/\b(Ii|Iii|Iv|Vi|Vii|Viii)\b/g, m => m.toUpperCase());
}

// "Patrick James Secuya Lauron" in title case, from the name parts (first,
// middle, last); falls back to the stored full name for older records.
export function displayName(student: Pick<StudentProfile, 'firstName' | 'middleName' | 'lastName' | 'name'>): string {
  const { firstName, middleName, lastName } = profileNameParts(student);
  const joined = [firstName, middleName, lastName].filter(Boolean).join(' ');
  return titleCaseName(joined || student.name || '');
}

// Up to two initials for an avatar placeholder.
export function nameInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

// "Santos" → "S." for forms that ask for a middle initial.
export function middleInitialOf(middleName: string): string {
  const first = middleName.trim().charAt(0);
  return first ? `${first.toUpperCase()}.` : '';
}
