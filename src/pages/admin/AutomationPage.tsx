import React, { useCallback, useEffect, useState } from 'react';
import { Building2, CalendarClock, Clock, Mail, Play, RefreshCw, Shuffle, Sunrise } from 'lucide-react';
import { API_BASE_URL, authHeaders, formatDateTime, titleCaseName } from './adminData';
import { ResultDialog, Alert, Badge, Button, Card, Checkbox, ErrorState, Field, Modal, PageHeader, Skeleton, Table, Td, TextInput, Th, Toast, Tr } from './AdminUI';

// AdSO: what AniSkolar does on its own (backend utils/automation.js):
// reminders, the morning summary and the start-of-semester office
// assignment. Everything starts off. Each job can be previewed (nothing is
// sent or changed) and run now; the timers run it on schedule once it's on.
// Personal emails go through an outbox that sends a few a minute.

type JobName = 'dutyReminders' | 'officeHeadReminders' | 'deadlineReminders';
interface LastRun { period: string; at: string; queued: number; summary: string; error?: string }
interface AutomationView {
  settings: Record<JobName, boolean> & { updatedBy: string | null; updatedAt: string | null };
  lastRuns: Partial<Record<JobName, LastRun>>;
  outbox: { queued: number; sentLast7Days: number; failedLast7Days: number; perMinute: number; mailEnabled: boolean };
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
  const [preview, setPreview] = useState<JobName | null>(null);
  const [outboxOpen, setOutboxOpen] = useState(false);

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
                    <Button size="sm" icon={Play} onClick={() => setPreview(job.name)} disabled={!data}>Preview / run now</Button>
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

      {preview && (
        <PreviewDialog
          job={JOBS.find(j => j.name === preview)!}
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

function PreviewDialog({ job, call, onClose, onRan }: {
  job: (typeof JOBS)[number];
  call: <T>(path: string, init?: { method: string; body?: unknown }) => Promise<T>;
  onClose: () => void;
  onRan: (view: AutomationView, result: JobResult) => void;
}) {
  const [result, setResult] = useState<JobResult | null>(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    call<{ result: JobResult }>(`/${job.name}/preview`, { method: 'POST' })
      .then(body => { if (!cancelled) setResult(body.result); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to preview.'); });
    return () => { cancelled = true; };
  }, [call, job.name]);

  const run = async () => {
    setRunning(true);
    setError('');
    try {
      const body = await call<{ result: JobResult } & AutomationView>(`/${job.name}/run`, { method: 'POST' });
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
      title={`${job.title}: preview`}
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

