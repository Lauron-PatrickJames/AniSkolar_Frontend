import React from 'react';
import { EarningSibling, NonEarningSibling, OtherContributor, RealEstateEntry } from '../../types';
import {
  APPLICANT_STATEMENT, CIVIL_STATUS_OPTIONS, CONTRIBUTION_TYPES, HOUSEHOLD_ROLES, HOUSE_STATUS,
  HOUSE_STATUS_OPTIONS, INCOME_SOURCES, LIVING_STATUS, PARENT_STATEMENT, SCHOOL_TYPES_3,
  SIBLING_LIVING_WITH_FAMILY, VEHICLE_TYPES, YES_NO, YES_NO_NA, coResidingTotal, newRowId
} from '../../utils/grantForms';
import {
  Block, CheckboxField, CheckboxListField, ChoiceField, ComputedField, FieldError, FileSlotField,
  NumberField, RepeatableList, SelectField, SubHeading, TextField, labelClass, useGrantForm
} from './fields';

// The POLCA "Financial Aid Grantee Personal Information Sheet" (7-page
// evaluation sheet), one component per numbered section. Per the sheet's
// instructions, numeric answers default to 0 and "N/A" is accepted where a
// question doesn't apply.

const P = 'evaluationSheet';

export function EducationSection() {
  const levels = [
    { key: 'elementary', label: 'Elementary' },
    { key: 'juniorHigh', label: 'Junior High School' },
    { key: 'seniorHigh', label: 'Senior High School' }
  ];
  return (
    <div className="space-y-6">
      {levels.map(level => (
        <Block key={level.key}>
          <SubHeading>{level.label}</SubHeading>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <TextField path={`${P}.education.${level.key}.schoolName`} label="Name of School" required className="sm:col-span-2" />
            <TextField path={`${P}.education.${level.key}.yearGraduated`} label="Year Graduated" required placeholder="e.g. 2020" maxLength={4} />
            <TextField path={`${P}.education.${level.key}.address`} label="Address" required className="sm:col-span-2" />
            <ChoiceField path={`${P}.education.${level.key}.type`} label="Type of School" required options={SCHOOL_TYPES_3} />
          </div>
        </Block>
      ))}
    </div>
  );
}

export function BoardingSection() {
  const { values } = useGrantForm();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      <ChoiceField path={`${P}.boarding.isBoarding`} label="Are you staying in a boarding house or dormitory?" required options={YES_NO} className="sm:col-span-2" />
      {values.evaluationSheet?.boarding.isBoarding === 'Yes' && (
        <NumberField path={`${P}.boarding.monthlyFee`} label="Monthly Fee" peso required />
      )}
    </div>
  );
}

export function EmploymentSection() {
  const { values } = useGrantForm();
  const employed = values.evaluationSheet?.employment.isEmployed === 'Yes';
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      <ChoiceField path={`${P}.employment.isEmployed`} label="Are you currently employed?" required options={YES_NO} className="sm:col-span-2" />
      {employed && (
        <>
          <ChoiceField path={`${P}.employment.type`} label="Do you work" required options={['Full time', 'Part time']} className="sm:col-span-2" />
          <TextField path={`${P}.employment.company`} label="Name of Company" required />
          <TextField path={`${P}.employment.telNo`} label="Tel. No." type="tel" />
          <TextField path={`${P}.employment.address`} label="Company Address" required className="sm:col-span-2" />
        </>
      )}
    </div>
  );
}

export function FinancingSection() {
  const { values, errors } = useGrantForm();
  const f = values.evaluationSheet!.financing;
  const withAmount = [
    { key: 'otherScholarship', label: 'Other scholarship' },
    { key: 'educationalPlan', label: 'Educational plan' },
    { key: 'others', label: 'Others' }
  ] as const;
  return (
    <div className="space-y-4">
      <p className={labelClass}>Who finances your schooling? Check all that apply.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <CheckboxField path={`${P}.financing.parents`} label="Parents" className="p-2.5 border border-slate-100 rounded-lg" />
        <CheckboxField path={`${P}.financing.relatives`} label="Relatives" className="p-2.5 border border-slate-100 rounded-lg" />
        <CheckboxField path={`${P}.financing.self`} label="Self" className="p-2.5 border border-slate-100 rounded-lg" />
      </div>
      {withAmount.map(item => (
        <div key={item.key} className="p-3 border border-slate-100 rounded-xl space-y-3">
          <CheckboxField path={`${P}.financing.${item.key}.checked`} label={item.label} />
          {f[item.key].checked && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextField path={`${P}.financing.${item.key}.specify`} label="Please specify" required />
              <NumberField path={`${P}.financing.${item.key}.amountPerSem`} label="Amount per Semester" peso required />
            </div>
          )}
        </div>
      ))}
      <FieldError message={errors[`${P}.financing`]} />
    </div>
  );
}

export function MembershipsSection() {
  const { values, setValue, errors } = useGrantForm();
  const m = values.evaluationSheet!.memberships;
  const options = [
    { key: 'sportsCountryClub', label: 'Sports & country club' },
    { key: 'serviceOrg', label: 'Service organization' },
    { key: 'professionalAssociation', label: 'Professional association' },
    { key: 'businessOrg', label: 'Business organization' },
    { key: 'others', label: 'Others' }
  ];
  // "None" is exclusive with every other option.
  const clearOthers = (checked: boolean) => {
    if (!checked) return;
    options.forEach(o => setValue(`${P}.memberships.${o.key}`, false));
  };
  const clearNone = (checked: boolean) => { if (checked) setValue(`${P}.memberships.none`, false); };
  return (
    <div className="space-y-4">
      <p className={labelClass}>Is your parent / guardian / spouse a member of any of the following? Check all that apply.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <CheckboxField path={`${P}.memberships.none`} label="None" onToggle={clearOthers} className="p-2.5 border border-slate-100 rounded-lg" />
        {options.map(o => (
          <CheckboxField key={o.key} path={`${P}.memberships.${o.key}`} label={o.label} onToggle={clearNone} className="p-2.5 border border-slate-100 rounded-lg" />
        ))}
      </div>
      {m.others && <TextField path={`${P}.memberships.othersSpecify`} label="Please specify" required />}
      <FieldError message={errors[`${P}.memberships`]} />
    </div>
  );
}

export function TravelSection() {
  const { values } = useGrantForm();
  const t = values.evaluationSheet!.travel;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      <ChoiceField path={`${P}.travel.hasPassport`} label="Do you have a passport?" required options={YES_NO} />
      {t.hasPassport === 'Yes' && (
        <TextField path={`${P}.travel.passportDateIssued`} label="Date Issued" type="date" required hint="We don't collect your passport number." />
      )}
      <ChoiceField path={`${P}.travel.traveledAbroad`} label="Have you traveled abroad in the last 5 years?" required options={YES_NO} className="sm:col-span-2" />
      {t.traveledAbroad === 'Yes' && (
        <>
          <NumberField path={`${P}.travel.numberOfTrips`} label="Number of Trips" integer required />
          <ChoiceField path={`${P}.travel.financedBy`} label="Financed by" required options={['Family', 'Others']} />
        </>
      )}
    </div>
  );
}

export function FamilyDataSection() {
  const { values } = useGrantForm();
  const sheet = values.evaluationSheet!;
  return (
    <div className="space-y-6">
      <Block>
        <SubHeading note="Who lives with you in the same household?">7.1 Co-residing Family Members</SubHeading>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {(['father', 'mother', 'guardian', 'spouse'] as const).map(k => (
            <CheckboxField key={k} path={`${P}.family.coResiding.${k}`} label={k[0].toUpperCase() + k.slice(1)} className="p-2.5 border border-slate-100 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <NumberField path={`${P}.family.coResiding.children`} label="Children" integer />
          <NumberField path={`${P}.family.coResiding.brothers`} label="Brothers" integer />
          <NumberField path={`${P}.family.coResiding.sisters`} label="Sisters" integer />
          <NumberField path={`${P}.family.coResiding.others`} label="Others" integer />
          <ComputedField label="Total" value={coResidingTotal(sheet)} />
        </div>
      </Block>

      <Block>
        <SubHeading note={'Write "N/A" as the name for a row that doesn’t apply. Gross income is monthly.'}>7.2 Parents, Spouse & Guardian</SubHeading>
        <ChoiceField path={`${P}.family.parentsSeparated`} label="Are your parents separated or divorced?" required options={YES_NO_NA} className="mb-5" />
        <div className="space-y-4">
          {HOUSEHOLD_ROLES.map(role => {
            const base = `${P}.family.${role.key}`;
            const required = role.key === 'father' || role.key === 'mother';
            return (
              <div key={role.key} className="p-4 border border-slate-200 rounded-xl bg-slate-50/40">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">{role.label}{!required && ' (if any)'}</p>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <TextField path={`${base}.name`} label="Name" required={required} className="sm:col-span-2" />
                  <NumberField path={`${base}.age`} label="Age" integer max={120} />
                  <SelectField path={`${base}.living`} label="Still Living?" required={required} options={LIVING_STATUS} />
                  <TextField path={`${base}.highestDegree`} label="Highest Degree" />
                  <TextField path={`${base}.school`} label="School" />
                  <TextField path={`${base}.employer`} label="Employer" />
                  <TextField path={`${base}.jobTitle`} label="Job Title" />
                  <NumberField path={`${base}.grossIncome`} label="Gross Monthly Income" peso />
                </div>
              </div>
            );
          })}
        </div>
      </Block>

      <Block>
        <SubHeading>7.3 Earning Siblings</SubHeading>
        <RepeatableList<EarningSibling>
          path={`${P}.family.earningSiblings`}
          itemLabel="Earning sibling"
          emptyText="None added."
          addLabel="Add earning sibling"
          newItem={() => ({ id: newRowId('es'), name: '', age: 0, highestDegree: '', school: '', civilStatus: 'Single', childrenCount: 0, employer: '', jobTitle: '', grossIncome: 0, livingWithFamily: '' })}
          renderRow={base => (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <TextField path={`${base}.name`} label="Name" required className="sm:col-span-2" />
              <NumberField path={`${base}.age`} label="Age" integer max={120} />
              <SelectField path={`${base}.civilStatus`} label="Civil Status" options={CIVIL_STATUS_OPTIONS} />
              <TextField path={`${base}.highestDegree`} label="Highest Degree" />
              <TextField path={`${base}.school`} label="School" />
              <NumberField path={`${base}.childrenCount`} label="No. of Children (if married)" integer />
              <SelectField path={`${base}.livingWithFamily`} label="Living with Family?" options={SIBLING_LIVING_WITH_FAMILY} />
              <TextField path={`${base}.employer`} label="Employer" />
              <TextField path={`${base}.jobTitle`} label="Job Title" />
              <NumberField path={`${base}.grossIncome`} label="Gross Monthly Income" peso className="sm:col-span-2" />
            </div>
          )}
        />
      </Block>

      <Block>
        <SubHeading>7.4 Non-earning Siblings</SubHeading>
        <RepeatableList<NonEarningSibling>
          path={`${P}.family.nonEarningSiblings`}
          itemLabel="Non-earning sibling"
          emptyText="None added."
          addLabel="Add non-earning sibling"
          newItem={() => ({ id: newRowId('ns'), name: '', age: 0, civilStatus: 'Single', childrenCount: 0, isStudying: '', highestLevel: '', school: '', withScholarship: '' })}
          renderRow={base => (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <TextField path={`${base}.name`} label="Name" required className="sm:col-span-2" />
              <NumberField path={`${base}.age`} label="Age" integer max={120} />
              <SelectField path={`${base}.civilStatus`} label="Civil Status" options={CIVIL_STATUS_OPTIONS} />
              <NumberField path={`${base}.childrenCount`} label="No. of Children (if married)" integer />
              <ChoiceField path={`${base}.isStudying`} label="Studying?" options={YES_NO} />
              <TextField path={`${base}.highestLevel`} label="Highest Level" />
              <TextField path={`${base}.school`} label="School" />
              <ChoiceField path={`${base}.withScholarship`} label="With Scholarship?" options={YES_NO_NA} />
            </div>
          )}
        />
      </Block>

      <Block>
        <SubHeading note="Relatives or others who help support the family.">7.5 Other Contributors</SubHeading>
        <RepeatableList<OtherContributor>
          path={`${P}.family.otherContributors`}
          itemLabel="Contributor"
          emptyText="None added."
          addLabel="Add contributor"
          newItem={() => ({ id: newRowId('oc'), name: '', relationship: '', contributionType: '', averageMonthly: 0 })}
          renderRow={base => (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <TextField path={`${base}.name`} label="Name" required />
              <TextField path={`${base}.relationship`} label="Relationship" />
              <SelectField path={`${base}.contributionType`} label="Contribution" required options={CONTRIBUTION_TYPES} />
              <NumberField path={`${base}.averageMonthly`} label="Avg. Monthly Amount" peso />
            </div>
          )}
        />
      </Block>
    </div>
  );
}

function VehicleRow({ vehicleKey, label }: { vehicleKey: string; label: string }) {
  const { values } = useGrantForm();
  const count = values.evaluationSheet?.assets.vehicles[vehicleKey]?.count ?? 0;
  const shown = Math.min(Math.max(count, 0), 10);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-start py-3 border-b border-slate-100 last:border-b-0">
      <NumberField path={`${P}.assets.vehicles.${vehicleKey}.count`} label={label} integer max={50} />
      <div className="sm:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Array.from({ length: shown }, (_, i) => (
          <TextField key={i} path={`${P}.assets.vehicles.${vehicleKey}.models.${i}`} label={`${label} #${i + 1} — Year / Model`} placeholder="e.g. 2018 Toyota Vios" />
        ))}
      </div>
    </div>
  );
}

export function AssetsSection() {
  const { values, scholarship } = useGrantForm();
  const a = values.evaluationSheet!.assets;
  const slot = (key: string) => scholarship.documentSlots?.find(s => s.key === key);
  const electricityBill = slot('electricityBill');
  const waterBill = slot('waterBill');
  const houseAmountLabel = a.house.status === HOUSE_STATUS.ownedMortgaged ? 'Monthly Amortization'
    : a.house.status === HOUSE_STATUS.rented ? 'Monthly Rent' : null;

  return (
    <div className="space-y-6">
      <Block>
        <SubHeading>8.1 Sources of Household Income</SubHeading>
        <CheckboxListField path={`${P}.assets.incomeSources`} label="Check all that apply" required options={INCOME_SOURCES} />
        {a.incomeSources.includes('Others') && (
          <TextField path={`${P}.assets.incomeSourcesOther`} label="Please specify" required className="mt-3" />
        )}
      </Block>

      <Block>
        <SubHeading>8.2 – 8.5 Utilities</SubHeading>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-3">
            <ChoiceField path={`${P}.assets.electricity.has`} label="8.2 Electricity?" required options={YES_NO} />
            {a.electricity.has === 'Yes' && (
              <>
                <NumberField path={`${P}.assets.electricity.lastBill`} label="Last Bill Amount" peso required />
                {electricityBill && <FileSlotField slot={electricityBill} required compact />}
              </>
            )}
          </div>
          <div className="space-y-3">
            <ChoiceField path={`${P}.assets.water.has`} label="8.3 Piped Water?" required options={YES_NO} />
            {a.water.has === 'Yes' && (
              <>
                <NumberField path={`${P}.assets.water.lastBill`} label="Last Bill Amount" peso required />
                {waterBill && <FileSlotField slot={waterBill} required compact />}
              </>
            )}
          </div>
          <ChoiceField path={`${P}.assets.cableTv`} label="8.4 Cable / Satellite TV?" required options={YES_NO} />
          <ChoiceField path={`${P}.assets.internet`} label="8.5 Internet?" required options={YES_NO} />
        </div>
      </Block>

      <Block>
        <SubHeading>8.6 – 8.7 House</SubHeading>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <SelectField path={`${P}.assets.house.status`} label="The house you live in is" required options={HOUSE_STATUS_OPTIONS} className="sm:col-span-2" />
          {houseAmountLabel && <NumberField path={`${P}.assets.house.monthlyAmount`} label={houseAmountLabel} peso />}
          {a.house.status === HOUSE_STATUS.others && <TextField path={`${P}.assets.house.othersSpecify`} label="Please specify" required />}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-4">
          <NumberField path={`${P}.assets.floorAreaSqm`} label="Floor Area (sqm)" required />
          <NumberField path={`${P}.assets.bedrooms`} label="No. of Bedrooms" integer required />
          <NumberField path={`${P}.assets.bathrooms`} label="No. of Toilets / Bathrooms" integer required />
        </div>
      </Block>

      <Block>
        <SubHeading note="Enter how many of each the family owns, then the year/model of each one.">8.8 Vehicles</SubHeading>
        <div>
          {VEHICLE_TYPES.map(v => <VehicleRow key={v.key} vehicleKey={v.key} label={v.label} />)}
        </div>
      </Block>

      <Block>
        <SubHeading>8.9 Credit Cards</SubHeading>
        <ChoiceField path={`${P}.assets.hasCreditCards`} label="Does any family member have a credit card?" required options={YES_NO} />
      </Block>

      <Block>
        <SubHeading note="Residential lots and non-residential / agricultural lots owned by the family.">8.10 Real Estate</SubHeading>
        <RepeatableList<RealEstateEntry>
          path={`${P}.assets.realEstate`}
          itemLabel="Property"
          emptyText="No real estate added."
          addLabel="Add property"
          newItem={() => ({ id: newRowId('re'), kind: '', areaSqm: 0, location: '', marketValue: 0, earnsIncome: 'No', monthlyIncome: 0 })}
          renderRow={(base, index) => (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <SelectField path={`${base}.kind`} label="Type" required options={['Residential', 'Non-residential / Agricultural']} className="sm:col-span-2" />
              <NumberField path={`${base}.areaSqm`} label="Area (sqm)" />
              <NumberField path={`${base}.marketValue`} label="Market Value" peso />
              <TextField path={`${base}.location`} label="Location" required className="sm:col-span-2" />
              <ChoiceField path={`${base}.earnsIncome`} label="Earns Income?" options={YES_NO} />
              {a.realEstate[index]?.earnsIncome === 'Yes' && (
                <NumberField path={`${base}.monthlyIncome`} label="Monthly Income" peso />
              )}
            </div>
          )}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-5">
          <ChoiceField path={`${P}.assets.boarders.has`} label="Boarders / lodgers / bedspacers?" required options={YES_NO} />
          {a.boarders.has === 'Yes' && <NumberField path={`${P}.assets.boarders.monthlyIncome`} label="Monthly Income from Boarders" peso />}
        </div>
      </Block>
    </div>
  );
}

export function StatementsSection() {
  const { setValue, errors } = useGrantForm();
  const today = new Date().toISOString().slice(0, 10);
  const statements = [
    { who: 'applicant', title: 'Applicant', text: APPLICANT_STATEMENT, nameLabel: 'Printed Name of Applicant' },
    { who: 'parent', title: 'Parent / Guardian', text: PARENT_STATEMENT, nameLabel: 'Printed Name of Parent / Guardian' }
  ];
  return (
    <div className="space-y-6">
      {statements.map(s => {
        const base = `${P}.statements.${s.who}`;
        const hasError = !!errors[`${base}.agreed`];
        return (
          <Block key={s.who}>
            <SubHeading>{s.title} Statement</SubHeading>
            <div className={`border rounded-xl p-4 mb-4 ${hasError ? 'border-rose-400 bg-rose-50/60' : 'border-amber-300 bg-amber-50/50'}`}>
              <CheckboxField
                path={`${base}.agreed`}
                label={s.text}
                onToggle={checked => setValue(`${base}.date`, checked ? today : '')}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <TextField path={`${base}.name`} label={s.nameLabel} required className="sm:col-span-2" />
              <TextField path={`${base}.date`} label="Date" type="date" disabled hint="Filled in when you tick the box." />
            </div>
          </Block>
        );
      })}
    </div>
  );
}
