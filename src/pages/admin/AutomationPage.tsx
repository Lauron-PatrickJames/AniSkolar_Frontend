import React, { useCallback, useEffect, useState } from 'react';
import { Building2, CalendarClock, CalendarDays, Clock, Mail, Pencil, Play, Plus, RefreshCw, Trash2, Zap } from 'lucide-react';
import { API_BASE_URL, authHeaders, formatDateTime } from './adminData';
import { ResultDialog, Alert, Badge, Button, Card, Checkbox, ConfirmDialog, DatePicker, EmptyState, ErrorState, Field, Modal, PageHeader, SegmentedControl, Select, Skeleton, Table, Td, TextInput, Textarea, Th, Toast, Tr } from './AdminUI';
import EmailAudience, { DEFAULT_EMAIL_TARGET, EmailTarget, describeTarget } from './EmailAudience';
import { mockScholarships, acceptsOnlineApplications } from '../../data/scholarships';

// AdSO: what AniSkolar does on its own (backend utils/automation.js):
// reminders, the morning summary and the start-of-semester office
// assignment. Everything starts off. Each job can be previewed (nothing is
// sent or changed) and run now; the timers run it on schedule once it's on.
// Personal emails go through an outbox that sends a few a minute.
// Below them, the AdSO's own automations (backend utils/customAutomations.js):
// an email on a schedule to an audience, or to the student involved when an
// application or renewal changes.

type JobName = 'dutyReminders' | 'officeHeadReminders' | 'deadlineReminders';
interface LastRun { period: string; at: string; queued: number; summary: string; error?: string }
interface AutomationView {
  settings: Record<JobName, boolean> & { updatedBy: string | null; updatedAt: string | null };
  lastRuns: Partial<Record<JobName, LastRun>>;
  outbox: { queued: number; sentLast7Days: number; failedLast7Days: number; perMinute: number; mailEnabled: boolean };
  custom?: CustomAutomation[];
}
type Frequency = 'once' | 'daily' | 'weekly' | 'monthly';
type EventName = 'applicationSubmitted' | 'applicationApproved' | 'applicationNeedsRevision' | 'applicationRejected'
  | 'renewalSubmitted' | 'renewalRenewed' | 'renewalNeedsRevision' | 'renewalNotRenewed';
interface CustomAutomation {
  _id: string;
  name: string;
  enabled: boolean;
  trigger: 'schedule' | 'event';
  frequency?: Frequency;
  date?: string;
  weekday?: number;
  dayOfMonth?: number;
  hour?: number;
  audience?: 'students' | 'officeHeads';
  emailTarget?: EmailTarget;
  event?: EventName;
  scholarshipIds?: string[];
  subject: string;
  body: string;
  lastRun?: LastRun;
}
interface JobResult {
  queued: number;
  summary: string;
  emails: number;
  sample: { to: string; subject: string }[];
  details: { assignments?: { studentNumber: string; name: string; office: string }[]; leftOver?: number } | Record<string, number> | null;
}
interface OutboxRow { _id: string; kind: string; to: string; subject: string; attempts: number; error?: string; createdAt: string }

const JOBS: { name: JobName; title: string; when: string; icon: React.ElementType; description: string }[] = [
  {
    name: 'dutyReminders', title: 'Duty hours reminders', when: 'Mondays, 8:00 AM', icon: Clock,
    description: 'Emails SFAG scholars who are behind on their hours.',
  },
  {
    name: 'officeHeadReminders', title: 'Office head reminders', when: 'Mondays, 8:00 AM', icon: Building2,
    description: 'Emails office heads with duties to confirm or scholars to evaluate.',
  },
  {
    name: 'deadlineReminders', title: 'Deadline reminders', when: 'Daily, 8:00 AM', icon: CalendarClock,
    description: 'Reminds students 3 days and 1 day before a deadline, and once after “Needs revision”.',
  },
];

const EVENTS: { value: EventName; label: string }[] = [
  { value: 'applicationSubmitted', label: 'An application is submitted' },
  { value: 'applicationApproved', label: 'An application is approved' },
  { value: 'applicationNeedsRevision', label: 'An application needs revision' },
  { value: 'applicationRejected', label: 'An application is rejected' },
  { value: 'renewalSubmitted', label: 'A renewal is submitted' },
  { value: 'renewalRenewed', label: 'A renewal is approved (renewed)' },
  { value: 'renewalNeedsRevision', label: 'A renewal needs revision' },
  { value: 'renewalNotRenewed', label: 'A renewal is not renewed' },
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const hourLabel = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}`;
const longDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
const scholarshipName = (id: string) => mockScholarships.find(s => s.id === id)?.name ?? id;
const todayManila = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

// "Every Monday, 8:00 AM · to Current scholars of …" / "When an application is approved (SFAG) · to the student".
function describeAutomation(a: CustomAutomation): string {
  if (a.trigger === 'event') {
    const what = EVENTS.find(e => e.value === a.event)?.label.replace(/^An? /, '') ?? a.event;
    const only = a.scholarshipIds?.length ? ` (${a.scholarshipIds.map(scholarshipName).join(', ')})` : '';
    return `When ${a.event?.startsWith('application') ? 'an' : 'a'} ${what}${only} · to the student`;
  }
  const at = hourLabel(a.hour ?? 8);
  const when = a.frequency === 'once' ? `On ${a.date ? longDay(a.date) : '?'}, ${at}`
    : a.frequency === 'weekly' ? `Every ${WEEKDAYS[a.weekday ?? 1]}, ${at}`
      : a.frequency === 'monthly' ? `Monthly on day ${a.dayOfMonth}, ${at}`
        : `Daily, ${at}`;
  const who = a.audience === 'officeHeads' ? 'office heads' : describeTarget(a.emailTarget ?? DEFAULT_EMAIL_TARGET);
  return `${when} · to ${who}`;
}

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full ring-1 ring-inset transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60 ${checked ? 'bg-accent ring-accent' : 'bg-surface-muted ring-line-strong'}`}
    >
      <span className={`inline-block size-5 rounded-full bg-white shadow ring-1 ring-line transition-transform ${checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5'}`} />
    </button>
  );
}

export default function AutomationPage({ getToken }: { getToken: () => Promise<string | null> }) {
  const [data, setData] = useState<AutomationView | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [result, setResult] = useState('');
  const [preview, setPreview] = useState<{ title: string; path: string } | null>(null);
  const [outboxOpen, setOutboxOpen] = useState(false);
  // The automation being added (null) or edited; undefined when closed.
  const [editing, setEditing] = useState<CustomAutomation | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<CustomAutomation | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const call = useCallback(async <T,>(path: string, init?: { method: string; body?: unknown }): Promise<T> => {
    const res = await fetch(`${API_BASE_URL}/api/automation${path}`, {
      method: init?.method ?? 'GET',
      headers: await authHeaders(getToken, !!init?.body),
      ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Something went wrong.');
    return body as T;
  }, [getToken]);

  const load = useCallback(async () => {
    try {
      setData(await call<AutomationView>(''));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load.');
    }
  }, [call]);
  useEffect(() => { load(); }, [load]);

  const save = async (patch: Partial<AutomationView['settings']>, key: string) => {
    setSaving(key);
    try {
      setData(await call<AutomationView>('', { method: 'PUT', body: patch }));
      return true;
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to save.');
      return false;
    } finally {
      setSaving(null);
    }
  };

  if (error && !data) return <Card><ErrorState title="Couldn't load automation" message={error} onRetry={load} /></Card>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automation"
      />
      {data && !data.outbox.mailEnabled && (
        <Alert tone="warning" title="Email isn't set up on the server">Jobs still run (the office assignment still happens), but no email goes out until ACS_EMAIL_CONNECTION_STRING and ACS_EMAIL_SENDER are in the backend .env.</Alert>
      )}

      <Card
        title="Email outbox"
        actions={data && data.outbox.failedLast7Days > 0 ? <Button size="sm" onClick={() => setOutboxOpen(true)}>View failed</Button> : undefined}
      >
        {!data ? <Skeleton className="h-10 w-full" /> : (
          <dl className="grid grid-cols-3 gap-4 text-center sm:text-left">
            {[['Waiting to send', data.outbox.queued], ['Sent (7 days)', data.outbox.sentLast7Days], ['Failed (7 days)', data.outbox.failedLast7Days]].map(([label, n]) => (
              <div key={label as string}>
                <dt className="text-xs text-ink-subtle">{label}</dt>
                <dd className={`text-xl font-semibold tabular-nums ${label === 'Failed (7 days)' && Number(n) > 0 ? 'text-danger' : 'text-ink'}`}>{n}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      <div className="space-y-4">
        {JOBS.map(job => {
          const on = !!data?.settings[job.name];
          const last = data?.lastRuns[job.name];
          const Icon = job.icon;
          return (
            <Card key={job.name}>
              <div className="flex items-start gap-4">
                <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ${on ? 'bg-accent-subtle text-accent' : 'bg-surface-muted text-ink-subtle'}`}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h2 className="text-sm font-semibold text-ink">{job.title}</h2>
                    <Badge tone={on ? 'success' : 'neutral'}>{on ? job.when : 'Off'}</Badge>
                  </div>
                  <p className="text-sm text-ink-muted">{job.description}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <p className={`text-xs ${last?.error ? 'text-danger' : 'text-ink-subtle'}`}>
                      {last ? `Last run ${formatDateTime(last.at)}: ${last.error ? `failed (${last.error})` : `${last.summary}${last.queued ? ` ${last.queued} emails queued.` : ''}`}` : 'Hasn’t run yet.'}
                    </p>
                    <Button size="sm" icon={Play} onClick={() => setPreview({ title: job.title, path: `/${job.name}` })} disabled={!data}>Preview / run now</Button>
                  </div>
                </div>
                <Switch
                  checked={on}
                  disabled={!data || saving === job.name}
                  label={`${job.title}: ${on ? 'on' : 'off'}`}
                  onChange={v => save({ [job.name]: v }, job.name).then(ok => ok && setToast(`${job.title} ${v ? `is on (${job.when.toLowerCase()})` : 'is off'}.`))}
                />
              </div>
            </Card>
          );
        })}
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
          <div>
            <h2 className="text-base font-semibold text-ink">Your automations</h2>
            <p className="text-sm text-ink-muted">Emails you set up yourself: on a schedule, or when an application or renewal changes.</p>
          </div>
          <Button variant="primary" icon={Plus} onClick={() => setEditing(null)} disabled={!data}>Add automation</Button>
        </div>
        {data && !data.custom?.length && (
          <Card><EmptyState icon={Zap} title="No automations of your own yet" description="Add one to email students or office heads on a schedule, or a student when their application or renewal changes." /></Card>
        )}
        {data?.custom?.map(a => {
          const last = a.lastRun;
          const Icon = a.trigger === 'event' ? Zap : CalendarDays;
          const done = a.trigger === 'schedule' && a.frequency === 'once' && last?.period === a.date;
          return (
            <Card key={a._id}>
              <div className="flex items-start gap-4">
                <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ${a.enabled ? 'bg-accent-subtle text-accent' : 'bg-surface-muted text-ink-subtle'}`}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 className="text-sm font-semibold text-ink">{a.name}</h3>
                    <Badge tone={a.enabled ? 'success' : 'neutral'}>{a.enabled ? 'On' : done ? 'Sent' : 'Off'}</Badge>
                  </div>
                  <p className="text-sm text-ink-muted">{describeAutomation(a)}</p>
                  <p className="truncate text-sm text-ink"><span className="text-ink-subtle">Subject:</span> {a.subject}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <p className={`text-xs ${last?.error ? 'text-danger' : 'text-ink-subtle'}`}>
                      {last ? `Last run ${formatDateTime(last.at)}: ${last.error ? `failed (${last.error})` : last.summary}` : 'Hasn’t run yet.'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(a)}>Edit</Button>
                      <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setDeleting(a)}>Delete</Button>
                      <Button size="sm" icon={Play} onClick={() => setPreview({ title: a.name, path: `/custom/${a._id}` })}>Preview / run now</Button>
                    </div>
                  </div>
                </div>
                <Switch
                  checked={a.enabled}
                  disabled={saving === a._id}
                  label={`${a.name}: ${a.enabled ? 'on' : 'off'}`}
                  onChange={async v => {
                    setSaving(a._id);
                    try {
                      setData(await call<AutomationView>(`/custom/${a._id}`, { method: 'PATCH', body: { enabled: v } }));
                      setToast(`${a.name} is ${v ? 'on' : 'off'}.`);
                    } catch (err) {
                      setToast(err instanceof Error ? err.message : 'Failed to save.');
                    } finally {
                      setSaving(null);
                    }
                  }}
                />
              </div>
            </Card>
          );
        })}
      </div>

      {editing !== undefined && (
        <AutomationDialog
          initial={editing}
          call={call}
          getToken={getToken}
          onClose={() => setEditing(undefined)}
          onSaved={(view, name) => { setData(view); setEditing(undefined); setToast(`${name} saved.`); }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.name}”?`}
          confirmLabel="Delete"
          confirmIcon={Trash2}
          tone="danger"
          busy={deleteBusy}
          onCancel={() => { if (!deleteBusy) setDeleting(null); }}
          onConfirm={async () => {
            setDeleteBusy(true);
            try {
              setData(await call<AutomationView>(`/custom/${deleting._id}`, { method: 'DELETE' }));
              setToast(`${deleting.name} deleted.`);
              setDeleting(null);
            } catch (err) {
              setToast(err instanceof Error ? err.message : 'Failed to delete.');
            } finally {
              setDeleteBusy(false);
            }
          }}
        >
          <p className="text-sm text-ink-muted">It stops sending. Emails it already queued still go out.</p>
        </ConfirmDialog>
      )}

      {preview && (
        <PreviewDialog
          title={preview.title}
          path={preview.path}
          call={call}
          onClose={() => setPreview(null)}
          onRan={(view, result) => {
            setData(view);
            setPreview(null);
            setResult(`${result.summary}${result.queued ? ` Queued ${result.queued} email${result.queued === 1 ? '' : 's'}.` : ''}`);
          }}
        />
      )}
      {outboxOpen && (
        <FailedEmailsDialog
          call={call}
          onClose={() => setOutboxOpen(false)}
          onRetried={(view, n) => { setData(view); setOutboxOpen(false); setResult(`Sending ${n} email${n === 1 ? '' : 's'} again.`); }}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
      {result && <ResultDialog message={result} onClose={() => setResult('')} />}
    </div>
  );
}

function PreviewDialog({ title, path, call, onClose, onRan }: {
  title: string;
  path: string;
  call: <T>(path: string, init?: { method: string; body?: unknown }) => Promise<T>;
  onClose: () => void;
  onRan: (view: AutomationView, result: JobResult) => void;
}) {
  const [result, setResult] = useState<JobResult | null>(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    call<{ result: JobResult }>(`${path}/preview`, { method: 'POST' })
      .then(body => { if (!cancelled) setResult(body.result); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to preview.'); });
    return () => { cancelled = true; };
  }, [call, path]);

  const run = async () => {
    setRunning(true);
    setError('');
    try {
      const body = await call<{ result: JobResult } & AutomationView>(`${path}/run`, { method: 'POST' });
      onRan(body, body.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run.');
      setRunning(false);
    }
  };

  const nothing = result && result.emails === 0;

  return (
    <Modal
      size="lg"
      title={`${title}: preview`}
      onClose={onClose}
      dismissible={!running}
      footer={
        <>
          <Button onClick={onClose} disabled={running}>{nothing ? 'Close' : 'Cancel'}</Button>
          {!nothing && (
            <Button variant="primary" icon={Mail} onClick={run} loading={running} disabled={!result}>
              {`Send ${result?.emails ?? ''} email${result?.emails === 1 ? '' : 's'}`}
            </Button>
          )}
        </>
      }
    >
      {error && <Alert tone="danger">{error}</Alert>}
      {!result ? (!error && <div className="space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></div>) : (
        <div className="space-y-4">
          <p className="text-sm text-ink">{result.summary}</p>
          {result.emails > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-ink">{result.emails} email{result.emails === 1 ? '' : 's'}{result.emails > result.sample.length ? `, for example:` : ':'}</p>
              <ul className="divide-y divide-line rounded-control text-sm ring-1 ring-line">
                {result.sample.map(s => (
                  <li key={s.to + s.subject} className="px-3 py-2">
                    <span className="block truncate text-ink">{s.subject}</span>
                    <span className="block truncate text-xs text-ink-subtle">to {s.to}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-ink-subtle">Anyone who already got this reminder this time is skipped automatically.</p>
            </div>
          )}
          {nothing && <p className="text-sm text-ink-subtle">Nobody to email right now.</p>}
        </div>
      )}
    </Modal>
  );
}

function FailedEmailsDialog({ call, onClose, onRetried }: {
  call: <T>(path: string, init?: { method: string; body?: unknown }) => Promise<T>;
  onClose: () => void;
  onRetried: (view: AutomationView, n: number) => void;
}) {
  const [rows, setRows] = useState<OutboxRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    call<{ emails: OutboxRow[] }>('/outbox?status=failed').then(b => setRows(b.emails)).catch(err => setError(err instanceof Error ? err.message : 'Failed to load.'));
  }, [call]);
  const retry = async () => {
    setBusy(true);
    try {
      const body = await call<{ retried: number } & AutomationView>('/outbox/retry', { method: 'POST' });
      onRetried(body, body.retried);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry.');
      setBusy(false);
    }
  };
  return (
    <Modal
      size="lg"
      title="Emails that couldn't be sent"
      onClose={onClose}
      footer={<><Button onClick={onClose}>Close</Button><Button variant="primary" icon={RefreshCw} onClick={retry} loading={busy} disabled={!rows?.length}>Try them again</Button></>}
    >
      {error && <Alert tone="danger">{error}</Alert>}
      {!rows ? <Skeleton className="h-24 w-full" /> : rows.length === 0 ? <p className="text-sm text-ink-subtle">None.</p> : (
        <Table label="Failed emails" minWidth="32rem">
          <thead><tr><Th sticky={false}>Email</Th><Th sticky={false}>Why</Th></tr></thead>
          <tbody>
            {rows.map(r => (
              <Tr key={r._id}>
                <Td><span className="block truncate text-ink">{r.subject}</span><span className="block truncate text-xs text-ink-subtle">to {r.to} · {formatDateTime(r.createdAt)}</span></Td>
                <Td><span className="text-xs text-ink-muted">{r.error || '—'}</span></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Modal>
  );
}


// Add or edit one of the AdSO's own automations.
type When = 'On a schedule' | 'When something happens';
function AutomationDialog({ initial, call, getToken, onClose, onSaved }: {
  initial: CustomAutomation | null;
  call: <T>(path: string, init?: { method: string; body?: unknown }) => Promise<T>;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onSaved: (view: AutomationView, name: string) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [when, setWhen] = useState<When>(initial?.trigger === 'event' ? 'When something happens' : 'On a schedule');
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency ?? 'weekly');
  const [date, setDate] = useState(initial?.date ?? '');
  const [weekday, setWeekday] = useState(String(initial?.weekday ?? 1));
  const [dayOfMonth, setDayOfMonth] = useState(String(initial?.dayOfMonth ?? 1));
  const [hour, setHour] = useState(String(initial?.hour ?? 8));
  const [audience, setAudience] = useState<'students' | 'officeHeads'>(initial?.audience ?? 'students');
  const [target, setTarget] = useState<EmailTarget>(initial?.emailTarget ?? DEFAULT_EMAIL_TARGET);
  const [event, setEvent] = useState<EventName | ''>(initial?.event ?? '');
  const [scholarshipId, setScholarshipId] = useState(initial?.scholarshipIds?.[0] ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [enabled, setEnabled] = useState(initial?.enabled ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isEvent = when === 'When something happens';
  const scholarships = mockScholarships.filter(acceptsOnlineApplications);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const payload = {
      name, subject, body, enabled,
      ...(isEvent
        ? { trigger: 'event', event, scholarshipIds: scholarshipId ? [scholarshipId] : [] }
        : {
          trigger: 'schedule', frequency, hour: Number(hour), audience,
          ...(frequency === 'once' ? { date } : {}),
          ...(frequency === 'weekly' ? { weekday: Number(weekday) } : {}),
          ...(frequency === 'monthly' ? { dayOfMonth: Number(dayOfMonth) } : {}),
          ...(audience === 'students' ? { emailTarget: target } : {}),
        }),
    };
    try {
      const view = await call<AutomationView>(initial ? `/custom/${initial._id}` : '/custom', { method: initial ? 'PUT' : 'POST', body: payload });
      onSaved(view, name.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
      setBusy(false);
    }
  };

  return (
    <Modal
      size="lg"
      sheet
      title={initial ? 'Edit automation' : 'Add automation'}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" form="automation-form" variant="primary" loading={busy}>{initial ? 'Save changes' : 'Add automation'}</Button>
        </>
      }
    >
      <form id="automation-form" onSubmit={save} noValidate className="space-y-5">
        {error && <Alert tone="danger" onDismiss={() => setError('')}>{error}</Alert>}
        <Field label="Name" helper="For you; students don’t see it.">
          <TextInput value={name} onChange={e => setName(e.target.value)} maxLength={100} placeholder="e.g. Monthly reminder to SFAG scholars" />
        </Field>

        <Field label="When it sends">
          <SegmentedControl<When> label="When it sends" options={['On a schedule', 'When something happens']} value={when} onChange={v => v && setWhen(v)} />
        </Field>

        {isEvent ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="When" helper="Emails the student whose application or renewal it is.">
              <Select value={event} onChange={v => setEvent(v as EventName)} label="When">
                <option value="" disabled>Choose what happens</option>
                {EVENTS.map(ev => <option key={ev.value} value={ev.value}>{ev.label}</option>)}
              </Select>
            </Field>
            <Field label="For">
              <Select value={scholarshipId} onChange={setScholarshipId} label="For">
                <option value="">Any scholarship</option>
                {scholarships.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="How often">
                <Select value={frequency} onChange={v => setFrequency(v as Frequency)} label="How often">
                  <option value="once">Once</option>
                  <option value="daily">Every day</option>
                  <option value="weekly">Every week</option>
                  <option value="monthly">Every month</option>
                </Select>
              </Field>
              {frequency === 'once' && (
                <Field label="Date">
                  <DatePicker value={date} onChange={setDate} min={todayManila()} />
                </Field>
              )}
              {frequency === 'weekly' && (
                <Field label="Day">
                  <Select value={weekday} onChange={setWeekday} label="Day">
                    {WEEKDAYS.map((d, i) => <option key={d} value={String(i)}>{d}</option>)}
                  </Select>
                </Field>
              )}
              {frequency === 'monthly' && (
                <Field label="Day of the month">
                  <Select value={dayOfMonth} onChange={setDayOfMonth} label="Day of the month">
                    {Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={String(i + 1)}>{i + 1}</option>)}
                  </Select>
                </Field>
              )}
              <Field label="Time" helper="Philippine time.">
                <Select value={hour} onChange={setHour} label="Time">
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={String(h)}>{hourLabel(h)}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Send to">
              <SegmentedControl<'Students' | 'Office heads'>
                label="Send to"
                options={['Students', 'Office heads']}
                value={audience === 'students' ? 'Students' : 'Office heads'}
                onChange={v => v && setAudience(v === 'Students' ? 'students' : 'officeHeads')}
              />
            </Field>
            {audience === 'students'
              ? <EmailAudience value={target} onChange={setTarget} relatedScholarshipId="" getToken={getToken} disabled={busy} />
              : <p className="text-sm text-ink-muted">Every duty office head with an email in Duty hours → Offices.</p>}
          </>
        )}

        <Field label="Subject">
          <TextInput value={subject} onChange={e => setSubject(e.target.value)} maxLength={150} placeholder="e.g. A reminder from the scholarship office" />
        </Field>
        <Field
          label="Message"
          helper={<>You can write {'{firstName}'}{isEvent ? <>, {'{scholarship}'} and {'{status}'}</> : audience === 'officeHeads' ? <> and {'{office}'}</> : null}; they’re filled in for each person. Lines starting with “- ” become a list.</>}
        >
          <Textarea value={body} onChange={e => setBody(e.target.value)} rows={7} maxLength={5000} placeholder={'Hi {firstName},\n\n…'} />
        </Field>
        <Checkbox
          checked={enabled}
          onChange={setEnabled}
          label="On"
          description={isEvent ? 'Emails only for changes from now on.' : 'Sends on schedule. You can also preview and send it now from its card.'}
        />
      </form>
    </Modal>
  );
}
