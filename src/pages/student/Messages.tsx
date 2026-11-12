import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/react';
import { Building2, RefreshCw } from 'lucide-react';
import { Application } from '../../types';
import Conversation from '../../components/messages/Conversation';
import { ChatMessage, MESSAGES_API_BASE, MESSAGES_READ_EVENT, MessageOffice, postMessage } from '../../utils/messages';
import { ChatSkeleton } from '../../components/Skeletons';

// The student's conversations with the scholarship offices (backend
// routes/messages.js): the AdSO, plus each office they applied to (POLCA,
// Alumni…) or that wrote to them. Each office has its own conversation.
// Opening one marks that office's messages read; it refreshes every 20
// seconds while open.

const ADSO = 'LSO';
const ADSO_FALLBACK: MessageOffice = { code: ADSO, name: 'Admissions and Scholarship Office (AdSO)', short: 'AdSO', unread: 0, last: null };

const timeLabel = (iso: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })
    : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
};

export default function Messages({ applications: _applications }: { applications: Application[] }) {
  const { getToken } = useAuth();
  const [offices, setOffices] = useState<MessageOffice[]>([ADSO_FALLBACK]);
  const [office, setOffice] = useState(ADSO);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [error, setError] = useState('');

  const headers = useCallback(async () => {
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  }, [getToken]);

  const loadOffices = useCallback(async () => {
    try {
      const res = await fetch(`${MESSAGES_API_BASE}/api/messages/mine/offices`, { headers: await headers() });
      if (!res.ok) return;
      const list: MessageOffice[] = (await res.json()).offices ?? [];
      if (list.length) setOffices(list);
    } catch {
      // keep the last list
    }
  }, [headers]);

  const load = useCallback(async () => {
    try {
      const h = await headers();
      const q = `?office=${encodeURIComponent(office)}`;
      const res = await fetch(`${MESSAGES_API_BASE}/api/messages/mine${q}`, { headers: h });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to load your messages.');
      const list: ChatMessage[] = body.messages ?? [];
      setMessages(list);
      setError('');
      if (list.some(m => m.from === 'adso' && !m.readAt)) {
        await fetch(`${MESSAGES_API_BASE}/api/messages/mine/read${q}`, { method: 'POST', headers: h });
        setOffices(prev => prev.map(o => (o.code === office ? { ...o, unread: 0 } : o)));
        window.dispatchEvent(new Event(MESSAGES_READ_EVENT));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load your messages.');
    }
  }, [headers, office]);

  useEffect(() => {
    setMessages(null);
    setError('');
    load();
    loadOffices();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') { load(); loadOffices(); }
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [load, loadOffices]);

  const send = async (data: { body: string; files: File[]; applicationId?: string }) => {
    const message = await postMessage(`/api/messages/mine?office=${encodeURIComponent(office)}`, getToken, data);
    setMessages(prev => [...(prev ?? []), message]);
    setOffices(prev => prev.map(o => (o.code === office ? { ...o, last: message } : o)));
  };

  const current = offices.find(o => o.code === office) ?? ADSO_FALLBACK;
  const many = offices.length > 1;
  const shortName = current.code === ADSO ? 'the scholarship office' : current.short;

  const conversation = (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-xs">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-green/10 text-brand-green">
          <Building2 className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">{current.name}</p>
          <p className="text-xs text-slate-500">Usually replies within office hours (Mon–Fri).</p>
        </div>
      </div>
      {error && !messages ? (
        <div className="space-y-3 p-6 text-center">
          <p className="text-sm font-semibold text-rose-900">{error}</p>
          <button type="button" onClick={load} className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-800 hover:text-rose-950">
            <RefreshCw className="h-3.5 w-3.5" /> Try again
          </button>
        </div>
      ) : !messages ? (
        <div className="p-4"><ChatSkeleton label="Loading messages" /></div>
      ) : (
        <Conversation
          key={office}
          className="h-[min(70vh,640px)]"
          messages={messages}
          viewer="student"
          getToken={getToken}
          onSend={send}
          emptyText={`No messages yet. Write to ${shortName} below.`}
          placeholder={`Write to ${shortName}…`}
        />
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900">Messages</h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500 sm:text-sm">
          {many
            ? 'Ask a scholarship office a question or send them a file. Each office has its own conversation. You’ll also get an email in your school Outlook when they reply.'
            : 'Ask the Admissions and Scholarship Office (AdSO) a question or send them a file. You’ll also get an email in your school Outlook when they reply.'}
        </p>
      </div>

      {!many ? conversation : (
        <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <nav aria-label="Offices" className="min-w-0">
            <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0 [scrollbar-width:none]">
              {offices.map(o => {
                const active = o.code === office;
                const preview = o.last ? (o.last.body || (o.last.attachments.length ? '📎 Attachment' : '')) : 'No messages yet';
                return (
                  <li key={o.code} className="shrink-0 lg:shrink">
                    <button
                      type="button"
                      onClick={() => setOffice(o.code)}
                      aria-current={active ? 'true' : undefined}
                      className={`flex w-56 items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors lg:w-full focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green ${
                        active ? 'border-brand-green/40 bg-brand-green/5' : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${active ? 'bg-brand-green text-white' : 'bg-slate-100 text-slate-500'}`}>
                        <Building2 className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={`truncate text-sm ${o.unread ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'}`}>{o.short}</span>
                          {o.last && <span className="ml-auto shrink-0 text-[11px] text-slate-400">{timeLabel(o.last.createdAt)}</span>}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className={`truncate text-xs ${o.unread ? 'font-semibold text-slate-700' : 'text-slate-500'}`}>
                            {o.last?.from === 'student' ? 'You: ' : ''}{preview}
                          </span>
                          {o.unread > 0 && (
                            <span className="ml-auto shrink-0 rounded-full bg-brand-green px-1.5 text-[11px] font-bold text-white tabular-nums" aria-label={`${o.unread} unread`}>
                              {o.unread}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          {conversation}
        </div>
      )}
    </div>
  );
}
