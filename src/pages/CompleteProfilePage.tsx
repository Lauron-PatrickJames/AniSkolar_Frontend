import React, { useState } from 'react';
import { useAuth, useClerk } from '@clerk/react';
import { AlertCircle, GraduationCap, MapPin, Users, LogOut } from 'lucide-react';
import { StudentProfile } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

interface CompleteProfilePageProps {
  onComplete: (student: StudentProfile) => void;
}

const inputClass =
  'block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all';
const labelClass = 'block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5';

const CIVIL_STATUS_OPTIONS = ['Single', 'Married', 'Widowed', 'Separated', 'Divorced'];

function SectionHeading({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 pb-1">
      <div className="w-9 h-9 rounded-xl bg-emerald-50 text-brand-green flex items-center justify-center shrink-0">
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div>
        <h2 className="font-display font-bold text-sm text-slate-900">{title}</h2>
        <p className="text-[11px] text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
}

export default function CompleteProfilePage({ onComplete }: CompleteProfilePageProps) {
  const { getToken } = useAuth();
  const { signOut } = useClerk();

  // Personal Details
  const [studentNumber, setStudentNumber] = useState('');
  const [course, setCourse] = useState('');
  const [college, setCollege] = useState('');
  const [programCode, setProgramCode] = useState('');
  const [yearLevel, setYearLevel] = useState('1st Year');
  const [section, setSection] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [nationality, setNationality] = useState('');
  const [placeOfBirth, setPlaceOfBirth] = useState('');
  const [civilStatus, setCivilStatus] = useState('');
  const [gpa, setGpa] = useState('');

  // Contact Information
  const [homeAddress, setHomeAddress] = useState('');
  const [cityMunicipality, setCityMunicipality] = useState('');
  const [province, setProvince] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [country, setCountry] = useState('Philippines');
  const [telephoneNumber, setTelephoneNumber] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');

  // Parents / Guardian Information
  const [fatherName, setFatherName] = useState('');
  const [motherName, setMotherName] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianRelationship, setGuardianRelationship] = useState('');
  const [guardianAddress, setGuardianAddress] = useState('');
  const [guardianContactNo, setGuardianContactNo] = useState('');

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!studentNumber.trim()) {
      setError('Student number is required.');
      return;
    }

    if (gpa.trim() && (Number.isNaN(Number(gpa)) || Number(gpa) < 1.0 || Number(gpa) > 5.0)) {
      setError('GPA must be a number between 1.0 and 5.0.');
      return;
    }

    setSubmitting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE_URL}/api/students/complete-profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          studentNumber,
          course,
          college,
          programCode,
          yearLevel,
          section,
          dateOfBirth: dateOfBirth || undefined,
          nationality,
          placeOfBirth,
          civilStatus: civilStatus || undefined,
          gpa: gpa.trim() ? gpa : undefined,
          homeAddress,
          cityMunicipality,
          province,
          zipCode,
          country,
          telephoneNumber,
          mobileNumber,
          fatherName,
          motherName,
          guardianName,
          guardianRelationship,
          guardianAddress,
          guardianContactNo,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to save your profile.');
        setSubmitting(false);
        return;
      }

      onComplete(data.student);
    } catch {
      setError('Something went wrong. Please check your connection and try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-xl p-8 sm:p-10 space-y-8">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-brand-green flex items-center justify-center mx-auto">
            <GraduationCap className="w-6 h-6" />
          </div>
          <h1 className="font-display font-black text-xl text-slate-900">Complete Your Profile</h1>
          <p className="text-xs text-slate-500 leading-relaxed">
            Just a few details before you continue to the portal.
          </p>
        </div>

        {error && (
          <div className="p-3.5 bg-rose-50 text-rose-700 rounded-xl border border-rose-100 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">

          {/* Personal Details */}
          <section className="space-y-4">
            <SectionHeading icon={GraduationCap} title="Personal Details" subtitle="Your academic and personal identity" />

            <div>
              <label className={labelClass}>Student Number</label>
              <input
                type="text"
                placeholder="e.g. 202312345"
                value={studentNumber}
                onChange={e => setStudentNumber(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Course / Program</label>
                <input
                  type="text"
                  placeholder="e.g. BS Information Technology"
                  value={course}
                  onChange={e => setCourse(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>College</label>
                <input
                  type="text"
                  placeholder="e.g. CICS"
                  value={college}
                  onChange={e => setCollege(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Program Code</label>
                <input
                  type="text"
                  placeholder="e.g. BSIT"
                  value={programCode}
                  onChange={e => setProgramCode(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Year Level</label>
                <select value={yearLevel} onChange={e => setYearLevel(e.target.value)} className={inputClass}>
                  <option value="1st Year">1st Year</option>
                  <option value="2nd Year">2nd Year</option>
                  <option value="3rd Year">3rd Year</option>
                  <option value="4th Year">4th Year</option>
                  <option value="5th Year">5th Year</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Section</label>
                <input
                  type="text"
                  placeholder="e.g. BIT44"
                  value={section}
                  onChange={e => setSection(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Date of Birth</label>
                <input
                  type="date"
                  value={dateOfBirth}
                  onChange={e => setDateOfBirth(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Civil Status</label>
                <select value={civilStatus} onChange={e => setCivilStatus(e.target.value)} className={inputClass}>
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
                <input
                  type="text"
                  placeholder="e.g. Filipino"
                  value={nationality}
                  onChange={e => setNationality(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Place of Birth</label>
                <input
                  type="text"
                  placeholder="e.g. Dasmariñas, Cavite"
                  value={placeOfBirth}
                  onChange={e => setPlaceOfBirth(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Current GPA</label>
              <input
                type="number"
                step="0.01"
                min="1"
                max="5"
                placeholder="e.g. 1.75"
                value={gpa}
                onChange={e => setGpa(e.target.value)}
                className={inputClass}
              />
            </div>
          </section>

          {/* Contact Information */}
          <section className="space-y-4">
            <SectionHeading icon={MapPin} title="Contact Information" subtitle="Where and how we can reach you" />

            <div>
              <label className={labelClass}>Complete Home Address</label>
              <input
                type="text"
                placeholder="House No., Street, Barangay"
                value={homeAddress}
                onChange={e => setHomeAddress(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>City / Municipality</label>
                <input
                  type="text"
                  value={cityMunicipality}
                  onChange={e => setCityMunicipality(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Province</label>
                <input
                  type="text"
                  value={province}
                  onChange={e => setProvince(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Zip Code</label>
                <input
                  type="text"
                  value={zipCode}
                  onChange={e => setZipCode(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Country</label>
              <input
                type="text"
                value={country}
                onChange={e => setCountry(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Telephone Number</label>
                <input
                  type="tel"
                  placeholder="e.g. (046) 123 4567"
                  value={telephoneNumber}
                  onChange={e => setTelephoneNumber(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Mobile Number</label>
                <input
                  type="tel"
                  placeholder="e.g. 09XX XXX XXXX"
                  value={mobileNumber}
                  onChange={e => setMobileNumber(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          {/* Parents / Guardian Information */}
          <section className="space-y-4">
            <SectionHeading icon={Users} title="Parents / Guardian Information" subtitle="Who we contact in case of emergency" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Father</label>
                <input
                  type="text"
                  placeholder="Father's full name"
                  value={fatherName}
                  onChange={e => setFatherName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Mother</label>
                <input
                  type="text"
                  placeholder="Mother's full name"
                  value={motherName}
                  onChange={e => setMotherName(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Guardian</label>
                <input
                  type="text"
                  placeholder="Guardian's full name"
                  value={guardianName}
                  onChange={e => setGuardianName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Relationship (Guardian)</label>
                <input
                  type="text"
                  placeholder="e.g. Aunt, Grandparent"
                  value={guardianRelationship}
                  onChange={e => setGuardianRelationship(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Guardian Address</label>
              <input
                type="text"
                value={guardianAddress}
                onChange={e => setGuardianAddress(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Guardian Contact No.</label>
              <input
                type="tel"
                value={guardianContactNo}
                onChange={e => setGuardianContactNo(e.target.value)}
                className={inputClass}
              />
            </div>
          </section>

          <button
            type="submit"
            disabled={submitting}
            className="w-full font-display font-bold uppercase text-xs tracking-wider text-white bg-brand-green hover:bg-brand-green-dark px-5 py-3.5 rounded-xl transition-all shadow-md shadow-emerald-900/10 disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Continue to Portal'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => signOut()}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-slate-400 hover:text-rose-500 transition-colors focus:outline-hidden pt-2"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Not you? Sign out</span>
        </button>
      </div>
    </div>
  );
}