import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, ArchiveRestore, ArrowLeft, Building2, ExternalLink, FileText, Mail, MailOpen, MessageSquare, PenSquare, Pin, PinOff, Trash2, UserRound } from 'lucide-react';
import { StudentProfile } from '../../types';
import Conversation from '../../components/messages/Conversation';
import { ChatMessage, MESSAGES_READ_EVENT, postMessage } from '../../utils/messages';
import { collegeName } from '../../data/programs';
import { API_BASE_URL, authHeaders, formatDateTime, titleCaseName } from './adminData';
import { ResultDialog, Alert, Avatar, Badge, Button, Card, ConfirmDialog, DropdownMenu, DropdownMenuItem, EmptyState, Menu, ErrorState, Field, Modal, PageHeader, SearchInput, SegmentedControl, Select, Skeleton, TableSkeleton, TextInput, Toast } from './AdminUI';
import { QuickReplies, UnfilledHint, firstNameOf } from './ReplyTemplates';

// An office's conversations with students (backend routes/messages.js),
// one per student: each office (AdSO, POLCA, Alumni…) has its own inbox.
// The AdSO also has the duty offices' conversations. Left: every conversation, newest first, with unread counts;
// right: the open one. A conversation can also be started from an
// application or a scholar ("Message student"), or here by student number.
// The AdSO can pin, archive, mark as unread or delete a conversation; that
// only changes their own inbox (backend models/MessageThread.js).

// A student's conversation, or a duty office's (its head writes from the
// office portal). The open one is selected by key: a student number, or
// "office:" + the office name.
const OFFICE_PREFIX = 'office:';
// Another scholarship office's conversation (POLCA, the AdSO…): "peer:" + its code.
const PEER_PREFIX = 'peer:';
interface Thread {
  kind: 'student' | 'office' | 'peer';
  studentNumber?: string;
  office?: string;
  peerOffice?: string;
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
const keyOf = (t: Thread) => (t.kind === 'office' ? `${OFFICE_PREFIX}${t.office}` : t.kind === 'peer' ? `${PEER_PREFIX}${t.peerOffice}` : t.studentNumber!);
const pathOf = (t: Thread) => (t.kind === 'office' ? `/api/messages/admin/offices/${encodeURIComponent(t.office!)}`
  : t.kind === 'peer' ? `/api/messages/admin/peers/${encodeURIComponent(t.peerOffice!)}` : `/api/messages/admin/threads/${t.studentNumber}`);
const titleOf = (t: Thread) => (t.kind === 'office' ? t.office! : t.kind === 'peer' ? t.name : t.name ? titleCaseName(t.name) : t.studentNumber!);
const isUnread = (t: Thread) => t.unread > 0 || t.markedUnread;

interface ThreadDetail {
  student: { studentNumber: string; name: string; email: string; programCode?: string; college?: string; yearLevel?: string; avatarUrl?: string };
  applications: { _id: string; referenceCode: string; scholarshipName: string; status: string }[];
  messages: ChatMessage[];
  state?: { pinned: boolean; archived: boolean; markedUnread: boolean };
}

export default function MessagesPage({ getToken, isAdso = true, selectedStudent, onSelectStudent, onOpenApplication, onOpenScholar }: {
  getToken: () => Promise<string | null>;
  // Duty offices write to the AdSO only.
  isAdso?: boolean;
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
                  {t.kind !== 'student'
                    ? <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent"><Building2 className="size-4" aria-hidden /></span>
                    : <Avatar name={t.name || t.studentNumber || ''} avatarUrl={t.avatarUrl} size="sm" />}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={`truncate text-sm ${unread ? 'font-semibold text-ink' : 'font-medium text-ink'}`}>{titleOf(t)}</span>
                      {t.pinned && <Pin className="size-3.5 shrink-0 text-ink-subtle" aria-label="Pinned" />}
                      {t.unread > 0
                        ? <span className="ml-auto shrink-0 rounded-full bg-accent px-1.5 text-xs font-semibold text-white tabular-nums" aria-label={`${t.unread} unread`}>{t.unread}</span>
                        : t.markedUnread && <span className="ml-auto size-2.5 shrink-0 rounded-full bg-accent" aria-label="Marked as unread" />}
                    </span>
                    <span className="block truncate text-xs text-ink-subtle">{t.kind === 'office' ? ['Duty office', t.headName].filter(Boolean).join(' · ') : t.kind === 'peer' ? 'Scholarship office' : [t.studentNumber, t.college].filter(Boolean).join(' · ')}</span>
                    <span className={`block truncate text-xs ${unread ? 'text-ink' : 'text-ink-muted'}`}>{t.last.from === 'adso' ? 'You: ' : ''}{preview}</span>
                    <span className="block text-xs text-ink-subtle tabular-nums">{formatDateTime(t.last.createdAt)}</span>
                  </span>
                </button>
                <div className="absolute right-1.5 top-2.5 opacity-100 lg:opacity-0 lg:focus-within:opacity-100 lg:group-hover:opacity-100">
                  <DropdownMenu label={`Actions for ${titleOf(t)}`} items={menuFor(t)} />
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
        {selectedStudent?.startsWith(PEER_PREFIX) ? (
          <PeerThreadView
            key={selectedStudent}
            code={selectedStudent.slice(PEER_PREFIX.length)}
            getToken={getToken}
            onBack={() => onSelectStudent(null)}
            onChanged={loadThreads}
            menu={headerMenu}
          />
        ) : selectedStudent?.startsWith(OFFICE_PREFIX) ? (
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
      {newOpen && <NewMessageDialog getToken={getToken} isAdso={isAdso} existing={new Set((threads ?? []).map(keyOf))} onClose={() => setNewOpen(false)} onOpen={key => { setNewOpen(false); onSelectStudent(key); }} />}
      {deleting && (
        <ConfirmDialog
          tone="danger"
          title="Delete this conversation?"
          description={`Removed from your inbox only. ${deleting.kind === 'student' ? 'The student' : 'The office'} keeps their copy.`}
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
        composerTop={(body, setBody) => (
          <QuickReplies getToken={getToken} vars={{ firstName: firstNameOf(s.name) }} value={body} onInsert={setBody} />
        )}
        composerTools={body => <UnfilledHint text={body} />}
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
              <h3 className="mb-2 text-sm font-semibold text-ink-muted">{title}</h3>
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
// One person or office to pick: a badge, the name, a detail line, and
// "Open" when there's already a conversation (else "Write" on hover).
function PickRow({ badge, title, detail, existing, onClick }: { badge: React.ReactNode; title: string; detail?: string; existing?: boolean; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="group flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left hover:bg-surface-muted focus:outline-hidden focus-visible:bg-surface-muted">
        {badge}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{title}</span>
          {detail && <span className="block truncate text-xs text-ink-muted">{detail}</span>}
        </span>
        {existing
          ? <Badge tone="neutral">Open chat</Badge>
          : <span className="text-xs font-semibold text-accent opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">Write →</span>}
      </button>
    </li>
  );
}
// Two letters for an office: "POLCA" → "PO", "Alumni Office" → "AO".
const officeInitials = (name: string) => {
  const words = name.replace(/\(.*?\)/g, '').split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
};
const OfficeBadge = ({ name }: { name: string }) => (
  <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-[11px] font-semibold tracking-tight text-accent">{officeInitials(name)}</span>
);
const GroupLabel = ({ children }: { children: React.ReactNode }) => (
  <li className="sticky top-0 z-10 bg-surface px-3 pb-1 pt-3 text-xs font-medium text-ink-subtle first:pt-0">{children}</li>
);

function NewMessageDialog({ getToken, isAdso, existing, onClose, onOpen }: { getToken: () => Promise<string | null>; isAdso: boolean; existing: Set<string>; onClose: () => void; onOpen: (key: string) => void }) {
  const [to, setTo] = useState<'Student' | 'Peer' | 'Office'>('Student');
  // The other scholarship offices (POLCA, the AdSO…).
  const [peers, setPeers] = useState<{ code: string; name: string; short: string }[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/messages/admin/peers`, { headers: await authHeaders(getToken) });
        if (res.ok) setPeers((await res.json()).offices ?? []);
      } catch {
        // no offices to pick
      }
    })();
  }, [getToken]);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ studentNumber: string; name: string; programCode?: string; college?: string; yearLevel?: string }[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [offices, setOffices] = useState<{ office: string; headName?: string; headEmail?: string }[]>([]);
  useEffect(() => {
    if (!isAdso) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/duty-hours/admin/settings`, { headers: await authHeaders(getToken) });
        if (res.ok) setOffices(((await res.json()).officeSlots ?? []).filter((o: { headEmail?: string }) => o.headEmail));
      } catch {
        // no offices to pick
      }
    })();
  }, [getToken, isAdso]);

  // Students, a moment after typing.
  useEffect(() => {
    if (to !== 'Student' || query.trim().length < 2) { setFound(null); return; }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/messages/admin/students?q=${encodeURIComponent(query.trim())}`, { headers: await authHeaders(getToken) });
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
  const peerList = peers.filter(o => !q || o.name.toLowerCase().includes(q) || o.short.toLowerCase().includes(q));
  // Offices you already write to first, then scholarship offices, then the student governments.
  const isGov = (o: { name: string }) => /student government/i.test(o.name);
  const peerGroups = [
    { label: 'Recent', items: peerList.filter(o => existing.has(`${PEER_PREFIX}${o.code}`)) },
    { label: 'Scholarship offices', items: peerList.filter(o => !existing.has(`${PEER_PREFIX}${o.code}`) && !isGov(o)) },
    { label: 'Student governments', items: peerList.filter(o => !existing.has(`${PEER_PREFIX}${o.code}`) && isGov(o)) },
  ].filter(g => g.items.length);
  const HINT = {
    Student: isAdso ? 'Search any student by name or student number.' : 'Students who applied to your office’s scholarships.',
    Peer: 'Other offices in AniSkolar. Their admins reply from their admin console.',
    Office: 'Duty offices. Their heads reply from the office portal.',
  };
  const typedNumber = /^\d{9}$/.test(query.trim()) ? query.trim() : null;
  const row = 'flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left hover:bg-surface-muted focus:outline-hidden focus-visible:bg-surface-muted';

  return (
    <Modal size="md" title="New message" onClose={onClose} footer={<Button onClick={onClose}>Cancel</Button>}>
      <div className="space-y-4">
        <SegmentedControl<'Student' | 'Peer' | 'Office'>
          label="Write to"
          options={[
            'Student',
            ...(peers.length ? ['Peer' as const] : []),
            ...(offices.length ? ['Office' as const] : []),
          ]}
          value={to}
          onChange={v => { if (v) { setTo(v); setQuery(''); } }}
          renderLabel={o => (o === 'Student' ? 'Student' : o === 'Peer' ? 'Office' : 'Duty office')}
        />
        <p className="-mt-1 text-xs text-ink-subtle">{HINT[to]}</p>
        <SearchInput
          value={query}
          onChange={setQuery}
          label={to === 'Student' ? 'Search students' : 'Search offices'}
          placeholder={to === 'Student' ? 'Name or student number…' : to === 'Peer' ? 'Search offices, e.g. POLCA…' : 'Office or head’s name…'}
        />
        <div className="-mx-2 max-h-[22rem] min-h-48 overflow-y-auto px-2">
          {to === 'Student' ? (
            query.trim().length < 2 ? (
              <p className="py-10 text-center text-sm text-ink-subtle">Type a name or student number.</p>
            ) : searching && !found ? (
              <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : (
              <ul className="space-y-0.5">
                {(found ?? []).map(st => (
                  <PickRow
                    key={st.studentNumber}
                    badge={<Avatar name={titleCaseName(st.name)} size="sm" />}
                    title={titleCaseName(st.name)}
                    detail={[st.studentNumber, st.programCode, st.yearLevel].filter(Boolean).join(' · ')}
                    existing={existing.has(st.studentNumber)}
                    onClick={() => onOpen(st.studentNumber)}
                  />
                ))}
                {found && found.length === 0 && (
                  typedNumber && isAdso
                    ? <li><button type="button" onClick={() => onOpen(typedNumber)} className={row}><MessageSquare className="size-4 text-ink-subtle" aria-hidden /><span className="text-sm text-ink">Write to <span className="font-medium tabular-nums">{typedNumber}</span></span></button></li>
                    : <li className="py-10 text-center text-sm text-ink-subtle">{isAdso ? 'No student found.' : 'No student found among your office’s applicants.'}</li>
                )}
              </ul>
            )
          ) : to === 'Peer' ? (
            <ul className="space-y-0.5">
              {peerGroups.map(g => (
                <React.Fragment key={g.label}>
                  <GroupLabel>{g.label}</GroupLabel>
                  {g.items.map(o => (
                    <PickRow
                      key={o.code}
                      badge={<OfficeBadge name={o.short} />}
                      title={o.short}
                      detail={o.name !== o.short ? o.name : undefined}
                      existing={existing.has(`${PEER_PREFIX}${o.code}`)}
                      onClick={() => onOpen(`${PEER_PREFIX}${o.code}`)}
                    />
                  ))}
                </React.Fragment>
              ))}
              {peerList.length === 0 && <li className="py-10 text-center text-sm text-ink-subtle">{q ? `No office matches “${query.trim()}”.` : 'No other office has an admin account yet.'}</li>}
            </ul>
          ) : (
            <ul className="space-y-0.5">
              {officeList.map(o => (
                <PickRow
                  key={o.office}
                  badge={<OfficeBadge name={o.office} />}
                  title={o.office}
                  detail={o.headName ? `Head: ${o.headName}` : undefined}
                  existing={existing.has(`${OFFICE_PREFIX}${o.office}`)}
                  onClick={() => onOpen(`${OFFICE_PREFIX}${o.office}`)}
                />
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
        composerTop={(body, setBody) => (
          <QuickReplies getToken={getToken} vars={{ firstName: firstNameOf(data.office.headName) }} value={body} onInsert={setBody} />
        )}
        composerTools={body => <UnfilledHint text={body} />}
      />
    </Card>
  );
}

// A conversation with another scholarship office (POLCA, the AdSO…): their
// admins write from their own admin console.
function PeerThreadView({ code, getToken, onBack, onChanged, menu }: {
  code: string;
  getToken: () => Promise<string | null>;
  onBack: () => void;
  onChanged: () => void;
  menu?: React.ReactNode;
}) {
  const [data, setData] = useState<{ office: { code: string; name: string; short: string }; messages: ChatMessage[]; state?: { markedUnread: boolean } } | null>(null);
  const [error, setError] = useState('');
  const path = `/api/messages/admin/peers/${encodeURIComponent(code)}`;

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
          <p className="truncate text-sm font-semibold text-ink">{data.office.name}</p>
          <p className="truncate text-xs text-ink-subtle">Scholarship office · their admins reply from their admin console</p>
        </div>
        {menu}
      </div>
      <Conversation
        className="h-[min(62vh,600px)]"
        messages={data.messages}
        viewer="adso"
        getToken={getToken}
        onSend={async msg => { const m = await postMessage(path, getToken, msg); setData(d => (d ? { ...d, messages: [...d.messages, m] } : d)); onChanged(); }}
        emptyText={`No messages yet. Write the first one below — the ${data.office.short} admins are also emailed.`}
        placeholder={`Write to ${data.office.short}…`}
        composerTop={(body, setBody) => (
          <QuickReplies getToken={getToken} vars={{}} value={body} onInsert={setBody} />
        )}
        composerTools={body => <UnfilledHint text={body} />}
      />
    </Card>
  );
}
