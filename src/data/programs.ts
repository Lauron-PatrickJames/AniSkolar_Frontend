// DLSU-D undergraduate programs. A student picks one program; its course
// name, code and college (department) all come from here, so the three
// can't disagree. Mirrors data/programs.js in the backend, which validates
// the code — keep the two lists in sync.
//
// TO CONFIRM: assembled from the colleges' published offerings, not an
// official Registrar list. Have the Registrar or AdSO check the codes and
// names (and add any missing program) before students rely on it.

export interface Program {
  code: string;
  name: string;
  college: string;      // college code, e.g. 'CICS'
}

export const COLLEGES: Record<string, string> = {
  CBAA: 'College of Business Administration and Accountancy',
  CCJE: 'College of Criminal Justice Education',
  CEAT: 'College of Engineering, Architecture and Technology',
  CICS: 'College of Information and Computer Studies',
  CLAC: 'College of Liberal Arts and Communication',
  COEd: 'College of Education',
  COS: 'College of Science',
  CTHM: 'College of Tourism and Hospitality Management',
};

export const PROGRAMS: Program[] = [
  { code: 'BSA', name: 'BS Accountancy', college: 'CBAA' },
  { code: 'BSMA', name: 'BS Management Accounting', college: 'CBAA' },
  { code: 'BSBA-FM', name: 'BS Business Administration major in Financial Management', college: 'CBAA' },
  { code: 'BSBA-HRM', name: 'BS Business Administration major in Human Resource Management', college: 'CBAA' },
  { code: 'BSBA-MM', name: 'BS Business Administration major in Marketing Management', college: 'CBAA' },
  { code: 'BSBA-OM', name: 'BS Business Administration major in Operations Management', college: 'CBAA' },
  { code: 'BSEntrep', name: 'BS Entrepreneurship', college: 'CBAA' },
  { code: 'BSCrim', name: 'BS Criminology', college: 'CCJE' },
  { code: 'BSArch', name: 'BS Architecture', college: 'CEAT' },
  { code: 'BSCE', name: 'BS Civil Engineering', college: 'CEAT' },
  { code: 'BSCpE', name: 'BS Computer Engineering', college: 'CEAT' },
  { code: 'BSEE', name: 'BS Electrical Engineering', college: 'CEAT' },
  { code: 'BSECE', name: 'BS Electronics Engineering', college: 'CEAT' },
  { code: 'BSIE', name: 'BS Industrial Engineering', college: 'CEAT' },
  { code: 'BSME', name: 'BS Mechanical Engineering', college: 'CEAT' },
  { code: 'BSCS', name: 'BS Computer Science', college: 'CICS' },
  { code: 'BSIT', name: 'BS Information Technology', college: 'CICS' },
  { code: 'ABComm', name: 'AB Communication', college: 'CLAC' },
  { code: 'ABPhilo', name: 'AB Philosophy', college: 'CLAC' },
  { code: 'ABPolSci', name: 'AB Political Science', college: 'CLAC' },
  { code: 'BMMA', name: 'Bachelor of Multimedia Arts', college: 'CLAC' },
  { code: 'BSPsych', name: 'BS Psychology', college: 'CLAC' },
  { code: 'BEEd', name: 'Bachelor of Elementary Education', college: 'COEd' },
  { code: 'BPEd', name: 'Bachelor of Physical Education', college: 'COEd' },
  { code: 'BSEd-Eng', name: 'Bachelor of Secondary Education major in English', college: 'COEd' },
  { code: 'BSEd-Fil', name: 'Bachelor of Secondary Education major in Filipino', college: 'COEd' },
  { code: 'BSEd-Math', name: 'Bachelor of Secondary Education major in Mathematics', college: 'COEd' },
  { code: 'BSEd-Sci', name: 'Bachelor of Secondary Education major in Science', college: 'COEd' },
  { code: 'BSEd-SS', name: 'Bachelor of Secondary Education major in Social Studies', college: 'COEd' },
  { code: 'BSBio', name: 'BS Biology', college: 'COS' },
  { code: 'BSChem', name: 'BS Chemistry', college: 'COS' },
  { code: 'BSMath', name: 'BS Mathematics', college: 'COS' },
  { code: 'BSHM', name: 'BS Hospitality Management', college: 'CTHM' },
  { code: 'BSTM', name: 'BS Tourism Management', college: 'CTHM' },
];

export function findProgram(code?: string | null): Program | undefined {
  if (!code) return undefined;
  const c = code.trim().toLowerCase();
  return PROGRAMS.find(p => p.code.toLowerCase() === c);
}

export function collegeName(code?: string | null): string {
  return (code && COLLEGES[code]) || code || '';
}

export const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'];
