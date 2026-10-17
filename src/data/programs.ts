// DLSU-D undergraduate programs. A student picks one program; its course
// name, code and college (department) all come from here, so the three
// can't disagree. Mirrors data/programs.js in the backend, which validates
// the code — keep the two lists in sync.
//
// Source: the DLSU-D "All Programs" page (dlsud.edu.ph/all-programs),
// October 2026. The site lists Secondary Education without majors; the
// majors are kept here on purpose. Codes are AniSkolar's own.

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
  { code: 'BSA', name: 'Bachelor of Science in Accountancy', college: 'CBAA' },
  { code: 'BSMA', name: 'Bachelor of Science in Management Accounting', college: 'CBAA' },
  { code: 'BSEntrep', name: 'Bachelor of Science in Entrepreneurship', college: 'CBAA' },
  { code: 'BSBA-BOM', name: 'BSBA Major in Business and Operations Management', college: 'CBAA' },
  { code: 'BSBA-BE', name: 'BSBA Major in Business Economics', college: 'CBAA' },
  { code: 'BSBA-HRD', name: 'BSBA Major in Human Resource Development', college: 'CBAA' },
  { code: 'BSBA-MM', name: 'BSBA Major in Marketing Management', college: 'CBAA' },
  { code: 'BSBA-MM-IMC', name: 'BSBA Major in Marketing Management with Specialization in Integrated Marketing Communications', college: 'CBAA' },
  { code: 'BSCrim', name: 'Bachelor of Science in Criminology', college: 'CCJE' },
  { code: 'BFS', name: 'Bachelor of Forensic Science', college: 'CCJE' },
  { code: 'BSArch', name: 'Bachelor of Science in Architecture', college: 'CEAT' },
  { code: 'BSCE', name: 'Bachelor of Science in Civil Engineering', college: 'CEAT' },
  { code: 'BSCpE', name: 'Bachelor of Science in Computer Engineering', college: 'CEAT' },
  { code: 'BSEE', name: 'Bachelor of Science in Electrical Engineering', college: 'CEAT' },
  { code: 'BSECE', name: 'Bachelor of Science in Electronics Engineering', college: 'CEAT' },
  { code: 'BSIE', name: 'Bachelor of Science in Industrial Engineering', college: 'CEAT' },
  { code: 'BSME', name: 'Bachelor of Science in Mechanical Engineering', college: 'CEAT' },
  { code: 'BMMA', name: 'Bachelor of Multimedia Arts', college: 'CEAT' },
  { code: 'BSCS', name: 'Bachelor of Science in Computer Science', college: 'CICS' },
  { code: 'BSIT', name: 'Bachelor of Science in Information Technology', college: 'CICS' },
  { code: 'ABComm', name: 'Bachelor of Arts in Communication', college: 'CLAC' },
  { code: 'ABDMJ', name: 'Bachelor of Arts in Digital and Multimedia Journalism', college: 'CLAC' },
  { code: 'ABID', name: 'Bachelor of Arts in International Development', college: 'CLAC' },
  { code: 'ABPolSci', name: 'Bachelor of Arts in Political Science', college: 'CLAC' },
  { code: 'ABPsych', name: 'Bachelor of Arts in Psychology', college: 'CLAC' },
  { code: 'BSPsych', name: 'Bachelor of Science in Psychology', college: 'CLAC' },
  { code: 'BECEd', name: 'Bachelor of Early Childhood Education', college: 'COEd' },
  { code: 'BSNEd', name: 'Bachelor of Special Needs Education', college: 'COEd' },
  { code: 'BSEd-Eng', name: 'Bachelor of Secondary Education major in English', college: 'COEd' },
  { code: 'BSEd-Fil', name: 'Bachelor of Secondary Education major in Filipino', college: 'COEd' },
  { code: 'BSEd-Math', name: 'Bachelor of Secondary Education major in Mathematics', college: 'COEd' },
  { code: 'BSEd-Sci', name: 'Bachelor of Secondary Education major in Science', college: 'COEd' },
  { code: 'BSEd-SS', name: 'Bachelor of Secondary Education major in Social Studies', college: 'COEd' },
  { code: 'BSBio', name: 'Bachelor of Science in Biology', college: 'COS' },
  { code: 'BSAM', name: 'Bachelor of Science in Applied Mathematics', college: 'COS' },
  { code: 'BSITM', name: 'Bachelor of Science in International Tourism Management', college: 'CTHM' },
  { code: 'BSIHM', name: 'BS International Hospitality Management with Specialization in Culinary & Food Service Administration', college: 'CTHM' },
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
