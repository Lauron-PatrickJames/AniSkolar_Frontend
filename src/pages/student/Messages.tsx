import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/react';
import { RefreshCw } from 'lucide-react';
import { Application } from '../../types';
import Conversation from '../../components/messages/Conversation';
import { ChatMessage, MESSAGES_API_BASE, MESSAGES_READ_EVENT, postMessage } from '../../utils/messages';
import { ChatSkeleton } from '../../components/Skeletons';

// The student's conversation with the Admissions and Scholarship Office
// (backend routes/messages.js). Opening it marks the office's messages
// read; it refreshes every 20 seconds while open.

export default function Messages({ applications }: { applications: Application[] }) {
  const { getToken } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const res = await fetch(`${MESSAGES_API_BASE}/api/messages/mine`, { headers });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to load your messages.');
      const list: ChatMessage[] = body.messages ?? [];
      setMessages(list);
      setError('');
      if (list.some(m => m.from === 'adso' && !m.readAt)) {
        await fetch(`${MESSAGES_API_BASE}/api/messages/mine/read`, { method: 'POST', headers });
        window.dispatchEvent(new Event(MESSAGES_READ_EVENT));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load your messages.');
    }
  }, [getToken]);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, 20_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const send = async (data: { body: string; files: File[]; applicationId?: string }) => {
    const message = await postMessage('/api/messages/mine', getToken, data);
    setMessages(prev => [...(prev ?? []), message]);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900">Messages</h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500 sm:text-sm">
          Ask the Admissions and Scholarship Office (AdSO) a question or send them a file. You'll also get an email in your school Outlook when they reply.
        </p>
      </div>
      {error && !messages && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center space-y-3">
          <p className="text-sm font-semibold text-rose-900">{error}</p>
          <button type="button" onClick={load} className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-800 hover:text-rose-950">
            <RefreshCw className="w-3.5 h-3.5" /> Try again
          </button>
        </div>
      )}
      {!messages && !error && (
        <ChatSkeleton label="Loading messages" />
      )}
      {messages && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-xs">
          <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
            <p className="text-sm font-bold text-slate-900">Admissions and Scholarship Office</p>
            <p className="text-[11px] text-slate-500">Usually replies within office hours (Mon–Fri).</p>
          </div>
          <Conversation
            className="h-[min(70vh,640px)]"
            messages={messages}
            viewer="student"
            getToken={getToken}
            applications={applications.map(a => {
              const ref = (a as Application & { referenceCode?: string }).referenceCode;
              return { id: a.id, label: ref ? `${ref} · ${a.scholarshipName}` : a.scholarshipName };
            })}
            onSend={send}
            emptyText="No messages yet. Write to the scholarship office below."
            placeholder="Write to the scholarship office…"
          />
        </div>
      )}
    </div>
  );
}
