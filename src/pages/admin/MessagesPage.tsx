import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, ArchiveRestore, ArrowLeft, Building2, ExternalLink, FileText, Mail, MailOpen, MessageSquare, PenSquare, Pin, PinOff, Trash2, UserRound } from 'lucide-react';
import { StudentProfile } from '../../types';
import Conversation from '../../components/messages/Conversation';
import { ChatMessage, MESSAGES_READ_EVENT, postMessage } from '../../utils/messages';
import { collegeName } from '../../data/programs';
import { API_BASE_URL, authHeaders, formatDateTime, titleCaseName } from './adminData';
import { ResultDialog, Alert, Avatar, Button, Card, ConfirmDialog, DropdownMenu, DropdownMenuItem, EmptyState, Menu, ErrorState, Field, Modal, PageHeader, SearchInput, SegmentedControl, Select, Skeleton, TableSkeleton, TextInput, Toast } from './AdminUI';
import { TemplatePicker, UnfilledHint, firstNameOf } from './ReplyTemplates';

// AdSO: conversations with students (backend routes/messages.js), one per
// student. Left: every conversation, newest first, with unread counts;
// right: the open one. A conversation can also be started from an
// application or a scholar ("Message student"), or here by student number.
// The AdSO can pin, archive, mark as unread or delete a conversation; that
// only changes their own inbox (backend models/MessageThread.js).

// A student's conversation, or a duty office's (its head writes from the
// office portal). The open one is selected by key: a student number, or
// "office:" + the office name.
const OFFICE_PREFIX = 'office:';
interface Thread {
  kind: 'student' | 'office';
  studentNumber?: string;
  office?: string;
  headName?: string;
  name: string;
  email: string;
  programCode?: string;
  college?: string;
  yearLevel?: string;
  avatarUrl?: string;
  unread: number;
  count: number;
  last: ChatMessage;
  // The AdSO's inbox state.
  pinned: boolean;
  archived: boolean;
  markedUnread: boolean;
}

type InboxView = 'Inbox' | 'Unread' | 'Archived';
const keyOf = (t: Thread) => (t.kind === 'office' ? `${OFFICE_PREFIX}${t.office}` : t.studentNumber!);
const pathOf = (t: Thread) => (t.kind === 'office' ? `/api/messages/admin/offices/${encodeURIComponent(t.office!)}` : `/api/messages/admin/threads/${t.studentNumber}`);
const isUnread = (t: Thread) => t.unread > 0 || t.markedUnread;

interface ThreadDetail {
  student: { studentNumber: string; name: string; email: string; programCode?: string; college?: string; yearLevel?: string; avatarUrl?: string };
  applications: { _id: string; referenceCode: string; scholarshipName: string; status: string }[];
  messages: ChatMessage[];
  state?: { pinned: boolean; archived: boolean; markedUnread: boolean };
}

export default function MessagesPage({ getToken, selectedStudent, onSelectStudent, onOpenApplication, onOpenScholar }: {
  getToken: () => Promise<string | null>;
  selectedStudent: string | null;
  onSelectStudent: (studentNumber: string | null) => void;
  onOpenApplication: (applicationId: string) => void;
  // Opens the student's full record (Scholars).
  onOpenScholar?: (studentNumber: string) => void;
}) {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [inboxView, setInboxView] = useState<InboxView>('Inbox');
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const [deleting, setDeleting] = useState<Thread | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [result, setResult] = useState('');

  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/messages/admin/threads`, { headers: await authHeaders(getToken) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to load messages.');
      setThreads(body.threads ?? []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages.');
    }
  }, [getToken]);

  useEffect(() => {
    loadThreads();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') loadThreads(); }, 20_000);
    return () => window.clearInterval(timer);
  }, [loadThreads]);

  const inView = useCallback((t: Thread, v: InboxView) => (v === 'Archived' ? t.archived : v === 'Unread' ? isUnread(t) : !t.archived), []);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (threads ?? [])
      .filter(t => inView(t, inboxView))
      .filter(t => !q || t.name.toLowerCase().includes(q) || (t.studentNumber ?? '').includes(q) || (t.college ?? '').toLowerCase().includes(q) || (t.headName ?? '').toLowerCase().includes(q));
  }, [threads, search, inboxView, inView]);
  const counts = useMemo(() => ({
    Inbox: (threads ?? []).filter(t => !t.archived && isUnread(t)).length,
    Unread: (threads ?? []).filter(isUnread).length,
    Archived: (threads ?? []).filter(t => t.archived).length,
  }), [threads]);

  // Pin / archive / mark unread: shown at once, then saved.
  const patch = useCallback(async (t: Thread, change: { pinned?: boolean; archived?: boolean; unread?: boolean }) => {
    setThreads(list => list?.map(x => (keyOf(x) === keyOf(t) ? {
      ...x,
      ...(change.pinned !== undefined ? { pinned: change.pinned } : {}),
      ...(change.archived !== undefined ? { archived: change.archived } : {}),
      ...(change.unread !== undefined ? { markedUnread: change.unread, unread: change.unread ? x.unread : 0 } : {}),
    } : x)) ?? null);
    try {
      const res = await fetch(`${API_BASE_URL}${pathOf(t)}/state`, { method: 'PATCH', headers: await authHeaders(getToken, true), body: JSON.stringify(change) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Couldn’t update the conversation.');
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Couldn’t update the conversation.' });
    }
    window.dispatchEvent(new Event(MESSAGES_READ_EVENT));
    loadThreads();
  }, [getToken, loadThreads]);

  const closeIfOpen = (t: Thread) => { if (keyOf(t) === selectedStudent) onSelectStudent(null); };
  const menuFor = (t: Thread): DropdownMenuItem[] => [
    t.pinned
      ? { key: 'unpin', label: 'Unpin', icon: PinOff, onSelect: () => patch(t, { pinned: false }) }
      : { key: 'pin', label: 'Pin to top', icon: Pin, onSelect: () => patch(t, { pinned: true }) },
    isUnread(t)
      ? { key: 'read', label: 'Mark as read', icon: MailOpen, onSelect: () => patch(t, { unread: false }) }
      : { key: 'unread', label: 'Mark as unread', icon: Mail, onSelect: () => { closeIfOpen(t); patch(t, { unread: true }); } },
    t.archived
      ? { key: 'unarchive', label: 'Move to inbox', icon: ArchiveRestore, onSelect: () => { patch(t, { archived: false }); setToast({ message: 'Moved to the inbox.' }); } }
      : { key: 'archive', label: 'Archive', icon: Archive, onSelect: () => {
        closeIfOpen(t);
        patch(t, { archived: true });
        setToast({ message: 'Conversation archived. It comes back if they write again.', undo: () => patch(t, { archived: false }) });
      } },
    { key: 'delete', label: 'Delete', icon: Trash2, tone: 'danger', onSelect: () => { setDeleteError(''); setDeleting(t); } },
  ];

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}${pathOf(deleting)}`, { method: 'DELETE', headers: await authHeaders(getToken) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Couldn’t delete the conversation.');
      closeIfOpen(deleting);
      setThreads(list => list?.filter(x => keyOf(x) !== keyOf(deleting)) ?? null);
      setDeleting(null);
      setResult('Conversation deleted. The student keeps their copy.');
      window.dispatchEvent(new Event(MESSAGES_READ_EVENT));
      loadThreads();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Couldn’t delete the conversation.');
    } finally {
      setDeleteBusy(false);
    }
  };
  const openThread = threads?.find(t => keyOf(t) === selectedStudent) ?? null;
  const headerMenu = openThread ? <DropdownMenu label="Conversation actions" items={menuFor(openThread)} /> : null;

  const list = (
    <Card flush className={selectedStudent ? 'hidden lg:block' : ''}>
      <div className="space-y-2 border-b border-line p-3">
        <SearchInput value={search} onChange={setSearch} label="Search conversations" placeholder="Search name, student no. or college…" />
        <SegmentedControl
          options={['Inbox', 'Unread', 'Archived'] as const}
          value={inboxView}
          onChange={v => v && setInboxView(v)}
          label="Show"
          renderLabel={o => <>{o}{counts[o] > 0 && <span className="ml-1 tabular-nums text-ink-subtle">{counts[o]}</span>}</>}
        />
      </div>
      {error && !threads ? (
        <ErrorState title="Couldn't load messages" message={error} onRetry={loadThreads} />
      ) : !threads ? (
        <TableSkeleton rows={5} label="Loading conversations" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={inboxView === 'Archived' ? Archive : MessageSquare}
          title={search ? 'No conversations match' : inboxView === 'Archived' ? 'Nothing archived' : inboxView === 'Unread' ? 'All caught up' : threads.length ? 'Inbox is empty' : 'No messages yet'}
         
        />
      ) : (
        <ul className="max-h-[70vh] divide-y divide-line overflow-y-auto">
          {visible.map(t => {
            const key = keyOf(t);
            const active = key === selectedStudent;
            const unread = isUnread(t);
            const preview = t.last.body || (t.last.attachments.length ? `📎 ${t.last.attachments.length} attachment${t.last.attachments.length === 1 ? '' : 's'}` : '');
            return (
              <li key={key} className="group relative">
                <button
                  type="button"
                  onClick={() => onSelectStudent(key)}
                  className={`flex w-full items-start gap-3 py-3 pl-3 pr-10 text-left hover:bg-surface-muted ${active ? 'bg-accent-subtle' : ''}`}
                >
                  {t.kind === 'office'
                    ? <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent"><Building2 className="size-4" aria-hidden /></span>
                    : <Avatar name={t.name || t.studentNumber || ''} avatarUrl={t.avatarUrl} size="sm" />}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={`truncate text-sm ${unread ? 'font-semibold text-ink' : 'font-medium text-ink'}`}>{t.kind === 'office' ? t.office : t.name ? titleCaseName(t.name) : t.studentNumber}</span>
                      {t.pinned && <Pin className="size-3.5 shrink-0 text-ink-subtle" aria-label="Pinned" />}
                      {t.unread > 0
                        ? <span className="ml-auto shrink-0 rounded-full bg-accent px-1.5 text-xs font-semibold text-white tabular-nums" aria-label={`${t.unread} unread`}>{t.unread}</span>
                        : t.markedUnread && <span className="ml-auto size-2.5 shrink-0 rounded-full bg-accent" aria-label="Marked as unread" />}
                    </span>
                    <span className="block truncate text-xs text-ink-subtle">{t.kind === 'office' ? ['Office', t.headName].filter(Boolean).join(' · ') : [t.studentNumber, t.college].filter(Boolean).join(' · ')}</span>
                    <span className={`block truncate text-xs ${unread ? 'text-ink' : 'text-ink-muted'}`}>{t.last.from === 'adso' ? 'You: ' : ''}{preview}</span>
                    <span className="block text-[11px] text-ink-subtle">{formatDateTime(t.last.createdAt)}</span>
                  </span>
                </button>
                <div className="absolute right-1.5 top-2.5 opacity-100 lg:opacity-0 lg:focus-within:opacity-100 lg:group-hover:opacity-100">
                  <DropdownMenu label={`Actions for ${t.kind === 'office' ? t.office : t.name || t.studentNumber}`} items={menuFor(t)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Messages"
        actions={<Button icon={PenSquare} onClick={() => setNewOpen(true)}>New message</Button>}
      />
      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        {list}
        {selectedStudent?.startsWith(OFFICE_PREFIX) ? (
          <OfficeThreadView
            key={selectedStudent}
            office={selectedStudent.slice(OFFICE_PREFIX.length)}
            getToken={getToken}
            onBack={() => onSelectStudent(null)}
            onChanged={loadThreads}
            menu={headerMenu}
          />
        ) : selectedStudent ? (
          <ThreadView
            key={selectedStudent}
            studentNumber={selectedStudent}
            getToken={getToken}
            onBack={() => onSelectStudent(null)}
            onOpenApplication={onOpenApplication}
            onOpenScholar={onOpenScholar}
            onChanged={loadThreads}
            menu={headerMenu}
          />
        ) : (
          <Card className="hidden lg:block">
            <EmptyState icon={MessageSquare} title="Choose a conversation" />
          </Card>
        )}
      </div>
      {newOpen && <NewMessageDialog getToken={getToken} onClose={() => setNewOpen(false)} onOpen={key => { setNewOpen(false); onSelectStudent(key); }} />}
      {deleting && (
        <ConfirmDialog
          tone="danger"
          title="Delete this conversation?"
          description={`Removed from your inbox only. ${deleting.kind === 'office' ? 'The office' : 'The student'} keeps their copy.`}
          confirmLabel="Delete"
          confirmIcon={Trash2}
          busy={deleteBusy}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
      {result && <ResultDialog message={result} onClose={() => setResult('')} />}
      {toast && (
        <Toast
          message={toast.message}
          action={toast.undo ? { label: 'Undo', onClick: () => { toast.undo!(); setToast(null); } } : undefined}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

function ThreadView({ studentNumber, getToken, onBack, onOpenApplication, onOpenScholar, onChanged, menu }: {
  studentNumber: string;
  getToken: () => Promise<string | null>;
  onBack: () => void;
  onOpenApplication: (applicationId: string) => void;
  onOpenScholar?: (studentNumber: string) => void;
  onChanged: () => void;
  menu?: React.ReactNode;
}) {
  const [data, setData] = useState<ThreadDetail | null>(null);
  const [error, setError] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/messages/admin/threads/${studentNumber}`, { headers: await authHeaders(getToken) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to load the conversation.');
      setData(body);
      setError('');
      if (body.state?.markedUnread || (body.messages as ChatMessage[]).some(m => m.from === 'student' && !m.readAt)) {
        await fetch(`${API_BASE_URL}/api/messages/admin/threads/${studentNumber}/read`, { method: 'POST', headers: await authHeaders(getToken) });
        window.dispatchEvent(new Event(MESSAGES_READ_EVENT));
        onChanged();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the conversation.');
    }
  }, [studentNumber, getToken, onChanged]);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, 20_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const send = async (msg: { body: string; files: File[]; applicationId?: string }) => {
    const message = await postMessage(`/api/messages/admin/threads/${studentNumber}`, getToken, msg);
    setData(d => (d ? { ...d, messages: [...d.messages, message] } : d));
    onChanged();
  };

  if (error && !data) return <Card><ErrorState title="Couldn't load the conversation" message={error} onRetry={load} /></Card>;
  if (!data) return <Card><TableSkeleton rows={4} label="Loading conversation" /></Card>;
  const s = data.student;
  return (
    <Card flush>
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
        <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={onBack} className="lg:hidden">All</Button>
        <Avatar name={s.name || s.studentNumber} avatarUrl={s.avatarUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{s.name ? titleCaseName(s.name) : s.studentNumber}</p>
          <p className="truncate text-xs text-ink-subtle" title={[s.college && collegeName(s.college), s.email].filter(Boolean).join(' · ')}>
            {[s.studentNumber, [s.programCode, s.yearLevel].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
          </p>
        </div>
        {data.applications.length > 0 && (
          <Menu
            label={`Applications (${data.applications.length})`}
            icon={FileText}
            items={data.applications.map(a => ({ key: a._id, label: `${a.scholarshipName} · ${a.status}`, icon: ExternalLink, onSelect: () => onOpenApplication(a._id) }))}
          />
        )}
        <Button size="sm" variant="ghost" icon={UserRound} onClick={() => setProfileOpen(true)}>Profile</Button>
        {menu}
      </div>
      {profileOpen && (
        <StudentProfileDialog
          studentNumber={s.studentNumber}
          getToken={getToken}
          onClose={() => setProfileOpen(false)}
          onOpenRecord={onOpenScholar && data.applications.length > 0 ? () => { setProfileOpen(false); onOpenScholar(s.studentNumber); } : undefined}
        />
      )}
      <Conversation
        className="h-[min(62vh,600px)]"
        messages={data.messages}
        viewer="adso"
        getToken={getToken}
        onSend={send}
        emptyText="No messages yet. Write the first one below — the student is also emailed."
        placeholder="Write to the student…"
        composerTools={(body, setBody) => (
          <>
            <TemplatePicker getToken={getToken} context="message" vars={{ firstName: firstNameOf(s.name) }} value={body} onInsert={setBody} />
            <UnfilledHint text={body} />
          </>
        )}
      />
    </Card>
  );
}

// A student's profile, read-only, without leaving the conversation (GET
// /api/students/:studentNumber/profile, AdSO). Editing and the full record
// (applications, history, files) are on the Scholars page.
function StudentProfileDialog({ studentNumber, getToken, onClose, onOpenRecord }: {
  studentNumber: string;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onOpenRecord?: () => void;
}) {
  const [p, setP] = useState<StudentProfile | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/students/${encodeURIComponent(studentNumber)}/profile`, { headers: await authHeaders(getToken) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Couldn’t load the profile.');
        if (!cancelled) setP(body.student);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Couldn’t load the profile.');
      }
    })();
    return () => { cancelled = true; };
  }, [studentNumber, getToken]);

  const date = (v?: string) => (v ? new Date(v).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }) : '');
  const parent = (name?: string, contact?: string, deceased?: boolean) => (name ? `${name}${deceased ? ' (deceased)' : contact ? ` · ${contact}` : ''}` : '');
  const guardian = p ? (p.guardianType === 'father' ? `Father (${p.fatherName ?? ''})` : p.guardianType === 'mother' ? `Mother (${p.motherName ?? ''})`
    : p.guardianName ? [p.guardianName, p.guardianRelationship, p.guardianContactNo].filter(Boolean).join(' · ') : '') : '';
  const sections: [string, [string, React.ReactNode][]][] = p ? [
    ['Academic', [
      ['Program', [p.programCode, p.course].filter(Boolean).join(' · ')],
      ['College', p.college ? collegeName(p.college) : ''],
      ['Year and section', [p.yearLevel, p.section].filter(Boolean).join(' · ')],
      ['GPA', p.gpa ? Number(p.gpa).toFixed(2) : ''],
    ]],
    ['Personal', [
      ['Date of birth', date(p.dateOfBirth)],
      ['Place of birth', p.placeOfBirth],
      ['Nationality', p.nationality],
      ['Civil status', p.civilStatus],
    ]],
    ['Contact', [
      ['School email', p.email],
      ['Mobile', p.mobileNumber],
      ['Telephone', p.telephoneNumber],
      ['Home address', [p.homeAddress, p.cityMunicipality, p.province, p.zipCode].filter(Boolean).join(', ')],
    ]],
    ['Family', [
      ['Father', parent(p.fatherName, p.fatherContactNo, p.fatherDeceased)],
      ['Mother', parent(p.motherName, p.motherContactNo, p.motherDeceased)],
      ['Guardian', guardian],
    ]],
  ] : [];
  const openRequests = (p?.correctionRequests ?? []).filter(r => r.status === 'open');

  return (
    <Modal
      size="lg"
      title={p ? titleCaseName(p.name) : 'Student profile'}
      description={p ? [p.studentNumber, p.programCode, p.yearLevel].filter(Boolean).join(' · ') : studentNumber}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          {onOpenRecord && <Button variant="primary" icon={ExternalLink} onClick={onOpenRecord}>Open full record</Button>}
        </>
      }
    >
      {error ? <Alert tone="danger">{error}</Alert> : !p ? <TableSkeleton rows={6} label="Loading profile" /> : (
        <div className="space-y-5">
          {openRequests.length > 0 && (
            <Alert tone="warning" title={`${openRequests.length === 1 ? 'A change request' : `${openRequests.length} change requests`} from the student`}>
              <ul className="mt-1 space-y-1">{openRequests.map((r, i) => <li key={r._id ?? i}><span className="font-medium capitalize">{r.group}:</span> {r.message}</li>)}</ul>
              {onOpenRecord && <p className="mt-2 text-xs">Use Open full record → Edit profile to make the change.</p>}
            </Alert>
          )}
          <div className="flex items-center gap-3">
            <Avatar name={p.name} avatarUrl={p.avatarUrl} size="lg" />
            <div className="min-w-0 text-sm text-ink-muted">
              <p className="font-medium text-ink">{titleCaseName(p.name)}</p>
              <p>{p.email}</p>
            </div>
          </div>
          {sections.map(([title, rows]) => (
            <section key={title}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{title}</h3>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {rows.map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs text-ink-subtle">{label}</dt>
                    <dd className="text-sm text-ink break-words">{value || <span className="text-ink-subtle">Not provided</span>}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}

// New message: pick who from a live search (students by name or student
// number) or the list of duty offices with a head; picking opens the chat.
function NewMessageDialog({ getToken, onClose, onOpen }: { getToken: () => Promise<string | null>; onClose: () => void; onOpen: (key: string) => void }) {
  const [to, setTo] = useState<'Student' | 'Office'>('Student');
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ studentNumber: string; name: string; programCode?: string; college?: string; yearLevel?: string }[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [offices, setOffices] = useState<{ office: string; headName?: string; headEmail?: string }[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/duty-hours/admin/settings`, { headers: await authHeaders(getToken) });
        if (res.ok) setOffices(((await res.json()).officeSlots ?? []).filter((o: { headEmail?: string }) => o.headEmail));
      } catch {
        // no offices to pick
      }
    })();
  }, [getToken]);

  // Students, a moment after typing.
  useEffect(() => {
    if (to !== 'Student' || query.trim().length < 2) { setFound(null); return; }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/announcements/email/students?q=${encodeURIComponent(query.trim())}`, { headers: await authHeaders(getToken) });
        const body = await res.json().catch(() => ({}));
        if (!cancelled) setFound(res.ok ? body.students ?? [] : []);
      } catch {
        if (!cancelled) setFound([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, to, getToken]);

  const q = query.trim().toLowerCase();
  const officeList = offices.filter(o => !q || o.office.toLowerCase().includes(q) || (o.headName ?? '').toLowerCase().includes(q));
  const typedNumber = /^\d{9}$/.test(query.trim()) ? query.trim() : null;
  const row = 'flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left hover:bg-surface-muted focus:outline-hidden focus-visible:bg-surface-muted';

  return (
    <Modal size="md" title="New message" onClose={onClose} footer={<Button onClick={onClose}>Cancel</Button>}>
      <div className="space-y-4">
        <SegmentedControl<'Student' | 'Office'>
          label="Write to"
          options={offices.length ? ['Student', 'Office'] : ['Student']}
          value={to}
          onChange={v => { if (v) { setTo(v); setQuery(''); } }}
          renderLabel={o => (o === 'Student' ? 'A student' : 'A duty office')}
        />
        <SearchInput
          value={query}
          onChange={setQuery}
          label={to === 'Student' ? 'Search students' : 'Search offices'}
          placeholder={to === 'Student' ? 'Name or student number…' : 'Office or head’s name…'}
        />
        <div className="max-h-80 min-h-40 overflow-y-auto">
          {to === 'Student' ? (
            query.trim().length < 2 ? (
              <p className="py-10 text-center text-sm text-ink-subtle">Type a name or student number.</p>
            ) : searching && !found ? (
              <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : (
              <ul className="space-y-0.5">
                {(found ?? []).map(st => (
                  <li key={st.studentNumber}>
                    <button type="button" onClick={() => onOpen(st.studentNumber)} className={row}>
                      <Avatar name={titleCaseName(st.name)} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{titleCaseName(st.name)}</span>
                        <span className="block truncate text-xs text-ink-muted">{[st.studentNumber, st.programCode, st.yearLevel].filter(Boolean).join(' · ')}</span>
                      </span>
                      <MessageSquare className="size-4 text-ink-subtle" aria-hidden />
                    </button>
                  </li>
                ))}
                {found && found.length === 0 && (
                  typedNumber
                    ? <li><button type="button" onClick={() => onOpen(typedNumber)} className={row}><MessageSquare className="size-4 text-ink-subtle" aria-hidden /><span className="text-sm text-ink">Write to <span className="font-medium tabular-nums">{typedNumber}</span></span></button></li>
                    : <li className="py-10 text-center text-sm text-ink-subtle">No student found.</li>
                )}
              </ul>
            )
          ) : (
            <ul className="space-y-0.5">
              {officeList.map(o => (
                <li key={o.office}>
                  <button type="button" onClick={() => onOpen(`${OFFICE_PREFIX}${o.office}`)} className={row}>
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-ink-muted"><Building2 className="size-4" aria-hidden /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{o.office}</span>
                      {o.headName && <span className="block truncate text-xs text-ink-muted">{o.headName}</span>}
                    </span>
                    <MessageSquare className="size-4 text-ink-subtle" aria-hidden />
                  </button>
                </li>
              ))}
              {officeList.length === 0 && <li className="py-10 text-center text-sm text-ink-subtle">No office found.</li>}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

// A duty office's conversation (its head writes from the office portal).
function OfficeThreadView({ office, getToken, onBack, onChanged, menu }: {
  office: string;
  getToken: () => Promise<string | null>;
  onBack: () => void;
  onChanged: () => void;
  menu?: React.ReactNode;
}) {
  const [data, setData] = useState<{ office: { office: string; headName: string; headEmail: string }; messages: ChatMessage[]; state?: { markedUnread: boolean } } | null>(null);
  const [error, setError] = useState('');
  const path = `/api/messages/admin/offices/${encodeURIComponent(office)}`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}${path}`, { headers: await authHeaders(getToken) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to load the conversation.');
      setData(body);
      setError('');
      if (body.state?.markedUnread || (body.messages as ChatMessage[]).some(m => m.from === 'office' && !m.readAt)) {
        await fetch(`${API_BASE_URL}${path}/read`, { method: 'POST', headers: await authHeaders(getToken) });
        window.dispatchEvent(new Event(MESSAGES_READ_EVENT));
        onChanged();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the conversation.');
    }
  }, [path, getToken, onChanged]);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, 20_000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (error && !data) return <Card><ErrorState title="Couldn't load the conversation" message={error} onRetry={load} /></Card>;
  if (!data) return <Card><TableSkeleton rows={4} label="Loading conversation" /></Card>;
  return (
    <Card flush>
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
        <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={onBack} className="lg:hidden">All</Button>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent"><Building2 className="size-4" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{data.office.office}</p>
          <p className="truncate text-xs text-ink-subtle">{[data.office.headName, data.office.headEmail].filter(Boolean).join(' · ') || 'No head listed'}</p>
        </div>
        {menu}
      </div>
      <Conversation
        className="h-[min(62vh,600px)]"
        messages={data.messages}
        viewer="adso"
        getToken={getToken}
        onSend={async msg => { const m = await postMessage(path, getToken, msg); setData(d => (d ? { ...d, messages: [...d.messages, m] } : d)); onChanged(); }}
        emptyText="No messages yet. Write the first one below — the office head is also emailed."
        placeholder="Write to the office…"
      />
    </Card>
  );
}
