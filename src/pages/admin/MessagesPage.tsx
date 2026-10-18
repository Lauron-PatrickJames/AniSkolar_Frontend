import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, MessageSquare, PenSquare } from 'lucide-react';
import Conversation from '../../components/messages/Conversation';
import { ChatMessage, MESSAGES_READ_EVENT, postMessage } from '../../utils/messages';
import { collegeName } from '../../data/programs';
import { API_BASE_URL, authHeaders, formatDateTime, titleCaseName } from './adminData';
import { Alert, Avatar, Button, Card, EmptyState, ErrorState, Field, Modal, PageHeader, SearchInput, TableSkeleton, TextInput } from './AdminUI';

// AdSO: conversations with students (backend routes/messages.js), one per
// student. Left: every conversation, newest first, with unread counts;
// right: the open one. A conversation can also be started from an
// application or a scholar ("Message student"), or here by student number.

interface Thread {
  studentNumber: string;
  name: string;
  email: string;
  programCode: string;
  college: string;
  yearLevel: string;
  avatarUrl?: string;
  unread: number;
  count: number;
  last: ChatMessage;
}

interface ThreadDetail {
  student: { studentNumber: string; name: string; email: string; programCode?: string; college?: string; yearLevel?: string; avatarUrl?: string };
  applications: { _id: string; referenceCode: string; scholarshipName: string; status: string }[];
  messages: ChatMessage[];
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

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (threads ?? []).filter(t => !q || t.name.toLowerCase().includes(q) || t.studentNumber.includes(q) || t.college.toLowerCase().includes(q));
  }, [threads, search]);

  const list = (
    <Card flush className={selectedStudent ? 'hidden lg:block' : ''}>
      <div className="border-b border-line p-3">
        <SearchInput value={search} onChange={setSearch} label="Search conversations" placeholder="Search name, student no. or college…" />
      </div>
      {error && !threads ? (
        <ErrorState title="Couldn't load messages" message={error} onRetry={loadThreads} />
      ) : !threads ? (
        <TableSkeleton rows={5} label="Loading conversations" />
      ) : visible.length === 0 ? (
        <EmptyState icon={MessageSquare} title={threads.length ? 'No conversations match' : 'No messages yet'} description={threads.length ? 'Try another search.' : 'Messages from students appear here. You can also start one.'} />
      ) : (
        <ul className="max-h-[70vh] divide-y divide-line overflow-y-auto">
          {visible.map(t => {
            const active = t.studentNumber === selectedStudent;
            const preview = t.last.body || (t.last.attachments.length ? `📎 ${t.last.attachments.length} attachment${t.last.attachments.length === 1 ? '' : 's'}` : '');
            return (
              <li key={t.studentNumber}>
                <button
                  type="button"
                  onClick={() => onSelectStudent(t.studentNumber)}
                  className={`flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-surface-muted ${active ? 'bg-accent-subtle' : ''}`}
                >
                  <Avatar name={t.name || t.studentNumber} avatarUrl={t.avatarUrl} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={`truncate text-sm ${t.unread ? 'font-semibold text-ink' : 'font-medium text-ink'}`}>{t.name ? titleCaseName(t.name) : t.studentNumber}</span>
                      {t.unread > 0 && <span className="ml-auto shrink-0 rounded-full bg-accent px-1.5 text-xs font-semibold text-white tabular-nums" aria-label={`${t.unread} unread`}>{t.unread}</span>}
                    </span>
                    <span className="block truncate text-xs text-ink-subtle">{[t.studentNumber, t.college].filter(Boolean).join(' · ')}</span>
                    <span className={`block truncate text-xs ${t.unread ? 'text-ink' : 'text-ink-muted'}`}>{t.last.from === 'adso' ? 'You: ' : ''}{preview}</span>
                    <span className="block text-[11px] text-ink-subtle">{formatDateTime(t.last.createdAt)}</span>
                  </span>
                </button>
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
        {selectedStudent ? (
          <ThreadView
            key={selectedStudent}
            studentNumber={selectedStudent}
            getToken={getToken}
            onBack={() => onSelectStudent(null)}
            onOpenApplication={onOpenApplication}
            onChanged={loadThreads}
          />
        ) : (
          <Card className="hidden lg:block">
            <EmptyState icon={MessageSquare} title="Choose a conversation" description="Or start one with New message." />
          </Card>
        )}
      </div>
      {newOpen && <NewMessageDialog onClose={() => setNewOpen(false)} onOpen={sn => { setNewOpen(false); onSelectStudent(sn); }} />}
    </div>
  );
}

function ThreadView({ studentNumber, getToken, onBack, onOpenApplication, onChanged }: {
  studentNumber: string;
  getToken: () => Promise<string | null>;
  onBack: () => void;
  onOpenApplication: (applicationId: string) => void;
  onChanged: () => void;
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
      if ((body.messages as ChatMessage[]).some(m => m.from === 'student' && !m.readAt)) {
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
      />
    </Card>
  );
}

function NewMessageDialog({ onClose, onOpen }: { onClose: () => void; onOpen: (studentNumber: string) => void }) {
  const [value, setValue] = useState('');
  const valid = /^\d{9}$/.test(value.trim());
  return (
    <Modal
      size="sm"
      title="New message"
      description="Open a conversation with a student by their student number. You can also use Message student on an application or a scholar."
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid} onClick={() => onOpen(value.trim())}>Open conversation</Button></>}
    >
      <form onSubmit={e => { e.preventDefault(); if (valid) onOpen(value.trim()); }}>
        <Field label="Student number">
          <TextInput value={value} onChange={e => setValue(e.target.value.replace(/\D/g, '').slice(0, 9))} inputMode="numeric" placeholder="e.g. 202330864" autoFocus />
        </Field>
        {value && !valid && <Alert tone="info">Student numbers have 9 digits.</Alert>}
      </form>
    </Modal>
  );
}
