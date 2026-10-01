import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@clerk/react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Megaphone, Plus, Pin, PinOff, Pencil, Trash2, X, AlertCircle, Clock, Send, FileEdit,
  Calendar, Award, Bell, Facebook, ExternalLink, RotateCw
} from 'lucide-react';
import {
  Button, EmptyState, ErrorBanner, KpiCard, PageHeader, SearchInput, SelectInput, SkeletonRows, TabBar, Tag, controlClass
} from './AdminUI';

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

const CATEGORY_TONES: Record<Category, 'blue' | 'green' | 'rose' | 'amber'> = {
  'General': 'blue',
  'Update': 'green',
  'Deadline': 'rose',
  'Event': 'amber'
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
function FacebookStatusPill({ status }: { status: FacebookStatus }) {
  if (status === 'none') return null;
  const config: Record<Exclude<FacebookStatus, 'none'>, { label: string; tone: 'slate' | 'blue' | 'rose'; icon: React.ElementType }> = {
    pending: { label: 'Posting…', tone: 'slate', icon: Clock },
    posted: { label: 'On Facebook', tone: 'blue', icon: Facebook },
    failed: { label: 'Facebook post failed', tone: 'rose', icon: AlertCircle }
  };
  const c = config[status];
  return (
    <Tag tone={c.tone}>
      <c.icon className={`w-3 h-3 ${status === 'pending' ? 'animate-pulse' : ''}`} />
      {c.label}
    </Tag>
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
        role="dialog"
        aria-modal="true"
        aria-labelledby="announcement-editor-title"
        className="bg-white sm:rounded-xl shadow-2xl ring-1 ring-slate-200 w-full h-full sm:h-auto sm:max-w-2xl sm:max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h3 id="announcement-editor-title" className="text-base font-semibold text-slate-900">
              {isEdit ? 'Edit announcement' : 'New announcement'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Published announcements appear on every student's dashboard.</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          <ErrorBanner message={error} />

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              maxLength={150}
              placeholder="e.g. 1st Semester Scholarship Application Window Now Open"
              className={`${controlClass} px-3 py-2`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Summary</label>
            <p className="text-xs text-slate-500 -mt-1 mb-1.5">Shown on the collapsed card, and used as the Facebook post text.</p>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              maxLength={500}
              placeholder="One or two sentences summarizing the announcement..."
              className={`${controlClass} px-3 py-2 resize-none`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Full content</label>
            <p className="text-xs text-slate-500 -mt-1 mb-1.5">Shown when a student expands the announcement.</p>
            <textarea
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              rows={8}
              maxLength={8000}
              placeholder="Write the full announcement..."
              className={`${controlClass} px-3 py-2 resize-y`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Category</label>
              <SelectInput value={form.category} onChange={v => setForm(f => ({ ...f, category: v as Category }))} ariaLabel="Category">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </SelectInput>
            </div>
            <label className="flex items-center gap-2 cursor-pointer h-9.5">
              <input
                type="checkbox"
                checked={form.isPinned}
                onChange={e => setForm(f => ({ ...f, isPinned: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-300 accent-brand-green"
              />
              <span className="text-sm text-slate-700 flex items-center gap-1.5">
                <Pin className="w-4 h-4 text-slate-400" /> Pin to top of feed
              </span>
            </label>
          </div>

          {/* Facebook cross-post toggle. Only meaningful when this save
              actually publishes — greyed out with an explanatory note
              while the form is in "Save Draft" territory, rather than
              hiding it and making the option feel undiscoverable. */}
          <label className="flex items-start gap-3 p-3.5 rounded-lg ring-1 ring-inset ring-slate-200 bg-slate-50/60 cursor-pointer">
            <input
              type="checkbox"
              checked={form.crosspostToFacebook}
              onChange={e => setForm(f => ({ ...f, crosspostToFacebook: e.target.checked }))}
              className="w-4 h-4 mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
            />
            <span className="min-w-0">
              <span className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
                <Facebook className="w-4 h-4 text-blue-600" />
                Also post to the AniSkolar Facebook Page
              </span>
              <span className="block text-xs text-slate-500 mt-0.5 leading-relaxed">
                Uses the title, description, and a link back to this announcement. Only happens when you hit Publish — saving as a draft never posts.
              </span>
            </span>
          </label>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-5 py-3.5 border-t border-slate-100 bg-slate-50/60 shrink-0">
          <Button onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button
            icon={FileEdit}
            onClick={() => onSave(form, false)}
            disabled={isSaving || !form.title.trim() || !form.description.trim() || !form.content.trim()}
          >
            Save as draft
          </Button>
          <Button
            variant="primary"
            icon={Send}
            loading={isSaving}
            onClick={() => onSave(form, true)}
            disabled={isSaving || !form.title.trim() || !form.description.trim() || !form.content.trim()}
          >
            {form.crosspostToFacebook ? 'Publish & post to Facebook' : 'Publish'}
          </Button>
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
        role="alertdialog"
        aria-modal="true"
        className="bg-white rounded-xl shadow-2xl ring-1 ring-slate-200 w-full max-w-md p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-base font-semibold text-slate-900">Delete announcement?</p>
            <p className="text-sm text-slate-500 mt-1 wrap-break-word">"{announcement.title}" will be permanently removed for everyone. This can't be undone.</p>
            {announcement.facebookStatus === 'posted' && (
              <p className="text-[11px] text-amber-600 font-semibold mt-2 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>This won't remove the linked Facebook post — take that down separately on the Page if needed.</span>
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button onClick={onCancel} disabled={isDeleting}>Cancel</Button>
          <Button
            icon={Trash2}
            loading={isDeleting}
            onClick={onConfirm}
            disabled={isDeleting}
            className="!bg-rose-600 !text-white hover:!bg-rose-700 !ring-0"
          >
            Delete
          </Button>
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

  const statusTabs: { key: AnnouncementStatus | 'All'; label: string; count: number }[] = [
    { key: 'All', label: 'All', count: stats.total },
    { key: 'published', label: 'Published', count: stats.published },
    { key: 'draft', label: 'Drafts', count: stats.draft }
  ];
  const filtersActive = search.trim() !== '' || statusFilter !== 'All' || facebookFilter !== 'All';

  return (
    <div id={id} className="space-y-6">
      <PageHeader
        title="Announcements"
        description="Post and manage the official updates students see on their dashboard."
        actions={<Button variant="primary" icon={Plus} onClick={openCreate}>New announcement</Button>}
      />

      <ErrorBanner message={loadError} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Published" value={stats.published} hint="Visible to students" icon={Send} tone="green" />
        <KpiCard label="Drafts" value={stats.draft} hint="Not yet visible" icon={FileEdit} tone="amber" />
        <KpiCard label="Pinned" value={stats.pinned} hint="Shown at the top" icon={Pin} tone="sky" />
        <KpiCard label="On Facebook" value={stats.onFacebook} hint="Cross-posted to the Page" icon={Facebook} tone="violet" />
      </div>

      <section className="bg-white rounded-xl border border-slate-200/80 shadow-[0_1px_2px_rgba(16,24,40,0.04)] min-w-0">
        <div className="px-3 sm:px-4">
          <TabBar<AnnouncementStatus | 'All'> tabs={statusTabs} value={statusFilter} onChange={setStatusFilter} className="border-slate-100" />
        </div>
        <div className="p-4 flex flex-col md:flex-row gap-3 border-b border-slate-100">
          <SearchInput value={search} onChange={setSearch} placeholder="Search announcements…" className="flex-1" />
          <SelectInput value={facebookFilter} onChange={v => setFacebookFilter(v as FacebookStatus | 'All')} className="md:w-56" ariaLabel="Filter by Facebook status">
            <option value="All">Any Facebook status</option>
            <option value="posted">On Facebook</option>
            <option value="pending">Posting…</option>
            <option value="failed">Failed</option>
            <option value="none">Not cross-posted</option>
          </SelectInput>
        </div>

        {isLoading ? (
          <SkeletonRows rows={3} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title={filtersActive ? 'No announcements match your filters' : 'No announcements yet'}
            description={filtersActive ? 'Try a different search or filter.' : 'Create your first announcement to keep students informed.'}
            action={filtersActive
              ? <Button size="sm" onClick={() => { setSearch(''); setStatusFilter('All'); setFacebookFilter('All'); }}>Clear filters</Button>
              : <Button size="sm" variant="primary" icon={Plus} onClick={openCreate}>New announcement</Button>}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map(a => {
              const CategoryIcon = CATEGORY_ICONS[a.category] ?? Bell;
              return (
                <li key={a.id} className="group px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 hover:bg-slate-50/60 transition-colors">
                  <div className={`hidden sm:flex w-9 h-9 rounded-lg items-center justify-center shrink-0 ${a.isPinned ? 'bg-emerald-50 text-brand-green' : 'bg-slate-100 text-slate-500'}`}>
                    {a.isPinned ? <Pin className="w-4 h-4" /> : <CategoryIcon className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium text-slate-900 mr-1">{a.title}</p>
                      <Tag tone={CATEGORY_TONES[a.category] ?? 'blue'}><CategoryIcon className="w-3 h-3" />{a.category}</Tag>
                      {a.status === 'published' ? <Tag tone="green">Published</Tag> : <Tag>Draft</Tag>}
                      {a.isPinned && <Tag tone="green"><Pin className="w-3 h-3" />Pinned</Tag>}
                      <FacebookStatusPill status={a.facebookStatus} />
                    </div>
                    <p className="text-sm text-slate-500 line-clamp-2 mt-1 wrap-break-word">{a.description}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-400">
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {a.status === 'published' ? `Published ${formatDateTime(a.publishedAt)}` : `Updated ${formatDateTime(a.updatedAt)}`}</span>
                      {a.facebookStatus === 'posted' && a.facebookPostUrl && (
                        <a href={a.facebookPostUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-600 hover:text-blue-700">
                          <ExternalLink className="w-3.5 h-3.5" /> View on Facebook
                        </a>
                      )}
                      {a.facebookStatus === 'failed' && a.facebookError && (
                        <span className="flex items-center gap-1 text-rose-600 wrap-break-word">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {a.facebookError}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 self-start">
                    {/* Cross-post action: only offered for published posts.
                        Shows "Post" when never tried, "Retry" after a failure. */}
                    {a.status === 'published' && a.facebookStatus !== 'posted' && a.facebookStatus !== 'pending' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={a.facebookStatus === 'failed' ? RotateCw : Facebook}
                        loading={postingFacebookId === a.id}
                        disabled={postingFacebookId === a.id}
                        onClick={() => postToFacebook(a, a.facebookStatus === 'failed')}
                        title={a.facebookStatus === 'failed' ? 'Retry posting to Facebook' : 'Post to Facebook'}
                        aria-label={a.facebookStatus === 'failed' ? 'Retry posting to Facebook' : 'Post to Facebook'}
                      />
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={a.isPinned ? PinOff : Pin}
                      loading={togglingPinId === a.id}
                      disabled={togglingPinId === a.id}
                      onClick={() => togglePin(a)}
                      title={a.isPinned ? 'Unpin' : 'Pin'}
                      aria-label={a.isPinned ? 'Unpin' : 'Pin'}
                    />
                    <Button size="sm" variant="ghost" icon={Pencil} onClick={() => openEdit(a)} title="Edit" aria-label="Edit" />
                    <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setPendingDelete(a)} title="Delete" aria-label="Delete" className="hover:!text-rose-600 hover:!bg-rose-50" />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

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