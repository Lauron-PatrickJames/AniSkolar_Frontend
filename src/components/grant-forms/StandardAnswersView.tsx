import React from 'react';
import { SfagApplicationDetails } from '../../types';
import { AnswerCheck, AnswerField, AnswerGrid, AnswerGroup, RowsTable } from './GrantAnswersView';

// Read-only review of the SFAG and Entrance (standard) applications, laid
// out like the POLCA / Alumni review (GrantAnswersView). Used by the
// Review & Submit step in ApplyScholarship.tsx.

function formatDate(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export interface StandardProfileInfo {
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  phone: string;
  studentNumber: string;
  program: string;
  yearLevel: string;
  gpa: string;
}

export function StandardProfileAnswers({ info }: { info: StandardProfileInfo }) {
  return (
    <AnswerGroup title="Personal & Academic Profile">
      <AnswerGrid>
        <AnswerField summary label="First Name" value={info.firstName} />
        <AnswerField summary label="Middle Name" value={info.middleName} />
        <AnswerField summary label="Last Name" value={info.lastName} />
        <AnswerField summary label="Student No." value={info.studentNumber} />
        <AnswerField summary label="Email" value={info.email} />
        <AnswerField summary label="Mobile" value={info.phone} />
        <AnswerField summary label="Program" value={info.program} />
        <AnswerField summary label="Year Level" value={info.yearLevel} />
        <AnswerField label="Cumulative GPA" value={info.gpa} />
      </AnswerGrid>
    </AnswerGroup>
  );
}

export function SfagAnswers({ details }: { details: SfagApplicationDetails }) {
  const p = details.personalInfo;
  const c = details.contactSchool;
  const pg = details.parentsGuardian;
  const a = details.assetsExpenses;
  const parentRow = (label: string, parent: typeof pg.father) => [
    label, parent.fullName, parent.occupation, parent.company, parent.companyTel, parent.monthlyIncome, parent.isSoloParent ? 'Yes' : 'No'
  ];

  return (
    <div className="space-y-7">
      <AnswerGroup title="Personal Information">
        <AnswerGrid>
          <AnswerField summary label="Last Name" value={p.lastName} />
          <AnswerField summary label="First Name" value={p.firstName} />
          <AnswerField label="M.I. / Suffix" value={[p.middleInitial, p.suffix].filter(Boolean).join(' / ')} />
          <AnswerField summary label="Student No." value={p.studentNumber} />
          <AnswerField summary label="Course / Year" value={[p.course, p.yearLevel].filter(Boolean).join(' · ')} />
          <AnswerField label="Date of Birth" value={formatDate(p.dateOfBirth)} />
          <AnswerField label="Age" value={p.age} />
          <AnswerField label="Place of Birth" value={p.placeOfBirth} />
          <AnswerField label="Civil Status" value={p.civilStatus} />
          <AnswerField label="Gender" value={p.gender} />
          <AnswerField label="Nationality" value={p.nationality} />
          <AnswerField label="PWD" value={p.isPwd ? 'Yes' : 'No'} />
          <AnswerField label="Religion" value={p.religion === 'OTHERS' ? p.specifyReligion : p.religion} />
        </AnswerGrid>
      </AnswerGroup>

      <AnswerGroup title="Contact & School">
        <AnswerGrid>
          <AnswerField label="Home Address" value={c.streetAddress} wide />
          <AnswerField label="Municipality / City" value={c.municipality} />
          <AnswerField label="Province" value={c.province} />
          <AnswerField label="Country" value={c.country} />
          <AnswerField summary label="Mobile" value={c.mobileNo} />
          <AnswerField label="Landline" value={c.landlineNo} />
          <AnswerField summary label="Email" value={c.email} />
          <AnswerField label="Secondary School" value={c.secondarySchool ? `${c.secondarySchool} (${c.schoolType})` : ''} />
          <AnswerField label="School Address" value={c.schoolAddress} wide />
        </AnswerGrid>
      </AnswerGroup>

      <AnswerGroup title="Parents & Guardian">
        <div className="space-y-4">
          <RowsTable
            columns={['', 'Name', 'Occupation', 'Company', 'Company Tel.', 'Monthly Income', 'Solo Parent']}
            empty=""
            rows={[parentRow('Father', pg.father), parentRow('Mother', pg.mother)]}
          />
          <AnswerGrid>
            <AnswerField label="Guardian" value={pg.guardian.fullName} />
            <AnswerField label="Relationship" value={pg.guardian.relationship} />
            <AnswerField label="Occupation" value={pg.guardian.occupation} />
            <AnswerField label="Monthly Income" value={pg.guardian.fullName ? pg.guardian.monthlyIncome : ''} />
            <AnswerField label="Contact No." value={pg.guardian.contactNo} />
          </AnswerGrid>
        </div>
      </AnswerGroup>

      <AnswerGroup title={`Siblings (${details.siblings.length})`}>
        <RowsTable
          columns={['Name', 'Status', 'Civil Status', 'Age', 'School / Company', 'Type', 'Tuition / Income', 'DLSU-D Scholar']}
          empty="No siblings listed."
          rows={details.siblings.map(s => [s.fullName, s.socialStatus, s.civilStatus, s.age, s.schoolOrCompany, s.schoolType, s.tuitionOrIncome, s.isDlsudScholar ? 'Yes' : 'No'])}
        />
      </AnswerGroup>

      <AnswerGroup title="Assets & Expenses">
        <AnswerGrid>
          <AnswerField label="House and Lot" value={a.houseAndLot} />
          <AnswerField label="Automobile" value={a.automobile} />
          <AnswerField label="Income Sources" value={a.incomeSources} />
          <AnswerField label="Combined Non-Taxable Income" value={a.combinedNonTaxableIncome} />
          <AnswerField label="Affidavit of Non-Filing" value={a.affidavitNonFilingIncomeTax} />
          <AnswerField label="Water" value={a.waterBill} />
          <AnswerField label="Electricity" value={a.electricityBill} />
          <AnswerField label="Telephone" value={a.telephoneBill} />
          <AnswerField label="Mobile Phone" value={a.mobilePhoneBill} />
          <AnswerField label="Internet" value={a.internetBill} />
          <AnswerField label="Amortization (House)" value={a.amortizationHouse} />
          <AnswerField label="Amortization (Auto)" value={a.amortizationAuto} />
        </AnswerGrid>
      </AnswerGroup>

      <AnswerGroup title="Agreement">
        <div className="space-y-2">
          <AnswerCheck ok={!!details.agreement.certifyConsulted}>Consulted family members on the information provided</AnswerCheck>
          <AnswerCheck ok={!!details.agreement.certifyAccuracy}>Certifies the veracity and completeness of the form</AnswerCheck>
        </div>
      </AnswerGroup>
    </div>
  );
}
