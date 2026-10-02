import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import {
  Award, Bell, Calendar, Clock, Facebook, FileEdit, ImagePlus, Megaphone, Pencil, Pin, PinOff,
  Plus, RotateCw, Send, Trash2, X
} from 'lucide-react';
import { API_BASE_URL, authHeaders, formatShortDate } from './adminData';
import { mockScholarships } from '../../data/scholarships';
import {
  Alert, Badge, Button, Card, Checkbox, ConfirmDialog, DropdownMenu, EmptyState, ErrorState, Field, IconButton, Modal,
  PageHeader, SearchInput, Select, TableSkeleton, Tabs, TextInput, Textarea, Toolbar, Tooltip
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

type ListTab = 'all' | 'published' | 'draft' | 'pinned';

const EMPTY_TABS: Record<ListTab, { title: string; description: string }> = {
  all: { title: 'No announcements yet', description: 'Post updates students see on their dashboard and on the Facebook Page.' },
  published: { title: 'Nothing published', description: 'Published announcements show on the student dashboard.' },
  draft: { title: 'No drafts', description: 'Save an announcement as a draft to finish it later.' },
  pinned: { title: 'Nothing pinned', description: 'Pin an announcement to keep it at the top of the student feed.' }
};

// Refetch when the admin comes back to the tab, at most this often.
const REFETCH_AFTER_MS = 30_000;

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
  const [tab, setTab] = useState<ListTab>('all');
  const [facebookFilter, setFacebookFilter] = useState<FbStatus | 'All'>('All');

  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [pendingDelete, setPendingDelete] = useState<AdminAnnouncement | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [togglingPinId, setTogglingPinId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Each load and each local change bumps this, so a response that started
  // before a change can't overwrite it with older data.
  const loadSeq = useRef(0);
  const lastLoaded = useRef(0);

  const fetchAnnouncements = useCallback(async () => {
    const seq = ++loadSeq.current;
    setIsLoading(true);
    setLoadError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/announcements`, { headers: await authHeaders(getToken) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'The server returned an error while loading announcements.');
      if (seq !== loadSeq.current) return;
      setAnnouncements((body.announcements ?? []).map(normalize));
      lastLoaded.current = Date.now();
    } catch (err) {
      if (seq === loadSeq.current) setLoadError(err instanceof Error ? err.message : 'Something went wrong loading announcements.');
    } finally {
      if (seq === loadSeq.current) setIsLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  useEffect(() => {
    const refetch = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoaded.current > REFETCH_AFTER_MS) fetchAnnouncements();
    };
    window.addEventListener('focus', refetch);
    document.addEventListener('visibilitychange', refetch);
    return () => {
      window.removeEventListener('focus', refetch);
      document.removeEventListener('visibilitychange', refetch);
    };
  }, [fetchAnnouncements]);

  // After a change: show the server's copy right away, then refetch the
  // list so ordering and anything changed elsewhere are current.
  const applyChange = (update: (prev: AdminAnnouncement[]) => AdminAnnouncement[]) => {
    loadSeq.current++;
    setAnnouncements(update);
    fetchAnnouncements();
  };
  const upsert = (saved: AdminAnnouncement) =>
    applyChange(prev => (prev.some(a => a.id === saved.id) ? prev.map(a => (a.id === saved.id ? saved : a)) : [saved, ...prev]));

  const reportFacebook = (title: string, result: FacebookResult | null | undefined) => {
    if (result && !result.ok) {
      setFacebookNotice({
        title: result.tokenExpired ? `${title} — the Facebook Page token needs renewing` : `${title}, but Facebook wasn't updated`,
        message: result.error || 'Facebook returned an error.'
      });
    }
  };

  const counts = useMemo(() => ({
    all: announcements.length,
    published: announcements.filter(a => a.status === 'published').length,
    draft: announcements.filter(a => a.status === 'draft').length,
    pinned: announcements.filter(a => a.isPinned).length
  }), [announcements]);

  // Pinned first; otherwise the server's order (newest first). sort() is stable.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return announcements
      .filter(a => {
        if (tab === 'published' && a.status !== 'published') return false;
        if (tab === 'draft' && a.status !== 'draft') return false;
        if (tab === 'pinned' && !a.isPinned) return false;
        if (facebookFilter !== 'All' && a.fbStatus !== facebookFilter) return false;
        if (q && !a.title.toLowerCase().includes(q) && !a.description.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => Number(b.isPinned) - Number(a.isPinned));
  }, [announcements, search, tab, facebookFilter]);

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
      const deletedId = pendingDelete.id;
      applyChange(prev => prev.filter(a => a.id !== deletedId));
      setPendingDelete(null);
      if (body.facebookWarning) setFacebookNotice({ title: 'Announcement deleted, but the Facebook post is still up', message: body.facebookWarning });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Couldn't delete the announcement. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const listFiltersActive = search.trim() !== '' || facebookFilter !== 'All';
  const hasData = announcements.length > 0;
  const firstLoad = isLoading && !hasData;
  const failedEmpty = !!loadError && !hasData && !isLoading;
  const tabCount = (n: number) => (firstLoad || failedEmpty ? undefined : n);
  const newButton = <Button variant="primary" icon={Plus} onClick={openCreate}>New announcement</Button>;

  return (
    <div id={id} className="space-y-6">
      <PageHeader
        title="Announcements"
        description="Post updates to the student dashboard and the Facebook Page."
        actions={newButton}
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

      <Card
        flush
        headerSlot={
          <>
            <Tabs<ListTab>
              label="Filter announcements"
              value={tab}
              onChange={setTab}
              tabs={[
                { key: 'all', label: 'All', count: tabCount(counts.all) },
                { key: 'published', label: 'Published', count: tabCount(counts.published) },
                { key: 'draft', label: 'Drafts', count: tabCount(counts.draft) },
                { key: 'pinned', label: 'Pinned', count: tabCount(counts.pinned) }
              ]}
            />
            <Toolbar>
              <SearchInput value={search} onChange={setSearch} label="Search announcements" placeholder="Search title or summary…" className="flex-1" />
              <Select value={facebookFilter} onChange={v => setFacebookFilter(v as FbStatus | 'All')} className="md:w-56" label="Filter by Facebook status">
                <option value="All">Any Facebook status</option>
                <option value="posted">Posted to Facebook</option>
                <option value="not_posted">Not on Facebook</option>
                <option value="failed">Facebook failed</option>
              </Select>
            </Toolbar>
          </>
        }
      >
        {firstLoad ? (
          <TableSkeleton rows={3} label="Loading announcements" />
        ) : failedEmpty ? (
          <ErrorState title="Couldn't load announcements" message={loadError} onRetry={fetchAnnouncements} retrying={isLoading} />
        ) : visible.length === 0 ? (
          listFiltersActive ? (
            <EmptyState
              icon={Megaphone}
              title="No announcements match"
              description="Try a different search or Facebook status."
              action={<Button onClick={() => { setSearch(''); setFacebookFilter('All'); }}>Clear filters</Button>}
            />
          ) : (
            <EmptyState icon={tab === 'pinned' ? Pin : Megaphone} title={EMPTY_TABS[tab].title} description={EMPTY_TABS[tab].description} action={newButton} />
          )
        ) : (
          <ul className="divide-y divide-line" aria-label="Announcements">
            {visible.map(a => (
              <AnnouncementRow
                key={a.id}
                a={a}
                pinBusy={togglingPinId === a.id}
                retrying={retryingId === a.id}
                retryDisabled={!!retryingId}
                onEdit={() => openEdit(a)}
                onTogglePin={() => togglePin(a)}
                onRetry={() => retryFacebook(a)}
                onDelete={() => { setDeleteError(''); setPendingDelete(a); }}
              />
            ))}
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
          description={<>"{pendingDelete.title}" will be permanently removed from the student portal. This can't be undone.</>}
          confirmLabel={pendingDelete.fbPostId ? 'Delete here and on Facebook' : 'Delete'}
          confirmIcon={Trash2}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
          busy={isDeleting}
          error={deleteError}
        >
          {pendingDelete.fbPostId ? (
            <Alert tone="warning" icon={Facebook}>The post on the Facebook Page is deleted too.</Alert>
          ) : (
            <p className="text-sm text-ink-muted">It isn't on the Facebook Page, so nothing changes there.</p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}

// --- Row -----------------------------------------------------------------------

function AnnouncementRow({ a, pinBusy, retrying, retryDisabled, onEdit, onTogglePin, onRetry, onDelete }: {
  a: AdminAnnouncement;
  pinBusy: boolean;
  retrying: boolean;
  retryDisabled: boolean;
  onEdit: () => void;
  onTogglePin: () => void;
  onRetry: () => void;
  onDelete: () => void;
}) {
  const CategoryIcon = CATEGORY_ICONS[a.category] ?? Bell;
  // Falls back to the category icon if the image can't load.
  const [thumbFailed, setThumbFailed] = useState(false);
  const thumb = thumbFailed ? null : imageSrc(a.imageUrl);
  const published = a.status === 'published';
  const meta = [
    a.category,
    published ? `Published ${formatShortDate(a.publishedAt)}` : `Edited ${formatShortDate(a.updatedAt)}`,
    a.scholarshipId ? SCHOLARSHIP_NAMES[a.scholarshipId] ?? a.scholarshipId : null
  ].filter(Boolean).join(' · ');

  return (
    <li className="flex gap-3 px-4 py-3.5 sm:gap-4 sm:px-5">
      {thumb ? (
        <img src={thumb} alt="" onError={() => setThumbFailed(true)} className="size-10 shrink-0 rounded-control object-cover ring-1 ring-line" />
      ) : (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-neutral-bg text-ink-subtle">
          <CategoryIcon className="size-4" aria-hidden />
        </span>
      )}

      <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            {a.isPinned && (
              <>
                <Pin className="size-3.5 shrink-0 text-accent" aria-hidden />
                <span className="sr-only">Pinned: </span>
              </>
            )}
            <button
              type="button"
              onClick={onEdit}
              title={a.title}
              className="min-w-0 truncate rounded-badge text-left text-sm font-medium text-ink hover:text-accent"
            >
              {a.title}
            </button>
          </div>
          <p className="mt-0.5 line-clamp-1 text-sm text-ink-muted wrap-break-word">{a.description}</p>
          <p className="mt-1 truncate text-xs text-ink-subtle tabular-nums">{meta}</p>
        </div>

        <div className="mt-2 flex items-center gap-2 sm:mt-0 sm:shrink-0">
          {published ? <Badge tone="success" dot>Published</Badge> : <Badge dot>Draft</Badge>}
          <FacebookIndicator a={a} retrying={retrying} retryDisabled={retryDisabled} onRetry={onRetry} />
          <div className="ml-auto flex items-center gap-0.5 sm:ml-2">
            <IconButton
              icon={a.isPinned ? PinOff : Pin}
              label={a.isPinned ? 'Unpin' : 'Pin to top'}
              loading={pinBusy}
              onClick={onTogglePin}
            />
            <IconButton icon={Pencil} label="Edit" onClick={onEdit} disabled={retrying} />
            <DropdownMenu
              label={`More actions for "${a.title}"`}
              items={[{ key: 'delete', label: 'Delete', icon: Trash2, tone: 'danger', onSelect: onDelete }]}
            />
          </div>
        </div>
      </div>
    </li>
  );
}

// One small Facebook icon instead of a badge: muted when the announcement
// isn't on the Page, accent (and a link to the post) when it is, red with
// a Retry action when the last Facebook step failed.
function FacebookIndicator({ a, retrying, retryDisabled, onRetry }: {
  a: AdminAnnouncement;
  retrying: boolean;
  retryDisabled: boolean;
  onRetry: () => void;
}) {
  const box = 'inline-flex size-8 items-center justify-center rounded-control';

  if (a.fbStatus === 'failed') {
    return (
      <span className="flex items-center gap-1">
        <Tooltip content={a.fbError || 'Facebook returned an error.'} className={`${box} text-danger-fg`}>
          <Facebook className="size-4" aria-hidden />
          <span className="sr-only">Facebook failed</span>
        </Tooltip>
        <Button size="sm" variant="danger-secondary" icon={RotateCw} loading={retrying} disabled={retryDisabled} onClick={onRetry}>
          Retry
          <span className="sr-only"> Facebook for “{a.title}”</span>
        </Button>
      </span>
    );
  }

  if (a.fbStatus === 'posted' && a.fbPermalink) {
    return (
      <Tooltip content="Posted to Facebook. Opens the post." asChild>
        <a
          href={a.fbPermalink}
          target="_blank"
          rel="noreferrer"
          aria-label="View on Facebook (opens in a new tab)"
          className={`${box} text-accent hover:bg-accent-subtle`}
        >
          <Facebook className="size-4" aria-hidden />
        </a>
      </Tooltip>
    );
  }

  const note = a.fbEnabled && a.status === 'draft' ? 'Posts to Facebook when published' : 'Not on Facebook';
  return (
    <Tooltip content={note} className={`${box} text-ink-subtle/60`}>
      <Facebook className="size-4" aria-hidden />
      <span className="sr-only">{note}</span>
    </Tooltip>
  );
}
