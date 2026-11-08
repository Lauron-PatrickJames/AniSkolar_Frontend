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

// Words that belong to the surname that follows them ("dela Cruz", "San Jose").
const SURNAME_PARTICLES = new Set(['de', 'del', 'dela', 'delas', 'delos', 'di', 'da', 'du', 'la', 'las', 'los', 'san', 'santa', 'sta', 'sta.', 'sto', 'sto.', 'van', 'von', 'mac', 'mc']);

// The DLSU-D Microsoft directory sends only the first word as the first
// name and puts the other given names into the surname ("JUAN" +
// "MIGUEL DELA CRUZ"). The username starts with the surname's initial
// (dja1234 = Dela Cruz, Juan, A…), so the surname is the shortest ending
// of the last name that starts with that letter, with any particle before
// it ("dela Cruz"). When that doesn't fit — the first name already has
// several words (corrected by hand), one-word last name, no match — the
// names are returned unchanged. The student still confirms them.
// Mirrors splitDirectoryName in the backend (routes/students.js).
export function splitDirectoryName(first: string, last: string, email: string): { firstName: string; lastName: string } {
  const f = (first ?? '').trim().replace(/\s+/g, ' ');
  const l = (last ?? '').trim().replace(/\s+/g, ' ');
  const initial = (email ?? '').trim().charAt(0).toLowerCase();
  const words = l.split(' ').filter(Boolean);
  if (!f || f.includes(' ') || words.length < 2 || !/[a-z]/.test(initial)) return { firstName: f, lastName: l };
  for (let i = words.length - 1; i >= 1; i--) {
    if (words[i].charAt(0).toLowerCase() !== initial) continue;
    let start = i;
    while (start > 1 && SURNAME_PARTICLES.has(words[start - 1].toLowerCase())) start--;
    return { firstName: [f, ...words.slice(0, start)].join(' '), lastName: words.slice(start).join(' ') };
  }
  return { firstName: f, lastName: l };
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
