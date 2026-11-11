import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import {
  Award, Bell, Calendar, CalendarClock, Check, ChevronLeft, ChevronRight, Clock, CornerUpLeft, Eye, Facebook, FileEdit, Hourglass, ImagePlus, Mail, Megaphone, Pencil, Pin, PinOff,
  Plus, RotateCw, Send, Trash2, X
} from 'lucide-react';
import { API_BASE_URL, authHeaders, formatShortDate } from './adminData';
import { OFFICE_LABELS, mockScholarships, officeOf } from '../../data/scholarships';
import { Announcement, ScholarshipOffice } from '../../types';
import { AnnouncementArticle } from '../../components/AnnouncementCard';
import EmailAudience, { DEFAULT_EMAIL_TARGET, EmailTarget, describeTarget } from './EmailAudience';
import {
  Alert, Badge, Button, Card, Checkbox, ConfirmDialog, DropdownMenu, EmptyState, ErrorState, Field, IconButton, Modal,
  PageHeader, SearchInput, SegmentedControl, Select, TableSkeleton, Tabs, TextInput, Textarea, Toolbar, Tooltip
} from './AdminUI';
import { ScheduleFields, ScheduleState, formatScheduled, initialSchedule, scheduleToIso } from './announcementSchedule';

// Matches frontend/src/types.ts `Announcement['category']` exactly.
const CATEGORIES = ['General', 'Update', 'Deadline', 'Event'] as const;
type Category = typeof CATEGORIES[number];
// 'scheduled' publishes itself at scheduledFor (the backend's timer).
// 'pending': an office other than the AdSO asked to publish or schedule it;
// it waits for the AdSO's approval (review.requestedStatus is what it asked).
type AnnouncementStatus = 'draft' | 'pending' | 'scheduled' | 'published';

// The AdSO's approval of an office's announcement (backend Announcement.review).
interface AnnouncementReview {
  requestedStatus: 'published' | 'scheduled' | null;
  requestedAt: string | null;
  requestedBy: string | null;
  decision: 'approved' | 'returned' | null;
  decidedAt: string | null;
  decidedBy: string | null;
  note: string | null;
}

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
  review?: AnnouncementReview | null;
  // Who posted it: a scholarship office code, or a duty office's name.
  office?: string;
  dutyOffice?: string | null;
  isPinned: boolean;
  publishedAt: string | null;
  scheduledFor?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  images: AnnouncementImage[];
  fbEnabled: boolean;
  fbStatus: FbStatus;
  fbPostId: string | null;
  fbPermalink: string | null;
  fbError: string | null;
  fbLastSyncedAt: string | null;
  // "Also email students" (backend utils/announcementEmails.js): sent once
  // to the students' Outlook when published, in batches.
  emailEnabled: boolean;
  emailAudience: EmailAudience;
  emailTarget?: EmailTarget;
  emailStatus: 'not_sent' | 'queued' | 'sending' | 'sent' | 'failed';
  emailTotal: number;
  emailSent: number;
  emailError: string | null;
  emailSentAt: string | null;
}

type EmailAudience = 'all' | 'applicants' | 'scholars';

interface AnnouncementImage {
  id: string;
  url: string;   // path on the API server
}

// Result of the Facebook step returned alongside a saved announcement.
interface FacebookResult {
  ok: boolean;
  error?: string;
  tokenExpired?: boolean;
}

const FB_DEFAULTS: Partial<AdminAnnouncement> = {
  images: [], fbEnabled: false, fbStatus: 'not_posted', fbPostId: null, fbPermalink: null, fbError: null, fbLastSyncedAt: null,
  emailEnabled: false, emailAudience: 'all', emailStatus: 'not_sent', emailTotal: 0, emailSent: 0, emailError: null, emailSentAt: null
};

const normalize = (raw: Partial<AdminAnnouncement>): AdminAnnouncement => ({ ...FB_DEFAULTS, ...raw } as AdminAnnouncement);

// Read at render, so scholarships the AdSO created are included.
const scholarshipName = (id: string) => mockScholarships.find(s => s.id === id)?.name;

const imageSrc = (url: string) => `${API_BASE_URL}${url}`;

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
// Must match MAX_IMAGES in the backend's models/Announcement.js.
const MAX_IMAGES = 10;

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
  emailEnabled: boolean;
  emailTarget: EmailTarget;
  emailLocked?: boolean;         // the email already went out (or is going)
  existingImages: AnnouncementImage[];  // images already saved on the announcement
  schedule: ScheduleState;       // publish now or at a set time
  returnedNote?: string;         // why the AdSO returned it (an office's draft)
}

// One image in the editor, in display order: either already saved
// (existingId) or newly picked (file, shown through an object URL).
interface ImageItem {
  key: string;
  existingId?: string;
  file?: File;
  src: string;
}

const BLANK_FORM: Omit<EditorState, 'schedule'> = {
  title: '', description: '', content: '', category: 'General', scholarshipId: '', isPinned: false, fbEnabled: true, emailEnabled: false, emailTarget: DEFAULT_EMAIL_TARGET, existingImages: []
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
function FacebookPreview({ title, content, images }: { title: string; content: string; images: string[] }) {
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
      <PreviewImages images={images} />
    </div>
  );
}

// Roughly how Facebook lays out a multi-photo post: one large photo, or a
// grid of up to four with "+N" on the last when there are more.
function PreviewImages({ images }: { images: string[] }) {
  if (images.length === 0) return null;
  if (images.length === 1) {
    return <img src={images[0]} alt="" className="max-h-72 w-full border-t border-line object-cover" />;
  }
  const shown = images.slice(0, 4);
  const extra = images.length - shown.length;
  return (
    <div className="grid grid-cols-2 gap-0.5 border-t border-line bg-line">
      {shown.map((src, i) => (
        <div key={src} className={`relative ${shown.length === 3 && i === 0 ? 'col-span-2 aspect-2/1' : 'aspect-square'}`}>
          <img src={src} alt="" className="size-full object-cover" />
          {extra > 0 && i === shown.length - 1 && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-xl font-semibold text-white">+{extra}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// A student-feed card for the preview, matching the student Announcements
// page: the first image shown whole over a blur of itself, or a plain panel.
function StudentPreview({ title, description, category, images, pinned, scholarship }: {
  title: string; description: string; category: Category; images: string[]; pinned: boolean; scholarship?: string;
}) {
  const Icon = CATEGORY_ICONS[category];
  return (
    <div className="overflow-hidden rounded-card bg-surface ring-1 ring-line" aria-label="Student feed preview">
      <div className="relative aspect-[16/10] overflow-hidden bg-accent-subtle">
        {images[0] ? (
          <>
            <img src={images[0]} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-60 blur-2xl" />
            <img src={images[0]} alt="" className="relative mx-auto h-full w-auto max-w-full object-contain" />
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-accent">
            <span className="flex size-10 items-center justify-center rounded-xl bg-surface shadow-card ring-1 ring-accent/15"><Icon className="size-5" aria-hidden /></span>
            <span className="text-[11px] font-semibold uppercase tracking-widest">{category}</span>
          </div>
        )}
        {images.length > 1 && (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">{images.length} photos</span>
        )}
        {pinned && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-surface/95 px-2 py-0.5 text-[11px] font-semibold text-ink shadow-card"><Pin className="size-3" aria-hidden />Pinned</span>
        )}
      </div>
      <div className="space-y-1.5 p-4">
        <p className="text-[11px] text-ink-subtle"><span className="font-semibold text-ink-muted">{category}</span> · Today{scholarship ? ` · ${scholarship}` : ''}</p>
        <p className="line-clamp-2 font-display text-base font-semibold leading-snug text-ink">
          {title.trim() || <span className="text-ink-subtle">Your title</span>}
        </p>
        <p className="line-clamp-3 text-sm leading-relaxed text-ink-muted">
          {description.trim() || <span className="text-ink-subtle">Your summary appears here, under the title.</span>}
        </p>
      </div>
    </div>
  );
}

// A titled group in the editor.
function EditorSection({ title, description, children, aside }: { title: string; description?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-ink-subtle">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

// A switch-style card for "also email" and "also post to Facebook".
function ShareOption({ icon: Icon, title, description, checked, onChange, disabled, children }: {
  icon: React.ElementType; title: string; description: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; children?: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <div className={`rounded-control bg-surface ring-1 transition-colors ${checked ? 'ring-accent/40' : 'ring-line'}`}>
      <label htmlFor={id} className={`flex items-start gap-3 p-3.5 ${disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${checked ? 'bg-accent-subtle text-accent' : 'bg-neutral-bg text-ink-subtle'}`}>
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink">{title}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-ink-subtle">{description}</span>
        </span>
        <span className="relative mt-1 inline-flex shrink-0">
          <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} className="peer sr-only" />
          <span aria-hidden className="h-5 w-9 rounded-full bg-line-strong transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2" />
          <span aria-hidden className="absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
        </span>
      </label>
      {children && <div className="border-t border-line px-3.5 pb-3.5 pt-3">{children}</div>}
    </div>
  );
}

function AnnouncementEditor({ initial, onClose, onSave, isSaving, error, getToken, ownOffice }: {
  initial: EditorState;
  ownOffice: ScholarshipOffice;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onSave: (form: EditorState, images: ImageItem[], publish: boolean) => void;
  isSaving: boolean;
  error: string;
}) {
  const [form, setForm] = useState<EditorState>(initial);
  // Other offices post about their own scholarships, in AniSkolar only.
  const isAdso = ownOffice === 'LSO';
  const scholarshipOptions = isAdso ? mockScholarships : mockScholarships.filter(s => officeOf(s) === ownOffice);
  const [images, setImages] = useState<ImageItem[]>(() =>
    initial.existingImages.map(img => ({ key: img.id, existingId: img.id, src: imageSrc(img.url) }))
  );
  const [imageError, setImageError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [previewTab, setPreviewTab] = useState<'students' | 'facebook'>('students');
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
  // Offices other than the AdSO submit for the AdSO's approval.
  const needsApproval = !isAdso;
  const isPending = initial.status === 'pending';
  const isLive = initial.status === 'published';
  const wasScheduled = initial.status === 'scheduled';
  const scheduling = !isLive && form.schedule.timing === 'Schedule';
  const errors = attempted ? validate(form) : {};
  const scheduleError = attempted && scheduling ? scheduleToIso(form.schedule).error : undefined;
  const errorFields = Object.keys(errors) as TextField[];
  const showFb = isAdso && form.fbEnabled;
  const tab = showFb ? previewTab : 'students';

  // Anything typed or changed since the editor opened.
  const dirty = useMemo(() => {
    const { schedule: s0, existingImages: _e0, ...a } = initial;
    const { schedule: s1, existingImages: _e1, ...b } = form;
    return JSON.stringify(a) !== JSON.stringify(b)
      || JSON.stringify(s0) !== JSON.stringify(s1)
      || images.length !== initial.existingImages.length
      || images.some((img, i) => img.existingId !== initial.existingImages[i]?.id);
  }, [form, images, initial]);

  const requestClose = () => {
    if (isSaving) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  // Object URLs for newly picked images are released when they're removed
  // (removeImage) or when the editor closes (here).
  const imagesRef = useRef(images);
  imagesRef.current = images;
  useEffect(() => () => {
    imagesRef.current.forEach(img => { if (img.file) URL.revokeObjectURL(img.src); });
  }, []);

  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) => setForm(f => ({ ...f, [key]: value }));

  const addFiles = (files: File[]) => {
    if (files.length === 0) return;
    const problems: string[] = [];
    const accepted = files.filter(file => {
      if (!(['image/jpeg', 'image/png'].includes(file.type) || /\.(jpe?g|png)$/i.test(file.name))) { problems.push(`${file.name} isn't a JPG or PNG.`); return false; }
      if (file.size > MAX_IMAGE_BYTES) { problems.push(`${file.name} is over 10MB.`); return false; }
      return true;
    });
    const room = MAX_IMAGES - images.length;
    if (accepted.length > room) problems.push(`Only ${MAX_IMAGES} images are allowed; ${accepted.length - room} weren't added.`);
    const added = accepted.slice(0, Math.max(room, 0)).map(file => ({
      key: `new-${crypto.randomUUID()}`,
      file,
      src: URL.createObjectURL(file)
    }));
    setImageError(problems.join(' '));
    setImages(prev => [...prev, ...added]);
  };

  const pickImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    addFiles(files);
  };

  const removeImage = (key: string) => {
    setImageError('');
    setImages(prev => {
      const target = prev.find(img => img.key === key);
      if (target?.file) URL.revokeObjectURL(target.src);
      return prev.filter(img => img.key !== key);
    });
  };

  // Images keep the order shown; the first is the cover.
  const moveImage = (from: number, to: number) => setImages(prev => {
    if (to < 0 || to >= prev.length) return prev;
    const next = [...prev];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  });

  const submit = (publish: boolean) => {
    if (isSaving) return;
    setAttempted(true);
    const found = validate(form);
    const first = (['title', 'description', 'content'] as TextField[]).find(k => found[k]);
    if (first) {
      refs[first].current?.focus();
      return;
    }
    if (publish && scheduling && scheduleToIso(form.schedule).error) return;
    setSavingAs(publish ? 'publish' : 'draft');
    onSave(form, images, publish);
  };

  // The first sentence or two of the body, as a starting summary.
  const summaryFromBody = () => {
    const text = form.content.trim().replace(/\s+/g, ' ');
    const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
    let out = '';
    for (const s of sentences) {
      if ((out + s).length > 220) break;
      out += s;
    }
    set('description', (out || text.slice(0, 220)).trim());
  };

  // Shown only once a field gets close to its limit.
  const counter = (key: TextField) => (form[key].length >= LIMITS[key] * 0.8 ? `${form[key].length}/${LIMITS[key]}` : undefined);
  const primaryLabel = needsApproval
    ? (isEdit && isLive ? 'Submit changes for approval' : scheduling ? 'Submit schedule for approval' : 'Submit for approval')
    : isEdit && isLive
    ? 'Save changes'
    : scheduling
      ? (wasScheduled ? 'Save schedule' : 'Schedule')
      : wasScheduled
        ? 'Publish now'
        : 'Publish';
  const fbHelp = isLive && form.fbEnabled
    ? 'Saving updates the Facebook post. Turning this off deletes it from the Page.'
    : scheduling
      ? 'Posts to the Page when it publishes at the scheduled time.'
      : 'Posts to the Page when you publish. Saving a draft never posts.';

  // One line in the footer saying exactly what the main button will do.
  const when = isEdit && isLive ? 'Updates the live post' : scheduling ? `Publishes ${formatScheduled(scheduleToIso(form.schedule).iso) || 'at the scheduled time'}` : 'Publishes right away';
  const channels = ['AniSkolar', ...(form.emailEnabled && !form.emailLocked ? ['email'] : []), ...(showFb ? ['Facebook'] : [])];
  const summaryLine = needsApproval
    ? `Goes to the AdSO for approval, then ${when.charAt(0).toLowerCase()}${when.slice(1)} · ${channels.join(', ').replace(/, ([^,]*)$/, ' and $1')}`
    : `${when} · ${channels.join(', ').replace(/, ([^,]*)$/, ' and $1')}`;

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <>
      <Modal
        title={isEdit ? 'Edit announcement' : 'New announcement'}
        description={isEdit ? undefined : 'Write it once, then choose where it goes.'}
        onClose={requestClose}
        dismissible={!isSaving}
        initialFocusRef={refs.title}
        size="xl"
        sheet
        bodyClassName="p-0"
        footer={
          <>
            <p className="hidden min-w-0 flex-1 items-center gap-2 text-xs text-ink-muted sm:flex">
              <Send className="size-3.5 shrink-0 text-ink-subtle" aria-hidden />
              <span className="truncate">{summaryLine}</span>
              <kbd className="ml-1 hidden shrink-0 rounded border border-line-strong bg-surface px-1 font-sans text-[11px] text-ink-subtle lg:inline">{isMac ? '⌘' : 'Ctrl'}+Enter</kbd>
            </p>
            <Button onClick={requestClose} disabled={isSaving}>Cancel</Button>
            <Button icon={FileEdit} loading={isSaving && savingAs === 'draft'} disabled={isSaving} onClick={() => submit(false)}>
              {isPending ? 'Take back to draft' : isLive ? 'Unpublish to draft' : wasScheduled ? 'Unschedule to draft' : 'Save as draft'}
            </Button>
            <Button variant="primary" icon={scheduling ? CalendarClock : Send} loading={isSaving && savingAs === 'publish'} disabled={isSaving} onClick={() => submit(true)}>
              {primaryLabel}
            </Button>
          </>
        }
      >
        <form
          className="grid min-h-full grid-cols-1 lg:h-full lg:grid-cols-[minmax(0,1fr)_23rem]"
          onSubmit={e => { e.preventDefault(); submit(true); }}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(true); } }}
          noValidate
        >
          {/* Compose */}
          <div className="space-y-7 px-5 py-5 lg:overflow-y-auto lg:px-7 lg:py-6">
            {error && <Alert tone="danger" title="Couldn't save the announcement">{error}</Alert>}
            {initial.returnedNote && (
              <Alert tone="warning" title="The AdSO returned this announcement">
                {initial.returnedNote} Make the changes, then submit it again.
              </Alert>
            )}
            {isPending && (
              <Alert tone="info" title="Waiting for the AdSO's approval">
                Students won’t see it until the AdSO approves it. Saving changes sends this version instead.
              </Alert>
            )}
            {errorFields.length > 0 && (
              <Alert tone="danger" title={`Fix ${errorFields.length === 1 ? 'this field' : `these ${errorFields.length} fields`} before saving`}>
                {errorFields.map(k => FIELD_LABELS[k]).join(', ')}
              </Alert>
            )}

            <EditorSection title="Write">
              <Field label="Title" error={errors.title} labelAside={counter('title')}>
                <TextInput
                  ref={refs.title}
                  value={form.title}
                  onChange={e => set('title', e.target.value)}
                  maxLength={LIMITS.title}
                  placeholder="e.g. 1st Semester Scholarship Application Window Now Open"
                  disabled={isSaving}
                  className="h-11 text-base font-semibold"
                />
              </Field>

              <Field label="Category">
                <div role="radiogroup" aria-label="Category" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {CATEGORIES.map(c => {
                    const Icon = CATEGORY_ICONS[c];
                    const active = form.category === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => set('category', c)}
                        disabled={isSaving}
                        className={`flex h-10 items-center justify-center gap-2 rounded-control text-sm font-medium ring-1 ring-inset transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          active ? 'bg-accent-subtle text-accent ring-accent' : 'bg-surface text-ink-muted ring-line-strong hover:bg-surface-muted hover:text-ink'}`}
                      >
                        <Icon className="size-4" aria-hidden />{c}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="Body" error={errors.content} labelAside={counter('content')} helper={!errors.content ? 'Leave a blank line between paragraphs. Web links become clickable for students.' : undefined}>
                <Textarea
                  ref={refs.content}
                  value={form.content}
                  onChange={e => set('content', e.target.value)}
                  rows={9}
                  maxLength={LIMITS.content}
                  placeholder="Write the full announcement…"
                  className="resize-y text-[15px] leading-relaxed"
                  disabled={isSaving}
                />
              </Field>

              <Field
                label="Summary"
                error={errors.description}
                labelAside={counter('description') ?? (form.content.trim() && !form.description.trim() ? (
                  <button type="button" onClick={summaryFromBody} disabled={isSaving} className="font-medium text-accent hover:underline">Use start of body</button>
                ) : undefined)}
                helper={!errors.description ? 'Shown under the title on the student feed card.' : undefined}
              >
                <Textarea
                  ref={refs.description}
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                  rows={2}
                  maxLength={LIMITS.description}
                  placeholder="One or two sentences students see before opening it…"
                  className="resize-none"
                  disabled={isSaving}
                />
              </Field>
            </EditorSection>

            <EditorSection
              title="Images"
              description={`Optional. Up to ${MAX_IMAGES} JPG or PNG images, 10MB each. The first one is the cover.`}
              aside={images.length > 0 ? <span className="text-xs tabular-nums text-ink-subtle">{images.length}/{MAX_IMAGES}</span> : undefined}
            >
              <input ref={fileInput} type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" multiple className="hidden" onChange={pickImages} disabled={isSaving} />
              {images.length > 0 && (
                <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-5" aria-label="Images, in order">
                  {images.map((img, i) => (
                    <li key={img.key} className="group relative">
                      <img src={img.src} alt={`Image ${i + 1}`} className="aspect-square w-full rounded-control object-cover ring-1 ring-line" />
                      {i === 0 && <span className="absolute left-1.5 top-1.5 rounded-badge bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">Cover</span>}
                      <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                        <span className="flex gap-1">
                          <button type="button" onClick={() => moveImage(i, i - 1)} disabled={isSaving || i === 0} aria-label={`Move image ${i + 1} earlier`} className="flex size-6 items-center justify-center rounded-md bg-surface/95 text-ink-muted shadow-sm ring-1 ring-line hover:text-ink disabled:opacity-40">
                            <ChevronLeft className="size-3.5" aria-hidden />
                          </button>
                          <button type="button" onClick={() => moveImage(i, i + 1)} disabled={isSaving || i === images.length - 1} aria-label={`Move image ${i + 1} later`} className="flex size-6 items-center justify-center rounded-md bg-surface/95 text-ink-muted shadow-sm ring-1 ring-line hover:text-ink disabled:opacity-40">
                            <ChevronRight className="size-3.5" aria-hidden />
                          </button>
                        </span>
                        <button type="button" onClick={() => removeImage(img.key)} disabled={isSaving} aria-label={`Remove image ${i + 1}`} className="flex size-6 items-center justify-center rounded-md bg-surface/95 text-ink-muted shadow-sm ring-1 ring-line hover:text-danger-fg disabled:opacity-40">
                          <Trash2 className="size-3.5" aria-hidden />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {images.length < MAX_IMAGES && (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={e => { e.preventDefault(); setDragging(false); if (!isSaving) addFiles(Array.from(e.dataTransfer.files)); }}
                  disabled={isSaving}
                  className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-control border-2 border-dashed px-4 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 ${
                    images.length ? 'py-4' : 'py-8'} ${dragging ? 'border-accent bg-accent-subtle' : 'border-line-strong hover:border-accent/60 hover:bg-surface-muted'}`}
                >
                  <ImagePlus className={`size-6 ${dragging ? 'text-accent' : 'text-ink-subtle'}`} aria-hidden />
                  <span className="text-sm font-medium text-ink">{dragging ? 'Drop to add' : images.length ? 'Add more images' : 'Drag images here, or click to choose'}</span>
                  {!images.length && <span className="text-xs text-ink-subtle">Posters and photos show in full on the student feed.</span>}
                </button>
              )}
              {imageError && <p role="alert" className="text-xs font-medium text-danger">{imageError}</p>}
            </EditorSection>

            <EditorSection title="Details">
              <Field label="Related scholarship" optional helper="It also shows on that scholarship's page.">
                <Select value={form.scholarshipId} onChange={v => set('scholarshipId', v)} disabled={isSaving}>
                  <option value="">None</option>
                  {scholarshipOptions.map(sch => <option key={sch.id} value={sch.id}>{sch.name}</option>)}
                </Select>
              </Field>
              <Checkbox
                checked={form.isPinned}
                onChange={v => set('isPinned', v)}
                disabled={isSaving}
                label="Pin to top of feed"
                description="Keeps it above newer announcements until you unpin it."
              />
            </EditorSection>
          </div>

          {/* Publish options and preview */}
          <aside className="space-y-6 border-t border-line bg-surface-muted px-5 py-5 lg:overflow-y-auto lg:border-l lg:border-t-0 lg:px-6 lg:py-6">
            {!isLive && (
              <EditorSection title="When">
                <ScheduleFields value={form.schedule} onChange={v => set('schedule', v)} disabled={isSaving} error={scheduleError} />
              </EditorSection>
            )}

            <EditorSection title="Also share" description="It always shows on AniSkolar.">
              <div className="space-y-2.5">
                <ShareOption
                  icon={Mail}
                  title="Email students (Outlook)"
                  description={form.emailLocked
                    ? 'Already emailed. Edits show on AniSkolar but are not emailed again.'
                    : 'Sent once to their school email when this publishes, a few batches a minute.'}
                  checked={form.emailEnabled}
                  onChange={v => set('emailEnabled', v)}
                  disabled={isSaving || form.emailLocked}
                >
                  {form.emailEnabled && !form.emailLocked ? (
                    <EmailAudience
                      value={form.emailTarget}
                      onChange={t => set('emailTarget', t)}
                      relatedScholarshipId={form.scholarshipId}
                      getToken={getToken}
                      disabled={isSaving}
                      onlyScholarshipIds={isAdso ? undefined : scholarshipOptions.map(s => s.id)}
                    />
                  ) : form.emailLocked ? (
                    <p className="text-xs text-ink-muted">Sent to: {describeTarget(form.emailTarget)}</p>
                  ) : undefined}
                </ShareOption>
                {isAdso && (
                  <ShareOption
                    icon={Facebook}
                    title="Post to the Facebook Page"
                    description={fbHelp}
                    checked={form.fbEnabled}
                    onChange={v => set('fbEnabled', v)}
                    disabled={isSaving}
                  />
                )}
              </div>
            </EditorSection>

            <EditorSection title="Preview">
              {showFb && (
                <SegmentedControl<'students' | 'facebook'>
                  options={['students', 'facebook']}
                  value={tab}
                  onChange={v => v && setPreviewTab(v)}
                  label="Preview"
                  renderLabel={o => (o === 'students' ? 'Student feed' : 'Facebook')}
                />
              )}
              {tab === 'students' ? (
                <StudentPreview
                  title={form.title}
                  description={form.description}
                  category={form.category}
                  images={images.map(img => img.src)}
                  pinned={form.isPinned}
                  scholarship={form.scholarshipId ? scholarshipName(form.scholarshipId) : undefined}
                />
              ) : (
                <FacebookPreview title={form.title} content={form.content} images={images.map(img => img.src)} />
              )}
            </EditorSection>
          </aside>
        </form>
      </Modal>

      {confirmDiscard && (
        <ConfirmDialog
          title={isEdit ? 'Discard your changes?' : 'Discard this announcement?'}
          description={isEdit ? 'Your edits will be lost. The saved announcement stays as it was.' : 'What you wrote will be lost. Save it as a draft to finish later.'}
          confirmLabel="Discard"
          confirmIcon={Trash2}
          tone="danger"
          onConfirm={() => { setConfirmDiscard(false); onClose(); }}
          onCancel={() => setConfirmDiscard(false)}
        />
      )}
    </>
  );
}

// --- Page ----------------------------------------------------------------------

type ListTab = 'all' | 'pending' | 'published' | 'scheduled' | 'draft' | 'pinned';

const EMPTY_TABS: Record<ListTab, { title: string; description: string }> = {
  all: { title: 'No announcements yet', description: 'Post updates students see on their dashboard and on the Facebook Page.' },
  pending: { title: 'Nothing waiting for approval', description: 'Announcements you submit wait here until the AdSO approves them.' },
  published: { title: 'Nothing published', description: 'Published announcements show on the student dashboard.' },
  scheduled: { title: 'Nothing scheduled', description: 'Schedule an announcement to publish it later on its own.' },
  draft: { title: 'No drafts', description: 'Save an announcement as a draft to finish it later.' },
  pinned: { title: 'Nothing pinned', description: 'Pin an announcement to keep it at the top of the student feed.' }
};

// Refetch when the admin comes back to the tab, at most this often.
const REFETCH_AFTER_MS = 30_000;

export default function AdminAnnouncements({ id, ownOffice = 'LSO', onReviewCountChange }: {
  id?: string;
  ownOffice?: ScholarshipOffice;
  // The AdSO: how many offices' announcements wait for approval (sidebar badge).
  onReviewCountChange?: (count: number) => void;
}) {
  const { getToken } = useAuth();
  // The AdSO approves the other offices' announcements; they submit theirs.
  const isAdsoOffice = ownOffice === 'LSO';

  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // Failures of row actions (pin, retry) that don't invalidate the list.
  const [actionError, setActionError] = useState('');
  // Saved-but-Facebook-failed outcomes, or delete warnings.
  const [facebookNotice, setFacebookNotice] = useState<{ title: string; message: string } | null>(null);

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<ListTab>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  // 'All', 'none' (not about a scholarship) or a scholarship id.
  const [scholarshipFilter, setScholarshipFilter] = useState<string>('All');

  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [pendingDelete, setPendingDelete] = useState<AdminAnnouncement | null>(null);
  // The announcement open in "Student view".
  const [viewing, setViewing] = useState<AdminAnnouncement | null>(null);
  // An office's announcement opened from the review queue (read-only).
  const [reviewing, setReviewing] = useState<AdminAnnouncement | null>(null);
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
    pending: announcements.filter(a => a.status === 'pending').length,
    published: announcements.filter(a => a.status === 'published').length,
    scheduled: announcements.filter(a => a.status === 'scheduled').length,
    draft: announcements.filter(a => a.status === 'draft').length,
    pinned: announcements.filter(a => a.isPinned).length
  }), [announcements]);

  // Pinned first; otherwise the server's order (newest first). sort() is stable.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return announcements
      .filter(a => {
        if (tab === 'pending' && a.status !== 'pending') return false;
        if (tab === 'published' && a.status !== 'published') return false;
        if (tab === 'draft' && a.status !== 'draft') return false;
        if (tab === 'scheduled' && a.status !== 'scheduled') return false;
        if (tab === 'pinned' && !a.isPinned) return false;
        if (categoryFilter !== 'All' && a.category !== categoryFilter) return false;
        if (scholarshipFilter === 'none' && a.scholarshipId) return false;
        if (scholarshipFilter !== 'All' && scholarshipFilter !== 'none' && a.scholarshipId !== scholarshipFilter) return false;
        if (q && !a.title.toLowerCase().includes(q) && !a.description.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => Number(b.isPinned) - Number(a.isPinned));
  }, [announcements, search, tab, categoryFilter, scholarshipFilter]);

  const openCreate = () => { setSaveError(''); setEditorState({ ...BLANK_FORM, fbEnabled: ownOffice === 'LSO', schedule: initialSchedule() }); };
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
      emailEnabled: a.emailEnabled,
      emailTarget: a.emailTarget ?? DEFAULT_EMAIL_TARGET,
      emailLocked: ['sending', 'sent'].includes(a.emailStatus) || a.emailSent > 0,
      existingImages: a.images,
      schedule: initialSchedule(a.status === 'scheduled' || (a.status === 'pending' && a.review?.requestedStatus === 'scheduled') ? a.scheduledFor : null),
      returnedNote: a.status === 'draft' && a.review?.decision === 'returned' ? a.review.note ?? undefined : undefined
    });
  };

  // Multipart so the optional images travel with the fields. The backend
  // saves first, then publishes/updates the Facebook post, and reports the
  // Facebook outcome separately so a Facebook failure never loses the save.
  const saveAnnouncement = async (form: EditorState, images: ImageItem[], publish: boolean) => {
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
      const scheduled = publish && form.status !== 'published' && form.schedule.timing === 'Schedule';
      data.append('status', scheduled ? 'scheduled' : publish ? 'published' : 'draft');
      if (scheduled) data.append('scheduledFor', scheduleToIso(form.schedule).iso ?? '');
      data.append('fbEnabled', String(form.fbEnabled));
      if (!form.emailLocked) {
        data.append('emailEnabled', String(form.emailEnabled));
        data.append('emailTarget', JSON.stringify(form.emailTarget));
      }
      // Saved images to keep, then new files; the backend appends new images
      // after the kept ones, which matches the editor's order (new images
      // are always added at the end).
      data.append('keepImageIds', JSON.stringify(images.flatMap(img => (img.existingId ? [img.existingId] : []))));
      images.forEach(img => { if (img.file) data.append('images', img.file, img.file.name); });

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

  // Sends a failed announcement email again, from where it stopped.
  const retryEmail = async (a: AdminAnnouncement) => {
    if (retryingId) return;
    setRetryingId(a.id);
    setActionError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/announcements/${a.id}/email/retry`, { method: 'POST', headers: await authHeaders(getToken) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Retry failed.');
      upsert(normalize(body.announcement));
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

  const listFiltersActive = search.trim() !== '' || categoryFilter !== 'All' || scholarshipFilter !== 'All';
  const usedScholarships = [...new Set(announcements.map(a => a.scholarshipId).filter((id): id is string => !!id))];
  const hasData = announcements.length > 0;
  const firstLoad = isLoading && !hasData;
  const failedEmpty = !!loadError && !hasData && !isLoading;
  const tabCount = (n: number) => (firstLoad || failedEmpty ? undefined : n);
  const newButton = <Button variant="primary" icon={Plus} onClick={openCreate}>New announcement</Button>;

  return (
    <div id={id} className="space-y-6">
      <PageHeader
        title="Announcements"
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

      {isAdsoOffice && (
        <ReviewQueue
          getToken={getToken}
          onView={a => setReviewing(a)}
          onCountChange={onReviewCountChange}
        />
      )}

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
                ...(isAdsoOffice ? [] : [{ key: 'pending' as const, label: 'Waiting for approval', count: tabCount(counts.pending) }]),
                { key: 'published', label: 'Published', count: tabCount(counts.published) },
                { key: 'scheduled', label: 'Scheduled', count: tabCount(counts.scheduled) },
                { key: 'draft', label: 'Drafts', count: tabCount(counts.draft) },
                { key: 'pinned', label: 'Pinned', count: tabCount(counts.pinned) }
              ]}
            />
            <Toolbar>
              <SearchInput value={search} onChange={setSearch} label="Search announcements" placeholder="Search title or summary…" className="flex-1" />
              <Select value={categoryFilter} onChange={setCategoryFilter} className="md:w-44" label="Filter by category">
                <option value="All">All categories</option>
                {['General', 'Update', 'Deadline', 'Event'].map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
              <Select value={scholarshipFilter} onChange={setScholarshipFilter} className="md:w-60" label="Filter by scholarship">
                <option value="All">All scholarships</option>
                <option value="none">Not about a scholarship</option>
                {usedScholarships.map(id => <option key={id} value={id}>{scholarshipName(id) ?? id}</option>)}
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
             
              action={<Button onClick={() => { setSearch(''); setCategoryFilter('All'); setScholarshipFilter('All'); }}>Clear filters</Button>}
            />
          ) : (
            <EmptyState icon={tab === 'pinned' ? Pin : Megaphone} title={EMPTY_TABS[tab].title} action={newButton} />
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
                onView={() => setViewing(a)}
                onTogglePin={() => togglePin(a)}
                onRetry={() => retryFacebook(a)}
                onRetryEmail={() => retryEmail(a)}
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
          getToken={getToken}
          ownOffice={ownOffice}
        />
      )}

      {reviewing && (
        <StudentViewDialog
          a={reviewing}
          office={(reviewing.office ?? 'LSO') as ScholarshipOffice}
          onClose={() => setReviewing(null)}
        />
      )}

      {viewing && (
        <StudentViewDialog
          a={viewing}
          office={ownOffice}
          onClose={() => setViewing(null)}
          onEdit={() => { const a = viewing; setViewing(null); openEdit(a); }}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          tone="danger"
          title="Delete announcement?"
          description="This can't be undone."
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

// --- Student view -----------------------------------------------------------------

// How the feed formats dates ("July 01, 2026"), matching the backend.
const feedDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' }) : '';

// The announcement shaped like GET /api/announcements/feed returns it.
// --- The AdSO's approval queue ---------------------------------------------------
// Every other office's announcement waiting for approval (scholarship offices
// and duty offices), oldest first: approve it (it goes out as the office
// asked: now, or at its scheduled time) or return it with what to change.

function ReviewQueue({ getToken, onView, onCountChange }: {
  getToken: () => Promise<string | null>;
  onView: (a: AdminAnnouncement) => void;
  onCountChange?: (count: number) => void;
}) {
  const [items, setItems] = useState<AdminAnnouncement[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [returning, setReturning] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState('');
  const [done, setDone] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/announcements/review`, { headers: await authHeaders(getToken) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Couldn’t load the announcements to review.');
      setItems((body.announcements ?? []).map(normalize));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t load the announcements to review.');
    }
  }, [getToken]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (items) onCountChange?.(items.length); }, [items, onCountChange]);

  const decide = async (a: AdminAnnouncement, action: 'approve' | 'return') => {
    if (action === 'return' && !note.trim()) { setNoteError('Tell the office what to change.'); return; }
    setBusyId(a.id);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/announcements/${a.id}/${action}`, {
        method: 'POST',
        headers: { ...(await authHeaders(getToken)), 'Content-Type': 'application/json' },
        body: action === 'return' ? JSON.stringify({ note: note.trim() }) : undefined,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Couldn’t save your decision.');
      setItems(prev => (prev ?? []).filter(x => x.id !== a.id));
      setReturning(null);
      setNote('');
      const later = a.review?.requestedStatus === 'scheduled' && a.scheduledFor && new Date(a.scheduledFor) > new Date();
      setDone(action === 'approve'
        ? `Approved “${a.title}”. ${later ? `It publishes ${formatScheduled(a.scheduledFor)}.` : 'Students can see it now.'}`
        : `Returned “${a.title}” to ${posterOf(a)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t save your decision.');
      load();
    } finally {
      setBusyId(null);
    }
  };

  if (!items?.length && !error && !done) return null;
  return (
    <Card
      title={<span className="flex items-center gap-2"><Hourglass className="size-4 text-warning-fg" aria-hidden />Waiting for your approval{items?.length ? <span className="font-normal text-ink-muted tabular-nums">· {items.length}</span> : null}</span>}
      description="Other offices’ announcements go out only once you approve them."
      flush
    >
      {(error || done) && (
        <div className="px-5 pt-4 sm:px-6">
          {error ? <Alert tone="danger" onDismiss={() => setError('')}>{error}</Alert> : <Alert tone="success" onDismiss={() => setDone('')}>{done}</Alert>}
        </div>
      )}
      {items && items.length > 0 ? (
        <ul className="divide-y divide-line" aria-label="Announcements waiting for approval">
          {items.map(a => {
            const busy = busyId === a.id;
            const scheduledLater = a.review?.requestedStatus === 'scheduled' && a.scheduledFor;
            const isReturning = returning === a.id;
            return (
              <li key={a.id} className="px-5 py-4 sm:px-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-ink-muted">
                      {posterOf(a)}{a.review?.requestedAt ? ` · submitted ${formatShortDate(a.review.requestedAt)}` : ''}
                    </p>
                    <h3 className="mt-0.5 font-semibold text-ink wrap-break-word">{a.title}</h3>
                    <p className="mt-0.5 line-clamp-2 text-sm text-ink-muted wrap-break-word">{a.description}</p>
                    <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-subtle">
                      <span>{scheduledLater ? `Publishes ${formatScheduled(a.scheduledFor)}` : 'Publishes when approved'}</span>
                      {a.emailEnabled && <span>Emails {a.dutyOffice ? 'the office’s scholars' : 'students'} once approved</span>}
                      {a.images.length > 0 && <span>{a.images.length} {a.images.length === 1 ? 'image' : 'images'}</span>}
                    </p>
                  </div>
                  {!isReturning && (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Button size="sm" icon={Eye} onClick={() => onView(a)}>Read</Button>
                      <Button size="sm" icon={CornerUpLeft} disabled={busy} onClick={() => { setReturning(a.id); setNote(''); setNoteError(''); }}>Return</Button>
                      <Button size="sm" variant="primary" icon={Check} loading={busy} onClick={() => decide(a, 'approve')}>Approve</Button>
                    </div>
                  )}
                </div>
                {isReturning && (
                  <div className="mt-3 space-y-3 rounded-control bg-surface-muted p-3">
                    <Field label={`What should ${posterOf(a)} change?`} error={noteError}>
                      <Textarea rows={2} maxLength={1000} value={note} autoFocus onChange={e => { setNote(e.target.value); setNoteError(''); }} placeholder="e.g. Add the venue and time of the orientation." />
                    </Field>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" disabled={busy} onClick={() => setReturning(null)}>Cancel</Button>
                      <Button size="sm" variant="primary" icon={CornerUpLeft} loading={busy} onClick={() => decide(a, 'return')}>Return to office</Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-5 py-4 text-sm text-ink-muted sm:px-6">Nothing else is waiting.</p>
      )}
    </Card>
  );
}

// Who posted it: a duty office's name, or a scholarship office's.
const posterOf = (a: AdminAnnouncement) => a.dutyOffice || OFFICE_LABELS[(a.office ?? 'LSO') as ScholarshipOffice] || 'An office';

function toStudentShape(a: AdminAnnouncement, office: ScholarshipOffice): Announcement {
  return {
    id: a.id,
    title: a.title,
    date: feedDate(a.publishedAt ?? a.scheduledFor ?? a.createdAt),
    description: a.description,
    content: a.content,
    category: a.category,
    scholarshipId: a.scholarshipId ?? null,
    postedBy: a.dutyOffice || OFFICE_LABELS[office] || null,
    imageUrls: a.images.map(img => imageSrc(img.url)),
    fbPermalink: a.fbStatus === 'posted' ? a.fbPermalink : null,
    publishedAt: a.publishedAt ?? a.scheduledFor ?? a.createdAt
  };
}

// Exactly what a student sees when they open the post. Scholars and
// applicants get the same feed, so one view covers both.
function StudentViewDialog({ a, office, onClose, onEdit }: { a: AdminAnnouncement; office: ScholarshipOffice; onClose: () => void; onEdit?: () => void }) {
  const notice = a.status === 'pending'
    ? 'This is waiting for the AdSO’s approval, so students can’t see it yet. This is how it will look once approved.'
    : a.status === 'draft'
    ? 'This is a draft, so students can’t see it yet. This is how it will look once published.'
    : a.status === 'scheduled'
      ? `Students will see this from ${formatScheduled(a.scheduledFor)}. This is how it will look.`
      : null;
  // Start at the top of the post, not on its first link.
  const topRef = useRef<HTMLDivElement>(null);
  return (
    <Modal
      title="Student view"
      description="What scholars and applicants see when they open this announcement."
      icon={<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent"><Eye className="size-4" aria-hidden /></span>}
      onClose={onClose}
      size="lg"
      initialFocusRef={topRef}
      bodyClassName="bg-canvas"
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          {onEdit && <Button variant="primary" icon={Pencil} onClick={onEdit}>Edit</Button>}
        </>
      }
    >
      <div ref={topRef} tabIndex={-1} className="space-y-4 p-4 outline-none sm:p-6">
        {notice && <Alert tone="info">{notice}</Alert>}
        {/* Framed like the student reading window. */}
        <div className="mx-auto max-w-[52rem] overflow-hidden rounded-2xl bg-white shadow-overlay ring-1 ring-line">
          <div className="border-b border-slate-100 px-5 py-3 sm:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-green">Announcement</p>
          </div>
          <div className="px-5 pb-8 pt-5 sm:px-8">
            <AnnouncementArticle announcement={toStudentShape(a, office)} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

function AnnouncementRow({ a, pinBusy, retrying, retryDisabled, onEdit, onView, onTogglePin, onRetry, onRetryEmail, onDelete }: {
  a: AdminAnnouncement;
  onView: () => void;
  pinBusy: boolean;
  retrying: boolean;
  retryDisabled: boolean;
  onEdit: () => void;
  onTogglePin: () => void;
  onRetry: () => void;
  onRetryEmail: () => void;
  onDelete: () => void;
}) {
  const CategoryIcon = CATEGORY_ICONS[a.category] ?? Bell;
  // Falls back to the category icon if the image can't load.
  const [thumbFailed, setThumbFailed] = useState(false);
  const thumb = thumbFailed || a.images.length === 0 ? null : imageSrc(a.images[0].url);
  const published = a.status === 'published';
  // An office's draft the AdSO sent back, with its note.
  const returned = a.status === 'draft' && a.review?.decision === 'returned';
  const scheduled = a.status === 'scheduled';
  const meta = [
    a.category,
    published ? `Published ${formatShortDate(a.publishedAt)}` : scheduled ? `Publishes ${formatScheduled(a.scheduledFor)}` : `Edited ${formatShortDate(a.updatedAt)}`,
    a.scholarshipId ? scholarshipName(a.scholarshipId) ?? a.scholarshipId : null
  ].filter(Boolean).join(' · ');

  return (
    <li className="relative flex gap-3 px-4 py-3.5 transition-colors hover:bg-surface-muted sm:gap-4 sm:px-5">
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
            {/* The whole row opens the Student view; the actions sit above it. */}
            <button
              type="button"
              onClick={onView}
              title={`See “${a.title}” as students do`}
              className="min-w-0 truncate rounded-badge text-left text-sm font-medium text-ink after:absolute after:inset-0 hover:text-accent focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-accent"
            >
              {a.title}
            </button>
          </div>
          <p className="mt-0.5 line-clamp-1 text-sm text-ink-muted wrap-break-word">{a.description}</p>
          <p className="mt-1 truncate text-xs text-ink-subtle tabular-nums">{meta}</p>
          {returned && (
            <p className="mt-1.5 line-clamp-2 text-xs text-danger-fg">
              <span className="font-semibold">Returned by the AdSO:</span> {a.review?.note}
            </p>
          )}
        </div>

        <div className="relative z-10 mt-2 flex items-center gap-2 sm:mt-0 sm:shrink-0">
          {published ? <Badge tone="success" dot>Published</Badge>
            : scheduled ? <Badge tone="info" icon={CalendarClock}>Scheduled</Badge>
              : a.status === 'pending' ? <Badge tone="warning" icon={Hourglass}>Waiting for AdSO</Badge>
                : returned ? <Badge tone="danger" dot>Returned</Badge>
                  : <Badge dot>Draft</Badge>}
          <EmailIndicator a={a} retrying={retrying} retryDisabled={retryDisabled} onRetry={onRetryEmail} />
          <FacebookIndicator a={a} retrying={retrying} retryDisabled={retryDisabled} onRetry={onRetry} />
          <div className="ml-auto flex items-center gap-0.5 sm:ml-2">
            <IconButton
              icon={a.isPinned ? PinOff : Pin}
              label={a.isPinned ? 'Unpin' : 'Pin to top'}
              loading={pinBusy}
              onClick={onTogglePin}
            />
            <IconButton icon={Eye} label="Student view" onClick={onView} />
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

// The Outlook email's state as a small icon: muted when not emailed, a
// count while sending, accent once sent, red with Retry when it failed.
function EmailIndicator({ a, retrying, retryDisabled, onRetry }: {
  a: AdminAnnouncement;
  retrying: boolean;
  retryDisabled: boolean;
  onRetry: () => void;
}) {
  const box = 'inline-flex h-8 items-center justify-center gap-1 rounded-control px-1.5 text-xs';
  if (a.emailStatus === 'failed') {
    return (
      <span className="flex items-center gap-1">
        <Tooltip content={a.emailError || 'The email could not be sent.'} className={`${box} text-danger-fg`}>
          <Mail className="size-4" aria-hidden />
          <span className="sr-only">Email failed</span>
        </Tooltip>
        <Button size="sm" variant="danger-secondary" icon={RotateCw} loading={retrying} disabled={retryDisabled} onClick={onRetry}>
          Retry
          <span className="sr-only"> email for “{a.title}”</span>
        </Button>
      </span>
    );
  }
  if (a.emailStatus === 'queued' || a.emailStatus === 'sending') {
    const progress = a.emailTotal ? `Emailing ${a.emailSent} of ${a.emailTotal}` : 'Email queued';
    return (
      <Tooltip content={`${progress} — sent a few batches a minute.`} className={`${box} text-warning-fg`}>
        <Mail className="size-4" aria-hidden />
        <span className="tabular-nums">{a.emailTotal ? `${a.emailSent}/${a.emailTotal}` : '…'}</span>
      </Tooltip>
    );
  }
  if (a.emailStatus === 'sent') {
    return (
      <Tooltip content={`Emailed to ${a.emailTotal} student${a.emailTotal === 1 ? '' : 's'}${a.emailSentAt ? ` on ${formatShortDate(a.emailSentAt)}` : ''}.`} className={`${box} text-accent`}>
        <Mail className="size-4" aria-hidden />
        <span className="sr-only">Emailed</span>
      </Tooltip>
    );
  }
  const note = a.emailEnabled && a.status !== 'published' ? 'Emails students when published' : 'Not emailed';
  return (
    <Tooltip content={note} className={`${box} text-ink-subtle/60`}>
      <Mail className="size-4" aria-hidden />
      <span className="sr-only">{note}</span>
    </Tooltip>
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

  const note = a.fbEnabled && a.status !== 'published' ? 'Posts to Facebook when published' : 'Not on Facebook';
  return (
    <Tooltip content={note} className={`${box} text-ink-subtle/60`}>
      <Facebook className="size-4" aria-hidden />
      <span className="sr-only">{note}</span>
    </Tooltip>
  );
}
