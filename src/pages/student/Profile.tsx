import React, { useState } from 'react';
import { StudentProfile } from '../../types';
import { User, Mail, GraduationCap, School, Layers, TrendingUp, Edit3, ShieldCheck, CheckCircle2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ProfileProps {
  student: StudentProfile;
  onUpdateProfile: (updated: StudentProfile) => void;
  id?: string;
}

export default function Profile({ student, onUpdateProfile, id }: ProfileProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(student.name);
  const [email, setEmail] = useState(student.email);
  const [course, setCourse] = useState(student.course);
  const [college, setCollege] = useState(student.college);
  const [yearLevel, setYearLevel] = useState(student.yearLevel);
  const [gpa, setGpa] = useState(student.gpa);
  
  const [showToast, setShowToast] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const updatedProfile: StudentProfile = {
      ...student,
      name,
      email,
      course,
      college,
      yearLevel,
      gpa
    };

    onUpdateProfile(updatedProfile);
    setIsEditing(false);
    
    // Show positive feedback
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  return (
    <div id={id} className="space-y-6 max-w-4xl">
      {/* Toast Notification */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-5 py-3.5 rounded-xl shadow-xl flex items-center space-x-3 border border-slate-800"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span className="text-xs font-semibold">Profile updated successfully!</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Profile Info Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        {/* Banner Accents */}
        <div className="h-32 bg-gradient-to-r from-brand-green/80 to-slate-900/90 relative">
          <div className="absolute top-4 right-4 text-[10px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-500/20 px-3 py-1 rounded-full uppercase tracking-wider">
            Verified Lasallian
          </div>
        </div>

        {/* User Card Content */}
        <div className="px-6 pb-8 relative">
          {/* Avatar positioning */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between -mt-16 mb-6 gap-4">
            <div className="w-28 h-28 rounded-2xl bg-brand-green text-white flex items-center justify-center font-display font-black text-4xl shadow-lg border-4 border-white">
              {student.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>

            <button
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center space-x-1.5 self-start text-xs font-bold uppercase tracking-wider text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 px-5 py-3 rounded-lg transition-colors focus:outline-hidden"
            >
              <Edit3 className="w-4 h-4 text-slate-500" />
              <span>Edit Profile</span>
            </button>
          </div>

          {/* Text Info */}
          <div className="space-y-1">
            <h2 className="font-display font-black text-2xl text-slate-900 tracking-tight">{student.name}</h2>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{student.studentNumber}</p>
          </div>
        </div>
      </div>

      {/* Grid of Profile Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Side: Academic Stats */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
          <h3 className="font-display font-extrabold text-base text-slate-900 border-b border-slate-100 pb-2">
            Academic Status
          </h3>

          <div className="space-y-4">
            {/* Course */}
            <div className="flex items-center space-x-4">
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-slate-500">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider leading-none">Course / Program</p>
                <p className="text-sm text-slate-800 font-semibold mt-1">{student.course}</p>
              </div>
            </div>

            {/* College */}
            <div className="flex items-center space-x-4">
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-slate-500">
                <School className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider leading-none">College Department</p>
                <p className="text-sm text-slate-800 font-semibold mt-1">{student.college}</p>
              </div>
            </div>

            {/* Year Level */}
            <div className="flex items-center space-x-4">
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-slate-500">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider leading-none">Current Year Level</p>
                <p className="text-sm text-slate-800 font-semibold mt-1">{student.yearLevel}</p>
              </div>
            </div>

            {/* Cumulative GPA */}
            <div className="flex items-center space-x-4">
              <div className="p-2.5 bg-emerald-50 border border-emerald-100 rounded-xl text-brand-green">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider leading-none">Cumulative GPA</p>
                <p className="text-sm text-brand-green font-bold mt-1">{student.gpa} / 4.00</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Account Credentials */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
          <h3 className="font-display font-extrabold text-base text-slate-900 border-b border-slate-100 pb-2">
            Account Information
          </h3>

          <div className="space-y-4">
            {/* Email */}
            <div className="flex items-center space-x-4">
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-slate-500">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider leading-none">University Email</p>
                <p className="text-sm text-slate-800 font-semibold mt-1 truncate">{student.email}</p>
              </div>
            </div>

            {/* Account Role */}
            <div className="flex items-center space-x-4">
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-slate-500">
                <User className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider leading-none">Account Role</p>
                <p className="text-sm text-slate-800 font-semibold mt-1">Non-Scholar (Applicant)</p>
              </div>
            </div>

            {/* SFAO Status Verification */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-brand-green shrink-0 mt-0.5" />
              <div className="text-[11px] text-slate-500 leading-relaxed">
                <strong>Registrar Synchronization:</strong> Your profile is synchronized with the DLSU-D Registrar Office. General profile changes may take up to 24 hours to sync automatically.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Profile Modal */}
      <AnimatePresence>
        {isEditing && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <span className="font-display font-bold text-base text-slate-800">Edit Portal Profile</span>
                <button onClick={() => setIsEditing(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {/* Full Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Full Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="block w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">University Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Course */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Course</label>
                    <input
                      type="text"
                      required
                      value={course}
                      onChange={(e) => setCourse(e.target.value)}
                      className="block w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all"
                    />
                  </div>

                  {/* College */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">College Department</label>
                    <input
                      type="text"
                      required
                      value={college}
                      onChange={(e) => setCollege(e.target.value)}
                      className="block w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Year Level */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Year Level</label>
                    <select
                      value={yearLevel}
                      onChange={(e) => setYearLevel(e.target.value)}
                      className="block w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all"
                    >
                      <option value="1st Year">1st Year</option>
                      <option value="2nd Year">2nd Year</option>
                      <option value="3rd Year">3rd Year</option>
                      <option value="4th Year">4th Year</option>
                      <option value="5th Year">5th Year</option>
                    </select>
                  </div>

                  {/* GPA */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Cumulative GPA</label>
                    <input
                      type="text"
                      required
                      value={gpa}
                      onChange={(e) => setGpa(e.target.value)}
                      className="block w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-100 rounded-lg transition-colors focus:outline-hidden"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold uppercase tracking-wider text-white bg-brand-green hover:bg-brand-green-dark rounded-lg transition-colors shadow-sm focus:outline-hidden"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
