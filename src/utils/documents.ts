import { useEffect, useState } from 'react';

// Stored documents (GET /api/applications/documents/:fileId) need the
// session token, so they can't be a plain <img src> or link: they're
// fetched with it and shown from a local blob: URL instead.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

type GetToken = () => Promise<string | null>;

async function fetchDocument(fileId: string, getToken: GetToken): Promise<string> {
  const token = await getToken();
  const res = await fetch(`${API_BASE_URL}/api/applications/documents/${fileId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(res.status === 404 ? 'File not found.' : "Couldn't load the file.");
  return URL.createObjectURL(await res.blob());
}

// The file as a blob: URL for previews and download links; null while it
// loads. Revoked when the component unmounts or the file changes.
export function useDocumentUrl(fileId: string | null | undefined, getToken: GetToken): { url: string | null; error: string } {
  const [state, setState] = useState<{ url: string | null; error: string }>({ url: null, error: '' });
  useEffect(() => {
    if (!fileId) return;
    let url: string | null = null;
    let cancelled = false;
    setState({ url: null, error: '' });
    fetchDocument(fileId, getToken)
      .then(u => {
        if (cancelled) URL.revokeObjectURL(u);
        else { url = u; setState({ url: u, error: '' }); }
      })
      .catch(err => { if (!cancelled) setState({ url: null, error: err instanceof Error ? err.message : "Couldn't load the file." }); });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [fileId, getToken]);
  return state;
}

// Opens a file in a new tab. The tab is opened right away (inside the
// click, so it isn't blocked as a pop-up) and pointed at the file once it
// has loaded.
export async function openDocument(fileId: string, getToken: GetToken): Promise<void> {
  const win = window.open('', '_blank');
  try {
    const url = await fetchDocument(fileId, getToken);
    if (win) win.location.href = url;
    else window.location.href = url;
    // The new tab has its own copy once loaded.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    win?.close();
    throw err;
  }
}
