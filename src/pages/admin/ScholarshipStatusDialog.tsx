import React, { useState } from 'react';
import { CalendarClock, CircleCheck, CircleOff, Clock, Send } from 'lucide-react';
import { Scholarship, ScholarshipOverride } from '../../types';
import { acceptsOnlineApplications, officeDisplayName, officeOf } from '../../data/scholarships';
import { API_BASE_URL, authHeaders } from './adminData';
import { Alert, Button, Checkbox, Field, Modal, TextInput, Textarea } from './AdminUI';
import { ScheduleFields, ScheduleState, formatScheduled, initialSchedule, scheduleToIso } from './announcementSchedule';

// Opening, closing or marking a scholarship "Closing Soon" comes with an
// announcement: drafted from the scholarship's details, editable here, and
// published now or scheduled (it can still be edited in Announcements).
//
//   mode 'change'   — changes the status, then posts the announcement
//   mode 'announce' — the status was already saved (edit page); only posts

export type ScholarshipStatus = Scholarship['status'];

interface Draft { title: string; description: string; content: string; category: 'Update' | 'Deadline' }

// The announcement text for a status change. Plain and factual; the admin
// edits it before posting.
export function announcementFor(s: Scholarship, status: ScholarshipStatus): Draft {
  const online = acceptsOnlineApplications(s);
  const office = officeDisplayName(officeOf(s));
  const period = s.deadline?.trim();
  const how = online
    ? `Apply in AniSkolar: go to Explore Grants and open the ${s.name}.`
    : `For how to apply, contact the ${office}.`;
  if (status === 'Open') {
    return {
      title: `${s.name}: applications are now open`,
      description: `Applications for the ${s.name} are now open.${period ? ` ${period}.` : ''}`.replace('..', '.'),
      content: [
        `Applications for the ${s.name} are now open.`,
        period ? `Deadline / application period: ${period}` : '',
        how,
      ].filter(Boolean).join('\n\n'),
      category: 'Update',
    };
  }
  if (status === 'Closing Soon') {
    return {
      title: `${s.name}: applications closing soon`,
      description: `Applications for the ${s.name} are closing soon.${period ? ` ${period}.` : ''}`.replace('..', '.'),
      content: [
        `Applications for the ${s.name} are closing soon. Submit yours before the deadline.`,
        period ? `Deadline / application period: ${period}` : '',
        how,
      ].filter(Boolean).join('\n\n'),
      category: 'Deadline',
    };
  }
  return {
    title: `${s.name}: applications are now closed`,
    description: `Applications for the ${s.name} are now closed.`,
    content: [
      `Applications for the ${s.name} are now closed. Thank you to everyone who applied.`,
      online ? 'You can follow your application in AniSkolar under Explore Grants → My Applications.' : '',
      `For questions, contact the ${office}.`,
    ].filter(Boolean).join('\n\n'),
    category: 'Update',
  };
}

const VERB: Record<ScholarshipStatus, { title: string; confirm: string; icon: React.ElementType; done: string }> = {
  Open: { title: 'Open', confirm: 'Open scholarship', icon: CircleCheck, done: 'Opened' },
  'Closing Soon': { title: 'Mark as closing soon:', confirm: 'Mark closing soon', icon: Clock, done: 'Marked as closing soon:' },
  Closed: { title: 'Close', confirm: 'Close scholarship', icon: CircleOff, done: 'Closed' },
};

const EFFECT: Record<ScholarshipStatus, string> = {
  Open: 'Students can see it in Explore and apply.',
  'Closing Soon': 'Students can still apply; it shows as closing soon.',
  Closed: "Students won't see it in Explore and can't apply while it's closed. Applications already submitted aren't affected.",
};

export interface StatusDialogResult {
  overrides?: ScholarshipOverride;          // when the status was changed here
  announcement?: { scheduledFor: string | null; facebookError?: string };
}

export default function ScholarshipStatusDialog({ scholarship, next, mode, getToken, changeStatus, onDone, onCancel }: {
  scholarship: Scholarship;
  next: ScholarshipStatus;
  mode: 'change' | 'announce';
  getToken: () => Promise<string | null>;
  // Saves the new status (mode 'change').
  changeStatus: () => Promise<ScholarshipOverride>;
  onDone: (result: StatusDialogResult) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => announcementFor(scholarship, next));
  const [announce, setAnnounce] = useState(true);
  const [fbEnabled, setFbEnabled] = useState(true);
  const [schedule, setSchedule] = useState<ScheduleState>(() => initialSchedule());
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Set once the status is saved, so a failed announcement can be retried
  // without changing the status again.
  const [savedOverrides, setSavedOverrides] = useState<ScholarshipOverride | null>(null);

  const statusDone = mode === 'announce' || !!savedOverrides;
  const verb = VERB[next];
  const scheduling = schedule.timing === 'Schedule';
  const missing = {
    title: !draft.title.trim() ? 'Enter a title.' : '',
    description: !draft.description.trim() ? 'Enter a short summary.' : '',
    content: !draft.content.trim() ? 'Enter the announcement body.' : '',
  };
  const scheduleError = attempted && announce && scheduling ? scheduleToIso(schedule).error : undefined;
  const shown = attempted && announce ? missing : { title: '', description: '', content: '' };
  const set = (key: keyof Draft, value: string) => setDraft(d => ({ ...d, [key]: value }));

  const post = async (): Promise<StatusDialogResult['announcement']> => {
    const scheduledFor = scheduling ? scheduleToIso(schedule).iso ?? null : null;
    const res = await fetch(`${API_BASE_URL}/api/announcements`, {
      method: 'POST',
      headers: await authHeaders(getToken, true),
      body: JSON.stringify({
        title: draft.title.trim(),
        description: draft.description.trim(),
        content: draft.content.trim(),
        category: draft.category,
        scholarshipId: scholarship.id,
        isPinned: false,
        fbEnabled,
        status: scheduling ? 'scheduled' : 'published',
        ...(scheduledFor ? { scheduledFor } : {}),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Couldn't post the announcement.");
    return { scheduledFor, facebookError: body.facebook && !body.facebook.ok ? body.facebook.error || 'Facebook returned an error.' : undefined };
  };

  const confirm = async () => {
    if (busy) return;
    setAttempted(true);
    if (announce && (missing.title || missing.description || missing.content)) return;
    if (announce && scheduling && scheduleToIso(schedule).error) return;
    setBusy(true);
    setError('');
    let overrides = savedOverrides ?? undefined;
    try {
      if (!statusDone) {
        overrides = await changeStatus();
        setSavedOverrides(overrides);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update the scholarship.');
      setBusy(false);
      return;
    }
    if (!announce) {
      onDone({ overrides });
      return;
    }
    try {
      onDone({ overrides, announcement: await post() });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't post the announcement.";
      setError(mode === 'change' ? `The scholarship was updated, but the announcement wasn't posted: ${message}` : message);
      setBusy(false);
    }
  };

  // Closing after the status saved but the announcement failed still
  // reports the status change.
  const close = () => {
    if (busy) return;
    if (savedOverrides) onDone({ overrides: savedOverrides });
    else onCancel();
  };

  const confirmLabel = statusDone
    ? (announce ? (scheduling ? 'Schedule announcement' : 'Post announcement') : 'Done')
    : verb.confirm;

  return (
    <Modal
      title={mode === 'change' ? `${verb.title} ${scholarship.name}?` : `Announce: ${scholarship.name} is ${next === 'Open' ? 'open' : next === 'Closed' ? 'closed' : 'closing soon'}`}
      description={mode === 'change' ? EFFECT[next] : 'The scholarship is saved. Let students know with an announcement.'}
      onClose={close}
      dismissible={!busy}
      size="lg"
      footer={
        <>
          <Button onClick={close} disabled={busy}>{mode === 'announce' || savedOverrides ? 'Skip' : 'Cancel'}</Button>
          <Button
            variant={next === 'Closed' && !statusDone ? 'danger' : 'primary'}
            icon={statusDone ? (scheduling && announce ? CalendarClock : Send) : verb.icon}
            loading={busy}
            onClick={confirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form className="space-y-5" onSubmit={e => { e.preventDefault(); confirm(); }} noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="rounded-control bg-surface-muted p-4 ring-1 ring-inset ring-line">
          <Checkbox
            checked={announce}
            onChange={setAnnounce}
            disabled={busy}
            label="Post an announcement"
            description="Shows on every student's dashboard and on this scholarship's page. You can still edit it later in Announcements."
          />
        </div>
        {announce && (
          <>
            <Field label="Title" error={shown.title || undefined} labelAside={`${draft.title.length}/150`}>
              <TextInput value={draft.title} onChange={e => set('title', e.target.value)} maxLength={150} disabled={busy} />
            </Field>
            <Field label="Summary" helper="Shown on the collapsed card in the student portal." error={shown.description || undefined} labelAside={`${draft.description.length}/500`}>
              <Textarea value={draft.description} onChange={e => set('description', e.target.value)} rows={2} maxLength={500} disabled={busy} className="resize-none" />
            </Field>
            <Field label="Body" error={shown.content || undefined}>
              <Textarea value={draft.content} onChange={e => set('content', e.target.value)} rows={6} maxLength={8000} disabled={busy} className="resize-y" />
            </Field>
            <ScheduleFields value={schedule} onChange={setSchedule} disabled={busy} error={scheduleError} nowLabel={mode === 'change' ? 'With this change' : 'Now'} />
            {scheduling && !scheduleError && scheduleToIso(schedule).iso && (
              <p className="text-xs text-ink-subtle">Publishes {formatScheduled(scheduleToIso(schedule).iso)}{mode === 'change' ? `; the scholarship is ${next === 'Open' ? 'opened' : next === 'Closed' ? 'closed' : 'updated'} now` : ''}.</p>
            )}
            <Checkbox
              checked={fbEnabled}
              onChange={setFbEnabled}
              disabled={busy}
              label="Also post to Facebook"
              description={scheduling ? 'Posts to the Page when it publishes.' : 'Posts to the Page right away.'}
            />
          </>
        )}
      </form>
    </Modal>
  );
}
