import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { GrantSibling } from '../../types';
import { ALUMNI_INSTITUTIONS, ALUMNI_RELATIONSHIPS } from '../../data/scholarships';
import {
  CIVIL_STATUS_OPTIONS, FAMILY_INCOME_BRACKETS, GENDER_OPTIONS, MONTHLY_EXPENSE_BRACKETS,
  VALUE_BRACKETS, YEAR_LEVEL_OPTIONS, YES_NO, calculateAge, certificationText, newRowId
} from '../../utils/grantForms';
import { checkApplyEligibility } from '../../utils/eligibility';
import {
  Block, CheckboxField, ChoiceField, ComputedField, FileSlotField, NumberField, RepeatableList,
  SelectField, SubHeading, TextField, useGrantForm
} from './fields';

// Application-form sections shared by every grant-form scholarship
// (POLCA Form No. 002 and the alumni form). Only the eligibility step and
// the certification wording differ per scholarship.

export function EligibilitySection() {
  const { scholarship, values, errors } = useGrantForm();
  const criteria = scholarship.eligibilityCriteria ?? {};
  const answers = values.eligibilityAnswers;
  const reasons = checkApplyEligibility(scholarship, answers);

  const polcaAnswered = typeof answers.hsGeneralAverage === 'number' && typeof answers.lowestHsGrade === 'number';
  const alumniAnswered = !!answers.relationship && !!answers.institution;
  const answered = criteria.alumniRelation ? alumniAnswered : polcaAnswered;

  return (
    <div className="space-y-6">
      {criteria.minHsGeneralAverage !== undefined && (
        <Block>
          <SubHeading note={`Your high school general average must be at least ${criteria.minHsGeneralAverage}, with no grade in the 70s.`}>
            High School Grades
          </SubHeading>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <NumberField path="eligibilityAnswers.hsGeneralAverage" label="HS General Average" required allowEmpty min={60} max={100} placeholder="e.g. 90" />
            <NumberField path="eligibilityAnswers.lowestHsGrade" label="Lowest Grade in Any Subject" required allowEmpty min={60} max={100} placeholder="e.g. 84" hint="Your single lowest final grade in high school." />
          </div>
        </Block>
      )}

      {criteria.requiresNoBoardRelation && (
        <Block>
          <SubHeading>Declaration</SubHeading>
          <CheckboxField
            path="eligibilityAnswers.notRelatedToBoardMember"
            label="I declare that I am not related by consanguinity to any current member of the POLCA Board of Trustees."
          />
        </Block>
      )}

      {criteria.alumniRelation && (
        <Block>
          <SubHeading note="You must be related to the alumnus/alumna up to the 2nd degree of consanguinity.">
            Alumni Relation
          </SubHeading>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField path="eligibilityAnswers.alumnusName" label="Alumnus / Alumna Full Name" required className="sm:col-span-2" />
            <SelectField path="eligibilityAnswers.relationship" label="Relationship to You" required options={ALUMNI_RELATIONSHIPS} hint="1st degree: parent. 2nd degree: sibling, grandparent, grandchild." />
            <SelectField path="eligibilityAnswers.institution" label="Alumni Institution" required options={ALUMNI_INSTITUTIONS} />
            <TextField path="eligibilityAnswers.batchYear" label="Batch / Year Graduated" required placeholder="e.g. 1998" maxLength={4} />
          </div>
        </Block>
      )}

      {answered && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-xl border flex items-start gap-2.5 text-xs ${
            reasons.length ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-brand-green-dark'
          }`}
        >
          {reasons.length ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
          <div className="space-y-1">
            <p className="font-bold">{reasons.length ? 'You don’t meet the requirements for this scholarship yet' : 'You meet the application requirements'}</p>
            {reasons.map(r => <p key={r}>{r}</p>)}
          </div>
        </motion.div>
      )}
      {errors.eligibility && !answered && (
        <p className="text-xs font-semibold text-rose-600">{errors.eligibility}</p>
      )}
    </div>
  );
}

export function StudentDataSection() {
  const { values, scholarship } = useGrantForm();
  const age = calculateAge(values.personalInfo.dateOfBirth);
  const photoSlot = scholarship.documentSlots?.find(s => s.key === 'photo2x2');

  return (
    <div className="space-y-6">
      <Block>
        <SubHeading note="Prefilled from your student profile — please check each entry.">Student Data</SubHeading>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <TextField path="personalInfo.lastName" label="Last Name" required />
          <TextField path="personalInfo.firstName" label="First Name" required />
          <TextField path="personalInfo.middleName" label="Middle Name" />
          <TextField path="personalInfo.studentNumber" label="Student No." disabled />
          <TextField path="personalInfo.course" label="Course" required />
          <SelectField path="personalInfo.yearLevel" label="Year Level" required options={YEAR_LEVEL_OPTIONS} />
          <TextField path="personalInfo.dateOfBirth" label="Date of Birth" type="date" required />
          <ComputedField label="Age" value={age ?? '—'} />
          <TextField path="personalInfo.placeOfBirth" label="Place of Birth" required />
          <SelectField path="personalInfo.civilStatus" label="Civil Status" required options={CIVIL_STATUS_OPTIONS} />
          <SelectField path="personalInfo.gender" label="Gender" required options={GENDER_OPTIONS} />
          <TextField path="personalInfo.citizenship" label="Citizenship" required placeholder="e.g. Filipino" />
          <TextField path="personalInfo.religion" label="Religion" required />
          <TextField path="personalInfo.email" label="Email Address" type="email" required className="sm:col-span-2" />
        </div>
      </Block>
      <Block>
        <SubHeading>Secondary School</SubHeading>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <TextField path="personalInfo.secondarySchool" label="Secondary School Attended" required className="sm:col-span-2" />
          <ChoiceField path="personalInfo.secondarySchoolType" label="Type" required options={['Public', 'Private']} />
        </div>
      </Block>
      {photoSlot && (
        <Block>
          <SubHeading note="Taken within the last 3 months.">2x2 Photo</SubHeading>
          <FileSlotField slot={photoSlot} required compact />
        </Block>
      )}
    </div>
  );
}

export function FamilyContactSection() {
  return (
    <div className="space-y-6">
      <Block>
        <SubHeading note={'Write "N/A" for a parent who is deceased or not in the picture, with a monthly income of 0.'}>Parents</SubHeading>
        <div className="space-y-4">
          {(['father', 'mother'] as const).map(who => (
            <div key={who} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <TextField path={`parentsGuardian.${who}.name`} label={who === 'father' ? "Father's Name" : "Mother's Name"} required />
              <TextField path={`parentsGuardian.${who}.occupation`} label="Occupation" required />
              <NumberField path={`parentsGuardian.${who}.monthlyIncome`} label="Monthly Income" peso required />
            </div>
          ))}
        </div>
      </Block>
      <Block>
        <SubHeading>Contact Information</SubHeading>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField path="contactSchool.streetAddress" label="Street Address" required className="sm:col-span-2" />
          <TextField path="contactSchool.barangay" label="Barangay" required />
          <TextField path="contactSchool.municipality" label="City / Municipality" required />
          <TextField path="contactSchool.province" label="Province" required />
          <TextField path="contactSchool.landlineNo" label="Landline No." type="tel" />
          <TextField path="contactSchool.mobileNo" label="Mobile No." type="tel" required placeholder="09171234567" />
        </div>
      </Block>
      <Block>
        <SubHeading note="Leave blank if you live with your parents.">Guardian</SubHeading>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField path="parentsGuardian.guardian.name" label="Guardian's Name" />
          <TextField path="parentsGuardian.guardian.relationship" label="Relationship" />
          <TextField path="parentsGuardian.guardian.address" label="Address" className="sm:col-span-2" />
          <TextField path="parentsGuardian.guardian.landlineNo" label="Landline No." type="tel" />
          <TextField path="parentsGuardian.guardian.mobileNo" label="Mobile No." type="tel" placeholder="09171234567" />
        </div>
      </Block>
    </div>
  );
}

export function SiblingsSection() {
  return (
    <div className="space-y-4">
      <SubHeading note="List all your brothers and sisters. Fill in the school fields if they are studying, or the company if employed.">Siblings</SubHeading>
      <RepeatableList<GrantSibling>
        path="siblings"
        itemLabel="Sibling"
        emptyText="No siblings added. Skip this step if you are an only child."
        addLabel="Add sibling"
        newItem={() => ({ id: newRowId('sib'), name: '', civilStatus: 'Single', age: 0, school: '', yearLevel: '', schoolType: 'N/A', company: '' })}
        renderRow={base => (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <TextField path={`${base}.name`} label="Name" required className="sm:col-span-2" />
            <NumberField path={`${base}.age`} label="Age" integer max={120} />
            <SelectField path={`${base}.civilStatus`} label="Civil Status" options={CIVIL_STATUS_OPTIONS} />
            <TextField path={`${base}.school`} label="School (if studying)" />
            <TextField path={`${base}.yearLevel`} label="Year Level" />
            <ChoiceField path={`${base}.schoolType`} label="School Type" options={['Public', 'Private', 'N/A']} />
            <TextField path={`${base}.company`} label="Company (if employed)" className="sm:col-span-2" />
          </div>
        )}
      />
    </div>
  );
}

export function FinancialInfoSection() {
  const { values } = useGrantForm();
  return (
    <div className="space-y-6">
      <Block>
        <SubHeading>Assets Owned by the Family</SubHeading>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <ChoiceField path="assetsExpenses.houseTenure" label="House and Lot" required options={['Owned', 'Rented', 'Mortgaged']} />
          <SelectField path="assetsExpenses.houseValue" label="House and Lot Value" required options={VALUE_BRACKETS} />
          <ChoiceField path="assetsExpenses.hasAutomobile" label="Automobile" required options={YES_NO} />
          {values.assetsExpenses.hasAutomobile === 'Yes' && (
            <SelectField path="assetsExpenses.automobileValue" label="Automobile Value" required options={VALUE_BRACKETS} />
          )}
        </div>
      </Block>
      <Block>
        <SubHeading>Income & Expenses</SubHeading>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <SelectField path="assetsExpenses.familyIncomeBracket" label="Combined Family Monthly Income" required options={FAMILY_INCOME_BRACKETS} />
          <SelectField path="assetsExpenses.monthlyExpensesBracket" label="Monthly Expenses" required options={MONTHLY_EXPENSE_BRACKETS} />
        </div>
      </Block>
    </div>
  );
}

export function CertificationSection() {
  const { scholarship, errors } = useGrantForm();
  const hasError = !!errors['agreement.agreed'];
  return (
    <div className="space-y-5">
      <div className={`border rounded-xl p-4 ${hasError ? 'border-rose-400 bg-rose-50/60' : 'border-amber-300 bg-amber-50/50'}`}>
        <CheckboxField path="agreement.agreed" label={certificationText(scholarship)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField path="agreement.applicantName" label="Printed Name of Applicant" required hint="Typing your name serves as your signature." />
        <TextField path="agreement.parentGuardianName" label="Printed Name of Parent / Guardian" required />
      </div>
    </div>
  );
}
