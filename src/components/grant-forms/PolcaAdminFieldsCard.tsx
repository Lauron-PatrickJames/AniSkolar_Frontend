import React, { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, Lock } from 'lucide-react';
import { PolcaAdminFields } from '../../types';

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

const inputClass =
  'block w-full px-3 py-2 border-0 ring-1 ring-inset ring-slate-300 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green transition-shadow';
const labelClass = 'block text-xs font-medium text-slate-700 mb-1';

function toDateInput(value?: string) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export default function PolcaAdminFieldsCard({ applicationId, fields, getToken, apiBaseUrl, onSaved }: PolcaAdminFieldsCardProps) {
  const [form, setForm] = useState({ dateReceived: '', receivedBy: '', applicantType: '', gpa: '' });
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
  }, [applicationId]);

  const update = (key: keyof typeof form, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const save = async () => {
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
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-[0_1px_2px_rgba(16,24,40,0.04)] p-5 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-2 -mt-0.5">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">POLCA office use</h3>
          <p className="text-xs text-slate-500 mt-0.5">From Form No. 002's personnel box</p>
        </div>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-[11px] font-medium text-slate-500 shrink-0">
          <Lock className="w-3 h-3" /> Internal
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Date Received</label>
          <input type="date" value={form.dateReceived} onChange={e => update('dateReceived', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>GPA</label>
          <input type="number" step="0.01" min={0} max={5} inputMode="decimal" value={form.gpa} onChange={e => update('gpa', e.target.value)} className={inputClass} placeholder="e.g. 3.25" />
        </div>
        <div className="col-span-2">
          <label className={labelClass}>Received By</label>
          <input type="text" value={form.receivedBy} onChange={e => update('receivedBy', e.target.value)} className={inputClass} />
        </div>
        <div className="col-span-2">
          <label className={labelClass}>Applicant</label>
          <div className="flex gap-2">
            {(['New', 'Old'] as const).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => update('applicantType', form.applicantType === type ? '' : type)}
                className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium ring-1 ring-inset transition-colors ${
                  form.applicantType === type ? 'bg-emerald-50 text-brand-green ring-brand-green' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={save}
          disabled={isSaving}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-brand-green hover:bg-brand-green-dark px-3.5 py-2 rounded-lg shadow-sm transition-colors disabled:opacity-50"
        >
          {isSaving ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
          Save office fields
        </button>
        {saved && <span className="text-[11px] font-bold text-brand-green flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Saved</span>}
        {error && <span className="text-[11px] font-bold text-rose-500 flex items-center gap-1 text-right"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</span>}
      </div>
      {fields?.updatedBy && (
        <p className="text-[10px] text-slate-400">Last updated by {fields.updatedBy}</p>
      )}
    </div>
  );
}
