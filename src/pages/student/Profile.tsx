import React, { useState } from 'react';
import { BadgeCheck, GraduationCap, Info, MapPin, Pencil, User, Users } from 'lucide-react';
import { ProfileChanges, SaveResult, StudentProfile, VerificationGroup } from '../../types';
import { Badge, Button, Toast } from '../admin/AdminUI';
import EditProfileDialog from '../../components/profile/EditProfileDialog';
import { DraftField, DraftSection } from '../../components/profile/profileForm';
import { displayName, nameInitials, titleCaseName } from '../../utils/names';
import {
  addressLines, formatGpa, formatLongDate, formatPhone, guardianTypeOf, openCorrectionRequest, programDetails,
  verificationOf, verificationText
} from '../../utils/profile';

// The student's profile: a header with who they are, then Academic,
// Personal, Contact and Parents & guardian as label / value lists. Every
// section opens the edit dialog on its own tab.

interface ProfileProps {
  student: StudentProfile;
  onUpdateProfile: (changes: ProfileChanges) => Promise<SaveResult>;
  onStudentUpdated: (student: StudentProfile) => void;
  id?: string;
}

const GROUPS: VerificationGroup[] = ['program', 'enrollment', 'gpa'];

export default function Profile({ student, onUpdateProfile, onStudentUpdated, id }: ProfileProps) {
  const [editing, setEditing] = useState<{ section: DraftSection; field?: DraftField } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const name = displayName(student);
  const program = programDetails(student);
  const verified = GROUPS.filter(g => verificationOf(student, g));
  const allVerified = verified.length === GROUPS.length;
  const edit = (section: DraftSection, field?: DraftField) => setEditing({ section, field });
  const subtitle = [program.code || program.name, student.yearLevel, student.section].filter(Boolean).join(' · ');

  return (
    <div id={id} data-admin className="space-y-6 text-ink">
      {/* Header */}
      <section aria-label="Your profile" className="rounded-card bg-surface p-5 shadow-card ring-1 ring-line sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {student.avatarUrl && !avatarFailed ? (
            <img src={student.avatarUrl} alt="" onError={() => setAvatarFailed(true)} className="size-16 shrink-0 rounded-full object-cover ring-1 ring-line" />
          ) : (
            <span aria-hidden className="flex size-16 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-lg font-semibold text-accent">{nameInitials(name)}</span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-title font-semibold text-ink">{name}</h2>
                  {allVerified && <Badge tone="success" icon={BadgeCheck}>Verified</Badge>}
                </div>
                <p className="mt-1 text-sm text-ink-muted">
                  <span className="tabular-nums">{student.studentNumber}</span>
                  {subtitle && <> · {subtitle}</>}
                </p>
                <p className="mt-0.5 break-all text-sm text-ink-muted">{student.email}</p>
              </div>
              <Button icon={Pencil} onClick={() => edit('academic')} className="self-start">Edit profile</Button>
            </div>
          </div>
        </div>
        {!allVerified && (
          <div className="mt-5 flex items-start gap-2.5 rounded-control bg-surface-muted px-3.5 py-3 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
            <div>
              <p className="font-medium text-ink">Some details are self-reported</p>
              <p className="mt-0.5 text-ink-muted">
                Your program, year level and GPA are as you entered them. The scholarship office checks them against university records when it reviews your applications, and marks them verified.
              </p>
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Section title="Academic" icon={GraduationCap} onEdit={() => edit('academic')}>
          <Row label="Program" tag={<VerifyTag student={student} group="program" />}
            value={program.name ? <>{program.name}{program.code && <span className="text-ink-subtle"> · {program.code}</span>}</> : null}
            onAdd={() => edit('academic', 'programCode')} />
          <Row label="Department" value={program.college} onAdd={() => edit('academic', 'programCode')} />
          <Row label="Year level" tag={<VerifyTag student={student} group="enrollment" />} value={student.yearLevel} onAdd={() => edit('academic', 'yearLevel')} />
          <Row label="Section" value={student.section} onAdd={() => edit('academic', 'section')} />
          <Row label="Cumulative GPA" tag={<VerifyTag student={student} group="gpa" />} value={formatGpa(student.gpa)} onAdd={() => edit('academic', 'gpa')} />
        </Section>

        <Section title="Personal" icon={User} onEdit={() => edit('personal')}>
          <Row label="Date of birth" value={formatLongDate(student.dateOfBirth)} onAdd={() => edit('personal', 'dateOfBirth')} />
          <Row label="Place of birth" value={student.placeOfBirth} onAdd={() => edit('personal', 'placeOfBirth')} />
          <Row label="Nationality" value={student.nationality} onAdd={() => edit('personal', 'nationality')} />
          <Row label="Civil status" value={student.civilStatus} onAdd={() => edit('personal', 'civilStatus')} />
        </Section>

        <Section title="Contact" icon={MapPin} onEdit={() => edit('contact')}>
          <Row label="University email" value={<span className="break-all">{student.email}</span>} />
          <Row label="Mobile" value={formatPhone(student.mobileNumber)} onAdd={() => edit('contact', 'mobileNumber')} />
          <Row label="Telephone" value={student.telephoneNumber} onAdd={() => edit('contact', 'telephoneNumber')} />
          <Row label="Home address" value={<Lines lines={addressLines(student)} />} empty={!student.homeAddress && !student.cityMunicipality} onAdd={() => edit('contact', 'homeAddress')} />
        </Section>

        <Section title="Parents & guardian" icon={Users} onEdit={() => edit('family')}>
          <Row label="Father" value={person(student.fatherName, student.fatherContactNo)} onAdd={() => edit('family', 'fatherName')} />
          <Row label="Mother" value={person(student.motherName, student.motherContactNo)} onAdd={() => edit('family', 'motherName')} />
          <Row label="Guardian" value={<Guardian student={student} />} empty={!guardianTypeOf(student)} onAdd={() => edit('family', 'guardianType')} />
        </Section>
      </div>

      {editing && (
        <EditProfileDialog
          student={student}
          initialSection={editing.section}
          focusField={editing.field}
          onSave={onUpdateProfile}
          onStudentUpdated={onStudentUpdated}
          onClose={saved => { setEditing(null); if (saved) setToast('Profile saved.'); }}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast(null)} duration={4000} />}
    </div>
  );
}

// --- Pieces ------------------------------------------------------------------------------

function Section({ title, icon: Icon, onEdit, children }: { title: string; icon: React.ElementType; onEdit: () => void; children: React.ReactNode }) {
  const headingId = `profile-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <section aria-labelledby={headingId} className="rounded-card bg-surface shadow-card ring-1 ring-line">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h3 id={headingId} className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Icon className="size-4 text-ink-subtle" aria-hidden />
          {title}
        </h3>
        <Button size="sm" variant="ghost" onClick={onEdit} aria-label={`Edit ${title.toLowerCase()}`}>Edit</Button>
      </header>
      <dl className="divide-y divide-line px-5">{children}</dl>
    </section>
  );
}

// One label / value line. An empty value shows "Not provided" with an Add link.
function Row({ label, value, tag, onAdd, empty }: {
  label: string;
  value: React.ReactNode;
  tag?: React.ReactNode;
  onAdd?: () => void;
  // Overrides the emptiness check for composite values.
  empty?: boolean;
}) {
  const isEmpty = empty ?? (value === null || value === undefined || value === '');
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 py-3 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
      <dt className="text-sm text-ink-subtle">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1 text-sm text-ink">
        {isEmpty ? (
          <span className="text-ink-subtle">
            Not provided
            {onAdd && (
              <>
                {' · '}
                <button type="button" onClick={onAdd} className="font-medium text-accent hover:underline" aria-label={`Add ${label.toLowerCase()}`}>Add</button>
              </>
            )}
          </span>
        ) : (
          <span className="min-w-0 wrap-break-word">{value}</span>
        )}
        {!isEmpty && tag}
      </dd>
    </div>
  );
}

function Lines({ lines }: { lines: string[] }) {
  return <>{lines.map((l, i) => <span key={i} className="block">{l}</span>)}</>;
}

function person(name?: string, contact?: string): React.ReactNode {
  if (!name) return null;
  return (
    <>
      <span className="block">{titleCaseName(name)}</span>
      {contact && <span className="block text-ink-muted tabular-nums">{formatPhone(contact)}</span>}
    </>
  );
}

function Guardian({ student }: { student: StudentProfile }) {
  const type = guardianTypeOf(student);
  const contact = student.guardianContactNo ? <span className="block text-ink-muted tabular-nums">{formatPhone(student.guardianContactNo)}</span> : null;
  if (type === 'father' || type === 'mother') {
    return <><span className="block">{type === 'father' ? 'Father' : 'Mother'} <span className="text-ink-subtle">(same as above)</span></span>{contact}</>;
  }
  if (type === 'other') {
    return (
      <>
        <span className="block">{titleCaseName(student.guardianName ?? '')}{student.guardianRelationship && <span className="text-ink-subtle"> · {student.guardianRelationship}</span>}</span>
        {contact}
        {student.guardianAddress && <span className="block text-ink-muted">{student.guardianAddress}</span>}
      </>
    );
  }
  return null;
}

// "Verified" (with who and when) or "Self-reported"; "Correction requested"
// while a request is open.
function VerifyTag({ student, group }: { student: StudentProfile; group: VerificationGroup }) {
  if (openCorrectionRequest(student, group)) return <Badge tone="warning">Correction requested</Badge>;
  const v = verificationOf(student, group);
  return (
    <span title={verificationText(student, group)}>
      {v ? <Badge tone="success" icon={BadgeCheck}>Verified</Badge> : <Badge>Self-reported</Badge>}
    </span>
  );
}
