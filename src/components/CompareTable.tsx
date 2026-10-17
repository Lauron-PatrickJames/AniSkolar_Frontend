import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, CheckCircle2, Info, Minus, Plus, X } from 'lucide-react';
import { Scholarship, StudentProfile } from '../types';
import { acceptsOnlineApplications } from '../data/scholarships';
import {
  APPLICANT_TYPE_LABELS, EligibilityRules, RULES, RuleDef, RuleKey, documentRows, hasDocument
} from '../data/requirementCatalog';
import { isContinuingStudent, toGpaNumber } from '../utils/eligibility';

// Students' side-by-side comparison of up to four scholarships: who can
// apply (with a "you meet this" hint where the profile can tell), the
// other conditions, and the documents to upload. Built from the same
// shared list as the AdSO's requirements matrix.

const MAX = 4;

type Fit = 'meets' | 'misses' | null;

// Whether the student's profile meets a rule, where it can tell.
function fitFor(key: RuleKey, rules: EligibilityRules, student: StudentProfile): Fit {
  const continuing = isContinuingStudent(student);
  if (key === 'applicantType') {
    if (!rules.applicantType || rules.applicantType === 'any') return 'meets';
    return (rules.applicantType === 'continuing') === continuing ? 'meets' : 'misses';
  }
  if (key === 'minGpa' && rules.minGpa !== undefined) {
    if (!continuing) return null;          // freshmen qualify by their HS average
    const gpa = toGpaNumber(student.gpa);
    if (gpa === null) return null;
    return gpa >= rules.minGpa ? 'meets' : 'misses';
  }
  return null;
}

// What a cell says for one rule ('' = not required).
function valueText(def: RuleDef, rules: EligibilityRules): string {
  const v = rules[def.key];
  if (v === undefined || v === false) return '';
  switch (def.key) {
    case 'applicantType': return APPLICANT_TYPE_LABELS[v as keyof typeof APPLICANT_TYPE_LABELS];
    case 'minGpa': return `GPA ${Number(v).toFixed(2)} or higher`;
    case 'minHsAverage': return `${v}% or higher`;
    case 'minUnits': return `At least ${v} units`;
    case 'residencySemesters': return `After ${v} ${Number(v) === 1 ? 'semester' : 'semesters'}`;
    default: return 'Required';
  }
}

function defaultSelection(list: Scholarship[]): string[] {
  const preferred = list.filter(s => acceptsOnlineApplications(s) && s.status !== 'Closed');
  return (preferred.length >= 2 ? preferred : list).slice(0, 3).map(s => s.id);
}

export default function CompareTable({ scholarships, student, onViewDetails }: {
  scholarships: Scholarship[];
  student: StudentProfile;
  onViewDetails: (id: string) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => defaultSelection(scholarships));
  const [onlyDifferences, setOnlyDifferences] = useState(false);

  // Keep what's still listed after a search or filter; start over if none is.
  useEffect(() => {
    setSelectedIds(prev => {
      const kept = prev.filter(id => scholarships.some(s => s.id === id));
      return kept.length ? kept : defaultSelection(scholarships);
    });
  }, [scholarships]);

  const selected = useMemo(
    () => selectedIds.map(id => scholarships.find(s => s.id === id)).filter((s): s is Scholarship => !!s),
    [selectedIds, scholarships]
  );
  const toggle = (id: string) => setSelectedIds(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : prev.length >= MAX ? prev : [...prev, id]
  );

  // Rule rows some selected scholarship uses (who can apply always shows).
  const ruleRows = RULES.filter(def => def.key === 'applicantType' || selected.some(s => valueText(def, s.rules ?? {})))
    .filter(def => !onlyDifferences || new Set(selected.map(s => valueText(def, s.rules ?? {}))).size > 1);
  const online = selected.filter(acceptsOnlineApplications);
  const docRows = documentRows(online)
    .filter(row => !onlyDifferences || new Set(online.map(s => hasDocument(s, row.key))).size > 1 || online.length < selected.length);
  const conditionsDiffer = new Set(selected.map(s => (s.customEligibility ?? []).join('|'))).size > 1;
  const showConditions = selected.some(s => (s.customEligibility ?? []).length) && (!onlyDifferences || conditionsDiffer);

  const LABEL = 'sticky left-0 z-10 bg-white px-4 py-3 text-left align-top text-xs font-semibold text-slate-600 border-b border-slate-100';
  const CELL = 'px-4 py-3 align-top border-b border-slate-100 text-xs text-slate-700';
  const section = (title: string, count?: number) => (
    <tr>
      <th scope="colgroup" className="sticky left-0 z-10 bg-slate-50 px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
        {title}{count !== undefined && <span className="ml-1 font-semibold normal-case tracking-normal text-slate-400">({count})</span>}
      </th>
      <td colSpan={selected.length} className="bg-slate-50 border-b border-slate-200" />
    </tr>
  );
  const notRequired = <span className="inline-flex items-center gap-1 text-slate-400"><Minus className="w-3.5 h-3.5" aria-hidden />Not required</span>;

  return (
    <div className="space-y-4">
      {/* Picker */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold text-slate-700">
            Compare up to {MAX} scholarships <span className="font-semibold text-slate-400">· {selected.length} selected</span>
          </p>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={onlyDifferences} onChange={e => setOnlyDifferences(e.target.checked)} className="w-4 h-4 accent-brand-green" />
            Only show what's different
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {scholarships.map(s => {
            const on = selectedIds.includes(s.id);
            const full = !on && selectedIds.length >= MAX;
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={on}
                disabled={full}
                title={full ? `Remove one to add another (up to ${MAX}).` : undefined}
                onClick={() => toggle(s.id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green/30 ${
                  on ? 'border-brand-green bg-brand-green/10 text-brand-green-dark' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 disabled:opacity-40 disabled:hover:border-slate-200'
                }`}
              >
                {on ? <Check className="w-3.5 h-3.5" aria-hidden /> : <Plus className="w-3.5 h-3.5" aria-hidden />}
                {s.name}
              </button>
            );
          })}
        </div>
      </div>

      {selected.length === 0 ? (
        <div className="text-center py-14 bg-white border border-slate-200 rounded-xl">
          <Info className="w-10 h-10 text-slate-300 mx-auto mb-3" aria-hidden />
          <p className="font-display font-bold text-slate-700">Pick scholarships to compare</p>
          <p className="text-xs text-slate-400 mt-1">Choose two or more above.</p>
        </div>
      ) : (
        <div className="w-fit max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto overscroll-x-contain">
            <table className="border-separate border-spacing-0" aria-label="Compare scholarships">
              <colgroup>
                <col className="w-36 sm:w-44" />
                {selected.map(s => <col key={s.id} className="w-64" />)}
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-20 bg-white px-4 py-4 text-left align-bottom border-b border-slate-200">
                    <span className="sr-only">Requirement</span>
                  </th>
                  {selected.map(s => {
                    const isOnline = acceptsOnlineApplications(s);
                    const docs = documentRows([s]).length;
                    return (
                      <th key={s.id} scope="col" className="w-64 min-w-56 px-4 py-4 text-left align-top border-b border-slate-200 font-normal">
                        <div className="flex items-start justify-between gap-2">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{s.category}</span>
                          <button type="button" onClick={() => toggle(s.id)} aria-label={`Remove ${s.name} from the comparison`} className="-m-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                            <X className="w-3.5 h-3.5" aria-hidden />
                          </button>
                        </div>
                        <p className="mt-2 font-display text-sm font-bold leading-snug text-slate-900">{s.name}</p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {isOnline
                            ? <><span className={s.status === 'Closed' ? 'text-slate-400' : 'text-emerald-700 font-semibold'}>{s.status}</span> · {docs} {docs === 1 ? 'document' : 'documents'}</>
                            : 'Info only'}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-400 line-clamp-2" title={s.deadline}>{s.deadline}</p>
                        <button type="button" onClick={() => onViewDetails(s.id)} className="mt-3 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:border-brand-green hover:text-brand-green">
                          View details
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {(ruleRows.length > 0 || showConditions) && section('Who can apply')}
                {ruleRows.map(def => (
                  <tr key={def.key}>
                    <th scope="row" className={LABEL}>{def.label}</th>
                    {selected.map(s => {
                      const rules = s.rules ?? {};
                      const text = valueText(def, rules) || (def.key === 'applicantType' ? APPLICANT_TYPE_LABELS.any : '');
                      const fit = text ? fitFor(def.key, rules, student) : null;
                      return (
                        <td key={s.id} className={CELL}>
                          {!text ? notRequired : (
                            <>
                              <span className="font-semibold text-slate-800">{text}</span>
                              {fit === 'meets' && (
                                <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden />You meet this
                                </span>
                              )}
                              {fit === 'misses' && (
                                <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                                  <AlertCircle className="w-3.5 h-3.5" aria-hidden />
                                  {def.key === 'minGpa' ? `Your GPA is ${toGpaNumber(student.gpa)?.toFixed(2)}` : 'Not for your year level'}
                                </span>
                              )}
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {showConditions && (
                  <tr>
                    <th scope="row" className={LABEL}>Other conditions</th>
                    {selected.map(s => (
                      <td key={s.id} className={CELL}>
                        {(s.customEligibility ?? []).length === 0 ? notRequired : (
                          <ul className="space-y-1.5">
                            {s.customEligibility!.map(line => (
                              <li key={line} className="flex gap-1.5">
                                <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                                <span className="line-clamp-4" title={line}>{line}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    ))}
                  </tr>
                )}

                {docRows.length > 0 && section('Documents to upload', docRows.length)}
                {docRows.map((row, i) => (
                  <tr key={row.key}>
                    <th scope="row" className={`${LABEL} font-medium`} title={row.label}>
                      <span className="line-clamp-2">{row.label}</span>
                    </th>
                    {selected.map(s => {
                      if (!acceptsOnlineApplications(s)) {
                        // One cell down the whole documents section.
                        return i === 0 ? (
                          <td key={s.id} rowSpan={docRows.length} className={`${CELL} bg-slate-50/60`}>
                            <p className="font-semibold text-slate-600">No online application</p>
                            {s.availNote && <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{s.availNote}</p>}
                          </td>
                        ) : null;
                      }
                      return (
                        <td key={s.id} className={CELL}>
                          {hasDocument(s, row.key)
                            ? <span className="inline-flex items-center gap-1 font-semibold text-brand-green"><Check className="w-4 h-4" aria-hidden />Upload</span>
                            : notRequired}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {onlyDifferences && ruleRows.length === 0 && !showConditions && docRows.length === 0 && (
                  <tr><td colSpan={selected.length + 1} className="px-4 py-8 text-center text-xs text-slate-500">These scholarships ask for the same things.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
