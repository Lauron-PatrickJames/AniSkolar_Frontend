import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import { ArrowLeft, MessageSquarePlus, RefreshCw, Search, X } from 'lucide-react';
import { Application } from '../../types';
import Conversation from '../../components/messages/Conversation';
import { ChatMessage, MESSAGES_API_BASE, MESSAGES_READ_EVENT, MessageOffice, postMessage } from '../../utils/messages';

// The student's conversations with the scholarship offices (backend
// routes/messages.js): the AdSO, plus each office they applied to (POLCA,
// Alumni…) or that wrote to them. "New message" starts one with any
// partner office. Each office has its own conversation.
// One panel like a chat app: offices on the left, the open conversation on
// the right; on a phone, the list first and the conversation full width
// with a back arrow. Opening one marks that office's messages read; it
// refreshes every 20 seconds while open.

const ADSO = 'LSO';
const ADSO_FALLBACK: MessageOffice = { code: ADSO, name: 'Admissions and Scholarship Office (AdSO)', short: 'AdSO', started: true, unread: 0, last: null };

const timeLabel = (iso: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })
    : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
};

// "Admissions and Scholarship Office (AdSO)" → "Admissions and Scholarship Office".
const fullName = (o: MessageOffice) => o.name.replace(/\s*\([^)]*\)\s*$/, '') || o.short;
// Two letters for the office's badge: "AdSO" → "AD", "POLCA" → "PO", "Alumni Office" → "AO".
const initials = (o: MessageOffice) => {
  const words = o.short.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : o.short.slice(0, 2)).toUpperCase();
};

function OfficeBadge({ office, size = 'md', active = false }: { office: MessageOffice; size?: 'sm' | 'md'; active?: boolean }) {
  const isAdso = office.code === ADSO;
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-bold tracking-tight ${size === 'sm' ? 'h-8 w-8 text-[11px]' : 'h-10 w-10 text-xs'} ${
        active || isAdso ? 'bg-brand-green text-white' : 'bg-brand-green/10 text-brand-green'
      }`}
    >
      {initials(office)}
    </span>
  );
}

export default function Messages({ applications: _applications }: { applications: Application[] }) {
  const { getToken } = useAuth();
  const [offices, setOffices] = useState<MessageOffice[]>([ADSO_FALLBACK]);
  const [office, setOffice] = useState(ADSO);
  // On a phone: showing the conversation (true) or the list.
  const [mobileOpen, setMobileOpen] = useState(false);
  // Offices picked from "New message" this visit.
  const [picked, setPicked] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
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
    setOffices(prev => prev.map(o => (o.code === office ? { ...o, started: true, last: message } : o)));
  };

  const current = offices.find(o => o.code === office) ?? ADSO_FALLBACK;
  // AdSO first, then the most recent conversations.
  const listed = offices.filter(o => o.started || o.code === office || picked.includes(o.code));
  const others = offices.filter(o => !listed.includes(o));
  const totalUnread = offices.reduce((n, o) => n + o.unread, 0);

  const open = (code: string) => { setOffice(code); setMobileOpen(true); };
  const pick = (code: string) => {
    setPicked(p => (p.includes(code) ? p : [...p, code]));
    setPicking(false);
    open(code);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900">Messages</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500 sm:text-sm">
            Ask the AdSO or a partner office a question, or send them a file. Replies also reach your school Outlook.
          </p>
        </div>
      </div>

      <div className="flex h-[min(76dvh,720px)] min-h-[28rem] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        {/* Offices */}
        <aside className={`relative w-full flex-col border-slate-200 md:flex md:w-72 md:border-r lg:w-80 ${mobileOpen ? 'hidden' : 'flex'}`}>
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-slate-900">
              Offices{totalUnread > 0 && <span className="ml-1.5 rounded-full bg-brand-green px-1.5 py-px text-[11px] font-bold text-white tabular-nums">{totalUnread}</span>}
            </p>
            {others.length > 0 && (
              <button
                type="button"
                onClick={() => setPicking(true)}
                aria-expanded={picking}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-brand-green transition-colors hover:bg-brand-green/10 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green"
              >
                <MessageSquarePlus className="h-4 w-4" aria-hidden /> New message
              </button>
            )}
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto p-2" aria-label="Your conversations">
            {listed.map(o => {
              const active = o.code === office;
              const preview = o.last ? (o.last.body || (o.last.attachments.length ? '📎 Attachment' : '')) : 'Start the conversation';
              return (
                <li key={o.code}>
                  <button
                    type="button"
                    onClick={() => open(o.code)}
                    aria-current={active ? 'true' : undefined}
                    className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green ${
                      active ? 'bg-brand-green/[0.07]' : 'hover:bg-slate-50'
                    }`}
                  >
                    {active && <span aria-hidden className="absolute inset-y-2 left-0 hidden w-1 rounded-full bg-brand-green md:block" />}
                    <OfficeBadge office={o} active={active} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className={`truncate text-sm ${o.unread ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'}`}>{o.short}</span>
                        {o.last && <span className="ml-auto shrink-0 text-[11px] text-slate-400 tabular-nums">{timeLabel(o.last.createdAt)}</span>}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className={`truncate text-xs ${o.unread ? 'font-semibold text-slate-700' : o.last ? 'text-slate-500' : 'italic text-slate-400'}`}>
                          {o.last?.from === 'student' ? 'You: ' : ''}{preview}
                        </span>
                        {o.unread > 0 && (
                          <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-green px-1.5 text-[11px] font-bold text-white tabular-nums" aria-label={`${o.unread} unread`}>
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

          {others.length > 0 && listed.length < 3 && !picking && (
            <p className="border-t border-slate-100 px-4 py-3 text-xs leading-relaxed text-slate-500">
              Need POLCA, the Alumni Office or another partner office? Use <span className="font-semibold text-brand-green">New message</span>.
            </p>
          )}

          {picking && <OfficePicker offices={others} onPick={pick} onClose={() => setPicking(false)} />}
        </aside>

        {/* Conversation */}
        <section className={`min-w-0 flex-1 flex-col bg-slate-50 md:flex ${mobileOpen ? 'flex' : 'hidden'}`} aria-label={`Conversation with ${current.short}`}>
          <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-3 py-3 sm:px-5">
            <button type="button" onClick={() => setMobileOpen(false)} aria-label="Back to offices" className="-ml-1 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <OfficeBadge office={current} size="sm" active />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900">{fullName(current)}</p>
              <p className="truncate text-xs text-slate-500">Replies during office hours, Mon–Fri</p>
            </div>
          </header>
          {error && !messages ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-sm font-semibold text-rose-900">{error}</p>
              <button type="button" onClick={load} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-50">
                <RefreshCw className="h-3.5 w-3.5" /> Try again
              </button>
            </div>
          ) : !messages ? (
            <div role="status" className="flex-1 space-y-4 p-5">
              <span className="sr-only">Loading messages</span>
              {['w-2/3', 'w-1/2 ml-auto', 'w-3/5'].map(w => <div key={w} className={`h-12 animate-pulse rounded-2xl bg-slate-200/70 ${w}`} />)}
            </div>
          ) : (
            <Conversation
              key={office}
              className="min-h-0 flex-1"
              messages={messages}
              viewer="student"
              getToken={getToken}
              onSend={send}
              emptyText={`No messages yet. Say hello to the ${current.code === ADSO ? 'AdSO' : current.short} below.`}
              placeholder={`Message ${current.short}…`}
            />
          )}
        </section>
      </div>
    </div>
  );
}

// "New message": the partner offices the student hasn't written to yet,
// searchable; laid over the office list.
function OfficePicker({ offices, onPick, onClose }: { offices: MessageOffice[]; onPick: (code: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const q = query.trim().toLowerCase();
  const shown = offices.filter(o => !q || o.name.toLowerCase().includes(q) || o.short.toLowerCase().includes(q));
  return (
    <div role="dialog" aria-label="New message: choose an office" className="absolute inset-0 z-10 flex flex-col bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-bold text-slate-900">New message</p>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
      </div>
      <div className="px-3 pt-3">
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 focus-within:border-brand-green focus-within:ring-2 focus-within:ring-brand-green/20">
          <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Find an office…"
            aria-label="Find an office"
            className="min-w-0 flex-1 bg-transparent text-base sm:text-sm focus:outline-hidden"
          />
        </label>
      </div>
      <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Partner offices</p>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {shown.map(o => (
          <li key={o.code}>
            <button type="button" onClick={() => onPick(o.code)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-slate-50 focus:bg-slate-50 focus:outline-hidden">
              <OfficeBadge office={o} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-800">{o.short}</span>
                {fullName(o) !== o.short && <span className="block truncate text-xs text-slate-500">{fullName(o)}</span>}
              </span>
            </button>
          </li>
        ))}
        {!shown.length && <li className="px-3 py-8 text-center text-sm text-slate-500">No office matches “{query}”.</li>}
      </ul>
    </div>
  );
}
