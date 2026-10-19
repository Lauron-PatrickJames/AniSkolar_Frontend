import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { findExplicitWords } from '../../utils/profanity';
import { FileText, Loader2, Paperclip, Send, X } from 'lucide-react';
import {
  ATTACHMENT_TYPES, ChatMessage, MAX_ATTACHMENTS, MAX_ATTACHMENT_SIZE, MAX_MESSAGE_LENGTH, MessageAttachment, openAttachment, useAttachmentUrl
} from '../../utils/messages';

// A student ↔ AdSO conversation: messages oldest first (yours on the
// right), then a box to write one, with up to 3 JPG/PNG/PDF attachments
// and, optionally, which application it's about. Used by the student's
// Messages page and the AdSO's.

type GetToken = () => Promise<string | null>;

interface Props {
  messages: ChatMessage[];
  viewer: 'student' | 'adso' | 'office';
  // Where attachments are served from (office heads have their own path).
  filesPath?: string;
  getToken: GetToken;
  // The student's applications, to say which one a message is about.
  applications?: { id: string; label: string }[];
  onSend: (data: { body: string; files: File[]; applicationId?: string }) => Promise<void>;
  emptyText: string;
  placeholder?: string;
  className?: string;
  // Extra controls by the Attach button (the AdSO's message templates):
  // given the current text and a way to replace it.
  composerTools?: (body: string, setBody: (text: string) => void) => React.ReactNode;
}

const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
const sizeLabel = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function Conversation({ messages, viewer, filesPath, getToken, applications = [], onSend, emptyText, placeholder, className = '', composerTools }: Props) {
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [applicationId, setApplicationId] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Explicit words in the draft: warned about here, refused by the server.
  const explicit = useMemo(() => findExplicitWords(body), [body]);

  // Keep the newest message in view.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (!ATTACHMENT_TYPES.includes(f.type)) { setError(`${f.name}: attach JPG, PNG or PDF files only.`); continue; }
      if (f.size > MAX_ATTACHMENT_SIZE) { setError(`${f.name} is over 10 MB.`); continue; }
      if (next.length >= MAX_ATTACHMENTS) { setError(`Attach at most ${MAX_ATTACHMENTS} files.`); break; }
      next.push(f);
    }
    setFiles(next);
    if (fileRef.current) fileRef.current.value = '';
  };

  const send = async () => {
    if (sending) return;
    if (!body.trim() && !files.length) { setError('Write a message or attach a file.'); return; }
    if (explicit.length) { setError('Please remove the inappropriate language before sending.'); return; }
    setSending(true);
    setError('');
    try {
      await onSend({ body: body.trim(), files, applicationId: applicationId || undefined });
      setBody('');
      setFiles([]);
      setApplicationId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the message.");
    } finally {
      setSending(false);
    }
  };

  let lastDay = '';
  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5" aria-live="polite">
        {messages.length === 0 && <p className="py-10 text-center text-sm text-slate-500">{emptyText}</p>}
        {messages.map(m => {
          const mine = m.from === viewer;
          const day = dayLabel(m.createdAt);
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <React.Fragment key={m._id}>
              {showDay && <p className="pt-2 text-center text-[11px] font-semibold text-slate-400">{day}</p>}
              <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 py-2.5 text-sm shadow-xs ${mine ? 'bg-brand-green text-white rounded-br-md' : 'bg-white text-slate-800 ring-1 ring-slate-200 rounded-bl-md'}`}>
                  {!mine && <p className="mb-0.5 text-[11px] font-bold text-slate-500">{m.authorName || (m.from === 'adso' ? 'Admissions and Scholarship Office' : m.from === 'office' ? 'Office' : 'Student')}</p>}
                  {m.applicationRef && (
                    <p className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${mine ? 'bg-white/20' : 'bg-slate-100 text-slate-600'}`}>About {m.applicationRef}</p>
                  )}
                  {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                  {m.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {m.attachments.map(a => <Attachment key={a.fileId} file={a} mine={mine} getToken={getToken} filesPath={filesPath} />)}
                    </div>
                  )}
                  <p className={`mt-1 text-right text-[10px] ${mine ? 'text-white/75' : 'text-slate-400'}`}>
                    {timeLabel(m.createdAt)}{mine && m.readAt ? ' · Seen' : ''}
                  </p>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <form
        className="space-y-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-5"
        onSubmit={e => { e.preventDefault(); send(); }}
      >
        {error && <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p>}
        {files.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700">
                <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                <span className="max-w-40 truncate">{f.name}</span>
                <span className="text-slate-400">{sizeLabel(f.size)}</span>
                <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} className="rounded p-0.5 text-slate-400 hover:text-rose-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }}
          maxLength={MAX_MESSAGE_LENGTH}
          rows={3}
          placeholder={placeholder || 'Write a message…'}
          aria-label="Message"
          aria-invalid={explicit.length > 0 || undefined}
          aria-describedby={explicit.length ? 'message-explicit-warning' : undefined}
          className="w-full resize-y rounded-xl border border-slate-200 px-3.5 py-2.5 text-base sm:text-sm focus:border-brand-green focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 aria-[invalid=true]:border-amber-400 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-amber-200"
        />
        {explicit.length > 0 && (
          <p id="message-explicit-warning" role="alert" className="text-xs font-semibold text-amber-700">
            Please remove inappropriate language ({explicit.join(', ')}). Messages with it can't be sent. If you're reporting something someone said, describe it without the word.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" multiple accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" className="hidden" onChange={e => addFiles(e.target.files)} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={files.length >= MAX_ATTACHMENTS || sending}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <Paperclip className="h-4 w-4" /> Attach
          </button>
          {composerTools?.(body, setBody)}
          {applications.length > 0 && (
            <select
              value={applicationId}
              onChange={e => setApplicationId(e.target.value)}
              aria-label="Which application this is about"
              className="min-w-0 max-w-full flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 sm:flex-none"
            >
              <option value="">Not about a specific application</option>
              {applications.map(a => <option key={a.id} value={a.id}>About {a.label}</option>)}
            </select>
          )}
          <span className="ml-auto hidden text-[11px] text-slate-400 sm:inline">Ctrl+Enter to send</span>
          <button
            type="submit"
            disabled={sending || explicit.length > 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-green px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-brand-green-dark disabled:opacity-60"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
          </button>
        </div>
        <p className="text-[11px] text-slate-400">JPG, PNG or PDF, up to {MAX_ATTACHMENTS} files of 10 MB each.</p>
      </form>
    </div>
  );
}

function Attachment({ file, mine, getToken, filesPath }: { file: MessageAttachment; mine: boolean; getToken: GetToken; filesPath?: string }) {
  const isImage = file.mimetype.startsWith('image/');
  const { url } = useAttachmentUrl(isImage ? file.fileId : null, getToken, filesPath);
  const [error, setError] = useState('');
  useEffect(() => setError(''), [file.fileId]);
  const open = () => openAttachment(file.fileId, getToken, filesPath).catch(err => setError(err instanceof Error ? err.message : "Couldn't open the file."));
  if (isImage) {
    return (
      <button type="button" onClick={open} className="overflow-hidden rounded-lg ring-1 ring-black/10" aria-label={`Open ${file.filename}`}>
        {url ? <img src={url} alt={file.filename} className="h-28 w-28 object-cover" /> : <span className="flex h-28 w-28 items-center justify-center bg-slate-100"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></span>}
      </button>
    );
  }
  return (
    <button type="button" onClick={open} className={`flex max-w-56 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs ${mine ? 'bg-white/15 hover:bg-white/25' : 'bg-slate-100 hover:bg-slate-200'}`}>
      <FileText className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0">
        <span className="block truncate font-semibold">{file.filename}</span>
        <span className={mine ? 'text-white/75' : 'text-slate-500'}>{error || `PDF · ${sizeLabel(file.size)}`}</span>
      </span>
    </button>
  );
}
