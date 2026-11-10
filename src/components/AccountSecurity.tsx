import React, { useCallback, useEffect, useState } from 'react';
import { useSession, useUser } from '@clerk/react';
import { KeyRound, Laptop, LogOut, Smartphone } from 'lucide-react';
import { Alert, Badge, Button, Card, Checkbox, ConfirmDialog, Field, Skeleton, TextInput } from '../pages/admin/AdminUI';

// Account security, for everyone signed in. Email + password accounts
// (offices) change their password and can turn on two-step verification.
// Students sign in with their DLSU-D Microsoft account and Authenticator,
// so there's no password here for them. Everyone sees the devices they're
// signed in on and can sign one out.

type SessionRow = Awaited<ReturnType<NonNullable<ReturnType<typeof useUser>['user']>['getSessions']>>[number];

const errorText = (err: unknown, fallback: string) => {
  const e = err as { errors?: { longMessage?: string; message?: string }[]; message?: string };
  return e?.errors?.[0]?.longMessage || e?.errors?.[0]?.message || e?.message || fallback;
};

const lastActive = (date: Date) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);

export default function AccountSecurity() {
  const { user, isLoaded } = useUser();
  if (!isLoaded || !user) return <Card><Skeleton className="h-24 w-full" /></Card>;
  return (
    <div className="space-y-6">
      {user.passwordEnabled && <PasswordCard />}
      {user.passwordEnabled && <TwoStepCard />}
      <DevicesCard />
    </div>
  );
}

function PasswordCard() {
  const { user } = useUser();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || busy) return;
    setDone(false);
    if (!current) return setError('Enter your current password.');
    if (next.length < 8) return setError('Use at least 8 characters for the new password.');
    if (next !== confirm) return setError('The two new passwords don’t match.');
    setBusy(true);
    setError('');
    try {
      await user.updatePassword({ currentPassword: current, newPassword: next, signOutOfOtherSessions: signOutOthers });
      setCurrent(''); setNext(''); setConfirm('');
      setDone(true);
    } catch (err) {
      setError(errorText(err, 'Couldn’t change your password.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Password">
      <form onSubmit={save} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        {done && <Alert tone="success">Your password was changed.</Alert>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Current password"><TextInput type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} disabled={busy} /></Field>
          <Field label="New password"><TextInput type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} disabled={busy} placeholder="At least 8 characters" /></Field>
          <Field label="Confirm new password"><TextInput type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} disabled={busy} /></Field>
        </div>
        <Checkbox checked={signOutOthers} onChange={setSignOutOthers} label="Sign out on my other devices" disabled={busy} />
        <Button type="submit" variant="primary" loading={busy}>Change password</Button>
      </form>
    </Card>
  );
}

// An authenticator app (Google Authenticator, Microsoft Authenticator…):
// after the password, sign-in asks for its 6-digit code.
function TwoStepCard() {
  const { user } = useUser();
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!user) return null;

  const run = async (fn: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError('');
    try { await fn(); } catch (err) {
      const text = errorText(err, fallback);
      // Clerk's wording when authenticator apps are off for the app.
      setError(/not enabled on this instance/i.test(text)
        ? 'Two-step verification isn’t turned on for AniSkolar yet. Ask the system administrator to turn on authenticator apps in Clerk (Configure → Multi-factor).'
        : text);
    } finally { setBusy(false); }
  };
  const start = () => run(async () => {
    const totp = await user.createTOTP();
    setSetup({ secret: totp.secret ?? '', uri: totp.uri ?? '' });
    setCode('');
  }, 'Couldn’t start the setup.');
  const verify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) return setError('Enter the 6-digit code from the app.');
    run(async () => {
      const totp = await user.verifyTOTP({ code: code.trim() });
      setSetup(null);
      setBackupCodes(totp.backupCodes ?? null);
      await user.reload();
    }, 'That code didn’t work. Check the app and try again.');
  };
  const newBackupCodes = () => run(async () => setBackupCodes((await user.createBackupCode()).codes), 'Couldn’t make new backup codes.');
  const turnOff = () => run(async () => {
    await user.disableTOTP();
    await user.reload();
    setConfirmOff(false);
    setBackupCodes(null);
  }, 'Couldn’t turn it off.');

  return (
    <Card
      title="Two-step verification"
      actions={user.totpEnabled ? <Badge tone="success" dot>On</Badge> : <Badge>Off</Badge>}
    >
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        {setup ? (
          <form onSubmit={verify} className="space-y-4">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-ink">
              <li>Open an authenticator app (Google or Microsoft Authenticator) and add an account.</li>
              <li>
                Choose <span className="font-medium">Enter a setup key</span> and type this key:
                <code className="mt-1.5 block w-fit select-all break-all rounded-control bg-surface-subtle px-3 py-2 font-mono text-sm tracking-wider ring-1 ring-line">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
                {setup.uri && <a href={setup.uri} className="mt-1 inline-block text-sm font-medium text-accent hover:underline">On this phone? Open it in the app</a>}
              </li>
              <li>Enter the 6-digit code the app shows.</li>
            </ol>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Code"><TextInput inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value)} disabled={busy} className="w-36 tracking-widest" /></Field>
              <Button type="submit" variant="primary" loading={busy}>Turn on</Button>
              <Button variant="ghost" onClick={() => setSetup(null)} disabled={busy}>Cancel</Button>
            </div>
          </form>
        ) : user.totpEnabled ? (
          <div className="flex flex-wrap gap-2">
            <Button icon={KeyRound} onClick={newBackupCodes} loading={busy}>New backup codes</Button>
            <Button variant="ghost" onClick={() => setConfirmOff(true)} disabled={busy}>Turn off</Button>
          </div>
        ) : (
          <Button variant="primary" icon={Smartphone} onClick={start} loading={busy}>Set up an authenticator app</Button>
        )}
        {backupCodes && backupCodes.length > 0 && (
          <Alert tone="warning" title="Save your backup codes">
            <p>Each one signs you in once if you lose your phone. Keep them somewhere safe; they won’t be shown again.</p>
            <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm sm:grid-cols-5">{backupCodes.map(c => <li key={c} className="select-all">{c}</li>)}</ul>
          </Alert>
        )}
      </div>
      {confirmOff && (
        <ConfirmDialog
          title="Turn off two-step verification?"
          description="Signing in will ask for your password only."
          confirmLabel="Turn off"
          tone="danger"
          busy={busy}
          error={error || undefined}
          onConfirm={turnOff}
          onCancel={() => setConfirmOff(false)}
        />
      )}
    </Card>
  );
}

function DevicesCard() {
  const { user } = useUser();
  const { session } = useSession();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const all = await user.getSessions();
      setSessions(all.filter(s => s.status === 'active').sort((a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime()));
    } catch (err) {
      setError(errorText(err, 'Couldn’t load your devices.'));
    }
  }, [user]);
  useEffect(() => { load(); }, [load]);

  const signOut = async (s: SessionRow) => {
    setBusyId(s.id);
    setError('');
    try { await s.revoke(); await load(); } catch (err) { setError(errorText(err, 'Couldn’t sign that device out.')); } finally { setBusyId(null); }
  };

  return (
    <Card title="Where you’re signed in">
      {error && <div className="mb-3"><Alert tone="danger">{error}</Alert></div>}
      {!sessions ? <Skeleton className="h-16 w-full" /> : (
        <ul className="divide-y divide-line">
          {sessions.map(s => {
            const a = s.latestActivity;
            const current = s.id === session?.id;
            const place = [a?.city, a?.country].filter(Boolean).join(', ');
            return (
              <li key={s.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-surface-subtle text-ink-muted">
                  {a?.isMobile ? <Smartphone className="size-4" aria-hidden /> : <Laptop className="size-4" aria-hidden />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">
                    {[a?.browserName, a?.deviceType].filter(Boolean).join(' on ') || 'Unknown device'}
                    {current && <Badge tone="success" className="ml-2">This device</Badge>}
                  </p>
                  <p className="text-xs text-ink-muted">{[place, `last active ${lastActive(s.lastActiveAt)}`].filter(Boolean).join(' · ')}</p>
                  {/* IPv6 addresses are long with no spaces: their own line, cut with "…". */}
                  {a?.ipAddress && <p className="truncate font-mono text-[11px] text-ink-subtle" title={a.ipAddress}>{a.ipAddress}</p>}
                </div>
                {!current && <div className="shrink-0"><Button size="sm" variant="ghost" icon={LogOut} onClick={() => signOut(s)} loading={busyId === s.id}>Sign out</Button></div>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
