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
  'block w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all';
const labelClass = 'block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1';

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
    setSaved(false);
    setError('');
  }, [applicationId, fields]);

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
    <div className="bg-white rounded-xl border border-slate-100 p-5 sm:p-6 card-shadow space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display font-bold text-sm text-slate-900 uppercase tracking-wider">POLCA Use Only</h3>
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          <Lock className="w-3 h-3" /> Hidden from student
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
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                  form.applicantType === type ? 'bg-brand-green text-white border-brand-green' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
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
          className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white bg-brand-green hover:bg-brand-green-dark px-3.5 py-2 rounded-lg transition-all disabled:opacity-50"
        >
          {isSaving ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
          Save
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
