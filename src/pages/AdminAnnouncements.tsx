import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@clerk/react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Megaphone, Plus, Pin, PinOff, Pencil, Trash2, X, CheckCircle,
  AlertCircle, Clock, Send, FileEdit, ChevronDown, Search, Calendar, Award, Bell,
  Facebook, ExternalLink, RotateCw
} from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

// Matches frontend/src/types.ts `Announcement['category']` exactly.
const CATEGORIES = ['General', 'Update', 'Deadline', 'Event'] as const;
type Category = typeof CATEGORIES[number];
type AnnouncementStatus = 'draft' | 'published';

// Lifecycle of the Facebook cross-post, independent of the announcement's
// own draft/published status — an announcement can be published on the
// portal without ever touching Facebook (facebookStatus stays 'none').
//   none    — never requested
//   pending — request sent to the backend, waiting on the Graph API call
//   posted  — live on the Page, facebookPostUrl is populated
//   failed  — Graph API call errored, facebookError has the reason
type FacebookStatus = 'none' | 'pending' | 'posted' | 'failed';

// Shape returned by GET /api/announcements — the frontend Announcement type
// (id, title, date, description, content, category) plus admin-only
// extensions the API adds (status, isPinned, publishedAt, createdBy, etc)
// and the Facebook cross-post fields below.
//
// BACKEND CONTRACT for Facebook cross-posting (not yet implemented server-side):
//   - Announcement documents gain: facebookStatus, facebookPostId,
//     facebookPostUrl, facebookError, facebookPostedAt.
//   - POST /api/announcements/:id/facebook
//       Triggers (or retries) the cross-post for an already-published
//       announcement. Requires a Facebook Page access token stored server
//       side (Graph API `POST /{page-id}/feed` with `message` built from
//       title + description + a link back to the portal). Returns the
//       updated announcement. Should be idempotent-ish: calling it again
//       after a 'posted' state should just return the existing post rather
//       than duplicate-posting, unless the caller passes `{ force: true }`.
//   - POST /api/announcements (create) and PATCH /api/announcements/:id
//       accept an optional `crosspostToFacebook: boolean` in the body —
//       when true and status is being set to 'published', the backend
//       kicks off the same Graph API call as above right after saving.
//   - DELETE /api/announcements/:id does NOT delete the Facebook post
//     (admins may want the public post to stay up even if it's archived
//     on the portal) — surfaced via a note in the delete-confirm dialog.
interface AdminAnnouncement {
  id: string;
  title: string;
  date: string;
  description: string;
  content: string;
  category: Category;
  status: AnnouncementStatus;
  isPinned: boolean;
  publishedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  facebookStatus: FacebookStatus;
  facebookPostUrl: string | null;
  facebookError: string | null;
  facebookPostedAt: string | null;
}

const CATEGORY_STYLES: Record<Category, string> = {
  'General': 'bg-blue-50 text-blue-700',
  'Update': 'bg-emerald-50 text-brand-green',
  'Deadline': 'bg-rose-50 text-rose-600',
  'Event': 'bg-amber-50 text-amber-600'
};

const CATEGORY_ICONS: Record<Category, React.ElementType> = {
  'General': Megaphone,
  'Update': Award,
  'Deadline': Clock,
  'Event': Calendar
};

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Small pill shown next to the status badge in the list, and reused in the
// editor's "also post to Facebook" section. Keeps the same visual weight as
// the existing published/draft pill so it doesn't compete for attention.
function FacebookStatusPill({ status, compact = false }: { status: FacebookStatus; compact?: boolean }) {
  if (status === 'none') return null;
  const config: Record<Exclude<FacebookStatus, 'none'>, { label: string; classes: string; icon: React.ElementType }> = {
    pending: { label: 'Posting…', classes: 'bg-slate-100 text-slate-500', icon: Clock },
    posted: { label: 'On Facebook', classes: 'bg-blue-50 text-blue-700', icon: Facebook },
    failed: { label: 'FB post failed', classes: 'bg-rose-50 text-rose-600', icon: AlertCircle }
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${c.classes}`}>
      <c.icon className={`w-3 h-3 ${status === 'pending' ? 'animate-pulse' : ''}`} />
      {!compact && c.label}
    </span>
  );
}

// --- Editor modal (create + edit share one form) ---------------------------

interface EditorState {
  id?: string;
  title: string;
  description: string;
  content: string;
  category: Category;
  isPinned: boolean;
  crosspostToFacebook: boolean;
}

const BLANK_FORM: EditorState = {
  title: '', description: '', content: '', category: 'General', isPinned: false, crosspostToFacebook: false
};

function AnnouncementEditor({
  initial, onClose, onSave, isSaving, error
}: {
  initial: EditorState;
  onClose: () => void;
  onSave: (form: EditorState, publish: boolean) => void;
  isSaving: boolean;
  error: string;
}) {
  const [form, setForm] = useState<EditorState>(initial);
  const isEdit = !!initial.id;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.97 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="bg-white sm:rounded-2xl shadow-2xl w-full h-full sm:h-auto sm:max-w-xl sm:max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
          <h3 className="font-display font-bold text-sm text-slate-900 uppercase tracking-wider">
            {isEdit ? 'Edit Announcement' : 'New Announcement'}
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 text-rose-700 rounded-lg border border-rose-100 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              maxLength={150}
              placeholder="e.g. 1st Semester Scholarship Application Window Now Open"
              className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Description <span className="text-slate-300 normal-case font-normal">— short teaser shown on the collapsed card, and used as the Facebook post text</span>
            </label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              maxLength={500}
              placeholder="One or two sentences summarizing the announcement..."
              className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all resize-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Full Content <span className="text-slate-300 normal-case font-normal">— shown when the card is expanded</span>
            </label>
            <textarea
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              rows={8}
              maxLength={8000}
              placeholder="Write the full announcement..."
              className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all resize-none font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Category</label>
              <div className="relative">
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value as Category }))}
                  className="w-full appearance-none px-3.5 py-2.5 pr-9 border border-slate-200 rounded-xl text-xs font-semibold bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer h-[42px]">
              <input
                type="checkbox"
                checked={form.isPinned}
                onChange={e => setForm(f => ({ ...f, isPinned: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-300 text-brand-green focus:ring-brand-green/30"
              />
              <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                <Pin className="w-3.5 h-3.5" /> Pin to top of feed
              </span>
            </label>
          </div>

          {/* Facebook cross-post toggle. Only meaningful when this save
              actually publishes — greyed out with an explanatory note
              while the form is in "Save Draft" territory, rather than
              hiding it and making the option feel undiscoverable. */}
          <label className="flex items-start gap-2.5 p-3.5 rounded-xl border border-slate-100 bg-slate-50/60 cursor-pointer">
            <input
              type="checkbox"
              checked={form.crosspostToFacebook}
              onChange={e => setForm(f => ({ ...f, crosspostToFacebook: e.target.checked }))}
              className="w-4 h-4 mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
            />
            <span className="min-w-0">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Facebook className="w-3.5 h-3.5 text-blue-600" />
                Also post to the AniSkolar Facebook Page
              </span>
              <span className="block text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                Uses the title, description, and a link back to this announcement. Only happens when you hit Publish — saving as a draft never posts.
              </span>
            </span>
          </label>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-5 py-4 border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(form, false)}
            disabled={isSaving || !form.title.trim() || !form.description.trim() || !form.content.trim()}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileEdit className="w-3.5 h-3.5" />
            Save Draft
          </button>
          <button
            type="button"
            onClick={() => onSave(form, true)}
            disabled={isSaving || !form.title.trim() || !form.description.trim() || !form.content.trim()}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-white bg-brand-green hover:bg-brand-green-dark shadow-md shadow-emerald-900/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {form.crosspostToFacebook ? 'Publish & Post to Facebook' : 'Publish'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// --- Delete confirmation -----------------------------------------------

function DeleteConfirm({ announcement, onCancel, onConfirm, isDeleting }: { announcement: AdminAnnouncement; onCancel: () => void; onConfirm: () => void; isDeleting: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-lg bg-rose-50 text-rose-600 shrink-0">
            <Trash2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800">Delete announcement?</p>
            <p className="text-xs text-slate-500 mt-1 break-words">"{announcement.title}" will be permanently removed for everyone.</p>
            {announcement.facebookStatus === 'posted' && (
              <p className="text-[11px] text-amber-600 font-semibold mt-2 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>This won't remove the linked Facebook post — take that down separately on the Page if needed.</span>
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={isDeleting} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-white bg-rose-600 hover:bg-rose-700 transition-colors disabled:opacity-50"
          >
            {isDeleting ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Delete
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// --- Main component --------------------------------------------------------

export default function AdminAnnouncements({ id }: { id?: string }) {
  const { getToken } = useAuth();

  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AnnouncementStatus | 'All'>('All');
  const [facebookFilter, setFacebookFilter] = useState<FacebookStatus | 'All'>('All');

  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [pendingDelete, setPendingDelete] = useState<AdminAnnouncement | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [togglingPinId, setTogglingPinId] = useState<string | null>(null);
  const [postingFacebookId, setPostingFacebookId] = useState<string | null>(null);

  const authHeaders = async () => {
    const token = await getToken();
    return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  };

  const fetchAnnouncements = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/announcements`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      if (!response.ok) throw new Error('Failed to load announcements.');
      const body = await response.json();
      // Backend fields are additive (facebookStatus etc.) — default them so
      // older records or an unmigrated API response don't break rendering.
      const normalized: AdminAnnouncement[] = (body.announcements ?? []).map((a: Partial<AdminAnnouncement>) => ({
        facebookStatus: 'none',
        facebookPostUrl: null,
        facebookError: null,
        facebookPostedAt: null,
        ...a
      }));
      setAnnouncements(normalized);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Something went wrong loading announcements.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    return announcements.filter(a => {
      if (statusFilter !== 'All' && a.status !== statusFilter) return false;
      if (facebookFilter !== 'All' && a.facebookStatus !== facebookFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!a.title.toLowerCase().includes(q) && !a.description.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [announcements, search, statusFilter, facebookFilter]);

  const stats = useMemo(() => ({
    total: announcements.length,
    published: announcements.filter(a => a.status === 'published').length,
    draft: announcements.filter(a => a.status === 'draft').length,
    pinned: announcements.filter(a => a.isPinned).length,
    onFacebook: announcements.filter(a => a.facebookStatus === 'posted').length
  }), [announcements]);

  const openCreate = () => { setSaveError(''); setEditorState({ ...BLANK_FORM }); };
  const openEdit = (a: AdminAnnouncement) => {
    setSaveError('');
    setEditorState({
      id: a.id,
      title: a.title,
      description: a.description,
      content: a.content,
      category: a.category,
      isPinned: a.isPinned,
      // Re-offer cross-posting only if it hasn't already gone out, so
      // editing a live Facebook post doesn't silently re-trigger it.
      crosspostToFacebook: false
    });
  };

  const saveAnnouncement = async (form: EditorState, publish: boolean) => {
    setIsSaving(true);
    setSaveError('');
    try {
      const headers = await authHeaders();
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        content: form.content.trim(),
        category: form.category,
        isPinned: form.isPinned,
        status: publish ? 'published' : 'draft',
        // Backend only acts on this when status is being set to 'published'
        // in this same request — see BACKEND CONTRACT note above the type.
        crosspostToFacebook: publish && form.crosspostToFacebook
      };
      const isEdit = !!form.id;
      const response = await fetch(
        `${API_BASE_URL}/api/announcements${isEdit ? `/${form.id}` : ''}`,
        { method: isEdit ? 'PATCH' : 'POST', headers, body: JSON.stringify(payload) }
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to save announcement.');
      }
      const body = await response.json();
      const saved: AdminAnnouncement = { facebookStatus: 'none', facebookPostUrl: null, facebookError: null, facebookPostedAt: null, ...body.announcement };
      setAnnouncements(prev => {
        const exists = prev.some(a => a.id === saved.id);
        return exists ? prev.map(a => (a.id === saved.id ? saved : a)) : [saved, ...prev];
      });
      setEditorState(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save announcement.');
    } finally {
      setIsSaving(false);
    }
  };

  const togglePin = async (a: AdminAnnouncement) => {
    setTogglingPinId(a.id);
    try {
      const headers = await authHeaders();
      const response = await fetch(`${API_BASE_URL}/api/announcements/${a.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ isPinned: !a.isPinned })
      });
      if (!response.ok) throw new Error();
      const body = await response.json();
      setAnnouncements(prev => prev.map(x => (x.id === a.id ? { ...x, ...body.announcement } : x)));
    } catch {
      setLoadError('Failed to update pin status.');
    } finally {
      setTogglingPinId(null);
    }
  };

  // Posts (or retries) the Facebook cross-post for an already-published
  // announcement. Optimistically flips the row to 'pending' so repeated
  // clicks are visibly disabled while the request is in flight.
  const postToFacebook = async (a: AdminAnnouncement, force = false) => {
    setPostingFacebookId(a.id);
    setAnnouncements(prev => prev.map(x => (x.id === a.id ? { ...x, facebookStatus: 'pending', facebookError: null } : x)));
    try {
      const headers = await authHeaders();
      const response = await fetch(`${API_BASE_URL}/api/announcements/${a.id}/facebook`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ force })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Facebook post failed.');
      setAnnouncements(prev => prev.map(x => (x.id === a.id ? { ...x, ...body.announcement } : x)));
    } catch (err) {
      setAnnouncements(prev => prev.map(x => (x.id === a.id
        ? { ...x, facebookStatus: 'failed', facebookError: err instanceof Error ? err.message : 'Facebook post failed.' }
        : x)));
    } finally {
      setPostingFacebookId(null);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      const headers = await authHeaders();
      const response = await fetch(`${API_BASE_URL}/api/announcements/${pendingDelete.id}`, { method: 'DELETE', headers });
      if (!response.ok) throw new Error();
      setAnnouncements(prev => prev.filter(a => a.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch {
      setLoadError('Failed to delete announcement.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div id={id} className="space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display font-black text-lg sm:text-xl md:text-2xl text-slate-900 tracking-tight">Announcements</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">Post and manage official updates shown to applicants.</p>
        </div>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white bg-brand-green hover:bg-brand-green-dark px-4 py-2.5 rounded-xl shadow-md shadow-emerald-900/10 transition-all shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          New Announcement
        </motion.button>
      </div>

      {loadError && (
        <div className="p-4 bg-rose-50 text-rose-800 rounded-xl border border-rose-100 text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
        {[
          { label: 'Total', value: stats.total, icon: Megaphone, accent: 'bg-slate-50 text-slate-500' },
          { label: 'Published', value: stats.published, icon: Send, accent: 'bg-emerald-50 text-brand-green' },
          { label: 'Drafts', value: stats.draft, icon: FileEdit, accent: 'bg-amber-50 text-amber-600' },
          { label: 'Pinned', value: stats.pinned, icon: Pin, accent: 'bg-sky-50 text-sky-600' },
          { label: 'On Facebook', value: stats.onFacebook, icon: Facebook, accent: 'bg-blue-50 text-blue-600' }
        ].map(s => (
          <div key={s.label} className="p-3.5 sm:p-5 rounded-xl border border-slate-100 bg-white card-shadow min-w-0">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{s.label}</p>
                <h3 className="text-2xl sm:text-3xl font-display font-extrabold text-brand-green mt-1">{s.value}</h3>
              </div>
              <div className={`p-2 sm:p-2.5 rounded-lg shrink-0 ${s.accent}`}>
                <s.icon className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-100 card-shadow">
        <div className="p-4 md:p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search announcements..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all placeholder:text-slate-300"
            />
          </div>
          <div className="flex gap-3">
            <div className="relative flex-1 md:flex-none">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as AnnouncementStatus | 'All')}
                className="w-full appearance-none pl-3.5 pr-9 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all"
              >
                <option value="All">All Statuses</option>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            <div className="relative flex-1 md:flex-none">
              <select
                value={facebookFilter}
                onChange={e => setFacebookFilter(e.target.value as FacebookStatus | 'All')}
                className="w-full appearance-none pl-3.5 pr-9 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all"
              >
                <option value="All">Any Facebook Status</option>
                <option value="posted">On Facebook</option>
                <option value="pending">Posting…</option>
                <option value="failed">Failed</option>
                <option value="none">Not Cross-posted</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-xs text-slate-400 font-semibold">Loading announcements...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Megaphone className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-400">No announcements match your filters.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map(a => {
              const CategoryIcon = CATEGORY_ICONS[a.category] ?? Bell;
              return (
                <div key={a.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      {a.isPinned && <Pin className="w-3.5 h-3.5 text-brand-green shrink-0" />}
                      <p className="text-sm font-bold text-slate-800 truncate">{a.title}</p>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${CATEGORY_STYLES[a.category] ?? CATEGORY_STYLES.General}`}>
                        <CategoryIcon className="w-3 h-3" />
                        {a.category}
                      </span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${a.status === 'published' ? 'bg-emerald-50 text-brand-green' : 'bg-slate-100 text-slate-500'}`}>
                        {a.status}
                      </span>
                      <FacebookStatusPill status={a.facebookStatus} />
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-2 break-words">{a.description}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-400 font-semibold">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {a.status === 'published' ? `Published ${formatDateTime(a.publishedAt)}` : `Updated ${formatDateTime(a.updatedAt)}`}</span>
                      {a.facebookStatus === 'posted' && a.facebookPostUrl && (
                        <a
                          href={a.facebookPostUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
                        >
                          <ExternalLink className="w-3 h-3" /> View on Facebook
                        </a>
                      )}
                      {a.facebookStatus === 'failed' && a.facebookError && (
                        <span className="flex items-center gap-1 text-rose-500 break-words">
                          <AlertCircle className="w-3 h-3 shrink-0" /> {a.facebookError}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 self-start">
                    {/* Cross-post action: only offered for published posts.
                        Shows "Post" when never tried, "Retry" after a
                        failure — same button, different affordance. */}
                    {a.status === 'published' && a.facebookStatus !== 'posted' && a.facebookStatus !== 'pending' && (
                      <button
                        type="button"
                        onClick={() => postToFacebook(a, a.facebookStatus === 'failed')}
                        disabled={postingFacebookId === a.id}
                        title={a.facebookStatus === 'failed' ? 'Retry posting to Facebook' : 'Post to Facebook'}
                        className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
                      >
                        {a.facebookStatus === 'failed' ? <RotateCw className="w-4 h-4" /> : <Facebook className="w-4 h-4" />}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => togglePin(a)}
                      disabled={togglingPinId === a.id}
                      title={a.isPinned ? 'Unpin' : 'Pin'}
                      className="p-2 rounded-lg text-slate-400 hover:text-brand-green hover:bg-emerald-50 transition-colors disabled:opacity-50"
                    >
                      {togglingPinId === a.id ? (
                        <span className="w-4 h-4 border-2 border-slate-200 border-t-brand-green rounded-full animate-spin block" />
                      ) : a.isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(a)}
                      title="Edit"
                      className="p-2 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(a)}
                      title="Delete"
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {editorState && (
          <AnnouncementEditor
            initial={editorState}
            onClose={() => setEditorState(null)}
            onSave={saveAnnouncement}
            isSaving={isSaving}
            error={saveError}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pendingDelete && (
          <DeleteConfirm
            announcement={pendingDelete}
            onCancel={() => setPendingDelete(null)}
            onConfirm={confirmDelete}
            isDeleting={isDeleting}
          />
        )}
      </AnimatePresence>
    </div>
  );
}