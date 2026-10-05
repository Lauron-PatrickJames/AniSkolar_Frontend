import React, { useState, useEffect, useMemo } from 'react';
import { Calculator, Plus, Trash2, RotateCcw, Info, AlertCircle, Copy, Check, Award, CheckCircle, ChevronRight, Loader2, Save } from 'lucide-react';
import { Application, ProfileChanges, SaveResult, Scholarship, StudentProfile } from '../../types';
import { acceptsOnlineApplications } from '../../data/scholarships';
import { GpaCheck, checkGpaRequirement, describeGpaRequirement, isContinuingStudent, toGpaNumber } from '../../utils/eligibility';

interface CourseEntry {
  id: string;
  name: string;
  units: string;
  grade: string;
}

function makeEmptyCourse(): CourseEntry {
  return {
    id: `course_${Math.random().toString(36).substr(2, 9)}`,
    name: '',
    units: '3',
    grade: '4.0'
  };
}

// --- Draft persistence (survives refresh, scoped per logged-in student) ---
// Keyed by student number so switching accounts never shows someone
// else's course list — mirrors the same pattern used for scholarship
// application drafts. GPA itself is no longer stored — it's derived live
// from the course list, so there's nothing to go stale.

const GPA_DRAFT_PREFIX = 'aniskolar_gpa_calculator_draft_';

function getGpaDraftKey(studentNumber: string) {
  return `${GPA_DRAFT_PREFIX}${studentNumber}`;
}

interface GpaDraft {
  courses: CourseEntry[];
}

function loadGpaDraft(studentNumber: string): GpaDraft | null {
  try {
    const raw = localStorage.getItem(getGpaDraftKey(studentNumber));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.courses) || parsed.courses.length === 0) return null;
    return { courses: parsed.courses };
  } catch {
    return null;
  }
}

function clearGpaDraft(studentNumber: string) {
  try {
    localStorage.removeItem(getGpaDraftKey(studentNumber));
  } catch {
    // ignore
  }
}

// --- Validation --------------------------------------------------------
const MAX_UNITS = 15;
const MIN_UNITS = 0.5;

function isValidUnits(value: string): boolean {
  const n = parseFloat(value);
  return !isNaN(n) && n >= MIN_UNITS && n <= MAX_UNITS;
}

function isValidGrade(value: string): boolean {
  const n = parseFloat(value);
  return !isNaN(n) && n >= 0 && n <= 4;
}

const inputClass =
  'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all';
const errorInputClass =
  'w-full px-3 py-2 border-2 border-rose-400 rounded-lg text-sm bg-rose-50/60 focus:outline-hidden focus:ring-2 focus:ring-rose-300 focus:border-rose-500 transition-all';

function GpaCheckPill({ status }: { status: GpaCheck['status'] }) {
  const styles = {
    meets: { label: 'Meets it', className: 'bg-emerald-50 text-brand-green border-emerald-100', Icon: CheckCircle },
    below: { label: 'Below', className: 'bg-amber-50 text-amber-800 border-amber-200', Icon: AlertCircle },
    unknown: { label: 'Add grades to check', className: 'bg-slate-50 text-slate-500 border-slate-200', Icon: Info },
    'not-applicable': { label: 'Not for freshmen', className: 'bg-slate-50 text-slate-500 border-slate-200', Icon: Info },
  }[status];
  const { Icon } = styles;
  return (
    <span className={`self-start shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold whitespace-nowrap ${styles.className}`}>
      <Icon className="w-3.5 h-3.5" aria-hidden />
      {styles.label}
    </span>
  );
}

interface GPACalculatorProps {
  student: StudentProfile;
  // Checked against each scholarship's GPA rule (gpaRequirement).
  scholarships: Scholarship[];
  // Approved applications mark the scholarships the student holds.
  applications: Application[];
  // Saves the computed GPA as the profile GPA; resolves to whether it saved.
  onUpdateProfile: (changes: ProfileChanges) => Promise<SaveResult>;
  onViewScholarship: (id: string) => void;
  id?: string;
}

export default function GPACalculator({ student, scholarships, applications, onUpdateProfile, onViewScholarship, id }: GPACalculatorProps) {
  // Load any saved draft for THIS student only, once on mount.
  const savedDraft = React.useMemo(
    () => loadGpaDraft(student.studentNumber),
    [student.studentNumber]
  );

  const [courses, setCourses] = useState<CourseEntry[]>(savedDraft?.courses ?? [makeEmptyCourse()]);
  const [copied, setCopied] = useState(false);

  // Re-load the draft whenever the logged-in student changes (e.g. someone
  // logs out and a different account logs in without a full page reload).
  useEffect(() => {
    const draftForCurrentStudent = loadGpaDraft(student.studentNumber);
    setCourses(draftForCurrentStudent?.courses ?? [makeEmptyCourse()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.studentNumber]);

  // Auto-save on every change, scoped to the current student's key.
  useEffect(() => {
    try {
      const draft: GpaDraft = { courses };
      localStorage.setItem(getGpaDraftKey(student.studentNumber), JSON.stringify(draft));
    } catch {
      // Storage can fail (private browsing, quota) — calculator still works, just won't persist
    }
  }, [courses, student.studentNumber]);

  const addCourse = () => {
    setCourses(prev => [...prev, makeEmptyCourse()]);
  };

  const removeCourse = (courseId: string) => {
    setCourses(prev => (prev.length > 1 ? prev.filter(c => c.id !== courseId) : prev));
  };

  const duplicateCourse = (course: CourseEntry) => {
    setCourses(prev => {
      const idx = prev.findIndex(c => c.id === course.id);
      const copy: CourseEntry = { ...course, id: `course_${Math.random().toString(36).substr(2, 9)}` };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };

  const updateCourse = (courseId: string, updates: Partial<CourseEntry>) => {
    setCourses(prev => prev.map(c => (c.id === courseId ? { ...c, ...updates } : c)));
  };

  const resetAll = () => {
    setCourses([makeEmptyCourse()]);
    clearGpaDraft(student.studentNumber);
  };

  // Live computation — recalculates on every keystroke instead of waiting
  // for a "Compute" click, so the number on screen is never stale. Rows
  // with invalid units/grade are simply excluded from the total, same as
  // the original silent isNaN-skip behavior — just now visible as a red
  // border instead of being invisible.
  const { gpa, totalUnits, totalPoints, includedCount, hasBelowHonorsThreshold, lowestGrade } = useMemo(() => {
    let totalUnits = 0;
    let totalPoints = 0;
    let includedCount = 0;
    let hasBelowHonorsThreshold = false;
    let lowestGrade: number | null = null;
    courses.forEach(course => {
      if (isValidUnits(course.units) && isValidGrade(course.grade)) {
        const units = parseFloat(course.units);
        const grade = parseFloat(course.grade);
        totalUnits += units;
        totalPoints += units * grade;
        includedCount += 1;
        if (grade < 2.5) hasBelowHonorsThreshold = true;
        if (lowestGrade === null || grade < lowestGrade) lowestGrade = grade;
      }
    });
    return {
      gpa: totalUnits > 0 ? totalPoints / totalUnits : 0,
      totalUnits,
      totalPoints,
      includedCount,
      hasBelowHonorsThreshold,
      lowestGrade
    };
  }, [courses]);

  // Scholarships whose GPA rule matters to this student, checked against
  // what's entered here. A rule for keeping a scholarship only matters to
  // its holders; one for upperclassmen isn't shown to freshmen (unless they
  // hold it). Held scholarships (an approved application) come first.
  const heldIds = useMemo(
    () => new Set(applications.filter(a => a.status === 'Approved').map(a => a.scholarshipId)),
    [applications]
  );
  const continuing = isContinuingStudent(student);
  const scholarshipChecks = useMemo(() => {
    return scholarships
      .filter(s => s.gpaRequirement)
      .map(s => ({ scholarship: s, req: s.gpaRequirement!, held: heldIds.has(s.id) }))
      .filter(({ req, held }) => held || (req.stage === 'apply' && (continuing || !req.continuingOnly)))
      .map(row => ({
        ...row,
        check: includedCount === 0
          ? ({ status: 'unknown', reasons: [] } as GpaCheck)
          : checkGpaRequirement(row.req, { gpa, lowestGrade }, { continuing: row.held || continuing })
      }))
      .sort((a, b) => Number(b.held) - Number(a.held));
  }, [scholarships, heldIds, continuing, includedCount, gpa, lowestGrade]);

  // Saving the computed GPA to the profile, which Explore and the
  // dashboard check scholarships against.
  const profileGpa = toGpaNumber(student.gpa);
  const roundedGpa = Math.round(gpa * 100) / 100;
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  useEffect(() => { setSaveState('idle'); }, [roundedGpa]);
  const saveAsProfileGpa = async () => {
    setSaveState('saving');
    const result = await onUpdateProfile({ gpa: roundedGpa.toFixed(2) });
    setSaveError(result.error ?? '');
    setSaveState(result.ok ? 'saved' : 'error');
  };

  const invalidCount = courses.length - includedCount;

  // Per the DLSU-D Honors List criteria: (1) academic load at least 75% of
  // the curriculum's prescribed units — not checkable here since this
  // calculator doesn't know your curriculum's full load; (2) no grade
  // lower than 2.50 in any academic subject — checkable from what's
  // entered; (3) must have passed NSTP and SEP — not tracked here at all.
  // So this only ever confirms/flags criterion 2, and says so plainly.
  const honorsCheck = useMemo(() => {
    if (includedCount === 0) return null;
    if (hasBelowHonorsThreshold) {
      return {
        label: 'Not on the Honors List',
        tone: 'amber' as const,
        note: 'The Honors List requires no grade lower than 2.50 in any academic subject — at least one entry here is below that.'
      };
    }
    const verifyNote = 'Still confirm your unit load (\u226575% of your curriculum) and that NSTP/SEP are passed \u2014 this calculator can\u2019t check either.';
    if (gpa >= 3.5) {
      return { label: 'First Honors', tone: 'emerald' as const, note: `GPA is 3.50 or higher with no grade below 2.50. ${verifyNote}` };
    }
    if (gpa >= 3.0) {
      return { label: 'Second Honors', tone: 'emerald' as const, note: `GPA is 3.00\u20133.49 with no grade below 2.50. ${verifyNote}` };
    }
    return {
      label: 'Not on the Honors List',
      tone: 'amber' as const,
      note: 'GPA is below 3.00, the minimum for Second Honors.'
    };
  }, [includedCount, hasBelowHonorsThreshold, gpa]);

  const handleCopySummary = async () => {
    const lines = courses
      .filter(c => isValidUnits(c.units) && isValidGrade(c.grade))
      .map(c => `${c.name || 'Untitled Course'} — ${c.units} units, ${parseFloat(c.grade).toFixed(2)}`);
    const summary = [
      ...lines,
      '',
      `Total Units: ${totalUnits}`,
      `Term GPA: ${gpa.toFixed(3)}`
    ].join('\n');
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail (permissions, insecure context) — fail quietly
    }
  };

  return (
    <div id={id} className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-xs">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-brand-green flex items-center justify-center shrink-0">
            <Calculator className="w-5 h-5" />
          </div>
          <h2 className="font-display font-black text-xl md:text-2xl text-slate-900 tracking-tight">Term GPA Calculator</h2>
        </div>
        <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
          See how well you did this term by computing your grade point average! Type your course names, units, and grades — your GPA updates as you go.
        </p>
      </div>

      {/* Live summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Term GPA</p>
          <p className="font-display font-black text-3xl text-brand-green">{gpa.toFixed(3)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Units</p>
          <p className="font-display font-black text-3xl text-slate-800">{totalUnits}</p>
        </div>
        <div className="col-span-2 sm:col-span-1 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-center">
          {honorsCheck ? (
            <div className="space-y-1">
              <div className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${
                honorsCheck.tone === 'emerald' ? 'bg-emerald-50 text-brand-green' : 'bg-amber-50 text-amber-700'
              }`}>
                <Award className="w-3.5 h-3.5" />
                {honorsCheck.label}
              </div>
              <p className="text-[10px] text-slate-400 leading-snug">{honorsCheck.note}</p>
            </div>
          ) : (
            <p className="text-[11px] text-slate-400 leading-snug">
              Add a valid course to check it against the Honors List grade requirement.
            </p>
          )}
        </div>
      </div>

      {invalidCount > 0 && (
        <div className="p-3.5 bg-rose-50 text-rose-700 rounded-xl border border-rose-100 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{invalidCount} course{invalidCount > 1 ? 's have' : ' has'} an invalid units or grade value and {invalidCount > 1 ? 'are' : 'is'} excluded from the GPA below.</span>
        </div>
      )}

      {/* Course table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-brand-green text-white">
          <span className="font-display font-bold text-sm">Number of Courses: {courses.length}</span>
          <button
            type="button"
            onClick={addCourse}
            className="inline-flex items-center gap-1.5 text-xs font-bold bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg transition-colors focus:outline-hidden"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Course
          </button>
        </div>

        <div className="hidden sm:grid grid-cols-12 gap-3 px-6 py-3 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          <div className="col-span-6">Course Title (Optional)</div>
          <div className="col-span-2">Units</div>
          <div className="col-span-3">Grade</div>
          <div className="col-span-1"></div>
        </div>

        <div className="divide-y divide-slate-100 max-h-112 overflow-y-auto">
          {courses.map((course, idx) => {
            const unitsValid = isValidUnits(course.units);
            const gradeValid = isValidGrade(course.grade);
            return (
              <div key={course.id} className="grid grid-cols-1 sm:grid-cols-12 gap-3 px-6 py-4 items-start hover:bg-slate-50/60 transition-colors">
                <div className="sm:col-span-6">
                  <label className="sm:hidden block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Course {idx + 1}
                  </label>
                  <input
                    type="text"
                    placeholder={`Course ${idx + 1}`}
                    value={course.name}
                    onChange={e => updateCourse(course.id, { name: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="sm:hidden block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Units</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 3"
                    value={course.units}
                    onChange={e => updateCourse(course.id, { units: e.target.value })}
                    className={unitsValid ? inputClass : errorInputClass}
                    aria-invalid={!unitsValid}
                  />
                  {!unitsValid && <p className="mt-1 text-[10px] font-semibold text-rose-500">{`${MIN_UNITS}\u2013${MAX_UNITS} units`}</p>}
                </div>
                <div className="sm:col-span-3">
                  <label className="sm:hidden block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Grade</label>
                  <input
                    type="number"
                    min="0"
                    max="4"
                    step="0.25"
                    placeholder="4.0"
                    value={course.grade}
                    onChange={e => updateCourse(course.id, { grade: e.target.value })}
                    className={gradeValid ? inputClass : errorInputClass}
                    aria-invalid={!gradeValid}
                  />
                  {!gradeValid && <p className="mt-1 text-[10px] font-semibold text-rose-500">0.0–4.0 only</p>}
                </div>
                <div className="sm:col-span-1 flex justify-end items-center gap-1 h-9.5">
                  <button
                    type="button"
                    onClick={() => duplicateCourse(course)}
                    className="p-2 text-slate-400 hover:text-brand-green hover:bg-emerald-50 rounded-lg transition-colors"
                    title="Duplicate course"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeCourse(course.id)}
                    disabled={courses.length === 1}
                    className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Remove course"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-5 bg-slate-50 border-t border-slate-100">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">GPA:</span>
              <span className="font-display font-black text-2xl text-brand-green">{gpa.toFixed(3)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCopySummary}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 px-4 py-2.5 rounded-lg transition-colors focus:outline-hidden"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-brand-green" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy Summary'}
            </button>
            <button
              type="button"
              onClick={resetAll}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 px-4 py-2.5 rounded-lg transition-colors focus:outline-hidden"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Scholarship GPA check */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 space-y-1">
          <h3 className="font-display font-bold text-base text-slate-900">Scholarship GPA check</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            How the GPA and grades above compare with each scholarship's requirement. Scholarships look at your cumulative GPA, so enter all your courses so far to check against it.
          </p>
        </div>

        {scholarshipChecks.length === 0 && (
          <p className="px-6 py-5 text-xs text-slate-500 leading-relaxed">
            {continuing
              ? 'None of the scholarships you can apply for has a GPA requirement.'
              : 'Freshman scholarships are based on your high school grades, so none of them checks your college GPA yet. Upperclassman scholarships will show here from your second year.'}
          </p>
        )}
        <ul className="divide-y divide-slate-100">
          {scholarshipChecks.map(({ scholarship, req, held, check }) => {
            const tag = held
              ? 'You hold this'
              : req.audience
                ? `${req.audience} only`
                : acceptsOnlineApplications(scholarship) ? 'To apply' : 'To qualify';
            return (
              <li key={scholarship.id} className="px-6 py-4 flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onViewScholarship(scholarship.id)}
                      className="font-semibold text-sm text-slate-800 hover:text-brand-green text-left inline-flex items-center gap-0.5"
                    >
                      {scholarship.name}
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" aria-hidden />
                    </button>
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                      held ? 'bg-emerald-50 text-brand-green' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {tag}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    {describeGpaRequirement(req)}
                    {req.stage === 'keep' || (held && req.keepToo) ? ', every semester to keep it' : ''}
                  </p>
                  {check.status === 'below' && (
                    <p className="text-xs text-amber-800 first-letter:uppercase">{check.reasons.join('; ')}.</p>
                  )}
                  {req.note && !held && <p className="text-[11px] text-slate-400 leading-snug">{req.note}</p>}
                </div>
                <GpaCheckPill status={check.status} />
              </li>
            );
          })}
        </ul>

        <div className="px-6 py-5 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-slate-500 leading-relaxed">
            Profile GPA: <span className="font-bold text-slate-700">{profileGpa !== null ? profileGpa.toFixed(2) : 'not set'}</span>
            {' · '}Explore Grants uses it to flag scholarships whose minimum you may not meet.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            {saveState === 'saved' && <span className="text-xs font-semibold text-brand-green flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Saved</span>}
            {saveState === 'error' && <span role="alert" className="text-xs font-semibold text-rose-600">{saveError || 'Couldn’t save. Try again.'}</span>}
            <button
              type="button"
              onClick={saveAsProfileGpa}
              disabled={includedCount === 0 || saveState === 'saving' || profileGpa === roundedGpa}
              className="inline-flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white bg-brand-green hover:bg-brand-green-dark disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 rounded-lg transition-colors focus:outline-hidden"
            >
              {saveState === 'saving' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Use {roundedGpa.toFixed(2)} as my GPA
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-2.5">
        <Info className="w-4.5 h-4.5 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800 leading-relaxed">
          This calculator uses DLSU-D's standard 4.0 grading scale for personal planning only. Your official GPA is always the one recorded by the University Registrar. Per the DLSU-D Honors List policy, a student qualifies by meeting all three of: (1) an academic load of at least 75% of the units prescribed in the curriculum for the semester, (2) no grade lower than 2.50 in any academic subject, and (3) passing NSTP and SEP — with First Honors at a GPA of 3.50 or higher and Second Honors at 3.00–3.49. This tool can only check the GPA and the 2.50 grade floor against what you've entered — it has no way to know your full curriculum load or your NSTP/SEP results, so confirm those separately with the Office of the University Registrar.
        </p>
      </div>
    </div>
  );
}