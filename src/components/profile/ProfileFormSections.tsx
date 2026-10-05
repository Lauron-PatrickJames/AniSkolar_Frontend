import React from 'react';
import { Lock } from 'lucide-react';
import { Checkbox, Combobox, ComboboxOption, DatePicker, Field, Select, TextInput } from '../../pages/admin/AdminUI';
import { PROGRAMS, YEAR_LEVELS, collegeName, findProgram } from '../../data/programs';
import { CITIES_BY_PROVINCE, PROVINCES } from '../../data/phLocations';
import { formatPhone, normalizePhMobile } from '../../utils/profile';
import { CIVIL_STATUS_OPTIONS, DraftField, PHILIPPINES, ProfileDraft } from './profileForm';

// The profile's form sections, shared by the first-time setup page and the
// Profile edit dialog. Each field sits in a [data-field] wrapper so a form
// can move focus to the first field with an error.

export interface SectionProps {
  draft: ProfileDraft;
  update: (patch: Partial<ProfileDraft>) => void;
  // The message to show for a field (already filtered by "touched").
  errorFor: (field: DraftField) => string | undefined;
  // Called when a field loses focus, to start showing its error.
  touch: (field: DraftField) => void;
}

function Slot({ name, className = '', children }: { name: DraftField; className?: string; children: React.ReactNode }) {
  return <div data-field={name} className={`min-w-0 ${className}`}>{children}</div>;
}

const PROGRAM_OPTIONS: ComboboxOption[] = PROGRAMS.map(p => ({ value: p.code, label: p.name, hint: `${p.code} · ${p.college}` }));
const PROVINCE_OPTIONS: ComboboxOption[] = PROVINCES.map(p => ({ value: p, label: p }));

// Shows a phone number grouped ("0917 123 4567") once it's a valid PH mobile.
const tidyPhone = (v: string) => (normalizePhMobile(v) ? formatPhone(v) : v);

// --- Academic ------------------------------------------------------------------------

export function AcademicFields({ draft, update, errorFor, touch, locked = {}, extra }: SectionProps & {
  // A verified group shown read-only (with its "Request correction" action)
  // instead of its inputs.
  locked?: Partial<Record<'program' | 'enrollment' | 'gpa', React.ReactNode>>;
  // Rendered first, e.g. the student number on first-time setup.
  extra?: React.ReactNode;
}) {
  const program = findProgram(draft.programCode);
  return (
    <div className="space-y-5">
      {extra}
      {locked.program ?? (
        <>
          <Slot name="programCode">
            <Field label="Program" error={errorFor('programCode')} helper={!errorFor('programCode') ? 'Search by name or code, e.g. “BSIT” or “accountancy”.' : undefined}>
              <Combobox
                value={draft.programCode}
                onChange={code => update({ programCode: code })}
                onBlur={() => touch('programCode')}
                options={PROGRAM_OPTIONS}
                placeholder="Search your program"
                emptyText="No program matches. Check the spelling, or ask the AdSO to add yours."
              />
            </Field>
          </Slot>
          {program && (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 rounded-control bg-surface-muted px-3 py-2.5 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-ink-subtle">Department</dt>
              <dd className="text-ink">{collegeName(program.college)}</dd>
              <dt className="text-ink-subtle">Program code</dt>
              <dd className="text-ink">{program.code}</dd>
            </dl>
          )}
        </>
      )}
      {locked.enrollment ?? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Slot name="yearLevel">
            <Field label="Year level" error={errorFor('yearLevel')}>
              <Select value={draft.yearLevel} onChange={v => { update({ yearLevel: v }); touch('yearLevel'); }}>
                <option value="" disabled>Select year level</option>
                {YEAR_LEVELS.map(y => <option key={y} value={y}>{y}</option>)}
              </Select>
            </Field>
          </Slot>
          <Slot name="section">
            <Field label="Section" optional error={errorFor('section')}>
              <TextInput value={draft.section} onChange={e => update({ section: e.target.value })} onBlur={() => touch('section')} placeholder="e.g. BIT44" maxLength={20} autoCapitalize="characters" />
            </Field>
          </Slot>
        </div>
      )}
      {locked.gpa ?? (
        <Slot name="gpa" className="sm:max-w-[calc(50%-0.625rem)]">
          <Field label="Cumulative GPA" optional error={errorFor('gpa')} helper={!errorFor('gpa') ? '0.00 to 4.00. Incoming freshmen can leave this blank.' : undefined}>
            <TextInput
              value={draft.gpa}
              inputMode="decimal"
              placeholder="e.g. 3.25"
              onChange={e => update({ gpa: e.target.value.replace(/[^\d.]/g, '') })}
              onBlur={e => {
                const v = e.currentTarget.value;
                const n = Number(v);
                if (v.trim() && Number.isFinite(n) && n >= 0 && n <= 4) update({ gpa: n.toFixed(2) });
                touch('gpa');
              }}
            />
          </Field>
        </Slot>
      )}
    </div>
  );
}

// A verified group, shown read-only.
export function LockedValue({ label, value, note, action }: { label: string; value: React.ReactNode; note: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-control bg-surface-muted px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{label}</p>
          <p className="mt-0.5 text-sm text-ink">{value}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-ink-subtle"><Lock className="size-3" aria-hidden />{note}</p>
        </div>
        {action}
      </div>
    </div>
  );
}

// --- Personal ------------------------------------------------------------------------

export function PersonalFields({ draft, update, errorFor, touch, accountName }: SectionProps & {
  // First and last name from the university account (read-only).
  accountName?: { firstName: string; lastName: string };
}) {
  const today = new Date();
  const maxDob = `${today.getFullYear() - 10}-12-31`;
  return (
    <div className="space-y-5">
      {accountName && (
        <div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="First name">
              <TextInput value={accountName.firstName} readOnly disabled />
            </Field>
            <Field label="Last name">
              <TextInput value={accountName.lastName} readOnly disabled />
            </Field>
          </div>
          <p className="mt-1.5 text-xs text-ink-subtle">From your university account.</p>
        </div>
      )}
      <Slot name="middleName">
        <Field label="Middle name" optional error={errorFor('middleName')} helper="Leave blank if you don’t have one.">
          <TextInput value={draft.middleName} onChange={e => update({ middleName: e.target.value })} onBlur={() => touch('middleName')} maxLength={60} autoComplete="additional-name" />
        </Field>
      </Slot>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Slot name="dateOfBirth">
          <Field label="Date of birth" optional error={errorFor('dateOfBirth')}>
            <DatePicker value={draft.dateOfBirth} onChange={v => update({ dateOfBirth: v })} onBlur={() => touch('dateOfBirth')} min="1925-01-01" max={maxDob} defaultMonth={`${today.getFullYear() - 18}-01-01`} placeholder="Select your birthday" />
          </Field>
        </Slot>
        <Slot name="placeOfBirth">
          <Field label="Place of birth" optional error={errorFor('placeOfBirth')}>
            <TextInput value={draft.placeOfBirth} onChange={e => update({ placeOfBirth: e.target.value })} onBlur={() => touch('placeOfBirth')} placeholder="e.g. Dasmariñas, Cavite" maxLength={120} />
          </Field>
        </Slot>
        <Slot name="nationality">
          <Field label="Nationality" optional error={errorFor('nationality')}>
            <TextInput value={draft.nationality} onChange={e => update({ nationality: e.target.value })} onBlur={() => touch('nationality')} maxLength={60} />
          </Field>
        </Slot>
        <Slot name="civilStatus">
          <Field label="Civil status" optional error={errorFor('civilStatus')}>
            <Select value={draft.civilStatus} onChange={v => update({ civilStatus: v })}>
              <option value="">Select</option>
              {CIVIL_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </Select>
          </Field>
        </Slot>
      </div>
    </div>
  );
}

// --- Contact -------------------------------------------------------------------------

export function ContactFields({ draft, update, errorFor, touch, email }: SectionProps & { email?: string }) {
  const ph = draft.country === PHILIPPINES;
  const cityOptions: ComboboxOption[] = (CITIES_BY_PROVINCE[draft.province] ?? []).map(c => ({ value: c, label: c }));
  return (
    <div className="space-y-5">
      {email && (
        <Field label="University email" helper="From your university account.">
          <TextInput value={email} readOnly disabled />
        </Field>
      )}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Slot name="mobileNumber">
          <Field label="Mobile number" optional error={errorFor('mobileNumber')} helper={!errorFor('mobileNumber') ? 'The office uses this to reach you about your application.' : undefined}>
            <TextInput
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={draft.mobileNumber}
              onChange={e => update({ mobileNumber: e.target.value })}
              onBlur={e => { update({ mobileNumber: tidyPhone(e.currentTarget.value) }); touch('mobileNumber'); }}
              placeholder="0917 123 4567"
            />
          </Field>
        </Slot>
        <Slot name="telephoneNumber">
          <Field label="Telephone" optional error={errorFor('telephoneNumber')}>
            <TextInput type="tel" inputMode="tel" value={draft.telephoneNumber} onChange={e => update({ telephoneNumber: e.target.value })} onBlur={() => touch('telephoneNumber')} placeholder="(046) 481 1900" />
          </Field>
        </Slot>
      </div>

      <fieldset className="space-y-5">
        <legend className="mb-3 text-sm font-semibold text-ink">Home address</legend>
        <Slot name="homeAddress">
          <Field label="Street address" optional error={errorFor('homeAddress')} helper="House or unit number, street, subdivision and barangay.">
            <TextInput value={draft.homeAddress} onChange={e => update({ homeAddress: e.target.value })} onBlur={() => touch('homeAddress')} autoComplete="street-address" maxLength={200} />
          </Field>
        </Slot>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Slot name="country">
            <Field label="Country" error={errorFor('country')}>
              <Select
                value={ph ? PHILIPPINES : 'other'}
                onChange={v => update(v === PHILIPPINES
                  ? { country: PHILIPPINES, province: '', cityMunicipality: '', zipCode: '' }
                  : { country: '', province: '', cityMunicipality: '' })}
              >
                <option value={PHILIPPINES}>Philippines</option>
                <option value="other">Another country</option>
              </Select>
            </Field>
          </Slot>
          {!ph && (
            <Slot name="country">
              <Field label="Which country?" error={errorFor('country')}>
                <TextInput value={draft.country} onChange={e => update({ country: e.target.value })} onBlur={() => touch('country')} autoComplete="country-name" maxLength={60} />
              </Field>
            </Slot>
          )}
          <Slot name="province">
            <Field label={ph ? 'Province' : 'State or province'} optional error={errorFor('province')}>
              {ph ? (
                <Combobox
                  value={draft.province}
                  onChange={p => update({ province: p, cityMunicipality: CITIES_BY_PROVINCE[p]?.includes(draft.cityMunicipality) ? draft.cityMunicipality : '' })}
                  onBlur={() => touch('province')}
                  options={PROVINCE_OPTIONS}
                  placeholder="Search province"
                />
              ) : (
                <TextInput value={draft.province} onChange={e => update({ province: e.target.value })} onBlur={() => touch('province')} maxLength={60} />
              )}
            </Field>
          </Slot>
          <Slot name="cityMunicipality">
            <Field label="City or municipality" optional error={errorFor('cityMunicipality')} helper={ph && !draft.province ? 'Choose the province first.' : undefined}>
              {ph ? (
                <Combobox
                  value={draft.cityMunicipality}
                  onChange={c => update({ cityMunicipality: c })}
                  onBlur={() => touch('cityMunicipality')}
                  options={cityOptions}
                  disabled={!draft.province}
                  placeholder={draft.province ? 'Search city or municipality' : ''}
                />
              ) : (
                <TextInput value={draft.cityMunicipality} onChange={e => update({ cityMunicipality: e.target.value })} onBlur={() => touch('cityMunicipality')} maxLength={60} />
              )}
            </Field>
          </Slot>
          <Slot name="zipCode">
            <Field label={ph ? 'ZIP code' : 'Postal code'} optional error={errorFor('zipCode')}>
              <TextInput
                value={draft.zipCode}
                inputMode={ph ? 'numeric' : 'text'}
                maxLength={ph ? 4 : 12}
                onChange={e => update({ zipCode: ph ? e.target.value.replace(/\D/g, '') : e.target.value })}
                onBlur={() => touch('zipCode')}
                placeholder={ph ? 'e.g. 4114' : ''}
                autoComplete="postal-code"
              />
            </Field>
          </Slot>
        </div>
      </fieldset>
    </div>
  );
}

// --- Parents & guardian ------------------------------------------------------------

export function FamilyFields({ draft, update, errorFor, touch }: SectionProps) {
  const parent = (who: 'father' | 'mother') => {
    const nameKey = `${who}Name` as const;
    const contactKey = `${who}ContactNo` as const;
    const title = who === 'father' ? 'Father' : 'Mother';
    return (
      <fieldset className="space-y-4">
        <legend className="mb-3 text-sm font-semibold text-ink">{title}</legend>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Slot name={nameKey}>
            <Field label="Full name" optional error={errorFor(nameKey)}>
              <TextInput value={draft[nameKey]} onChange={e => update({ [nameKey]: e.target.value })} onBlur={() => touch(nameKey)} maxLength={120} />
            </Field>
          </Slot>
          <Slot name={contactKey}>
            <Field label="Contact number" optional error={errorFor(contactKey)}>
              <TextInput type="tel" inputMode="tel" value={draft[contactKey]} onChange={e => update({ [contactKey]: e.target.value })} onBlur={e => { update({ [contactKey]: tidyPhone(e.currentTarget.value) }); touch(contactKey); }} />
            </Field>
          </Slot>
        </div>
      </fieldset>
    );
  };

  const choice = (value: ProfileDraft['guardianType'], label: string, hint?: string) => {
    const active = draft.guardianType === value;
    return (
      <label className={`flex cursor-pointer items-start gap-3 rounded-control px-3 py-2.5 ring-1 ring-inset transition-colors ${active ? 'bg-accent-subtle ring-accent' : 'ring-line-strong hover:bg-surface-muted'}`}>
        <input
          type="radio"
          name="guardianType"
          value={value}
          checked={active}
          onChange={() => { update({ guardianType: value }); touch('guardianType'); }}
          className="mt-0.5 size-4 shrink-0 accent-accent"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-ink">{label}</span>
          {hint && <span className="block truncate text-xs text-ink-subtle">{hint}</span>}
        </span>
      </label>
    );
  };

  return (
    <div className="space-y-6">
      {parent('father')}
      {parent('mother')}
      <fieldset data-field="guardianType" className="space-y-3">
        <legend className="mb-1 text-sm font-semibold text-ink">Guardian</legend>
        <p className="text-xs text-ink-subtle">Who the office contacts if they can’t reach you.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {choice('father', 'Same as father', draft.fatherName.trim() || undefined)}
          {choice('mother', 'Same as mother', draft.motherName.trim() || undefined)}
          {choice('other', 'Someone else')}
        </div>
        {draft.guardianType === 'other' && (
          <div className="space-y-5 pt-2">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Slot name="guardianName">
                <Field label="Full name" error={errorFor('guardianName')}>
                  <TextInput value={draft.guardianName} onChange={e => update({ guardianName: e.target.value })} onBlur={() => touch('guardianName')} maxLength={120} />
                </Field>
              </Slot>
              <Slot name="guardianRelationship">
                <Field label="Relationship to you" error={errorFor('guardianRelationship')}>
                  <TextInput value={draft.guardianRelationship} onChange={e => update({ guardianRelationship: e.target.value })} onBlur={() => touch('guardianRelationship')} placeholder="e.g. Aunt, grandparent" maxLength={60} />
                </Field>
              </Slot>
              <Slot name="guardianContactNo">
                <Field label="Contact number" optional error={errorFor('guardianContactNo')}>
                  <TextInput type="tel" inputMode="tel" value={draft.guardianContactNo} onChange={e => update({ guardianContactNo: e.target.value })} onBlur={e => { update({ guardianContactNo: tidyPhone(e.currentTarget.value) }); touch('guardianContactNo'); }} />
                </Field>
              </Slot>
            </div>
            <Checkbox
              checked={draft.guardianAddressSameAsHome}
              onChange={v => update({ guardianAddressSameAsHome: v })}
              label="Same as my home address"
            />
            {!draft.guardianAddressSameAsHome && (
              <Slot name="guardianAddress">
                <Field label="Guardian’s address" optional error={errorFor('guardianAddress')}>
                  <TextInput value={draft.guardianAddress} onChange={e => update({ guardianAddress: e.target.value })} onBlur={() => touch('guardianAddress')} maxLength={200} />
                </Field>
              </Slot>
            )}
          </div>
        )}
      </fieldset>
    </div>
  );
}

