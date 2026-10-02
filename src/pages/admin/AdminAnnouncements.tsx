import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import {
  AlertCircle, Award, Bell, Calendar, Clock, ExternalLink, Facebook, FileEdit, ImagePlus, Megaphone, Pencil, Pin, PinOff,
  Plus, RefreshCw, RotateCw, Send, Trash2, X
} from 'lucide-react';
import { API_BASE_URL, authHeaders, formatDateTime } from './adminData';
import { mockScholarships } from '../../data/scholarships';
import {
  Alert, Badge, Button, Card, Checkbox, ConfirmDialog, EmptyState, ErrorState, Field, IconButton, KpiCard, KpiGrid, Modal,
  PageHeader, SearchInput, Select, TableSkeleton, Tabs, TextInput, Textarea, Toolbar, Tone
} from './AdminUI';

// Matches frontend/src/types.ts `Announcement['category']` exactly.
const CATEGORIES = ['General', 'Update', 'Deadline', 'Event'] as const;
type Category = typeof CATEGORIES[number];
type AnnouncementStatus = 'draft' | 'published';

// Facebook Page cross-post state, owned by the backend (services/facebook.js):
//   not_posted — not on the Page (draft, or "Also post to Facebook" off)
//   posted     — live on the Page; fbPermalink links to it
//   failed     — the last publish / edit / delete failed; fbError says why
// The post exists while the announcement is published and fbEnabled is on.
type FbStatus = 'not_posted' | 'posted' | 'failed';

// Shape returned by GET /api/announcements (Announcement.toClientShape).
interface AdminAnnouncement {
  id: string;
  title: string;
  date: string;
  description: string;
  content: string;
  category: Category;
  scholarshipId?: string | null;
  status: AnnouncementStatus;
  isPinned: boolean;
  publishedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  imageUrl: string | null;
  fbEnabled: boolean;
  fbStatus: FbStatus;
  fbPostId: string | null;
  fbPermalink: string | null;
  fbError: string | null;
  fbLastSyncedAt: string | null;
}

// Result of the Facebook step returned alongside a saved announcement.
interface FacebookResult {
  ok: boolean;
  error?: string;
  tokenExpired?: boolean;
}

const FB_DEFAULTS: Pick<AdminAnnouncement, 'imageUrl' | 'fbEnabled' | 'fbStatus' | 'fbPostId' | 'fbPermalink' | 'fbError' | 'fbLastSyncedAt'> = {
  imageUrl: null, fbEnabled: false, fbStatus: 'not_posted', fbPostId: null, fbPermalink: null, fbError: null, fbLastSyncedAt: null
};

const normalize = (raw: Partial<AdminAnnouncement>): AdminAnnouncement => ({ ...FB_DEFAULTS, ...raw } as AdminAnnouncement);

const SCHOLARSHIP_NAMES: Record<string, string> = Object.fromEntries(mockScholarships.map(s => [s.id, s.name]));

const imageSrc = (url: string | null) => (url ? `${API_BASE_URL}${url}` : null);

const CATEGORY_ICONS: Record<Category, React.ElementType> = {
  General: Megaphone,
  Update: Award,
  Deadline: Clock,
  Event: Calendar
};

const FB_BADGE: Record<FbStatus, { label: string; tone: Tone }> = {
  posted: { label: 'Posted', tone: 'info' },
  not_posted: { label: 'Not posted', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'danger' }
};

// The Facebook post text: title, blank line, body. Must match
// composeMessage() in the backend's services/facebook.js.
function facebookMessage(title: string, content: string): string {
  return `${title.trim()}\n\n${content.trim()}`.trim();
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// --- Editor (create + edit share one form) -----------------------------------

interface EditorState {
  id?: string;
  status?: AnnouncementStatus;   // current status when editing
  title: string;
  description: string;
  content: string;
  category: Category;
  scholarshipId: string;         // '' = not about a specific scholarship
  isPinned: boolean;
  fbEnabled: boolean;
  existingImageUrl: string | null;  // image already saved on the announcement
}

interface ImageChange {
  file: File | null;   // newly picked image
  remove: boolean;     // remove the saved image
}

const BLANK_FORM: EditorState = {
  title: '', description: '', content: '', category: 'General', scholarshipId: '', isPinned: false, fbEnabled: true, existingImageUrl: null
};

const LIMITS = { title: 150, description: 500, content: 8000 };
type TextField = keyof typeof LIMITS;
const FIELD_LABELS: Record<TextField, string> = { title: 'Title', description: 'Summary', content: 'Body' };

function validate(form: EditorState): Partial<Record<TextField, string>> {
  const errors: Partial<Record<TextField, string>> = {};
  if (!form.title.trim()) errors.title = 'Enter a title.';
  if (!form.description.trim()) errors.description = 'Enter a short summary.';
  if (!form.content.trim()) errors.content = 'Enter the announcement body.';
  return errors;
}

// How the post will read on the Page. Plain, Facebook-like layout using the
// admin tokens; no attempt to imitate Facebook's own styling.
function FacebookPreview({ title, content, imageUrl }: { title: string; content: string; imageUrl: string | null }) {
  const message = facebookMessage(title, content);
  return (
    <div className="overflow-hidden rounded-control bg-surface ring-1 ring-line" aria-label="Facebook post preview">
      <div className="flex items-center gap-2.5 px-4 pt-3.5">
        <span className="flex size-9 items-center justify-center rounded-full bg-info-bg text-info-fg">
          <Facebook className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">AdSO Facebook Page</p>
          <p className="text-xs text-ink-subtle">Just now · Public</p>
        </div>
      </div>
      <p className="whitespace-pre-line px-4 py-3 text-sm text-ink wrap-break-word">
        {message || <span className="text-ink-subtle">Your title and body will appear here.</span>}
      </p>
      {imageUrl && <img src={imageUrl} alt="" className="max-h-72 w-full border-t border-line object-cover" />}
    </div>
  );
}

function AnnouncementEditor({ initial, onClose, onSave, isSaving, error }: {
  initial: EditorState;
  onClose: () => void;
  onSave: (form: EditorState, image: ImageChange, publish: boolean) => void;
  isSaving: boolean;
  error: string;
}) {
  const [form, setForm] = useState<EditorState>(initial);
  const [image, setImage] = useState<ImageChange>({ file: null, remove: false });
  const [imageError, setImageError] = useState('');
  // Errors stay hidden until the first save attempt, then update live.
  const [attempted, setAttempted] = useState(false);
  const [savingAs, setSavingAs] = useState<'draft' | 'publish' | null>(null);
  const refs = {
    title: useRef<HTMLInputElement>(null),
    description: useRef<HTMLTextAreaElement>(null),
    content: useRef<HTMLTextAreaElement>(null)
  };
  const fileInput = useRef<HTMLInputElement>(null);
  const isEdit = !!initial.id;
  const isLive = initial.status === 'published';
  const errors = attempted ? validate(form) : {};
  const errorFields = Object.keys(errors) as TextField[];

  // Object URL for a newly picked image, released when it changes.
  const [pickedUrl, setPickedUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!image.file) { setPickedUrl(null); return; }
    const url = URL.createObjectURL(image.file);
    setPickedUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image.file]);
  const previewImage = pickedUrl ?? (image.remove ? null : imageSrc(form.existingImageUrl));

  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) => setForm(f => ({ ...f, [key]: value }));

  const pickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!(file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name))) {
      setImageError('Use a JPG image.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError('The image must be under 10MB.');
      return;
    }
    setImageError('');
    setImage({ file, remove: false });
  };

  const removeImage = () => setImage({ file: null, remove: !!form.existingImageUrl });

  const submit = (publish: boolean) => {
    if (isSaving) return;
    setAttempted(true);
    const found = validate(form);
    const first = (['title', 'description', 'content'] as TextField[]).find(k => found[k]);
    if (first) {
      refs[first].current?.focus();
      return;
    }
    setSavingAs(publish ? 'publish' : 'draft');
    onSave(form, image, publish);
  };

  const counter = (key: TextField) => `${form[key].length}/${LIMITS[key]}`;
  const primaryLabel = isEdit && isLive
    ? 'Save changes'
    : form.fbEnabled ? 'Publish and post to Facebook' : 'Publish';
  const fbHelp = isLive && form.fbEnabled
    ? 'Saving updates the Facebook post. Turning this off deletes it from the Page.'
    : 'Posts to the Page when you publish. Saving a draft never posts.';

  return (
    <Modal
      title={isEdit ? 'Edit announcement' : 'New announcement'}
      description="Published announcements appear on every student's dashboard."
      onClose={onClose}
      dismissible={!isSaving}
      initialFocusRef={refs.title}
      size="lg"
      footer={
        <>
          <Button onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button icon={FileEdit} loading={isSaving && savingAs === 'draft'} disabled={isSaving} onClick={() => submit(false)}>
            {isLive ? 'Unpublish to draft' : 'Save as draft'}
          </Button>
          <Button variant="primary" icon={Send} loading={isSaving && savingAs === 'publish'} disabled={isSaving} onClick={() => submit(true)}>
            {primaryLabel}
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-6 lg:grid-cols-5" onSubmit={e => { e.preventDefault(); submit(true); }} noValidate>
        <div className="space-y-5 lg:col-span-3">
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

          <Field label="Summary" helper="Shown on the collapsed card in the student portal." error={errors.description} labelAside={counter('description')}>
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

          <Field label="Body" helper="Shown when a student expands the announcement, and posted to Facebook under the title." error={errors.content} labelAside={counter('content')}>
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

          <Field label="Image" optional helper="One JPG, up to 10MB. Changing the image replaces the Facebook post." error={imageError || undefined}>
            <div className="flex items-center gap-3">
              {previewImage && (
                <img src={previewImage} alt="Selected announcement image" className="size-16 shrink-0 rounded-control object-cover ring-1 ring-line" />
              )}
              <input ref={fileInput} type="file" accept=".jpg,.jpeg,image/jpeg" className="hidden" onChange={pickImage} disabled={isSaving} />
              <Button size="sm" icon={ImagePlus} onClick={() => fileInput.current?.click()} disabled={isSaving}>
                {previewImage ? 'Replace image' : 'Add image'}
              </Button>
              {previewImage && (
                <Button size="sm" variant="ghost" icon={X} onClick={removeImage} disabled={isSaving}>Remove</Button>
              )}
            </div>
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

          <Field label="Related scholarship" optional helper="The announcement also shows on that scholarship's page, e.g. varsity tryout dates on the Athletic Scholarship.">
            <Select value={form.scholarshipId} onChange={v => set('scholarshipId', v)} disabled={isSaving}>
              <option value="">None</option>
              {mockScholarships.map(sch => <option key={sch.id} value={sch.id}>{sch.name}</option>)}
            </Select>
          </Field>
        </div>

        <div className="space-y-3 lg:col-span-2">
          <div className="rounded-control bg-surface-muted p-4 ring-1 ring-inset ring-line">
            <Checkbox
              checked={form.fbEnabled}
              onChange={v => set('fbEnabled', v)}
              disabled={isSaving}
              label="Also post to Facebook"
              description={fbHelp}
            />
          </div>
          {form.fbEnabled && (
            <>
              <p className="text-xs font-medium text-ink-muted">Preview on Facebook</p>
              <FacebookPreview title={form.title} content={form.content} imageUrl={previewImage} />
            </>
          )}
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
  // Failures of row actions (pin, retry) that don't invalidate the list.
  const [actionError, setActionError] = useState('');
  // Saved-but-Facebook-failed outcomes, or delete warnings.
  const [facebookNotice, setFacebookNotice] = useState<{ title: string; message: string } | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AnnouncementStatus | 'All'>('All');
  const [facebookFilter, setFacebookFilter] = useState<FbStatus | 'All'>('All');

  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [pendingDelete, setPendingDelete] = useState<AdminAnnouncement | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [togglingPinId, setTogglingPinId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const upsert = (saved: AdminAnnouncement) =>
    setAnnouncements(prev => (prev.some(a => a.id === saved.id) ? prev.map(a => (a.id === saved.id ? saved : a)) : [saved, ...prev]));

  const reportFacebook = (title: string, result: FacebookResult | null | undefined) => {
    if (result && !result.ok) {
      setFacebookNotice({
        title: result.tokenExpired ? `${title} — the Facebook Page token needs renewing` : `${title}, but Facebook wasn't updated`,
        message: result.error || 'Facebook returned an error.'
      });
    }
  };

  const fetchAnnouncements = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/announcements`, { headers: await authHeaders(getToken) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'The server returned an error while loading announcements.');
      setAnnouncements((body.announcements ?? []).map(normalize));
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
      if (facebookFilter !== 'All' && a.fbStatus !== facebookFilter) return false;
      if (q && !a.title.toLowerCase().includes(q) && !a.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [announcements, search, statusFilter, facebookFilter]);

  const stats = useMemo(() => ({
    total: announcements.length,
    published: announcements.filter(a => a.status === 'published').length,
    draft: announcements.filter(a => a.status === 'draft').length,
    pinned: announcements.filter(a => a.isPinned).length,
    onFacebook: announcements.filter(a => a.fbStatus === 'posted').length
  }), [announcements]);

  const openCreate = () => { setSaveError(''); setEditorState({ ...BLANK_FORM }); };
  const openEdit = (a: AdminAnnouncement) => {
    setSaveError('');
    setEditorState({
      id: a.id,
      status: a.status,
      title: a.title,
      description: a.description,
      content: a.content,
      category: a.category,
      scholarshipId: a.scholarshipId ?? '',
      isPinned: a.isPinned,
      fbEnabled: a.fbEnabled,
      existingImageUrl: a.imageUrl
    });
  };

  // Multipart so the optional image travels with the fields. The backend
  // saves first, then publishes/updates the Facebook post, and reports the
  // Facebook outcome separately so a Facebook failure never loses the save.
  const saveAnnouncement = async (form: EditorState, image: ImageChange, publish: boolean) => {
    if (isSaving) return;
    setIsSaving(true);
    setSaveError('');
    setFacebookNotice(null);
    try {
      const data = new FormData();
      data.append('title', form.title.trim());
      data.append('description', form.description.trim());
      data.append('content', form.content.trim());
      data.append('category', form.category);
      data.append('scholarshipId', form.scholarshipId);
      data.append('isPinned', String(form.isPinned));
      data.append('status', publish ? 'published' : 'draft');
      data.append('fbEnabled', String(form.fbEnabled));
      if (image.file) data.append('image', image.file, image.file.name);
      else if (image.remove) data.append('removeImage', 'true');

      const isEdit = !!form.id;
      const response = await fetch(`${API_BASE_URL}/api/announcements${isEdit ? `/${form.id}` : ''}`, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: await authHeaders(getToken),
        body: data
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Failed to save announcement.');
      upsert(normalize(body.announcement));
      setEditorState(null);
      reportFacebook('Announcement saved', body.facebook);
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
      upsert(normalize(body.announcement));
    } catch {
      setActionError(`Couldn't ${a.isPinned ? 'unpin' : 'pin'} "${a.title}". Please try again.`);
    } finally {
      setTogglingPinId(null);
    }
  };

  // Retries the last failed Facebook publish / edit / delete.
  const retryFacebook = async (a: AdminAnnouncement) => {
    if (retryingId) return;
    setRetryingId(a.id);
    setActionError('');
    setFacebookNotice(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/announcements/${a.id}/facebook/retry`, {
        method: 'POST',
        headers: await authHeaders(getToken)
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Retry failed.');
      upsert(normalize(body.announcement));
      reportFacebook('Retried', body.facebook);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Retry failed.');
    } finally {
      setRetryingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete || isDeleting) return;
    setIsDeleting(true);
    setDeleteError('');
    setFacebookNotice(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/announcements/${pendingDelete.id}`, {
        method: 'DELETE',
        headers: await authHeaders(getToken)
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Couldn't delete the announcement. Please try again.");
      setAnnouncements(prev => prev.filter(a => a.id !== pendingDelete.id));
      setPendingDelete(null);
      if (body.facebookWarning) setFacebookNotice({ title: 'Announcement deleted, but the Facebook post is still up', message: body.facebookWarning });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Couldn't delete the announcement. Please try again.");
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
        description="Post and manage the official updates students see on their dashboard and on the Facebook Page."
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
      {facebookNotice && (
        <Alert tone="warning" title={facebookNotice.title} onDismiss={() => setFacebookNotice(null)}>{facebookNotice.message}</Alert>
      )}
      {actionError && <Alert tone="danger" onDismiss={() => setActionError('')}>{actionError}</Alert>}

      <KpiGrid>
        <KpiCard label="Published" value={kpiValue(stats.published)} hint="Visible to students" icon={Send} tone="success" loading={firstLoad} />
        <KpiCard label="Drafts" value={kpiValue(stats.draft)} hint="Not yet visible" icon={FileEdit} tone="warning" loading={firstLoad} />
        <KpiCard label="Pinned" value={kpiValue(stats.pinned)} hint="Shown at the top" icon={Pin} tone="accent" loading={firstLoad} />
        <KpiCard label="On Facebook" value={kpiValue(stats.onFacebook)} hint="Posted to the Page" icon={Facebook} tone="info" loading={firstLoad} />
      </KpiGrid>

      <Card
        flush
        headerSlot={
          <>
            <Tabs<AnnouncementStatus | 'All'> tabs={statusTabs} value={statusFilter} onChange={setStatusFilter} label="Filter by status" />
            <Toolbar>
              <SearchInput value={search} onChange={setSearch} label="Search announcements" placeholder="Search title or summary…" className="flex-1" />
              <Select value={facebookFilter} onChange={v => setFacebookFilter(v as FbStatus | 'All')} className="md:w-56" label="Filter by Facebook status">
                <option value="All">Any Facebook status</option>
                <option value="posted">Posted</option>
                <option value="not_posted">Not posted</option>
                <option value="failed">Failed</option>
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
              const fb = FB_BADGE[a.fbStatus] ?? FB_BADGE.not_posted;
              const thumb = imageSrc(a.imageUrl);
              return (
                <li key={a.id} className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-surface-muted sm:flex-row sm:items-start sm:gap-4">
                  {thumb ? (
                    <img src={thumb} alt="" className="hidden size-9 shrink-0 rounded-control object-cover ring-1 ring-line sm:block" />
                  ) : (
                    <span className={`hidden size-9 shrink-0 items-center justify-center rounded-control sm:flex ${a.isPinned ? 'bg-accent-subtle text-accent' : 'bg-neutral-bg text-ink-muted'}`}>
                      {a.isPinned ? <Pin className="size-4" aria-label="Pinned" /> : <CategoryIcon className="size-4" aria-hidden />}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="mr-1 text-sm font-medium text-ink wrap-break-word">{a.title}</h3>
                      {a.status === 'published' ? <Badge tone="success" dot>Published</Badge> : <Badge dot>Draft</Badge>}
                      <Badge icon={CategoryIcon}>{a.category}</Badge>
                      {a.scholarshipId && <Badge>{SCHOLARSHIP_NAMES[a.scholarshipId] ?? a.scholarshipId}</Badge>}
                      {a.isPinned && <Badge tone="accent" icon={Pin}>Pinned</Badge>}
                      <Badge tone={fb.tone} icon={Facebook}>
                        <span className="sr-only">Facebook: </span>{fb.label}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-ink-muted wrap-break-word">{a.description}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-subtle">
                      <span className="flex items-center gap-1 tabular-nums">
                        <Clock className="size-3.5" aria-hidden />
                        {a.status === 'published' ? `Published ${formatDateTime(a.publishedAt)}` : `Updated ${formatDateTime(a.updatedAt)}`}
                      </span>
                      {a.fbPostId && a.fbPermalink && (
                        <a href={a.fbPermalink} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-badge font-medium text-info-fg hover:underline">
                          <ExternalLink className="size-3.5" aria-hidden /> View on Facebook
                        </a>
                      )}
                      {a.fbStatus === 'failed' && a.fbError && (
                        <span className="flex items-start gap-1 text-danger wrap-break-word">
                          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden /> {a.fbError}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 self-start">
                    {a.fbStatus === 'failed' && (
                      <Button
                        size="sm"
                        icon={RotateCw}
                        loading={retryingId === a.id}
                        disabled={!!retryingId}
                        onClick={() => retryFacebook(a)}
                        aria-label={`Retry Facebook for "${a.title}"`}
                      >
                        Retry
                      </Button>
                    )}
                    <IconButton
                      icon={a.isPinned ? PinOff : Pin}
                      label={`${a.isPinned ? 'Unpin' : 'Pin'} "${a.title}"`}
                      loading={togglingPinId === a.id}
                      onClick={() => togglePin(a)}
                    />
                    <IconButton icon={Pencil} label={`Edit "${a.title}"`} onClick={() => openEdit(a)} disabled={retryingId === a.id} />
                    <IconButton
                      icon={Trash2}
                      label={`Delete "${a.title}"`}
                      onClick={() => { setDeleteError(''); setPendingDelete(a); }}
                      disabled={retryingId === a.id}
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
          confirmLabel={pendingDelete.fbPostId ? 'Delete here and on Facebook' : 'Delete'}
          confirmIcon={Trash2}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
          busy={isDeleting}
          error={deleteError}
        >
          {pendingDelete.fbPostId && (
            <Alert tone="warning">This also deletes the post from the Facebook Page.</Alert>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
