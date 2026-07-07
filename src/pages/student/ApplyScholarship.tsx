import React, { useState } from 'react';
import { Scholarship, StudentProfile, Application } from '../../types';
import { ArrowLeft, FileText, CheckCircle, Upload, Trash2, ShieldAlert, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface ApplyScholarshipProps {
  scholarship: Scholarship;
  student: StudentProfile;
  onBack: () => void;
  onSubmitApplication: (application: Application) => void;
  id?: string;
}

interface UploadedFile {
  docName: string;
  fileName: string;
  fileSize: string;
}

export default function ApplyScholarship({
  scholarship,
  student,
  onBack,
  onSubmitApplication,
  id
}: ApplyScholarshipProps) {
  // Form input states (prepopulated with student info)
  const [firstName, setFirstName] = useState(student.name.split(' ')[0] || '');
  const [lastName, setLastName] = useState(student.name.split(' ').slice(1).join(' ') || '');
  const [email, setEmail] = useState(student.email);
  const [phone, setPhone] = useState('+63 917 123 4567');
  const [studentNumber, setStudentNumber] = useState(student.studentNumber);
  const [program, setProgram] = useState(student.course);
  const [yearLevel, setYearLevel] = useState(student.yearLevel);
  const [gpa, setGpa] = useState(student.gpa);

  // Track mock file uploads per document requirement
  const [uploads, setUploads] = useState<Record<string, UploadedFile>>({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Trigger file upload simulation
  const handleFileChange = (docName: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      
      setUploads(prev => ({
        ...prev,
        [docName]: {
          docName,
          fileName: file.name,
          fileSize: `${fileSizeMB} MB`
        }
      }));
    }
  };

  // Remove mock file
  const removeFile = (docName: string) => {
    setUploads(prev => {
      const copy = { ...prev };
      delete copy[docName];
      return copy;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    // Check if all document requirements have been uploaded
    const missingDocs = scholarship.requirements.filter(req => !uploads[req]);
    if (missingDocs.length > 0) {
      setFormError(`Please upload all required files. Missing: ${missingDocs.slice(0, 2).join(', ')}${missingDocs.length > 2 ? ' and others.' : '.'}`);
      return;
    }

    if (!firstName || !lastName || !email || !studentNumber || !program || !yearLevel || !gpa) {
      setFormError('Please fill in all personal information fields.');
      return;
    }

    setIsSubmitting(true);

    // Simulate LSO identity routing and electronic submission
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true);

      const newApplication: Application = {
        id: `app_${Math.random().toString(36).substr(2, 9)}`,
        scholarshipId: scholarship.id,
        scholarshipName: scholarship.name,
        personalInfo: {
          firstName,
          lastName,
          email,
          phone,
          studentNumber
        },
        program,
        yearLevel,
        gpa,
        documents: scholarship.requirements.map(req => ({
          name: req,
          uploaded: true,
          fileName: uploads[req]?.fileName
        })),
        status: 'Under Evaluation',
        submittedAt: new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      };

      // Notify App to store application
      onSubmitApplication(newApplication);
    }, 1500);
  };

  if (isSuccess) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 md:p-12 text-center max-w-xl mx-auto space-y-6 shadow-xl my-8">
        <div className="w-16 h-16 rounded-full bg-emerald-100 text-brand-green flex items-center justify-center mx-auto shadow-md">
          <CheckCircle className="w-10 h-10" />
        </div>
        <div className="space-y-2">
          <h2 className="font-display font-black text-2xl text-slate-900 tracking-tight">Application Submitted Successfully!</h2>
          <p className="text-xs font-semibold text-brand-green uppercase tracking-wider">Reference Code: DLSU-D-LSO-{Math.floor(Math.random() * 900000 + 100000)}</p>
        </div>
        <p className="text-sm text-slate-500 leading-relaxed max-w-sm mx-auto">
          Your application for the <strong>{scholarship.name}</strong> has been received by the Linkages and Scholarship Office (LSO).
        </p>
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-left text-xs text-slate-500 space-y-2">
          <p><strong>What happens next?</strong></p>
          <p>1. LSO Officers will verify your uploaded grades and certifications.</p>
          <p>2. Keep an eye on your email and the Portal notifications tab for updates.</p>
          <p>3. Do not re-submit unless requested by the coordinators.</p>
        </div>
        <button
          onClick={onBack}
          className="inline-flex items-center space-x-1 font-display font-bold uppercase text-xs tracking-wider text-white bg-brand-green hover:bg-brand-green-dark px-6 py-3.5 rounded-xl transition-all shadow-md shadow-emerald-900/10 focus:outline-hidden"
        >
          <span>Return to Dashboard</span>
        </button>
      </div>
    );
  }

  return (
    <div id={id} className="space-y-6">
      {/* Back Link */}
      <button
        onClick={onBack}
        className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-500 hover:text-brand-green transition-colors focus:outline-hidden"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Scholarship Details</span>
      </button>

      {/* Form Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-xs">
        <h2 className="font-display font-black text-xl md:text-2xl text-slate-900 tracking-tight">
          Application Form: <span className="text-brand-green">{scholarship.name}</span>
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Complete the forms below and upload digital files. Please review your profiles carefully before submission.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Columns: Personal Info & Details (Col-span 2) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-xs space-y-6">
            <h3 className="font-display font-bold text-base text-slate-900 border-b border-slate-100 pb-2 mb-4">
              Personal & Academic Profile
            </h3>

            {formError && (
              <div className="p-4 bg-rose-50 text-rose-800 rounded-xl border border-rose-100 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* First Name */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">First Name</label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all"
                />
              </div>

              {/* Last Name */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Last Name</label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all"
                />
              </div>

              {/* Email Address */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all"
                />
              </div>

              {/* Contact Phone */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Mobile Phone</label>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all"
                />
              </div>

              {/* Student Number */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Student Number</label>
                <input
                  type="text"
                  required
                  value={studentNumber}
                  onChange={(e) => setStudentNumber(e.target.value)}
                  className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50/20 text-slate-500 cursor-not-allowed"
                  disabled
                />
              </div>

              {/* Academic Course Program */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Academic Program (Course)</label>
                <input
                  type="text"
                  required
                  value={program}
                  onChange={(e) => setProgram(e.target.value)}
                  className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all"
                />
              </div>

              {/* Year Level */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Year Level</label>
                <select
                  value={yearLevel}
                  onChange={(e) => setYearLevel(e.target.value)}
                  className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all"
                >
                  <option value="1st Year">1st Year</option>
                  <option value="2nd Year">2nd Year</option>
                  <option value="3rd Year">3rd Year</option>
                  <option value="4th Year">4th Year</option>
                  <option value="5th Year">5th Year</option>
                </select>
              </div>

              {/* Grade GPA */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Cumulative GPA</label>
                <input
                  type="text"
                  required
                  value={gpa}
                  onChange={(e) => setGpa(e.target.value)}
                  className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Document Checklist & Submit (Col-span 1) */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
            <div>
              <h3 className="font-display font-bold text-base text-slate-900 border-b border-slate-100 pb-2">
                Document Checklist
              </h3>
              <p className="text-[11px] text-slate-400 mt-1">Select and upload digital scans corresponding to each requested file.</p>
            </div>

            <div className="space-y-4">
              {scholarship.requirements.map((req, idx) => {
                const uploadedFile = uploads[req];
                return (
                  <div key={idx} className="p-3 border border-slate-200 rounded-xl space-y-2 bg-slate-50/30">
                    <p className="text-xs font-bold text-slate-700 leading-snug">{req}</p>
                    
                    {uploadedFile ? (
                      <div className="flex items-center justify-between p-2 bg-emerald-50 rounded-lg border border-emerald-100 text-xs">
                        <div className="flex items-center space-x-2 truncate">
                          <FileText className="w-4 h-4 text-brand-green shrink-0" />
                          <div className="truncate">
                            <p className="font-semibold text-slate-800 truncate leading-tight">{uploadedFile.fileName}</p>
                            <span className="text-[10px] text-slate-400 block">{uploadedFile.fileSize}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(req)}
                          className="p-1.5 text-rose-500 hover:bg-rose-100 rounded-md transition-colors"
                          title="Remove File"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center justify-center border-2 border-dashed border-slate-200 hover:border-brand-green/40 hover:bg-brand-green/2 rounded-lg p-3 cursor-pointer transition-colors text-xs text-slate-500 font-semibold gap-1.5">
                        <Upload className="w-4 h-4 text-slate-400" />
                        <span>Select Document</span>
                        <input
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg"
                          onChange={(e) => handleFileChange(req, e)}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Submit Action */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full font-display font-bold uppercase text-xs tracking-wider text-white bg-brand-green hover:bg-brand-green-dark px-5 py-4 rounded-xl transition-all duration-200 shadow-md shadow-emerald-900/10 flex items-center justify-center space-x-1.5 focus:outline-hidden disabled:opacity-50"
              >
                <span>{isSubmitting ? 'Submitting Application...' : 'Submit Application'}</span>
              </button>
            </div>
          </div>

          {/* LSO Security Notice */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-2.5">
            <ShieldAlert className="w-4.5 h-4.5 text-slate-400 shrink-0 mt-0.5" />
            <div className="text-[10px] text-slate-500 leading-relaxed">
              <span className="font-bold">Privacy Certification:</span> LSO complies with the Philippine Data Privacy Act of 2012. Information submitted is kept confidential and utilized solely for scholarship scoring.
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
