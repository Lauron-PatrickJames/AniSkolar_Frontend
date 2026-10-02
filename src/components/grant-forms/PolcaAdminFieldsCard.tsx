import React, { useEffect, useState } from 'react';
import { CheckCircle2, Lock, Save } from 'lucide-react';
import { PolcaAdminFields } from '../../types';
import { Alert, Badge, Button, Card, Field, SegmentedControl, TextInput } from '../../pages/admin/AdminUI';

// The POLCA form's "POLCA Personnel Use Only" box (Date Received, Received
// By, New/Old applicant, GPA). Admin-only: saved through
// PATCH /api/applications/:id/admin-fields and never returned to students.

interface PolcaAdminFieldsCardProps {
  applicationId: string;
  fields?: PolcaAdminFields;
  getToken: () => Promise<string | null>;
  apiBaseUrl: string;
  onSaved: (fields: PolcaAdminFields) => void;
}

type FormState = { dateReceived: string; receivedBy: string; applicantType: '' | 'New' | 'Old'; gpa: string };

function toDateInput(value?: string) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function validate(form: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (form.gpa !== '') {
    const gpa = Number(form.gpa);
    if (Number.isNaN(gpa)) errors.gpa = 'Enter a number, e.g. 3.25.';
    else if (gpa < 0 || gpa > 5) errors.gpa = 'GPA must be between 0 and 5.';
  }
  return errors;
}

export default function PolcaAdminFieldsCard({ applicationId, fields, getToken, apiBaseUrl, onSaved }: PolcaAdminFieldsCardProps) {
  const [form, setForm] = useState<FormState>({ dateReceived: '', receivedBy: '', applicantType: '', gpa: '' });
  const [attempted, setAttempted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm({
      dateReceived: toDateInput(fields?.dateReceived),
      receivedBy: fields?.receivedBy ?? '',
      applicantType: fields?.applicantType ?? '',
      gpa: fields?.gpa !== undefined && fields?.gpa !== null ? String(fields.gpa) : ''
    });
  }, [applicationId, fields]);

  // Clear the confirmation/error only when switching applications — a
  // successful save also updates `fields`, which mustn't hide "Saved".
  useEffect(() => {
    setSaved(false);
    setError('');
    setAttempted(false);
  }, [applicationId]);

  const errors = attempted ? validate(form) : {};

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const save = async () => {
    setAttempted(true);
    if (Object.keys(validate(form)).length > 0) return;
    setIsSaving(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(`${apiBaseUrl}/api/applications/${applicationId}/admin-fields`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          dateReceived: form.dateReceived || null,
          receivedBy: form.receivedBy,
          applicantType: form.applicantType || null,
          gpa: form.gpa === '' ? null : form.gpa
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to save.');
      onSaved(body.application?.adminFields ?? {});
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card
      title="POLCA office use"
      description="From Form No. 002's personnel box"
      actions={<Badge icon={Lock}>Internal</Badge>}
    >
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); save(); }} noValidate>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date received">
            <TextInput type="date" value={form.dateReceived} onChange={e => update('dateReceived', e.target.value)} disabled={isSaving} />
          </Field>
          <Field label="GPA" error={errors.gpa}>
            <TextInput
              type="number"
              step="0.01"
              min={0}
              max={5}
              inputMode="decimal"
              value={form.gpa}
              onChange={e => update('gpa', e.target.value)}
              placeholder="e.g. 3.25"
              disabled={isSaving}
              className="tabular-nums"
            />
          </Field>
          <Field label="Received by" className="col-span-2">
            <TextInput value={form.receivedBy} onChange={e => update('receivedBy', e.target.value)} disabled={isSaving} />
          </Field>
          <div className="col-span-2">
            <p className="mb-1.5 text-sm font-medium text-ink">Applicant</p>
            <SegmentedControl
              label="Applicant"
              options={['New', 'Old'] as const}
              value={form.applicantType}
              onChange={v => update('applicantType', v)}
              allowEmpty
            />
          </div>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="submit" variant="primary" icon={Save} loading={isSaving}>Save office fields</Button>
          {saved && (
            <span role="status" className="flex items-center gap-1 text-xs font-medium text-success-fg">
              <CheckCircle2 className="size-3.5" aria-hidden /> Saved
            </span>
          )}
        </div>
        {fields?.updatedBy && <p className="text-xs text-ink-subtle">Last updated by {fields.updatedBy}</p>}
      </form>
    </Card>
  );
}
