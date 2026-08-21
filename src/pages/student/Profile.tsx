import React, { useState } from 'react';
import { StudentProfile } from '../../types';
import {
  User, Mail, GraduationCap, School, Layers, TrendingUp, Edit3, CheckCircle2, X,
  Cake, Flag, MapPinned, Heart, MapPin, Phone, Smartphone, Users, ArrowRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ProfileProps {
  student: StudentProfile;
  onUpdateProfile: (updated: StudentProfile) => void;
  id?: string;
}

const inputClass =
  'block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all';
const labelClass = 'block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5';

const CIVIL_STATUS_OPTIONS = ['Single', 'Married', 'Widowed', 'Separated', 'Divorced'];

const show = (v?: string | number | null) => (v === undefined || v === null || v === '' ? 'Not provided' : v);

function formatDateDisplay(v?: string | null): string {
  if (!v) return 'Not provided';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return 'Not provided';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function toDateInputValue(v?: string | null): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function DetailRow({ icon: Icon, label, value, accent, missing }: {
  icon: React.ElementType; label: string; value: React.ReactNode; accent?: boolean; missing?: boolean;
}) {
  return (
    <div className="flex items-center space-x-3 sm:space-x-4">
      <div className={`p-2 sm:p-2.5 rounded-xl border shrink-0 ${
        missing ? 'bg-slate-50 border-dashed border-slate-200 text-slate-300'
          : accent ? 'bg-emerald-50 border-emerald-100 text-brand-green'
          : 'bg-slate-50 border-slate-100 text-slate-500'
      }`}>
        <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider leading-none">{label}</p>
        <p className={`text-sm font-semibold mt-1 break-words sm:truncate ${
          missing ? 'text-slate-300 italic font-medium' : accent ? 'text-brand-green' : 'text-slate-800'
        }`}>
          {value}
        </p>
      </div>
    </div>
  );
}

type EditTab = 'academic' | 'personal' | 'contact' | 'family';

const EDIT_TABS: { key: EditTab; label: string; icon: React.ElementType }[] = [
  { key: 'academic', label: 'Academic', icon: GraduationCap },
  { key: 'personal', label: 'Personal Details', icon: Cake },
  { key: 'contact', label: 'Contact Info', icon: MapPin },
  { key: 'family', label: 'Parents / Guardian', icon: Users },
];

// How long the Save Changes button stays disabled right after landing on
// the Family tab — guards against a fast accidental double-click on Next
// (which sits in the exact same spot Save Changes then occupies) from
// submitting the form before the student ever sees the tab.
const SUBMIT_GUARD_MS = 400;

export default function Profile({ student, onUpdateProfile, id }: ProfileProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<EditTab>('academic');
  const [justSwitched, setJustSwitched] = useState(false);

  // Academic
  const [course, setCourse] = useState(student.course);
  const [college, setCollege] = useState(student.college);
  const [programCode, setProgramCode] = useState(student.programCode || '');
  const [yearLevel, setYearLevel] = useState(student.yearLevel);
  const [section, setSection] = useState(student.section || '');
  const [gpa, setGpa] = useState(student.gpa);

  // Personal Details
  const [dateOfBirth, setDateOfBirth] = useState(toDateInputValue(student.dateOfBirth));
  const [nationality, setNationality] = useState(student.nationality || '');
  const [placeOfBirth, setPlaceOfBirth] = useState(student.placeOfBirth || '');
  const [civilStatus, setCivilStatus] = useState(student.civilStatus || '');
  const [avatarFailed, setAvatarFailed] = useState(false);

  // Contact Information
  const [homeAddress, setHomeAddress] = useState(student.homeAddress || '');
  const [cityMunicipality, setCityMunicipality] = useState(student.cityMunicipality || '');
  const [province, setProvince] = useState(student.province || '');
  const [zipCode, setZipCode] = useState(student.zipCode || '');
  const [country, setCountry] = useState(student.country || 'Philippines');
  const [telephoneNumber, setTelephoneNumber] = useState(student.telephoneNumber || '');
  const [mobileNumber, setMobileNumber] = useState(student.mobileNumber || '');

  // Parents / Guardian
  const [fatherName, setFatherName] = useState(student.fatherName || '');
  const [motherName, setMotherName] = useState(student.motherName || '');
  const [guardianName, setGuardianName] = useState(student.guardianName || '');
  const [guardianRelationship, setGuardianRelationship] = useState(student.guardianRelationship || '');
  const [guardianAddress, setGuardianAddress] = useState(student.guardianAddress || '');
  const [guardianContactNo, setGuardianContactNo] = useState(student.guardianContactNo || '');

  const [showToast, setShowToast] = useState(false);

  const openEditor = (tab: EditTab = 'academic') => {
    setActiveTab(tab);
    setIsEditing(true);
  };

  const goToTab = (tab: EditTab) => {
    setActiveTab(tab);
    // Only the transition into the final (Family) tab needs the guard —
    // that's the only spot where Next's position gets reused by Save Changes.
    if (tab === 'family') {
      setJustSwitched(true);
      setTimeout(() => setJustSwitched(false), SUBMIT_GUARD_MS);
    }
  };

  const goToNextTab = () => {
    const nextTab = EDIT_TABS[EDIT_TABS.findIndex(t => t.key === activeTab) + 1].key;
    goToTab(nextTab);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (justSwitched) return; // extra safety net alongside the disabled attribute

    const updatedProfile: StudentProfile = {
      ...student,
      course, college, programCode, yearLevel, section, gpa,
      dateOfBirth, nationality, placeOfBirth, civilStatus,
      homeAddress, cityMunicipality, province, zipCode, country, telephoneNumber, mobileNumber,
      fatherName, motherName, guardianName, guardianRelationship, guardianAddress, guardianContactNo,
    };

    onUpdateProfile(updatedProfile);
    setIsEditing(false);

    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  return (
    <div id={id} className="space-y-4 sm:space-y-6">
      {/* Toast Notification */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className="fixed top-4 sm:top-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-4 sm:px-5 py-3 sm:py-3.5 rounded-xl shadow-xl flex items-center space-x-3 border border-slate-800 w-[calc(100%-2rem)] sm:w-auto justify-center"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="text-xs font-semibold">Profile updated successfully!</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Profile Info Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="h-24 sm:h-32 bg-linear-to-r from-brand-green/80 to-slate-900/90 relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: 'radial-gradient(circle, white 1.5px, transparent 1.5px)',
              backgroundSize: '18px 18px'
            }}
          />
        </div>

        <div className="px-4 sm:px-6 pb-6 sm:pb-8 relative">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between -mt-12 sm:-mt-16 mb-4 sm:mb-6 gap-4">
            {student.avatarUrl && !avatarFailed ? (
              <img
                src={student.avatarUrl}
                alt={student.name}
                onError={() => setAvatarFailed(true)}
                className="w-20 h-20 sm:w-28 sm:h-28 rounded-2xl object-cover shadow-lg border-2 border-white shrink-0"
              />
            ) : (
              <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-2xl bg-brand-green text-white flex items-center justify-center font-display font-black text-2xl sm:text-4xl shadow-lg border-4 border-white shrink-0">
                {student.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
            )}

            <button
              onClick={() => openEditor('academic')}
              className="inline-flex items-center justify-center space-x-1.5 self-start sm:self-auto text-xs font-bold uppercase tracking-wider text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 px-4 sm:px-5 py-2.5 sm:py-3 rounded-lg transition-colors focus:outline-hidden w-full sm:w-auto"
            >
              <Edit3 className="w-4 h-4 text-slate-500" />
              <span>Edit Profile</span>
            </button>
          </div>

          <div className="space-y-1">
            <h2 className="font-display font-black text-xl sm:text-2xl text-slate-900 tracking-tight break-words">{student.name}</h2>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{student.studentNumber}</p>
          </div>
        </div>
      </div>

      {/* Grid of Profile Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Academic Status */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-xs space-y-4 sm:space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="font-display font-extrabold text-sm sm:text-base text-slate-900">Academic Status</h3>
            <button onClick={() => openEditor('academic')} className="text-slate-300 hover:text-brand-green transition-colors p-1 -m-1">
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-3 sm:space-y-4">
            <DetailRow icon={GraduationCap} label="Course / Program" value={show(student.course)} missing={!student.course} />
            <DetailRow icon={School} label="College Department" value={show(student.college)} missing={!student.college} />
            <DetailRow icon={Layers} label="Year Level / Section" value={`${show(student.yearLevel)}${student.section ? ` — ${student.section}` : ''}`} missing={!student.yearLevel} />
            <DetailRow icon={TrendingUp} label="Cumulative GPA" value={student.gpa ? `${student.gpa} / 4.00` : 'Not provided'} accent={!!student.gpa} missing={!student.gpa} />
          </div>
        </div>

        {/* Personal Details */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-xs space-y-4 sm:space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="font-display font-extrabold text-sm sm:text-base text-slate-900">Personal Details</h3>
            <button onClick={() => openEditor('personal')} className="text-slate-300 hover:text-brand-green transition-colors p-1 -m-1">
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-3 sm:space-y-4">
            <DetailRow icon={Cake} label="Date of Birth" value={formatDateDisplay(student.dateOfBirth)} missing={!student.dateOfBirth} />
            <DetailRow icon={Flag} label="Nationality" value={show(student.nationality)} missing={!student.nationality} />
            <DetailRow icon={MapPinned} label="Place of Birth" value={show(student.placeOfBirth)} missing={!student.placeOfBirth} />
            <DetailRow icon={Heart} label="Civil Status" value={show(student.civilStatus)} missing={!student.civilStatus} />
          </div>
        </div>

        {/* Contact Information */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-xs space-y-4 sm:space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="font-display font-extrabold text-sm sm:text-base text-slate-900">Contact Information</h3>
            <button onClick={() => openEditor('contact')} className="text-slate-300 hover:text-brand-green transition-colors p-1 -m-1">
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-3 sm:space-y-4">
            <DetailRow icon={Mail} label="University Email" value={student.email} />
            <DetailRow
              icon={MapPin}
              label="Home Address"
              value={show(
                [student.homeAddress, student.cityMunicipality, student.province, student.zipCode, student.country]
                  .filter(Boolean)
                  .join(', ') || undefined
              )}
              missing={!student.homeAddress}
            />
            <DetailRow icon={Phone} label="Telephone Number" value={show(student.telephoneNumber)} missing={!student.telephoneNumber} />
            <DetailRow icon={Smartphone} label="Mobile Number" value={show(student.mobileNumber)} missing={!student.mobileNumber} />
          </div>
        </div>

        {/* Parents / Guardian Information */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-xs space-y-4 sm:space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="font-display font-extrabold text-sm sm:text-base text-slate-900">Parents / Guardian Information</h3>
            <button onClick={() => openEditor('family')} className="text-slate-300 hover:text-brand-green transition-colors p-1 -m-1">
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-3 sm:space-y-4">
            <DetailRow icon={User} label="Father" value={show(student.fatherName)} missing={!student.fatherName} />
            <DetailRow icon={User} label="Mother" value={show(student.motherName)} missing={!student.motherName} />
            <DetailRow
              icon={Users}
              label="Guardian"
              value={student.guardianName ? `${student.guardianName}${student.guardianRelationship ? ` (${student.guardianRelationship})` : ''}` : 'Not provided'}
              missing={!student.guardianName}
            />
            <DetailRow icon={Phone} label="Guardian Contact No." value={show(student.guardianContactNo)} missing={!student.guardianContactNo} />
          </div>
        </div>
      </div>

      {/* Edit Profile Modal */}
      <AnimatePresence>
        {isEditing && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-0 sm:p-4">
            <motion.div
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              className="bg-white sm:rounded-2xl border-0 sm:border border-slate-200 shadow-2xl max-w-3xl w-full h-full sm:h-auto sm:max-h-[85vh] flex flex-col overflow-hidden"
            >
              <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                <span className="font-display font-bold text-sm sm:text-base text-slate-800">Edit Portal Profile</span>
                <button onClick={() => setIsEditing(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={handleSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && activeTab !== 'family') {
                    e.preventDefault();
                  }
                }}
                className="flex-1 flex min-h-0 relative"
              >
                {/* Tab rail (desktop) */}
                <div className="w-44 shrink-0 border-r border-slate-100 bg-slate-50/50 py-3 hidden sm:block">
                  {EDIT_TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => goToTab(tab.key)}
                        className={`w-full flex items-center gap-2 px-4 py-3 text-xs font-bold text-left transition-colors border-l-2 ${
                          isActive
                            ? 'border-brand-green text-brand-green bg-white'
                            : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Mobile tab select */}
                <div className="sm:hidden absolute top-0 left-0 right-0 border-b border-slate-100 bg-white z-10 px-2 py-2 flex gap-1 overflow-x-auto">
                  {EDIT_TABS.map(tab => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => goToTab(tab.key)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors shrink-0 ${
                        activeTab === tab.key ? 'bg-brand-green text-white' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 mt-11 sm:mt-0">
                    {activeTab === 'academic' && (
                      <div className="space-y-4">
                        <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-500 flex items-start sm:items-center gap-2">
                          <Mail className="w-3.5 h-3.5 shrink-0 mt-0.5 sm:mt-0" />
                          <span>Signed in as <span className="font-semibold text-slate-700 break-all">{student.email}</span> — name and email are managed by your account, not this form.</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className={labelClass}>Course</label>
                            <input type="text" value={course} onChange={(e) => setCourse(e.target.value)} className={inputClass} />
                          </div>
                          <div>
                            <label className={labelClass}>College Department</label>
                            <input type="text" value={college} onChange={(e) => setCollege(e.target.value)} className={inputClass} />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div>
                            <label className={labelClass}>Program Code</label>
                            <input type="text" placeholder="e.g. BSIT" value={programCode} onChange={(e) => setProgramCode(e.target.value)} className={inputClass} />
                          </div>
                          <div>
                            <label className={labelClass}>Year Level</label>
                            <select value={yearLevel} onChange={(e) => setYearLevel(e.target.value)} className={inputClass}>
                              <option value="1st Year">1st Year</option>
                              <option value="2nd Year">2nd Year</option>
                              <option value="3rd Year">3rd Year</option>
                              <option value="4th Year">4th Year</option>
                              <option value="5th Year">5th Year</option>
                            </select>
                          </div>
                          <div>
                            <label className={labelClass}>Section</label>
                            <input type="text" placeholder="e.g. IT-4A" value={section} onChange={(e) => setSection(e.target.value)} className={inputClass} />
                          </div>
                        </div>
                        <div>
                          <label className={labelClass}>Cumulative GPA</label>
                          <input type="number" step="0.01" min="1" max="5" value={gpa} onChange={(e) => setGpa(e.target.value)} className={inputClass} />
                        </div>
                      </div>
                    )}

                    {activeTab === 'personal' && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className={labelClass}>Date of Birth</label>
                            <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className={inputClass} />
                          </div>
                          <div>
                            <label className={labelClass}>Civil Status</label>
                            <select value={civilStatus} onChange={(e) => setCivilStatus(e.target.value)} className={inputClass}>
                              <option value="">Select...</option>
                              {CIVIL_STATUS_OPTIONS.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className={labelClass}>Nationality</label>
                            <input type="text" value={nationality} onChange={(e) => setNationality(e.target.value)} className={inputClass} />
                          </div>
                          <div>
                            <label className={labelClass}>Place of Birth</label>
                            <input type="text" value={placeOfBirth} onChange={(e) => setPlaceOfBirth(e.target.value)} className={inputClass} />
                          </div>
                        </div>
                      </div>
                    )}

                    {activeTab === 'contact' && (
                      <div className="space-y-4">
                        <div>
                          <label className={labelClass}>Complete Home Address</label>
                          <input type="text" value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} className={inputClass} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div>
                            <label className={labelClass}>City / Municipality</label>
                            <input type="text" value={cityMunicipality} onChange={(e) => setCityMunicipality(e.target.value)} className={inputClass} />
                          </div>
                          <div>
                            <label className={labelClass}>Province</label>
                            <input type="text" value={province} onChange={(e) => setProvince(e.target.value)} className={inputClass} />
                          </div>
                          <div>
                            <label className={labelClass}>Zip Code</label>
                            <input type="text" value={zipCode} onChange={(e) => setZipCode(e.target.value)} className={inputClass} />
                          </div>
                        </div>
                        <div>
                          <label className={labelClass}>Country</label>
                          <input type="text" value={country} onChange={(e) => setCountry(e.target.value)} className={inputClass} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className={labelClass}>Telephone Number</label>
                            <input type="tel" value={telephoneNumber} onChange={(e) => setTelephoneNumber(e.target.value)} className={inputClass} />
                          </div>
                          <div>
                            <label className={labelClass}>Mobile Number</label>
                            <input type="tel" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} className={inputClass} />
                          </div>
                        </div>
                      </div>
                    )}

                    {activeTab === 'family' && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className={labelClass}>Father</label>
                            <input type="text" value={fatherName} onChange={(e) => setFatherName(e.target.value)} className={inputClass} />
                          </div>
                          <div>
                            <label className={labelClass}>Mother</label>
                            <input type="text" value={motherName} onChange={(e) => setMotherName(e.target.value)} className={inputClass} />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className={labelClass}>Guardian</label>
                            <input type="text" value={guardianName} onChange={(e) => setGuardianName(e.target.value)} className={inputClass} />
                          </div>
                          <div>
                            <label className={labelClass}>Relationship (Guardian)</label>
                            <input type="text" placeholder="e.g. Aunt, Grandparent" value={guardianRelationship} onChange={(e) => setGuardianRelationship(e.target.value)} className={inputClass} />
                          </div>
                        </div>
                        <div>
                          <label className={labelClass}>Guardian Address</label>
                          <input type="text" value={guardianAddress} onChange={(e) => setGuardianAddress(e.target.value)} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Guardian Contact No.</label>
                          <input type="tel" value={guardianContactNo} onChange={(e) => setGuardianContactNo(e.target.value)} className={inputClass} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer: tab progress + actions */}
                  <div className="border-t border-slate-100 px-4 sm:px-6 py-3 sm:py-4 flex flex-col-reverse sm:flex-row items-center justify-between gap-3 shrink-0 bg-white">
                    <div className="hidden sm:flex items-center gap-1.5">
                      {EDIT_TABS.map((tab, idx) => (
                        <React.Fragment key={tab.key}>
                          {idx > 0 && <div className="w-3 h-px bg-slate-200" />}
                          <button
                            type="button"
                            onClick={() => goToTab(tab.key)}
                            className={`w-2 h-2 rounded-full transition-colors ${
                              activeTab === tab.key ? 'bg-brand-green' : 'bg-slate-200 hover:bg-slate-300'
                            }`}
                            aria-label={`Go to ${tab.label}`}
                          />
                        </React.Fragment>
                      ))}
                    </div>
                    <div className="flex gap-3 w-full sm:w-auto sm:ml-auto">
                      <button
                        type="button"
                        onClick={() => setIsEditing(false)}
                        className="flex-1 sm:flex-none px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-100 rounded-lg transition-colors focus:outline-hidden"
                      >
                        Cancel
                      </button>
                      {activeTab !== 'family' ? (
                        <button
                          type="button"
                          onClick={goToNextTab}
                          className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-5 py-2 text-xs font-bold uppercase tracking-wider text-white bg-brand-green hover:bg-brand-green-dark rounded-lg transition-colors shadow-sm focus:outline-hidden"
                        >
                          <span>Next</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          type="submit"
                          disabled={justSwitched}
                          className="flex-1 sm:flex-none px-5 py-2 text-xs font-bold uppercase tracking-wider text-white bg-brand-green hover:bg-brand-green-dark rounded-lg transition-colors shadow-sm focus:outline-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Save Changes
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}