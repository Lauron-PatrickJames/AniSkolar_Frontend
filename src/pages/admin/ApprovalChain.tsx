import React, { useState } from 'react';
import { Check, CornerUpLeft, Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import { API_BASE_URL, AdminApplication, authHeaders, formatDateTime, normalizeApplication } from './adminData';
import { Alert, Button, Field, Textarea } from './AdminUI';

// The AdSO's approval chain for its own scholarships (backend
// utils/approvalChain.js): the Scholarship Associate checks and endorses,
// the Head of the Recruitment and Scholarship Unit recommends approval or
// rejection, and the Director gives the final decision (the Decision
// card's Approve / Reject). Staff notes here are never shown to the
// student. An account's role is publicMetadata.adsoRole in Clerk; an
// account without one can act at every step.

export type ChainStage = 'associate' | 'head' | 'director';
export type AdsoRole = ChainStage | null;

export const STAGES: { key: ChainStage; label: string; short: string }[] = [
  { key: 'associate', label: 'Scholarship Associate', short: 'Associate' },
  { key: 'head', label: 'Head of the Recruitment and Scholarship Unit', short: 'Head' },
  { key: 'director', label: 'Director', short: 'Director' },
];
const labelOf = (s: ChainStage) => STAGES.find(x => x.key === s)!.label;

export const stageOf = (app: AdminApplication): ChainStage => app.approvalStage ?? 'associate';
export const canAct = (role: AdsoRole, stage: ChainStage) => !role || role === stage;

const ACTION_TEXT: Record<string, string> = {
  endorse: 'Endorsed to the Head',
  recommendApproval: 'Recommended approval',
  recommendRejection: 'Recommended rejection',
  returnToAssociate: 'Returned to the Associate',
  returnToHead: 'Returned to the Head',
  approve: 'Approved',
  reject: 'Rejected',
  revision: 'Sent back to the student for revision',
};

type Step = { action: string; label: string; icon: React.ElementType; variant: 'primary' | 'secondary' | 'danger-secondary' | 'ghost'; needsNote?: string; done: string };
const STEP_ACTIONS: Record<ChainStage, Step[]> = {
  associate: [
    { action: 'endorse', label: 'Endorse to the Head', icon: Send, variant: 'primary', done: 'Endorsed to the Head.' },
  ],
  head: [
    { action: 'recommendApproval', label: 'Recommend approval', icon: ThumbsUp, variant: 'primary', done: 'Recommended approval to the Director.' },
    { action: 'recommendRejection', label: 'Recommend rejection', icon: ThumbsDown, variant: 'danger-secondary', needsNote: 'Say why you recommend rejecting it.', done: 'Recommended rejection to the Director.' },
    { action: 'returnToAssociate', label: 'Return to the Associate', icon: CornerUpLeft, variant: 'ghost', needsNote: 'Say what the Associate should check.', done: 'Returned to the Associate.' },
  ],
  director: [
    { action: 'returnToHead', label: 'Return to the Head', icon: CornerUpLeft, variant: 'ghost', needsNote: 'Say what the Head should look at again.', done: 'Returned to the Head.' },
  ],
};

export default function ApprovalChain({ app, role, getToken, onChanged }: {
  app: AdminApplication;
  role: AdsoRole;
  getToken: () => Promise<string | null>;
  onChanged: (updated: AdminApplication, message: string) => void;
}) {
  const stage = stageOf(app);
  const at = STAGES.findIndex(s => s.key === stage);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const steps = app.approvalSteps ?? [];
  // The Head's latest recommendation, for the Director.
  const recommendation = [...steps].reverse().find(s => s.action === 'recommendApproval' || s.action === 'recommendRejection');
  const mine = canAct(role, stage);

  const take = async (step: Step) => {
    if (step.needsNote && !note.trim()) { setError(step.needsNote); return; }
    setBusy(step.action);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/applications/${app._id}/approval-step`, {
        method: 'POST',
        headers: await authHeaders(getToken, true),
        body: JSON.stringify({ action: step.action, note: note.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Couldn’t save the step.');
      setNote('');
      onChanged(normalizeApplication(body.application), step.done);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t save the step.');
    } finally {
      setBusy('');
    }
  };

  return (
    <section aria-label="Approval chain" className="space-y-3 rounded-control bg-surface-muted p-3.5 ring-1 ring-line">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Approval chain</p>
      <ol className="flex items-center gap-1.5 text-xs">
        {STAGES.map((s, i) => (
          <li key={s.key} className="flex flex-1 items-center gap-1.5">
            <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${i < at ? 'bg-accent text-white' : i === at ? 'bg-accent-subtle text-accent ring-2 ring-accent' : 'bg-surface text-ink-subtle ring-1 ring-line'}`}>
              {i < at ? <Check className="size-3" /> : i + 1}
            </span>
            <span className={`truncate ${i === at ? 'font-semibold text-ink' : 'text-ink-muted'}`}>{s.short}</span>
            {i < STAGES.length - 1 && <span className="h-px flex-1 bg-line" aria-hidden />}
          </li>
        ))}
      </ol>
      <p className="text-sm text-ink">
        With the <span className="font-medium">{labelOf(stage)}</span>.{' '}
        {stage === 'director' ? 'The Director approves or rejects below.' : stage === 'head' ? 'The Head recommends approval or rejection to the Director.' : 'The Associate checks the documents and endorses it to the Head.'}
      </p>

      {stage === 'director' && recommendation && (
        <Alert tone={recommendation.action === 'recommendApproval' ? 'success' : 'warning'} title={`The Head recommends ${recommendation.action === 'recommendApproval' ? 'approval' : 'rejection'}`}>
          {recommendation.note && <p>{recommendation.note}</p>}
          <p className="text-xs opacity-80">{recommendation.byName || recommendation.by} · {formatDateTime(recommendation.at)}</p>
        </Alert>
      )}

      {error && <Alert tone="danger" onDismiss={() => setError('')}>{error}</Alert>}

      {mine ? (
        STEP_ACTIONS[stage].length > 0 && (
          <div className="space-y-2">
            <Field label="Note for the next step" optional helper="Only the office staff see this.">
              <Textarea value={note} onChange={e => { setNote(e.target.value); if (error) setError(''); }} rows={2} maxLength={2000} disabled={!!busy} className="resize-y" />
            </Field>
            <div className="flex flex-wrap gap-2">
              {STEP_ACTIONS[stage].map(s => (
                <Button key={s.action} size="sm" variant={s.variant} icon={s.icon} loading={busy === s.action} disabled={!!busy} onClick={() => take(s)}>{s.label}</Button>
              ))}
            </div>
          </div>
        )
      ) : (
        <p className="text-xs text-ink-subtle">Only the {labelOf(stage)} can take this step. You can still send it back to the student for revision.</p>
      )}

      {steps.length > 0 && (
        <ul className="space-y-1.5 border-t border-line pt-2.5">
          {steps.map((s, i) => (
            <li key={i} className="text-xs text-ink-muted">
              <span className="font-medium text-ink">{ACTION_TEXT[s.action] ?? s.action}</span>
              {' · '}{s.byName || s.by}{s.role ? ` (${STAGES.find(x => x.key === s.role)?.short ?? s.role})` : ''} · {formatDateTime(s.at)}
              {s.note && <span className="block text-ink-muted">“{s.note}”</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
