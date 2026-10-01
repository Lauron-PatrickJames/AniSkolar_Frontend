import React from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import { EvaluationSheet, GrantApplicationDetails, HouseholdMember, Scholarship } from '../../types';
import { formatPeso } from '../../utils/format';
import { HOUSEHOLD_ROLES, VEHICLE_TYPES, calculateAge, coResidingTotal } from '../../utils/grantForms';

// Read-only rendering of a grant-form application, grouped by the same
// sections as the form. Used by the admin application detail view and the
// student's Review & Submit step.

function formatDate(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function AnswerField({ label, value, wide }: { label: string; value?: React.ReactNode; wide?: boolean }) {
  const empty = value === undefined || value === null || value === '';
  return (
    <div className={`min-w-0 ${wide ? 'col-span-2 sm:col-span-3' : ''}`}>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm text-slate-700 font-semibold wrap-break-word">{empty ? <span className="text-slate-300 font-normal">—</span> : value}</p>
    </div>
  );
}

export function AnswerGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h4 className="font-display font-bold text-xs text-brand-green uppercase tracking-wider pb-1.5 border-b border-slate-100">{title}</h4>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-4">{children}</div>;
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex items-start gap-2 text-xs font-semibold ${ok ? 'text-brand-green' : 'text-rose-500'}`}>
      {ok ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 shrink-0 mt-0.5" />}
      <span>{children}</span>
    </div>
  );
}

// Compact table for repeatable rows; scrolls horizontally on small screens.
function RowsTable({ columns, rows, empty }: { columns: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <p className="text-xs text-slate-400 italic">{empty}</p>;
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-xs text-left min-w-[560px]">
        <thead>
          <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            {columns.map(c => <th key={c} className="px-2 py-2 font-bold">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-slate-100 text-slate-700">
              {row.map((cell, j) => <td key={j} className="px-2 py-2 font-medium">{cell === '' || cell === undefined ? '—' : cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ApplicationFormAnswers({ details, scholarship }: { details: GrantApplicationDetails; scholarship?: Scholarship }) {
  const p = details.personalInfo;
  const e = details.eligibilityAnswers;
  const pg = details.parentsGuardian;
  const c = details.contactSchool;
  const f = details.assetsExpenses;
  const isAlumni = scholarship ? scholarship.applicationFormType === 'alumni' : !!e.relationship;

  return (
    <div className="space-y-7">
      <AnswerGroup title="Eligibility">
        {isAlumni ? (
          <Grid>
            <AnswerField label="Alumnus / Alumna" value={e.alumnusName} />
            <AnswerField label="Relationship" value={e.relationship} />
            <AnswerField label="Institution" value={e.institution} />
            <AnswerField label="Batch / Year Graduated" value={e.batchYear} />
          </Grid>
        ) : (
          <div className="space-y-3">
            <Grid>
              <AnswerField label="HS General Average" value={e.hsGeneralAverage} />
              <AnswerField label="Lowest HS Grade" value={e.lowestHsGrade} />
            </Grid>
            <Check ok={!!e.notRelatedToBoardMember}>Declares no relation by consanguinity to any current board member</Check>
          </div>
        )}
      </AnswerGroup>

      <AnswerGroup title="Student Data">
        <Grid>
          <AnswerField label="Last Name" value={p.lastName} />
          <AnswerField label="First Name" value={p.firstName} />
          <AnswerField label="Middle Name" value={p.middleName} />
          <AnswerField label="Student No." value={p.studentNumber} />
          <AnswerField label="Course / Year" value={[p.course, p.yearLevel].filter(Boolean).join(' · ')} />
          <AnswerField label="Date of Birth" value={formatDate(p.dateOfBirth)} />
          <AnswerField label="Age" value={calculateAge(p.dateOfBirth) ?? ''} />
          <AnswerField label="Place of Birth" value={p.placeOfBirth} />
          <AnswerField label="Civil Status" value={p.civilStatus} />
          <AnswerField label="Gender" value={p.gender} />
          <AnswerField label="Citizenship" value={p.citizenship} />
          <AnswerField label="Religion" value={p.religion} />
          <AnswerField label="Email" value={p.email} />
          <AnswerField label="Secondary School" value={p.secondarySchool ? `${p.secondarySchool}${p.secondarySchoolType ? ` (${p.secondarySchoolType})` : ''}` : ''} wide />
        </Grid>
      </AnswerGroup>

      <AnswerGroup title="Parents">
        <Grid>
          <AnswerField label="Father" value={pg.father.name} />
          <AnswerField label="Occupation" value={pg.father.occupation} />
          <AnswerField label="Monthly Income" value={formatPeso(pg.father.monthlyIncome)} />
          <AnswerField label="Mother" value={pg.mother.name} />
          <AnswerField label="Occupation" value={pg.mother.occupation} />
          <AnswerField label="Monthly Income" value={formatPeso(pg.mother.monthlyIncome)} />
        </Grid>
      </AnswerGroup>

      <AnswerGroup title="Contact Information">
        <Grid>
          <AnswerField label="Street Address" value={c.streetAddress} wide />
          <AnswerField label="Barangay" value={c.barangay} />
          <AnswerField label="City / Municipality" value={c.municipality} />
          <AnswerField label="Province" value={c.province} />
          <AnswerField label="Landline" value={c.landlineNo} />
          <AnswerField label="Mobile" value={c.mobileNo} />
        </Grid>
      </AnswerGroup>

      <AnswerGroup title="Guardian">
        <Grid>
          <AnswerField label="Name" value={pg.guardian.name} />
          <AnswerField label="Relationship" value={pg.guardian.relationship} />
          <AnswerField label="Address" value={pg.guardian.address} />
          <AnswerField label="Landline" value={pg.guardian.landlineNo} />
          <AnswerField label="Mobile" value={pg.guardian.mobileNo} />
        </Grid>
      </AnswerGroup>

      <AnswerGroup title={`Siblings (${details.siblings.length})`}>
        <RowsTable
          columns={['Name', 'Civil Status', 'Age', 'School / Year', 'Type', 'Company']}
          empty="No siblings listed."
          rows={details.siblings.map(s => [s.name, s.civilStatus, s.age, [s.school, s.yearLevel].filter(Boolean).join(' · '), s.schoolType, s.company])}
        />
      </AnswerGroup>

      <AnswerGroup title="Financial Information">
        <Grid>
          <AnswerField label="House and Lot" value={[f.houseTenure, f.houseValue].filter(Boolean).join(' · ')} />
          <AnswerField label="Automobile" value={f.hasAutomobile === 'Yes' ? `Yes · ${f.automobileValue}` : f.hasAutomobile} />
          <AnswerField label="Combined Family Monthly Income" value={f.familyIncomeBracket} />
          <AnswerField label="Monthly Expenses" value={f.monthlyExpensesBracket} />
        </Grid>
      </AnswerGroup>

      <AnswerGroup title="Certification">
        <div className="space-y-3">
          <Check ok={!!details.agreement.agreed}>Certifies the information is correct and complete, consulted with family</Check>
          <Grid>
            <AnswerField label="Applicant" value={details.agreement.applicantName} />
            <AnswerField label="Parent / Guardian" value={details.agreement.parentGuardianName} />
          </Grid>
        </div>
      </AnswerGroup>
    </div>
  );
}

function memberRow(label: string, m: HouseholdMember): React.ReactNode[] {
  return [label, m.name, m.age || '', [m.highestDegree, m.school].filter(Boolean).join(', '), m.employer, m.jobTitle, formatPeso(m.grossIncome), m.living];
}

function financingList(sheet: EvaluationSheet): string {
  const f = sheet.financing;
  const items: string[] = [];
  if (f.parents) items.push('Parents');
  if (f.relatives) items.push('Relatives');
  if (f.self) items.push('Self');
  const withAmount = [
    ['Other scholarship', f.otherScholarship],
    ['Educational plan', f.educationalPlan],
    ['Others', f.others]
  ] as const;
  for (const [label, src] of withAmount) {
    if (src.checked) items.push(`${label}: ${src.specify || '—'} (${formatPeso(src.amountPerSem)}/sem)`);
  }
  return items.join('; ');
}

function membershipList(sheet: EvaluationSheet): string {
  const m = sheet.memberships;
  if (m.none) return 'None';
  return [
    m.sportsCountryClub && 'Sports & country club',
    m.serviceOrg && 'Service organization',
    m.professionalAssociation && 'Professional association',
    m.businessOrg && 'Business organization',
    m.others && `Others: ${m.othersSpecify}`
  ].filter(Boolean).join('; ');
}

export function EvaluationSheetAnswers({ sheet }: { sheet: EvaluationSheet }) {
  const ed = sheet.education;
  const fam = sheet.family;
  const a = sheet.assets;
  const co = fam.coResiding;
  const coResidents = [
    co.father && 'Father', co.mother && 'Mother', co.guardian && 'Guardian', co.spouse && 'Spouse',
    co.children && `${co.children} child(ren)`, co.brothers && `${co.brothers} brother(s)`,
    co.sisters && `${co.sisters} sister(s)`, co.others && `${co.others} other(s)`
  ].filter(Boolean).join(', ');
  const vehicles = VEHICLE_TYPES
    .filter(v => (a.vehicles[v.key]?.count ?? 0) > 0)
    .map(v => {
      const entry = a.vehicles[v.key];
      const models = entry.models.slice(0, entry.count).filter(Boolean);
      return `${entry.count} ${v.label}${models.length ? ` (${models.join(', ')})` : ''}`;
    });

  return (
    <div className="space-y-7">
      <AnswerGroup title="1. Educational Background">
        <RowsTable
          columns={['Level', 'School', 'Address', 'Year Graduated', 'Type']}
          empty=""
          rows={([['Elementary', ed.elementary], ['Junior High', ed.juniorHigh], ['Senior High', ed.seniorHigh]] as const)
            .map(([label, s]) => [label, s.schoolName, s.address, s.yearGraduated, s.type])}
        />
      </AnswerGroup>

      <AnswerGroup title="2–3. Boarding & Employment">
        <Grid>
          <AnswerField label="Boarding House / Dorm" value={sheet.boarding.isBoarding === 'Yes' ? `Yes · ${formatPeso(sheet.boarding.monthlyFee)}/month` : sheet.boarding.isBoarding} />
          <AnswerField label="Employed" value={sheet.employment.isEmployed === 'Yes' ? `Yes · ${sheet.employment.type}` : sheet.employment.isEmployed} />
          {sheet.employment.isEmployed === 'Yes' && (
            <AnswerField label="Company" value={[sheet.employment.company, sheet.employment.address, sheet.employment.telNo].filter(Boolean).join(' · ')} />
          )}
        </Grid>
      </AnswerGroup>

      <AnswerGroup title="4–6. Financing, Memberships & Travel">
        <Grid>
          <AnswerField label="Who Finances Schooling" value={financingList(sheet)} wide />
          <AnswerField label="Parent / Guardian / Spouse Memberships" value={membershipList(sheet)} wide />
          <AnswerField label="Passport" value={sheet.travel.hasPassport === 'Yes' ? `Yes · issued ${formatDate(sheet.travel.passportDateIssued)}` : sheet.travel.hasPassport} />
          <AnswerField label="Traveled Abroad (5 yrs)" value={sheet.travel.traveledAbroad === 'Yes' ? `Yes · ${sheet.travel.numberOfTrips} trip(s), financed by ${sheet.travel.financedBy}` : sheet.travel.traveledAbroad} />
        </Grid>
      </AnswerGroup>

      <AnswerGroup title="7. Family Data">
        <div className="space-y-4">
          <Grid>
            <AnswerField label={`Co-residing (total ${coResidingTotal(sheet)})`} value={coResidents} wide />
            <AnswerField label="Parents Separated / Divorced" value={fam.parentsSeparated} />
          </Grid>
          <RowsTable
            columns={['', 'Name', 'Age', 'Highest Degree / School', 'Employer', 'Job Title', 'Gross Income', 'Living']}
            empty=""
            rows={HOUSEHOLD_ROLES.filter(r => fam[r.key].name).map(r => memberRow(r.label, fam[r.key]))}
          />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pt-2">Earning Siblings</p>
          <RowsTable
            columns={['Name', 'Age', 'Degree / School', 'Civil Status', 'Children', 'Employer', 'Job Title', 'Gross Income', 'With Family']}
            empty="None listed."
            rows={fam.earningSiblings.map(s => [s.name, s.age, [s.highestDegree, s.school].filter(Boolean).join(', '), s.civilStatus, s.childrenCount, s.employer, s.jobTitle, formatPeso(s.grossIncome), s.livingWithFamily])}
          />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pt-2">Non-earning Siblings</p>
          <RowsTable
            columns={['Name', 'Age', 'Civil Status', 'Children', 'Studying', 'Highest Level', 'School', 'Scholarship']}
            empty="None listed."
            rows={fam.nonEarningSiblings.map(s => [s.name, s.age, s.civilStatus, s.childrenCount, s.isStudying, s.highestLevel, s.school, s.withScholarship])}
          />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pt-2">Other Contributors</p>
          <RowsTable
            columns={['Name', 'Relationship', 'Contribution', 'Avg. Monthly']}
            empty="None listed."
            rows={fam.otherContributors.map(o => [o.name, o.relationship, o.contributionType, formatPeso(o.averageMonthly)])}
          />
        </div>
      </AnswerGroup>

      <AnswerGroup title="8. Income, Properties & Assets">
        <div className="space-y-4">
          <Grid>
            <AnswerField label="Income Sources" value={a.incomeSources.map(s => (s === 'Others' ? `Others: ${a.incomeSourcesOther}` : s)).join(', ')} wide />
            <AnswerField label="Electricity" value={a.electricity.has === 'Yes' ? `Yes · last bill ${formatPeso(a.electricity.lastBill)}` : a.electricity.has} />
            <AnswerField label="Piped Water" value={a.water.has === 'Yes' ? `Yes · last bill ${formatPeso(a.water.lastBill)}` : a.water.has} />
            <AnswerField label="Cable / Satellite TV" value={a.cableTv} />
            <AnswerField label="Internet" value={a.internet} />
            <AnswerField label="House" value={[a.house.status === 'Others' ? `Others: ${a.house.othersSpecify}` : a.house.status, a.house.monthlyAmount ? `${formatPeso(a.house.monthlyAmount)}/month` : ''].filter(Boolean).join(' · ')} />
            <AnswerField label="Floor Area" value={`${a.floorAreaSqm} sqm · ${a.bedrooms} bedroom(s) · ${a.bathrooms} toilet/bath`} />
            <AnswerField label="Vehicles" value={vehicles.length ? vehicles.join('; ') : 'None'} wide />
            <AnswerField label="Credit Cards" value={a.hasCreditCards} />
            <AnswerField label="Boarders / Lodgers" value={a.boarders.has === 'Yes' ? `Yes · ${formatPeso(a.boarders.monthlyIncome)}/month` : a.boarders.has} />
          </Grid>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pt-2">Real Estate</p>
          <RowsTable
            columns={['Type', 'Area (sqm)', 'Location', 'Market Value', 'Monthly Income']}
            empty="None listed."
            rows={a.realEstate.map(r => [r.kind, r.areaSqm, r.location, formatPeso(r.marketValue), r.earnsIncome === 'Yes' ? formatPeso(r.monthlyIncome) : 'None'])}
          />
        </div>
      </AnswerGroup>

      <AnswerGroup title="9. Statements">
        <div className="space-y-2">
          <Check ok={!!sheet.statements.applicant.agreed}>
            Applicant: {sheet.statements.applicant.name || '—'}{sheet.statements.applicant.date ? ` · ${formatDate(sheet.statements.applicant.date)}` : ''}
          </Check>
          <Check ok={!!sheet.statements.parent.agreed}>
            Parent / Guardian: {sheet.statements.parent.name || '—'}{sheet.statements.parent.date ? ` · ${formatDate(sheet.statements.parent.date)}` : ''}
          </Check>
        </div>
      </AnswerGroup>
    </div>
  );
}
