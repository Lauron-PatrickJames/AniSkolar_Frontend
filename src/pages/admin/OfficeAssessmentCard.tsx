import React, { useState } from 'react';
import { AssessmentField, OfficeAnswers, OfficeForm } from '../../data/officeForms';
import { API_BASE_URL, AdminApplication, authHeaders, formatDateTime } from './adminData';
import { Alert, Button, Card, Checkbox, DatePicker, Field, Select, TextInput } from './AdminUI';

// What the deciding office records while reviewing (data/officeForms.ts):
// the Heraldo's points, Vicissitude's rating, the ROTC amount, the USG's
// on-site schedule, the SDO's grant — with the result worked out. The AdSO
// sees it read-only on another office's scholarship. Never shown to the
// student; the decision message tells them what they got.
export default function OfficeAssessmentCard({ app, form, getToken, readOnly, onSaved }: {
  app: AdminApplication;
  form: OfficeForm;
  getToken: () => Promise<string | null>;
  readOnly?: boolean;
  onSaved: (updated: AdminApplication) => void;
}) {
  const answers = (app.standardInfo?.officeAnswers ?? {}) as OfficeAnswers;
  const initial = (): OfficeAnswers => Object.fromEntries(form.assessment.map(f => [
    f.key,
    app.officeAssessment?.[f.key] ?? (f.fromAnswer ? answers[f.fromAnswer] : undefined),
  ]));
  const [values, setValues] = useState<OfficeAnswers>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(values) !== JSON.stringify(initial());
  const result = form.result(values, answers);

  if (readOnly && !app.officeAssessment) return null;

  const set = (key: string, value: OfficeAnswers[string]) => setValues(v => ({ ...v, [key]: value }));
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/applications/${app._id}/office-assessment`, {
        method: 'PATCH',
        headers: await authHeaders(getToken, true),
        body: JSON.stringify({ assessment: values }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't save it.");
      onSaved({ ...app, officeAssessment: body.officeAssessment });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save it.");
    } finally {
      setBusy(false);
    }
  };

  const input = (f: AssessmentField) => {
    const value = values[f.key];
    const disabled = busy || readOnly;
    switch (f.type) {
      case 'bool':
        return <Checkbox key={f.key} checked={value === true} onChange={v => set(f.key, v)} label={f.label} disabled={disabled} />;
      case 'choice':
        return (
          <Field key={f.key} label={f.label} helper={f.hint}>
            <Select value={String(value ?? '')} onChange={v => set(f.key, v || undefined)} disabled={disabled}>
              <option value="">Not set</option>
              {f.options!.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
        );
      case 'date':
        return <Field key={f.key} label={f.label}><DatePicker value={String(value ?? '')} onChange={v => set(f.key, v || undefined)} disabled={disabled} /></Field>;
      case 'time':
        return <Field key={f.key} label={f.label}><TextInput type="time" value={String(value ?? '')} onChange={e => set(f.key, e.target.value || undefined)} disabled={disabled} /></Field>;
      default:
        return (
          <Field key={f.key} label={f.label} helper={f.hint}>
            <TextInput
              type="number"
              inputMode="decimal"
              min={f.min}
              max={f.max}
              step={f.step}
              value={value === undefined ? '' : String(value)}
              onChange={e => set(f.key, e.target.value === '' ? undefined : Number(e.target.value))}
              disabled={disabled}
            />
          </Field>
        );
    }
  };

  return (
    <Card
      title={form.assessmentTitle}
      description={readOnly ? undefined : `Approved by the ${form.approver}. Only your office sees this; tell the student what they got in your decision message.`}
      footer={!readOnly && dirty ? <Button size="sm" variant="primary" onClick={save} loading={busy}>Save</Button> : undefined}
    >
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        {form.assessment.map(input)}
        {result && (
          <Alert tone={result.tone === 'neutral' ? 'info' : result.tone} title={result.headline}>
            {result.lines.map(line => <p key={line}>{line}</p>)}
          </Alert>
        )}
        {app.officeAssessment?.updatedAt && !dirty && (
          <p className="text-xs text-ink-subtle">Saved {formatDateTime(String(app.officeAssessment.updatedAt))}{app.officeAssessment.updatedBy ? ` by ${app.officeAssessment.updatedBy}` : ''}</p>
        )}
      </div>
    </Card>
  );
}
