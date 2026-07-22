import React, { useState } from 'react';
import { Calculator, Plus, Trash2, RotateCcw, Info } from 'lucide-react';

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

const inputClass =
  'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all';

export default function GPACalculator({ id }: { id?: string }) {
  const [courses, setCourses] = useState<CourseEntry[]>([makeEmptyCourse()]);
  const [computedGpa, setComputedGpa] = useState<number | null>(null);

  const addCourse = () => {
    setCourses(prev => [...prev, makeEmptyCourse()]);
    setComputedGpa(null);
  };

  const removeCourse = (courseId: string) => {
    setCourses(prev => (prev.length > 1 ? prev.filter(c => c.id !== courseId) : prev));
    setComputedGpa(null);
  };

  const updateCourse = (courseId: string, updates: Partial<CourseEntry>) => {
    setCourses(prev => prev.map(c => (c.id === courseId ? { ...c, ...updates } : c)));
    setComputedGpa(null);
  };

  const resetAll = () => {
    setCourses([makeEmptyCourse()]);
    setComputedGpa(null);
  };

  const handleCompute = () => {
    let totalUnits = 0;
    let totalPoints = 0;
    courses.forEach(course => {
      const units = parseFloat(course.units);
      const grade = parseFloat(course.grade);
      if (!isNaN(units) && !isNaN(grade) && units > 0) {
        totalUnits += units;
        totalPoints += units * grade;
      }
    });
    setComputedGpa(totalUnits > 0 ? totalPoints / totalUnits : 0);
  };

  return (
    <div id={id} className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-xs">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-brand-green flex items-center justify-center shrink-0">
            <Calculator className="w-5 h-5" />
          </div>
          <h2 className="font-display font-black text-xl md:text-2xl text-slate-900 tracking-tight">Term GPA Calculator</h2>
        </div>
        <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
          See how well you did this term by computing your grade point average! Type your course names, units, and grades. Click "Compute" and you're done.
        </p>
      </div>

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

        <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
          {courses.map((course, idx) => (
            <div key={course.id} className="grid grid-cols-1 sm:grid-cols-12 gap-3 px-6 py-4 items-center">
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
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-3">
                <label className="sm:hidden block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Grade</label>
                <input
                  type="number"
                  min="0"
                  max="4"
                  step="0.5"
                  placeholder="4.0"
                  value={course.grade}
                  onChange={e => updateCourse(course.id, { grade: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => removeCourse(course.id)}
                  disabled={courses.length === 1}
                  className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Remove course"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-5 bg-slate-50 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">GPA:</span>
            <span className="font-display font-black text-2xl text-brand-green">
              {computedGpa !== null ? computedGpa.toFixed(3) : '0.000'}
            </span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={resetAll}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 px-4 py-2.5 rounded-lg transition-colors focus:outline-hidden"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
            <button
              type="button"
              onClick={handleCompute}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white bg-brand-green hover:bg-brand-green-dark px-6 py-2.5 rounded-lg transition-colors shadow-sm focus:outline-hidden"
            >
              Compute
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-2.5">
        <Info className="w-4.5 h-4.5 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800 leading-relaxed">
          This calculator uses DLSU-D's standard 4.0 grading scale for personal planning only. Your official GPA is always the one recorded by the University Registrar.
        </p>
      </div>
    </div>
  );
}