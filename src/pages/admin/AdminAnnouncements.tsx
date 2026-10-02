import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import {
  AlertCircle, Award, Bell, Calendar, Clock, ExternalLink, Facebook, FileEdit, Megaphone, Pencil, Pin, PinOff, Plus,
  RefreshCw, RotateCw, Send, Trash2
} from 'lucide-react';
import { API_BASE_URL, authHeaders, formatDateTime } from './adminData';
import {
  Alert, Badge, Button, Card, Checkbox, ConfirmDialog, EmptyState, ErrorState, Field, IconButton, KpiCard, KpiGrid, Modal,
  PageHeader, SearchInput, Select, TableSkeleton, Tabs, TextInput, Textarea, Toolbar, Tone
} from './AdminUI';

// Matches frontend/src/types.ts `Announcement['category']` exactly.
const CATEGORIES = ['General', 'Update', 'Deadline', 'Event'] as const;
type Category = typeof CATEGORIES[number];
type AnnouncementStatus = 'draft' | 'published';

// Lifecycle of the Facebook cross-post, independent of the announcement's
// own draft/published status:
//   none    — never requested
//   pending — request sent to the backend, waiting on the Graph API call
//   posted  — live on the Page, facebookPostUrl is populated
//   failed  — Graph API call errored, facebookError has the reason
type FacebookStatus = 'none' | 'pending' | 'posted' | 'failed';

// Shape returned by GET /api/announcements: the frontend Announcement type
// plus admin-only fields (status, isPinned, publishedAt, createdBy, ...)
// and the Facebook cross-post fields.
//
// BACKEND CONTRACT for Facebook cross-posting (not yet implemented server-side):
//   - Announcement documents gain: facebookStatus, facebookPostId,
//     facebookPostUrl, facebookError, facebookPostedAt.
//   - POST /api/announcements/:id/facebook triggers (or retries) the
//     cross-post for a published announcement and returns the updated
//     announcement. Calling it again after 'posted' should return the
//     existing post unless the body has { force: true }.
//   - POST /api/announcements and PATCH /api/announcements/:id accept an
//     optional `crosspostToFacebook: boolean`; when true and status is being
//     set to 'published', the backend cross-posts right after saving.
//   - DELETE /api/announcements/:id does NOT delete the Facebook post
//     (surfaced in the delete confirmation).
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

const FACEBOOK_DEFAULTS = { facebookStatus: 'none' as FacebookStatus, facebookPostUrl: null, facebookError: null, facebookPostedAt: null };

const CATEGORY_ICONS: Record<Category, React.ElementType> = {
  General: Megaphone,
  Update: Award,
  Deadline: Clock,
  Event: Calendar
};

const FACEBOOK_BADGE: Record<Exclude<FacebookStatus, 'none'>, { label: string; tone: Tone; icon: React.ElementType }> = {
  pending: { label: 'Posting to Facebook…', tone: 'neutral', icon: Clock },
  posted: { label: 'On Facebook', tone: 'info', icon: Facebook },
  failed: { label: 'Facebook post failed', tone: 'danger', icon: AlertCircle }
};

// --- Editor (create + edit share one form) -----------------------------------

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

const LIMITS = { title: 150, description: 500, content: 8000 };
type TextField = keyof typeof LIMITS;
const FIELD_LABELS: Record<TextField, string> = { title: 'Title', description: 'Summary', content: 'Full content' };

function validate(form: EditorState): Partial<Record<TextField, string>> {
  const errors: Partial<Record<TextField, string>> = {};
  if (!form.title.trim()) errors.title = 'Enter a title.';
  if (!form.description.trim()) errors.description = 'Enter a short summary.';
  if (!form.content.trim()) errors.content = 'Enter the full announcement.';
  return errors;
}

function AnnouncementEditor({ initial, onClose, onSave, isSaving, error }: {
  initial: EditorState;
  onClose: () => void;
  onSave: (form: EditorState, publish: boolean) => void;
  isSaving: boolean;
  error: string;
}) {
  const [form, setForm] = useState<EditorState>(initial);
  // Errors stay hidden until the first save attempt, then update live.
  const [attempted, setAttempted] = useState(false);
  const [savingAs, setSavingAs] = useState<'draft' | 'publish' | null>(null);
  const refs = {
    title: useRef<HTMLInputElement>(null),
    description: useRef<HTMLTextAreaElement>(null),
    content: useRef<HTMLTextAreaElement>(null)
  };
  const isEdit = !!initial.id;
  const errors = attempted ? validate(form) : {};
  const errorFields = Object.keys(errors) as TextField[];

  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) => setForm(f => ({ ...f, [key]: value }));

  const submit = (publish: boolean) => {
    setAttempted(true);
    const found = validate(form);
    const first = (['title', 'description', 'content'] as TextField[]).find(k => found[k]);
    if (first) {
      refs[first].current?.focus();
      return;
    }
    setSavingAs(publish ? 'publish' : 'draft');
    onSave(form, publish);
  };

  const counter = (key: TextField) => `${form[key].length}/${LIMITS[key]}`;

  return (
    <Modal
      title={isEdit ? 'Edit announcement' : 'New announcement'}
      description="Published announcements appear on every student's dashboard."
      onClose={onClose}
      dismissible={!isSaving}
      initialFocusRef={refs.title}
      footer={
        <>
          <Button onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button icon={FileEdit} loading={isSaving && savingAs === 'draft'} disabled={isSaving} onClick={() => submit(false)}>
            Save as draft
          </Button>
          <Button variant="primary" icon={Send} loading={isSaving && savingAs === 'publish'} disabled={isSaving} onClick={() => submit(true)}>
            {form.crosspostToFacebook ? 'Publish and post to Facebook' : 'Publish'}
          </Button>
        </>
      }
    >
      <form className="space-y-5" onSubmit={e => { e.preventDefault(); submit(true); }} noValidate>
        {error && <Alert tone="danger" title="Couldn't save the announcement">{error}</Alert>}
        {errorFields.length > 0 && (
          <Alert tone="danger" title={`Fix ${errorFields.length === 1 ? 'this field' : `these ${errorFields.length} fields`} before saving`}>
            {errorFields.map(k => FIELD_LABELS[k]).join(', ')}
          </Alert>
        )}

        <Field label="Title" error={errors.title} labelAside={counter('title')}>
          <TextInput
            ref={refs.title}
            value={form.title}
            onChange={e => set('title', e.target.value)}
            maxLength={LIMITS.title}
            placeholder="e.g. 1st Semester Scholarship Application Window Now Open"
            disabled={isSaving}
          />
        </Field>

        <Field
          label="Summary"
          helper="Shown on the collapsed card and used as the Facebook post text."
          error={errors.description}
          labelAside={counter('description')}
        >
          <Textarea
            ref={refs.description}
            value={form.description}
            onChange={e => set('description', e.target.value)}
            rows={2}
            maxLength={LIMITS.description}
            placeholder="One or two sentences summarizing the announcement…"
            className="resize-none"
            disabled={isSaving}
          />
        </Field>

        <Field
          label="Full content"
          helper="Shown when a student expands the announcement."
          error={errors.content}
          labelAside={counter('content')}
        >
          <Textarea
            ref={refs.content}
            value={form.content}
            onChange={e => set('content', e.target.value)}
            rows={8}
            maxLength={LIMITS.content}
            placeholder="Write the full announcement…"
            className="resize-y"
            disabled={isSaving}
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Category">
            <Select value={form.category} onChange={v => set('category', v as Category)} disabled={isSaving}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <div className="sm:pt-7">
            <Checkbox
              checked={form.isPinned}
              onChange={v => set('isPinned', v)}
              disabled={isSaving}
              label="Pin to top of feed"
              description="Pinned announcements stay above newer ones."
            />
          </div>
        </div>

        <div className="rounded-control bg-surface-muted p-4 ring-1 ring-inset ring-line">
          <Checkbox
            checked={form.crosspostToFacebook}
            onChange={v => set('crosspostToFacebook', v)}
            disabled={isSaving}
            label="Also post to the AniSkolar Facebook Page"
            description="Uses the title, summary, and a link back to this announcement. Only happens when you publish; saving a draft never posts."
          />
        </div>
      </form>
    </Modal>
  );
}

// --- Page ----------------------------------------------------------------------

export default function AdminAnnouncements({ id }: { id?: string }) {
  const { getToken } = useAuth();

  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // Failures of row actions (pin, Facebook) that don't invalidate the list.
  const [actionError, setActionError] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AnnouncementStatus | 'All'>('All');
  const [facebookFilter, setFacebookFilter] = useState<FacebookStatus | 'All'>('All');

  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [pendingDelete, setPendingDelete] = useState<AdminAnnouncement | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [togglingPinId, setTogglingPinId] = useState<string | null>(null);
  const [postingFacebookId, setPostingFacebookId] = useState<string | null>(null);

  const fetchAnnouncements = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/announcements`, { headers: await authHeaders(getToken) });
      if (!response.ok) throw new Error('The server returned an error while loading announcements.');
      const body = await response.json();
      // Facebook fields are additive; default them so older records render.
      setAnnouncements((body.announcements ?? []).map((a: Partial<AdminAnnouncement>) => ({ ...FACEBOOK_DEFAULTS, ...a })));
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
    const q = search.trim().toLowerCase();
    return announcements.filter(a => {
      if (statusFilter !== 'All' && a.status !== statusFilter) return false;
      if (facebookFilter !== 'All' && a.facebookStatus !== facebookFilter) return false;
      if (q && !a.title.toLowerCase().includes(q) && !a.description.toLowerCase().includes(q)) return false;
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
      // Never pre-checked, so editing a live post doesn't re-trigger it.
      crosspostToFacebook: false
    });
  };

  const saveAnnouncement = async (form: EditorState, publish: boolean) => {
    setIsSaving(true);
    setSaveError('');
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        content: form.content.trim(),
        category: form.category,
        isPinned: form.isPinned,
        status: publish ? 'published' : 'draft',
        // The backend only acts on this when publishing in this request.
        crosspostToFacebook: publish && form.crosspostToFacebook
      };
      const isEdit = !!form.id;
      const response = await fetch(`${API_BASE_URL}/api/announcements${isEdit ? `/${form.id}` : ''}`, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: await authHeaders(getToken, true),
        body: JSON.stringify(payload)
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Failed to save announcement.');
      const saved: AdminAnnouncement = { ...FACEBOOK_DEFAULTS, ...body.announcement };
      setAnnouncements(prev => (prev.some(a => a.id === saved.id) ? prev.map(a => (a.id === saved.id ? saved : a)) : [saved, ...prev]));
      setEditorState(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save announcement.');
    } finally {
      setIsSaving(false);
    }
  };

  const togglePin = async (a: AdminAnnouncement) => {
    setTogglingPinId(a.id);
    setActionError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/announcements/${a.id}`, {
        method: 'PATCH',
        headers: await authHeaders(getToken, true),
        body: JSON.stringify({ isPinned: !a.isPinned })
      });
      if (!response.ok) throw new Error();
      const body = await response.json();
      setAnnouncements(prev => prev.map(x => (x.id === a.id ? { ...x, ...body.announcement } : x)));
    } catch {
      setActionError(`Couldn't ${a.isPinned ? 'unpin' : 'pin'} "${a.title}". Please try again.`);
    } finally {
      setTogglingPinId(null);
    }
  };

  // Posts (or retries) the Facebook cross-post for a published announcement.
  // The row flips to 'pending' so repeated clicks are visibly blocked.
  const postToFacebook = async (a: AdminAnnouncement, force = false) => {
    setPostingFacebookId(a.id);
    setAnnouncements(prev => prev.map(x => (x.id === a.id ? { ...x, facebookStatus: 'pending', facebookError: null } : x)));
    try {
      const response = await fetch(`${API_BASE_URL}/api/announcements/${a.id}/facebook`, {
        method: 'POST',
        headers: await authHeaders(getToken, true),
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
    setDeleteError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/announcements/${pendingDelete.id}`, {
        method: 'DELETE',
        headers: await authHeaders(getToken, true)
      });
      if (!response.ok) throw new Error();
      setAnnouncements(prev => prev.filter(a => a.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch {
      setDeleteError("Couldn't delete the announcement. Please try again.");
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
  const hasData = announcements.length > 0;
  const firstLoad = isLoading && !hasData;
  const failedEmpty = !!loadError && !hasData && !isLoading;
  const kpiValue = (n: number) => (failedEmpty ? '—' : n);

  return (
    <div id={id} className="space-y-6">
      <PageHeader
        title="Announcements"
        description="Post and manage the official updates students see on their dashboard."
        actions={
          <>
            <Button icon={RefreshCw} loading={isLoading} onClick={fetchAnnouncements}>Refresh</Button>
            <Button variant="primary" icon={Plus} onClick={openCreate}>New announcement</Button>
          </>
        }
      />

      {loadError && hasData && (
        <Alert tone="danger" title="Couldn't refresh announcements" action={<Button size="sm" onClick={fetchAnnouncements}>Try again</Button>}>
          {loadError} Showing the last loaded list.
        </Alert>
      )}
      {actionError && <Alert tone="danger" onDismiss={() => setActionError('')}>{actionError}</Alert>}

      <KpiGrid>
        <KpiCard label="Published" value={kpiValue(stats.published)} hint="Visible to students" icon={Send} tone="success" loading={firstLoad} />
        <KpiCard label="Drafts" value={kpiValue(stats.draft)} hint="Not yet visible" icon={FileEdit} tone="warning" loading={firstLoad} />
        <KpiCard label="Pinned" value={kpiValue(stats.pinned)} hint="Shown at the top" icon={Pin} tone="accent" loading={firstLoad} />
        <KpiCard label="On Facebook" value={kpiValue(stats.onFacebook)} hint="Cross-posted to the Page" icon={Facebook} tone="info" loading={firstLoad} />
      </KpiGrid>

      <Card
        flush
        headerSlot={
          <>
            <Tabs<AnnouncementStatus | 'All'> tabs={statusTabs} value={statusFilter} onChange={setStatusFilter} label="Filter by status" />
            <Toolbar>
              <SearchInput value={search} onChange={setSearch} label="Search announcements" placeholder="Search title or summary…" className="flex-1" />
              <Select value={facebookFilter} onChange={v => setFacebookFilter(v as FacebookStatus | 'All')} className="md:w-56" label="Filter by Facebook status">
                <option value="All">Any Facebook status</option>
                <option value="posted">On Facebook</option>
                <option value="pending">Posting…</option>
                <option value="failed">Failed</option>
                <option value="none">Not cross-posted</option>
              </Select>
            </Toolbar>
          </>
        }
      >
        {firstLoad ? (
          <TableSkeleton rows={3} label="Loading announcements" />
        ) : failedEmpty ? (
          <ErrorState title="Couldn't load announcements" message={loadError} onRetry={fetchAnnouncements} retrying={isLoading} />
        ) : filtered.length === 0 ? (
          filtersActive ? (
            <EmptyState
              icon={Megaphone}
              title="No announcements match your filters"
              description="Try a different search or filter."
              action={<Button onClick={() => { setSearch(''); setStatusFilter('All'); setFacebookFilter('All'); }}>Clear filters</Button>}
            />
          ) : (
            <EmptyState
              icon={Megaphone}
              title="No announcements yet"
              description="Create your first announcement to keep students informed."
              action={<Button variant="primary" icon={Plus} onClick={openCreate}>New announcement</Button>}
            />
          )
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map(a => {
              const CategoryIcon = CATEGORY_ICONS[a.category] ?? Bell;
              const fb = a.facebookStatus !== 'none' ? FACEBOOK_BADGE[a.facebookStatus] : null;
              const canPostToFacebook = a.status === 'published' && a.facebookStatus !== 'posted' && a.facebookStatus !== 'pending';
              return (
                <li key={a.id} className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-surface-muted sm:flex-row sm:items-start sm:gap-4">
                  <span className={`hidden size-9 shrink-0 items-center justify-center rounded-control sm:flex ${a.isPinned ? 'bg-accent-subtle text-accent' : 'bg-neutral-bg text-ink-muted'}`}>
                    {a.isPinned ? <Pin className="size-4" aria-label="Pinned" /> : <CategoryIcon className="size-4" aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="mr-1 text-sm font-medium text-ink wrap-break-word">{a.title}</h3>
                      {a.status === 'published' ? <Badge tone="success" dot>Published</Badge> : <Badge dot>Draft</Badge>}
                      <Badge icon={CategoryIcon}>{a.category}</Badge>
                      {a.isPinned && <Badge tone="accent" icon={Pin}>Pinned</Badge>}
                      {fb && <Badge tone={fb.tone} icon={fb.icon}>{fb.label}</Badge>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-ink-muted wrap-break-word">{a.description}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-subtle">
                      <span className="flex items-center gap-1 tabular-nums">
                        <Clock className="size-3.5" aria-hidden />
                        {a.status === 'published' ? `Published ${formatDateTime(a.publishedAt)}` : `Updated ${formatDateTime(a.updatedAt)}`}
                      </span>
                      {a.facebookStatus === 'posted' && a.facebookPostUrl && (
                        <a href={a.facebookPostUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-badge font-medium text-info-fg hover:underline">
                          <ExternalLink className="size-3.5" aria-hidden /> View on Facebook
                        </a>
                      )}
                      {a.facebookStatus === 'failed' && a.facebookError && (
                        <span className="flex items-center gap-1 text-danger wrap-break-word">
                          <AlertCircle className="size-3.5 shrink-0" aria-hidden /> {a.facebookError}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 self-start">
                    {canPostToFacebook && (
                      <IconButton
                        icon={a.facebookStatus === 'failed' ? RotateCw : Facebook}
                        label={a.facebookStatus === 'failed' ? `Retry posting "${a.title}" to Facebook` : `Post "${a.title}" to Facebook`}
                        loading={postingFacebookId === a.id}
                        onClick={() => postToFacebook(a, a.facebookStatus === 'failed')}
                      />
                    )}
                    <IconButton
                      icon={a.isPinned ? PinOff : Pin}
                      label={`${a.isPinned ? 'Unpin' : 'Pin'} "${a.title}"`}
                      loading={togglingPinId === a.id}
                      onClick={() => togglePin(a)}
                    />
                    <IconButton icon={Pencil} label={`Edit "${a.title}"`} onClick={() => openEdit(a)} />
                    <IconButton
                      icon={Trash2}
                      label={`Delete "${a.title}"`}
                      onClick={() => { setDeleteError(''); setPendingDelete(a); }}
                      className="hover:bg-danger-bg hover:text-danger"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {editorState && (
        <AnnouncementEditor
          initial={editorState}
          onClose={() => setEditorState(null)}
          onSave={saveAnnouncement}
          isSaving={isSaving}
          error={saveError}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          tone="danger"
          title="Delete announcement?"
          description={<>"{pendingDelete.title}" will be permanently removed for everyone. This can't be undone.</>}
          confirmLabel="Delete"
          confirmIcon={Trash2}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
          busy={isDeleting}
          error={deleteError}
        >
          {pendingDelete.facebookStatus === 'posted' && (
            <Alert tone="warning">This won't remove the linked Facebook post. Take that down separately on the Page if needed.</Alert>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
