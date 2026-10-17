// The shared list every scholarship picks its eligibility rules and
// documents from, so the same requirement reads the same everywhere and
// scholarships can be compared side by side (the admin matrix and the
// students' Compare view). Keys are mirrored in the backend's
// data/requirementCatalog.js — keep the two in sync.
//
// A scholarship stores:
//   rules             EligibilityRules (below) — ticked rules + their values
//   customEligibility extra lines students read (not checked)
//   documentKeys      ticked catalog documents (the upload slots, in this order)
//   customDocuments   documents not on the list (also upload slots)
// and its `eligibility` / `requirements` text is generated from them
// (deriveScholarship in data/scholarships.ts).

export type ApplicantType = 'incoming' | 'continuing' | 'any';

export interface EligibilityRules {
  applicantType?: ApplicantType;
  minGpa?: number;              // upperclassmen GPA to apply (0.00–4.00)
  noFailingGrade?: boolean;
  minHsAverage?: number;        // incoming freshmen: high school general average (%)
  minUnits?: number;            // minimum unit load
  residencySemesters?: number;  // returnees / transferees: semesters of residency first
  filipino?: boolean;
  noBalance?: boolean;          // no unpaid or outstanding balance
}

export type RuleKey = keyof EligibilityRules;

interface RuleBase<K extends RuleKey> {
  key: K;
  label: string;                // row name in the matrix and editor
  // Checked against the student's profile (a warning, never a block).
  checked?: boolean;
}

export type RuleDef =
  | (RuleBase<'applicantType'> & { kind: 'choice' })
  | (RuleBase<'minGpa' | 'minHsAverage' | 'minUnits' | 'residencySemesters'> & { kind: 'number'; min: number; max: number; step: number; unit?: string; defaultValue: number })
  | (RuleBase<'noFailingGrade' | 'filipino' | 'noBalance'> & { kind: 'flag' });

export const APPLICANT_TYPE_LABELS: Record<ApplicantType, string> = {
  incoming: 'Incoming freshmen',
  continuing: 'Continuing students',
  any: 'Anyone',
};

// Shorter, for narrow matrix cells.
export const APPLICANT_TYPE_SHORT: Record<ApplicantType, string> = {
  incoming: 'Freshmen',
  continuing: 'Continuing',
  any: 'Anyone',
};

export const RULES: RuleDef[] = [
  { key: 'applicantType', label: 'Who can apply', kind: 'choice', checked: true },
  { key: 'minGpa', label: 'Minimum GPA (upperclassmen)', kind: 'number', min: 0, max: 4, step: 0.25, defaultValue: 2.5, checked: true },
  { key: 'noFailingGrade', label: 'No failing grades', kind: 'flag', checked: true },
  { key: 'minHsAverage', label: 'High school general average (freshmen)', kind: 'number', min: 60, max: 100, step: 1, unit: '%', defaultValue: 85 },
  { key: 'minUnits', label: 'Minimum unit load', kind: 'number', min: 1, max: 40, step: 1, unit: 'units', defaultValue: 18 },
  { key: 'residencySemesters', label: 'Residency for returnees and transferees', kind: 'number', min: 1, max: 8, step: 1, unit: 'sem', defaultValue: 1 },
  { key: 'filipino', label: 'Filipino citizen', kind: 'flag' },
  { key: 'noBalance', label: 'No unpaid balance', kind: 'flag' },
];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// The line students read for one ticked rule ('' for none).
export function ruleText(key: RuleKey, rules: EligibilityRules): string {
  const v = rules[key];
  if (v === undefined || v === false) return '';
  switch (key) {
    case 'applicantType':
      return v === 'incoming' ? 'Incoming freshmen only' : v === 'continuing' ? 'Continuing (upperclassmen) students only' : '';
    case 'minGpa': return `Upperclassmen: GPA of at least ${Number(v).toFixed(2)}`;
    case 'noFailingGrade': return 'No failing grades';
    case 'minHsAverage': return `Incoming freshmen: high school general average of at least ${v}%`;
    case 'minUnits': return `Enrolled in at least ${v} units, or as prescribed by the course curriculum`;
    case 'residencySemesters': return `Returnees and transferees: after ${plural(Number(v), 'semester', 'semesters')} of residency at DLSU-D`;
    case 'filipino': return 'Filipino citizen';
    case 'noBalance': return 'Upperclassmen: no unpaid or outstanding balance';
  }
}

// Short value for a matrix cell ('' = not required).
export function ruleCell(key: RuleKey, rules: EligibilityRules): string {
  const v = rules[key];
  if (v === undefined || v === false) return '';
  if (key === 'applicantType') return APPLICANT_TYPE_LABELS[v as ApplicantType];
  if (key === 'minGpa') return Number(v).toFixed(2);
  if (key === 'minHsAverage') return `${v}%`;
  if (key === 'minUnits') return String(v);
  if (key === 'residencySemesters') return `${v} sem`;
  return '✓';
}

export function ruleLines(rules: EligibilityRules = {}): string[] {
  return RULES.map(r => ruleText(r.key, rules)).filter(Boolean);
}

// --- Documents --------------------------------------------------------------

export interface DocumentDef {
  key: string;
  label: string;   // short name for the matrix and checklist
  text: string;    // what students read and upload against
}

// Texts follow the SFAG wording where it exists (its applications are
// stored against these labels).
export const DOCUMENTS: DocumentDef[] = [
  { key: 'applicationLetter', label: 'Application letter', text: 'Application Letter from parent/guardian addressed to the Admissions and Scholarship Office (AdSO)' },
  { key: 'parentLetter', label: 'Parent letter of financial need', text: 'Letter from parent/guardian supporting the need for financial assistance' },
  { key: 'recommendationLetter', label: 'Recommendation letter', text: 'One (1) Recommendation Letter from the guidance counselor, class adviser, subject teacher, or principal' },
  { key: 'personalEssay', label: 'Personal essay with 2x2 photo', text: 'Personal Essay with one (1) 2x2 photo taken within the last three months' },
  { key: 'photo2x2', label: '2x2 photo', text: '2x2 photo taken within the last three months' },
  { key: 'indigency', label: 'Certificate of indigency', text: 'Certificate of Indigency' },
  { key: 'incomeProof', label: 'ITR, non-filing, or OFW contract', text: 'Certificate of Income Tax Return (ITR), Affidavit of Non-Filing of ITR, or Employment Contract (for children of OFWs)' },
  { key: 'employmentCertificate', label: 'Parent certificate of employment', text: "Parent's certificate of employment" },
  { key: 'utilityBills', label: 'Utility bills', text: 'Recent utility bills (electric and water), saved in one (1) JPEG file' },
  { key: 'electricityBill', label: 'Electricity bill', text: 'Latest electricity bill' },
  { key: 'waterBill', label: 'Water bill', text: 'Latest water bill' },
  { key: 'residencePictures', label: 'Pictures of residence', text: 'Picture of Residence (indoor and outdoor view), saved in one (1) JPEG file' },
  { key: 'vicinityMap', label: 'Vicinity sketch map', text: 'Hand-drawn vicinity sketch map with contact information, starting from the most distinguishable barangay landmark to your home' },
  { key: 'psaBirthCertificate', label: 'PSA birth certificate', text: 'PSA birth certificate (printed on PSA security paper)' },
  { key: 'reportCard', label: 'Latest report card', text: 'Latest report card or certificate of grades' },
  { key: 'shsGrades', label: 'Senior high school grades', text: 'Photocopy of Senior HS grades / GPA for the last semester' },
  { key: 'grade12Card', label: 'Grade 12 report card', text: 'Photocopy of Grade 12 report card' },
  { key: 'rankingCertificate', label: 'Certificate of ranking', text: 'Certificate of Ranking indicating the number of graduates' },
  { key: 'entranceTestResult', label: 'Entrance test result', text: 'DLSU-D entrance test result' },
  { key: 'honorsActivities', label: 'Honors and activities', text: 'Honors/awards/recognition and extracurricular activities in Senior High School' },
  { key: 'proofOfRelation', label: 'Proof of relation', text: 'Proof of relation with the alumnus/alumna' },
  { key: 'polcaForm', label: 'POLCA application form', text: 'Accomplished POLCA application form' },
  { key: 'evaluationSheet', label: 'POLCA evaluation sheet', text: 'Accomplished 7-page evaluation sheet' },
  { key: 'alumniForm', label: 'Alumni application form', text: 'Accomplished alumni scholarship application form' },
];

const DOCUMENT_BY_KEY = new Map(DOCUMENTS.map(d => [d.key, d]));

export function documentDef(key: string): DocumentDef | undefined {
  return DOCUMENT_BY_KEY.get(key);
}

// Upload slots / requirement lines: ticked catalog documents in catalog
// order, then the custom ones.
export function documentTexts(keys: string[] = [], custom: string[] = []): string[] {
  const ticked = new Set(keys);
  return [...DOCUMENTS.filter(d => ticked.has(d.key)).map(d => d.text), ...custom];
}

export const RULE_LIMITS = { customLines: 30, customLineLength: 500 };

// Rules a scholarship's own application form already checks in code
// (POLCA's 85 average, POLCA and Alumni being for incoming freshmen), so
// they can't be changed from the editor or the matrix.
export function lockedRules(formType: string | undefined): RuleKey[] {
  if (formType === 'polca') return ['applicantType', 'minHsAverage'];
  if (formType === 'alumni') return ['applicantType'];
  return [];
}

// Documents a scholarship can tick in the checklist: the form-generated
// ones (POLCA / Alumni application forms) and the per-form photo and bill
// slots aren't offered.
export const TICKABLE_DOCUMENTS = DOCUMENTS.filter(d => !['polcaForm', 'evaluationSheet', 'alumniForm', 'photo2x2', 'electricityBill', 'waterBill'].includes(d.key));

// Rows for a comparison table: the catalog documents any of the given
// scholarships uses, in catalog order, then every custom document.
export function documentRows(items: { documentKeys?: string[]; customDocuments?: string[] }[]): { key: string; label: string; custom: boolean }[] {
  const used = new Set(items.flatMap(i => i.documentKeys ?? []));
  const custom = [...new Set(items.flatMap(i => i.customDocuments ?? []))];
  return [
    ...DOCUMENTS.filter(d => used.has(d.key)).map(d => ({ key: d.key, label: d.label, custom: false })),
    ...custom.map(text => ({ key: `custom:${text}`, label: text, custom: true })),
  ];
}

// Whether a scholarship asks for a document row from documentRows().
export function hasDocument(item: { documentKeys?: string[]; customDocuments?: string[] }, rowKey: string): boolean {
  return rowKey.startsWith('custom:')
    ? (item.customDocuments ?? []).includes(rowKey.slice(7))
    : (item.documentKeys ?? []).includes(rowKey);
}
