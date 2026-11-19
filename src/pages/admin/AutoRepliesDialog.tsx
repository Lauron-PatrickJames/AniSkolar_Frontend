import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Alert, Button, Checkbox, Field, Modal, SegmentedControl, TableSkeleton, TextInput, Textarea } from './AdminUI';
import { API_BASE_URL, authHeaders } from './adminData';

// The office's automatic replies to students (panel, Nov 2026: like a
// Facebook business page). Backend: GET/PUT /api/messages/admin/auto-replies
// (models/AutoReply.js):
//   welcome  when a student starts a conversation
//   away     outside office hours (weekdays 8 AM to 5 PM), or while away
//   quick questions  students tap one and get the saved answer at once

interface Faq { _id?: string; question: string; answer: string }
interface Settings {
  welcome: { enabled: boolean; text: string };
  away: { enabled: boolean; mode: 'outsideHours' | 'always'; text: string };
  faqs: Faq[];
}
const MAX_FAQS = 10;
// Ready-to-use messages, filled in so the office only has to tick the box
// (and can edit them).
const DEFAULT_WELCOME = 'Hi! Thank you for messaging us. We’ve received your message and will reply within 1–2 working days. You can also tap one of the quick questions below for an instant answer.';
const DEFAULT_AWAY = 'Thank you for your message! Our office is closed right now. We’ll reply on the next working day (Monday to Friday, 8:00 AM to 5:00 PM).';
const DEFAULT_AWAY_NOW = 'Thank you for your message! Our office is away right now, so replies may take a little longer. We’ll get back to you as soon as we can.';

export default function AutoRepliesDialog({ getToken, onClose, onSaved }: {
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/messages/admin/auto-replies`, { headers: await authHeaders(getToken) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Failed to load the automatic replies.');
        if (live) {
          const loaded: Settings = body.settings;
          setSettings({
            ...loaded,
            welcome: { ...loaded.welcome, text: loaded.welcome.text || DEFAULT_WELCOME },
            away: { ...loaded.away, text: loaded.away.text || (loaded.away.mode === 'always' ? DEFAULT_AWAY_NOW : DEFAULT_AWAY) },
          });
        }
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : 'Failed to load the automatic replies.');
      }
    })();
    return () => { live = false; };
  }, [getToken]);

  const patch = (next: Partial<Settings>) => setSettings(s => (s ? { ...s, ...next } : s));
  const setFaq = (i: number, next: Partial<Faq>) => setSettings(s => (s ? { ...s, faqs: s.faqs.map((f, j) => (j === i ? { ...f, ...next } : f)) } : s));

  const save = async () => {
    if (!settings) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/messages/admin/auto-replies`, {
        method: 'PUT',
        headers: await authHeaders(getToken, true),
        body: JSON.stringify(settings),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to save the automatic replies.');
      onSaved('Automatic replies saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the automatic replies.');
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Automatic replies"
      description="Sent to students for you, marked as automatic replies."
      onClose={onClose}
      dismissible={!busy}
      size="md"
      sheet
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" onClick={save} loading={busy} disabled={!settings}>Save</Button></>}
    >
      {error && <Alert tone="danger" onDismiss={() => setError('')}>{error}</Alert>}
      {!settings ? (!error && <TableSkeleton rows={4} label="Loading automatic replies" />) : (
        <div className="space-y-6">
          <section className="space-y-3">
            <Checkbox
              checked={settings.welcome.enabled}
              onChange={on => patch({ welcome: { ...settings.welcome, enabled: on } })}
              label="Welcome message"
              description="When a student starts a conversation (or writes after a week without messages)."
            />
            {settings.welcome.enabled && (
              <Textarea value={settings.welcome.text} onChange={e => patch({ welcome: { ...settings.welcome, text: e.target.value } })} rows={3} maxLength={1000} aria-label="Welcome message" placeholder="e.g. Hi! Thanks for messaging the AdSO. We reply within 1–2 working days. You can also tap a quick question below." />
            )}
          </section>

          <section className="space-y-3 border-t border-line pt-5">
            <Checkbox
              checked={settings.away.enabled}
              onChange={on => patch({ away: { ...settings.away, enabled: on } })}
              label="Away message"
              description="Sent instead of the welcome, at most once every 12 hours per student."
            />
            {settings.away.enabled && (
              <>
                <SegmentedControl<'outsideHours' | 'always'>
                  label="When"
                  options={['outsideHours', 'always']}
                  value={settings.away.mode}
                  // Switching swaps in that mode's message, unless it was edited.
                  onChange={v => v && patch({ away: { ...settings.away, mode: v, text: [DEFAULT_AWAY, DEFAULT_AWAY_NOW, ''].includes(settings.away.text.trim()) ? (v === 'always' ? DEFAULT_AWAY_NOW : DEFAULT_AWAY) : settings.away.text } })}
                  renderLabel={o => (o === 'outsideHours' ? 'Outside office hours' : 'Away now')}
                />
                <p className="-mt-1 text-xs text-ink-subtle">{settings.away.mode === 'outsideHours' ? 'Office hours: Monday to Friday, 8:00 AM to 5:00 PM.' : 'Every new message gets it until you switch back.'}</p>
                <Textarea value={settings.away.text} onChange={e => patch({ away: { ...settings.away, text: e.target.value } })} rows={3} maxLength={1000} aria-label="Away message" placeholder="e.g. Thanks for your message! The office is closed right now. We'll reply on the next working day (Mon–Fri, 8 AM–5 PM)." />
              </>
            )}
          </section>

          <section className="space-y-3 border-t border-line pt-5">
            <div>
              <p className="text-sm font-medium text-ink">Quick questions</p>
              <p className="text-xs text-ink-muted">Students tap one above the message box and get your answer at once. Up to {MAX_FAQS}.</p>
            </div>
            {settings.faqs.map((f, i) => (
              <div key={f._id ?? `new-${i}`} className="space-y-2 rounded-control p-3 ring-1 ring-line">
                <div className="flex items-start gap-2">
                  <Field label={`Question ${i + 1}`} className="min-w-0 flex-1">
                    <TextInput value={f.question} onChange={e => setFaq(i, { question: e.target.value })} maxLength={150} placeholder="e.g. When is the SFAG application?" />
                  </Field>
                  <Button size="sm" variant="ghost" icon={Trash2} className="mt-6" aria-label={`Remove question ${i + 1}`} onClick={() => patch({ faqs: settings.faqs.filter((_, j) => j !== i) })}>Remove</Button>
                </div>
                <Field label="Answer">
                  <Textarea value={f.answer} onChange={e => setFaq(i, { answer: e.target.value })} rows={3} maxLength={2000} />
                </Field>
              </div>
            ))}
            {settings.faqs.length < MAX_FAQS && (
              <button
                type="button"
                onClick={() => patch({ faqs: [...settings.faqs, { question: '', answer: '' }] })}
                className="flex w-full items-center justify-center gap-1.5 rounded-control border border-dashed border-line-strong px-3 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:border-accent hover:text-accent"
              >
                <Plus className="size-4" aria-hidden /> Add a quick question
              </button>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
