import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, ArchiveRestore, ArrowLeft, Building2, Mail, MailOpen, MessageSquare, PenSquare, Pin, PinOff, Trash2 } from 'lucide-react';
import Conversation from '../../components/messages/Conversation';
import { ChatMessage, MESSAGES_READ_EVENT, postMessage } from '../../utils/messages';
import { collegeName } from '../../data/programs';
import { API_BASE_URL, authHeaders, formatDateTime, titleCaseName } from './adminData';
import { ResultDialog, Alert, Avatar, Button, Card, ConfirmDialog, DropdownMenu, DropdownMenuItem, EmptyState, ErrorState, Field, Modal, PageHeader, SearchInput, SegmentedControl, Select, TableSkeleton, TextInput, Toast } from './AdminUI';
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

export default function MessagesPage({ getToken, selectedStudent, onSelectStudent, onOpenApplication }: {
  getToken: () => Promise<string | null>;
  selectedStudent: string | null;
  onSelectStudent: (studentNumber: string | null) => void;
  onOpenApplication: (applicationId: string) => void;
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
          description={search ? 'Try another search.' : inboxView === 'Archived' ? 'Archived conversations show here until the student or office writes again.' : inboxView === 'Unread' ? 'No unread conversations.' : 'Messages from students appear here. You can also start one.'}
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
        description="Conversations with students. Students can attach JPG, PNG or PDF files; new messages are also emailed to their school Outlook."
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
            onChanged={loadThreads}
            menu={headerMenu}
          />
        ) : (
          <Card className="hidden lg:block">
            <EmptyState icon={MessageSquare} title="Choose a conversation" description="Or start one with New message." />
          </Card>
        )}
      </div>
      {newOpen && <NewMessageDialog getToken={getToken} onClose={() => setNewOpen(false)} onOpen={key => { setNewOpen(false); onSelectStudent(key); }} />}
      {deleting && (
        <ConfirmDialog
          tone="danger"
          title="Delete this conversation?"
          description={`It's removed from your inbox. ${deleting.kind === 'office' ? 'The office' : 'The student'} keeps their copy, and if they write again, a new conversation starts here with only the new messages.`}
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

function ThreadView({ studentNumber, getToken, onBack, onOpenApplication, onChanged, menu }: {
  studentNumber: string;
  getToken: () => Promise<string | null>;
  onBack: () => void;
  onOpenApplication: (applicationId: string) => void;
  onChanged: () => void;
  menu?: React.ReactNode;
}) {
  const [data, setData] = useState<ThreadDetail | null>(null);
  const [error, setError] = useState('');

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
          <p className="truncate text-xs text-ink-subtle">
            {[s.studentNumber, s.college && collegeName(s.college), s.programCode, s.yearLevel].filter(Boolean).join(' · ')}{s.email ? ` · ${s.email}` : ''}
          </p>
        </div>
        {menu}
      </div>
      {data.applications.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-line px-3 py-2">
          {data.applications.map(a => (
            <button key={a._id} type="button" onClick={() => onOpenApplication(a._id)} className="rounded-badge bg-surface-muted px-2 py-1 text-xs text-ink-muted hover:text-ink" title="Open the application">
              <span className="font-mono">{a.referenceCode}</span> · {a.scholarshipName} · {a.status}
            </button>
          ))}
        </div>
      )}
      <Conversation
        className="h-[min(62vh,600px)]"
        messages={data.messages}
        viewer="adso"
        getToken={getToken}
        applications={data.applications.map(a => ({ id: a._id, label: `${a.referenceCode} · ${a.scholarshipName}` }))}
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

function NewMessageDialog({ getToken, onClose, onOpen }: { getToken: () => Promise<string | null>; onClose: () => void; onOpen: (key: string) => void }) {
  const [to, setTo] = useState<'student' | 'office'>('student');
  const [value, setValue] = useState('');
  const [office, setOffice] = useState('');
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
  const valid = to === 'student' ? /^\d{9}$/.test(value.trim()) : !!office;
  const open = () => { if (valid) onOpen(to === 'student' ? value.trim() : `${OFFICE_PREFIX}${office}`); };
  return (
    <Modal
      size="sm"
      title="New message"
      description="Write to a student by their student number, or to a duty office's head. You can also use Message student on an application or a scholar."
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid} onClick={open}>Open conversation</Button></>}
    >
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); open(); }}>
        <Field label="To">
          <Select value={to} onChange={v => setTo(v as 'student' | 'office')}>
            <option value="student">A student</option>
            <option value="office" disabled={!offices.length}>A duty office{offices.length ? '' : ' (no office heads yet)'}</option>
          </Select>
        </Field>
        {to === 'student' ? (
          <>
            <Field label="Student number">
              <TextInput value={value} onChange={e => setValue(e.target.value.replace(/\D/g, '').slice(0, 9))} inputMode="numeric" placeholder="e.g. 202330864" autoFocus />
            </Field>
            {value && !/^\d{9}$/.test(value.trim()) && <Alert tone="info">Student numbers have 9 digits.</Alert>}
          </>
        ) : (
          <Field label="Office">
            <Select value={office} onChange={setOffice}>
              <option value="">Choose an office</option>
              {offices.map(o => <option key={o.office} value={o.office}>{o.office}{o.headName ? ` — ${o.headName}` : ''}</option>)}
            </Select>
          </Field>
        )}
      </form>
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
