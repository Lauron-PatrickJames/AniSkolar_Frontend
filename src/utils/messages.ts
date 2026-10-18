import { useEffect, useState } from 'react';

// Messages between a student and the AdSO (backend routes/messages.js):
// one conversation per student. Attachments need the session token, so
// they're fetched and shown from a blob: URL (like utils/documents.ts).

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

type GetToken = () => Promise<string | null>;

export interface MessageAttachment {
  fileId: string;
  filename: string;
  mimetype: string;
  size: number;
}

export interface ChatMessage {
  _id: string;
  from: 'student' | 'adso';
  authorName?: string;
  body: string;
  attachments: MessageAttachment[];
  applicationId: string | null;
  applicationRef: string | null;
  readAt: string | null;
  createdAt: string;
}

// Same limits as the server.
export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_ATTACHMENTS = 3;
export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
export const ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

// Fired after a conversation is marked read, so unread badges refresh.
export const MESSAGES_READ_EVENT = 'aniskolar:messages-read';

async function fetchAttachment(fileId: string, getToken: GetToken): Promise<string> {
  const token = await getToken();
  const res = await fetch(`${API_BASE_URL}/api/messages/files/${fileId}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
  if (!res.ok) throw new Error(res.status === 404 ? 'File not found.' : "Couldn't load the file.");
  return URL.createObjectURL(await res.blob());
}

export function useAttachmentUrl(fileId: string | null, getToken: GetToken): { url: string | null; error: string } {
  const [state, setState] = useState<{ url: string | null; error: string }>({ url: null, error: '' });
  useEffect(() => {
    if (!fileId) return;
    let url: string | null = null;
    let cancelled = false;
    fetchAttachment(fileId, getToken)
      .then(u => { if (cancelled) URL.revokeObjectURL(u); else { url = u; setState({ url: u, error: '' }); } })
      .catch(err => { if (!cancelled) setState({ url: null, error: err instanceof Error ? err.message : "Couldn't load the file." }); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [fileId, getToken]);
  return state;
}

// Opens an attachment in a new tab (opened inside the click so it isn't
// blocked as a pop-up).
export async function openAttachment(fileId: string, getToken: GetToken): Promise<void> {
  const win = window.open('', '_blank');
  try {
    const url = await fetchAttachment(fileId, getToken);
    if (win) win.location.href = url; else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    win?.close();
    throw err;
  }
}

// Sends a message (multipart). Returns the saved message or throws.
export async function postMessage(url: string, getToken: GetToken, data: { body: string; files: File[]; applicationId?: string }): Promise<ChatMessage> {
  const fd = new FormData();
  fd.append('body', data.body);
  if (data.applicationId) fd.append('applicationId', data.applicationId);
  data.files.forEach(f => fd.append('files', f));
  const token = await getToken();
  const res = await fetch(`${API_BASE_URL}${url}`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : undefined, body: fd });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Couldn't send the message.");
  return body.message;
}

export { API_BASE_URL as MESSAGES_API_BASE };
