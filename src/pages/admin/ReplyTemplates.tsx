import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookmarkPlus, Check, ChevronDown, Copy, CopyPlus, MessageSquareText, Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
import { API_BASE_URL, authHeaders } from './adminData';
import { Alert, Badge, Button, Card, ConfirmDialog, DropdownMenu, Field, Modal, PageHeader, SearchInput, Select, Skeleton, Tabs, TextInput, Textarea } from './AdminUI';

// Saved replies (backend routes/replyTemplates.js): messages the office
// sends often, shared by the office. "Templates" next to a message box
// inserts one with {firstName}, {scholarship}, {referenceCode} and {term}
// filled in; [brackets] are left for the admin to fill.

type GetToken = () => Promise<string | null>;
export type TemplateContext = 'application' | 'renewal' | 'message';
export interface ReplyTemplate { _id: string; title: string; body: string; context: TemplateContext; decision: string | null; usedCount: number }
export type TemplateVars = Partial<Record<'firstName' | 'scholarship' | 'referenceCode' | 'term', string>>;

const CONTEXT_LABEL: Record<TemplateContext, string> = { application: 'Application decisions', renewal: 'Renewal decisions', message: 'Messages' };
const DECISIONS_FOR: Record<TemplateContext, string[]> = {
  application: ['Approved', 'Needs Revision', 'Rejected'],
  renewal: ['Renewed', 'Needs Revision', 'Not Renewed'],
  message: [],
};
type TemplateDraft = { context: TemplateContext; decision: string | null; body: string; title?: string };
const PLACEHOLDERS = ['{firstName}', '{scholarship}', '{referenceCode}', '{term}'];
// What each one means, in plain words, for the people writing templates.
const PLACEHOLDER_LABELS: Record<string, string> = {
  '{firstName}': 'Student’s first name',
  '{scholarship}': 'Scholarship name',
  '{referenceCode}': 'Reference number',
  '{term}': 'Semester',
};

// A template's text with its parts shown as chips: green ones AniSkolar
// fills in (the student's name…), yellow ones the sender types each time.
export function TemplateText({ body, className = '' }: { body: string; className?: string }) {
  const parts = body.split(/(\{\w+\}|\[[^\]\n]+\])/g);
  return (
    <p className={`whitespace-pre-line ${className}`}>
      {parts.map((part, i) => {
        if (PLACEHOLDER_LABELS[part]) return <Chip key={i} tone="fill">{PLACEHOLDER_LABELS[part]}</Chip>;
        if (/^\[[^\]]+\]$/.test(part)) return <Chip key={i} tone="type">{part.slice(1, -1)}</Chip>;
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </p>
  );
}

function Chip({ tone, children }: { tone: 'fill' | 'type'; children: React.ReactNode }) {
  return (
    <span className={`mx-0.5 inline-block rounded-badge px-1.5 py-px text-[0.92em] font-medium ${tone === 'fill' ? 'bg-success-bg text-success-fg' : 'bg-warning-bg text-warning-fg'}`}>
      {children}
    </span>
  );
}

// "DELA CRUZ, JUAN M." or "Juan M. Dela Cruz" → "Juan".
export function firstNameOf(name?: string | null): string {
  const n = (name ?? '').trim();
  if (!n) return '';
  const first = (n.includes(',') ? n.split(',')[1] : n).trim().split(/\s+/)[0] ?? '';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export function fillTemplate(body: string, vars: TemplateVars): string {
  return body.replace(/\{(firstName|scholarship|referenceCode|term)\}/g, (m, key: keyof TemplateVars) => vars[key]?.trim() || m);
}

// Parts still to fill in: [brackets] and placeholders that had no value.
export function unfilledParts(text: string): string[] {
  return [...new Set([...(text.match(/\[[^\]\n]{1,60}\]/g) ?? []), ...(text.match(/\{(firstName|scholarship|referenceCode|term)\}/g) ?? [])])];
}

export function UnfilledHint({ text }: { text: string }) {
  const parts = unfilledParts(text);
  if (!parts.length) return null;
  return <p className="text-xs font-medium text-warning-fg">Still to fill in: {parts.join(', ')}</p>;
}

async function api<T>(getToken: GetToken, path: string, init?: { method: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/api/reply-templates${path}`, {
    method: init?.method ?? 'GET',
    headers: await authHeaders(getToken, !!init?.body),
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Something went wrong.');
  return body as T;
}

// "Templates" button: a searchable list for this context, the decision's
// own first. onInsert gets the filled text.
export function TemplatePicker({ getToken, context, decision, vars, value, onInsert, disabled }: {
  getToken: GetToken;
  context: TemplateContext;
  decision?: string | null;
  vars: TemplateVars;
  value: string;
  onInsert: (text: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<ReplyTemplate[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [managing, setManaging] = useState<'list' | ReplyTemplate | 'new' | null>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setTemplates((await api<{ templates: ReplyTemplate[] }>(getToken, '')).templates);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the templates.');
    }
  }, [getToken]);

  // In a portal, fixed under (or above) the button, so a modal's scroll
  // area doesn't clip it.
  const place = useCallback(() => {
    const r = buttonRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(384, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const down = below >= Math.min(320, above);
    const maxHeight = Math.min(420, down ? below : above);
    setPos(down ? { left, width, maxHeight, top: r.bottom + 4 } : { left, width, maxHeight, bottom: window.innerHeight - r.top + 4 });
  }, []);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    if (!templates) load();
    const onDown = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); buttonRef.current?.focus(); } };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, templates, load, place]);

  const q = query.trim().toLowerCase();
  const list = (templates ?? [])
    .filter(t => t.context === context)
    .filter(t => !q || t.title.toLowerCase().includes(q) || t.body.toLowerCase().includes(q));
  const forDecision = decision ? list.filter(t => t.decision === decision) : [];
  const others = decision ? list.filter(t => t.decision !== decision) : list;

  const choose = (t: ReplyTemplate) => {
    const filled = fillTemplate(t.body, vars);
    onInsert(value.trim() ? `${value.trimEnd()}\n\n${filled}` : filled);
    setOpen(false);
    api(getToken, `/${t._id}/used`, { method: 'POST' }).catch(() => {});
  };

  const item = (t: ReplyTemplate) => (
    <li key={t._id}>
      <button type="button" onClick={() => choose(t)} className="block w-full px-3 py-2 text-left hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-ink">{t.title}</span>
          {t.decision && t.decision !== decision && <Badge tone="neutral">{t.decision}</Badge>}
        </span>
        <span className="line-clamp-2 text-xs text-ink-subtle">{fillTemplate(t.body, vars)}</span>
      </button>
    </li>
  );

  return (
    <>
      <Button ref={buttonRef} type="button" size="sm" variant="ghost" icon={MessageSquareText} iconRight={ChevronDown} onClick={() => setOpen(o => !o)} disabled={disabled} aria-expanded={open} aria-haspopup="dialog">
        Templates
      </Button>
      {open && pos && createPortal(
        <div
          data-admin
          ref={panelRef}
          role="dialog"
          aria-label="Insert a template"
          style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
          className="z-[1000] flex flex-col overflow-hidden rounded-card bg-surface shadow-lg ring-1 ring-line"
        >
          <div className="border-b border-line p-2">
            <SearchInput value={query} onChange={setQuery} label="Search templates" placeholder="Search templates…" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {error ? <p className="p-3 text-sm text-danger">{error}</p>
              : !templates ? <div role="status" className="space-y-3 p-3"><span className="sr-only">Loading templates…</span>{[0, 1, 2].map(i => <div key={i} className="space-y-1.5"><Skeleton className="h-3.5 w-1/2" /><Skeleton className="h-3 w-full" /></div>)}</div>
                : !list.length ? <p className="p-3 text-sm text-ink-subtle">{q ? 'No template matches.' : 'No templates here yet.'}</p>
                  : (
                    <>
                      {forDecision.length > 0 && (
                        <>
                          <p className="px-3 pt-2 text-xs font-semibold text-ink-subtle">For “{decision}”</p>
                          <ul>{forDecision.map(item)}</ul>
                        </>
                      )}
                      {others.length > 0 && (
                        <>
                          {forDecision.length > 0 && <p className="px-3 pt-2 text-xs font-semibold text-ink-subtle">Others</p>}
                          <ul>{others.map(item)}</ul>
                        </>
                      )}
                    </>
                  )}
          </div>
          <div className="flex flex-wrap gap-1 border-t border-line p-2">
            {value.trim() && (
              <Button size="sm" variant="ghost" icon={BookmarkPlus} onClick={() => { setOpen(false); setManaging('new'); }}>Save this message</Button>
            )}
            <Button size="sm" variant="ghost" icon={Settings2} onClick={() => { setOpen(false); setManaging('list'); }} className="ml-auto">Manage</Button>
          </div>
        </div>,
        document.body
      )}
      {managing && (
        <ManageTemplates
          getToken={getToken}
          templates={templates ?? []}
          start={managing}
          draft={managing === 'new' ? { context, decision: decision ?? null, body: value.trim() } : undefined}
          onChanged={load}
          onClose={() => setManaging(null)}
        />
      )}
    </>
  );
}

// Admin console → Message templates: the office's saved replies as cards,
// a tab per place they're used, with edit, duplicate and delete one click
// away.
const SAMPLE_VARS: TemplateVars = { firstName: 'Maria', scholarship: 'Student Financial Aid Grant (SFAG)', referenceCode: 'SFAG-2026-0001', term: '1st Semester' };
const CONTEXT_HINT: Record<TemplateContext, string> = {
  message: 'For Messages to a student or office.',
  application: 'Shown when you decide an application.',
  renewal: 'Shown when you decide a renewal.',
};

export function TemplatesPage({ getToken }: { getToken: GetToken }) {
  const [templates, setTemplates] = useState<ReplyTemplate[] | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<TemplateContext>('message');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ template: ReplyTemplate | null; draft?: TemplateDraft } | null>(null);
  const [deleting, setDeleting] = useState<ReplyTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTemplates((await api<{ templates: ReplyTemplate[] }>(getToken, '')).templates);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the templates.');
    }
  }, [getToken]);
  useEffect(() => { load(); }, [load]);

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(getToken, `/${deleting._id}`, { method: 'DELETE' });
      setDeleting(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete.');
    } finally {
      setBusy(false);
    }
  };
  const copy = async (t: ReplyTemplate) => {
    try { await navigator.clipboard.writeText(t.body); setCopied(t._id); window.setTimeout(() => setCopied(c => (c === t._id ? null : c)), 1500); } catch { /* no clipboard */ }
  };

  const q = query.trim().toLowerCase();
  const count = (c: TemplateContext) => (templates ?? []).filter(t => t.context === c).length;
  const shown = (templates ?? [])
    .filter(t => t.context === tab)
    .filter(t => !q || t.title.toLowerCase().includes(q) || t.body.toLowerCase().includes(q))
    .sort((a, b) => (DECISIONS_FOR[tab].indexOf(a.decision ?? '') - DECISIONS_FOR[tab].indexOf(b.decision ?? '')) || b.usedCount - a.usedCount || a.title.localeCompare(b.title));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Message templates"
        actions={<Button variant="primary" icon={Plus} onClick={() => setEditing({ template: null, draft: { context: tab, decision: null, body: '' } })}>New template</Button>}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <Tabs<TemplateContext>
          label="Where templates are used"
          value={tab}
          onChange={setTab}
          tabs={(['message', 'application', 'renewal'] as TemplateContext[]).map(c => ({ key: c, label: CONTEXT_LABEL[c], count: templates ? count(c) : undefined }))}
        />
        <div className="lg:w-72"><SearchInput value={query} onChange={setQuery} label="Search templates" placeholder="Search templates…" /></div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span>{CONTEXT_HINT[tab]}</span>
        <span className="inline-flex items-center gap-1"><Chip tone="fill">Green</Chip> filled in for you</span>
        <span className="inline-flex items-center gap-1"><Chip tone="type">Yellow</Chip> you type it in</span>
      </div>

      {error && <Alert tone="danger" onDismiss={() => setError('')}>{error}</Alert>}

      {!templates ? (
        <div className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map(i => <Card key={i}><Skeleton className="h-4 w-1/2" /><Skeleton className="mt-3 h-12 w-full" /></Card>)}</div>
      ) : shown.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <MessageSquareText className="size-8 text-ink-subtle" aria-hidden />
            <p className="text-sm font-medium text-ink">{q ? 'No template matches your search.' : `No ${CONTEXT_LABEL[tab].toLowerCase()} templates yet.`}</p>
            {!q && <Button icon={Plus} onClick={() => setEditing({ template: null, draft: { context: tab, decision: null, body: '' } })}>Create the first one</Button>}
          </div>
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {shown.map(t => (
            <li key={t._id} className="group flex flex-col rounded-card bg-surface p-5 shadow-card ring-1 ring-line transition-shadow hover:shadow-overlay">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-ink">{t.title}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {t.decision && <Badge tone={t.decision === 'Approved' || t.decision === 'Renewed' ? 'success' : t.decision === 'Needs Revision' ? 'warning' : 'danger'}>{t.decision}</Badge>}
                    <span className="text-xs text-ink-subtle">{t.usedCount > 0 ? `Used ${t.usedCount} ${t.usedCount === 1 ? 'time' : 'times'}` : 'Not used yet'}</span>
                  </div>
                </div>
                <DropdownMenu
                  label={`More for ${t.title}`}
                  items={[
                    { key: 'dup', label: 'Duplicate', icon: CopyPlus, onSelect: () => setEditing({ template: null, draft: { context: t.context, decision: t.decision, body: t.body, title: `${t.title} (copy)` } }) },
                    { key: 'del', label: 'Delete', icon: Trash2, tone: 'danger', onSelect: () => setDeleting(t) },
                  ]}
                />
              </div>
              <TemplateText body={t.body} className="mt-3 line-clamp-4 flex-1 text-sm leading-relaxed text-ink-muted" />
              <div className="mt-4 flex gap-2 border-t border-line pt-3">
                <Button size="sm" icon={Pencil} onClick={() => setEditing({ template: t })}>Edit</Button>
                <Button size="sm" variant="ghost" icon={copied === t._id ? Check : Copy} onClick={() => copy(t)}>{copied === t._id ? 'Copied' : 'Copy text'}</Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <TemplateForm
          getToken={getToken}
          template={editing.template}
          draft={editing.draft}
          onCancel={() => setEditing(null)}
          onSaved={async () => { await load(); setEditing(null); }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.title}”?`}
          description="It’s removed for everyone in your office."
          confirmLabel="Delete"
          tone="danger"
          busy={busy}
          onConfirm={remove}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function ManageTemplates({ getToken, templates, start, draft, onChanged, onClose }: {
  getToken: GetToken;
  templates: ReplyTemplate[];
  start: 'list' | 'new' | ReplyTemplate;
  draft?: TemplateDraft;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<ReplyTemplate | 'new' | null>(start === 'list' ? null : start);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<TemplateContext | 'all'>(draft?.context ?? 'all');
  const [savedFromHere, setSavedFromHere] = useState(false);

  const remove = async (t: ReplyTemplate) => {
    if (!window.confirm(`Delete the template “${t.title}”?`)) return;
    setDeleting(t._id);
    try {
      await api(getToken, `/${t._id}`, { method: 'DELETE' });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete.');
    } finally {
      setDeleting(null);
    }
  };

  if (editing) {
    return (
      <TemplateForm
        getToken={getToken}
        template={editing === 'new' ? null : editing}
        draft={editing === 'new' ? draft : undefined}
        onCancel={() => (start === 'list' || savedFromHere ? setEditing(null) : onClose())}
        onSaved={async () => {
          await onChanged();
          if (start === 'new') { onClose(); return; }
          setSavedFromHere(true);
          setEditing(null);
        }}
      />
    );
  }

  const shown = templates.filter(t => filter === 'all' || t.context === filter);
  return (
    <Modal
      size="lg"
      title="Message templates"
      onClose={onClose}
      footer={<><Button onClick={onClose}>Done</Button><Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>New template</Button></>}
    >
      <div className="space-y-3">
        {error && <Alert tone="danger" onDismiss={() => setError('')}>{error}</Alert>}
        <Select value={filter} onChange={v => setFilter(v as TemplateContext | 'all')} label="Show" className="w-full sm:w-64">
          <option value="all">All templates</option>
          {(Object.keys(CONTEXT_LABEL) as TemplateContext[]).map(c => <option key={c} value={c}>{CONTEXT_LABEL[c]}</option>)}
        </Select>
        {shown.length === 0 ? <p className="text-sm text-ink-subtle">No templates yet.</p> : (
          <ul className="divide-y divide-line rounded-control ring-1 ring-line">
            {shown.map(t => (
              <li key={t._id} className="flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                    {t.title}
                    <Badge tone="neutral">{t.decision ?? CONTEXT_LABEL[t.context]}</Badge>
                    {t.usedCount > 0 && <span className="text-xs font-normal text-ink-subtle">used {t.usedCount}×</span>}
                  </p>
                  <TemplateText body={t.body} className="mt-0.5 line-clamp-2 text-xs text-ink-muted" />
                </div>
                <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(t)} aria-label={`Edit ${t.title}`} />
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(t)} loading={deleting === t._id} aria-label={`Delete ${t.title}`} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function TemplateForm({ getToken, template, draft, onCancel, onSaved }: {
  getToken: GetToken;
  template: ReplyTemplate | null;
  draft?: TemplateDraft;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(template?.title ?? draft?.title ?? '');
  const [context, setContext] = useState<TemplateContext>(template?.context ?? draft?.context ?? 'message');
  const [decision, setDecision] = useState(template?.decision ?? draft?.decision ?? '');
  const [body, setBody] = useState(template?.body ?? draft?.body ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const decisions = DECISIONS_FOR[context];

  const insertPlaceholder = (p: string) => {
    const el = bodyRef.current;
    const at = el ? el.selectionStart : body.length;
    const next = body.slice(0, at) + p + body.slice(el ? el.selectionEnd : body.length);
    setBody(next);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + p.length, at + p.length); });
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = { title, body, context, decision: decisions.includes(decision) ? decision : null };
      await api(getToken, template ? `/${template._id}` : '', { method: template ? 'PUT' : 'POST', body: payload });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
      setSaving(false);
    }
  };

  const [sample, setSample] = useState(true);
  const missing = !title.trim() ? 'Give it a name.' : !body.trim() ? 'Write the message.' : '';

  return (
    <Modal
      size="xl"
      title={template ? 'Edit template' : 'New template'}
      onClose={onCancel}
      dismissible={!saving}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {missing && <span className="mr-auto text-sm text-ink-subtle">{missing}</span>}
          <Button onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!!missing}>Save template</Button>
        </div>
      }
    >
      <form className="grid gap-6 lg:grid-cols-2" onSubmit={e => { e.preventDefault(); if (!missing) save(); }}>
        <div className="space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Name">
            <TextInput value={title} onChange={e => setTitle(e.target.value)} maxLength={80} autoFocus={!template} placeholder="e.g. Blurry document" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Used for">
              <Select value={context} onChange={v => { setContext(v as TemplateContext); setDecision(''); }}>
                {(Object.keys(CONTEXT_LABEL) as TemplateContext[]).map(c => <option key={c} value={c}>{CONTEXT_LABEL[c]}</option>)}
              </Select>
            </Field>
            {decisions.length > 0 && (
              <Field label="Decision" optional>
                <Select value={decision} onChange={setDecision}>
                  <option value="">Any decision</option>
                  {decisions.map(d => <option key={d} value={d}>{d}</option>)}
                </Select>
              </Field>
            )}
          </div>
          <Field label="Message" labelAside={`${body.length}/2000`}>
            <Textarea ref={bodyRef} value={body} onChange={e => setBody(e.target.value)} rows={8} maxLength={2000} className="resize-y" placeholder="Hi, …" />
          </Field>
          <div className="space-y-2">
            <p className="text-xs font-medium text-ink-muted">Tap to add where your cursor is</p>
            <div className="flex flex-wrap gap-2">
              {PLACEHOLDERS.map(p => (
                <button key={p} type="button" onClick={() => insertPlaceholder(p)} className="rounded-full bg-success-bg px-2.5 py-1 text-xs font-medium text-success-fg transition hover:brightness-95 active:scale-95">
                  + {PLACEHOLDER_LABELS[p]}
                </button>
              ))}
              <button type="button" onClick={() => insertPlaceholder('[what to write]')} className="rounded-full bg-warning-bg px-2.5 py-1 text-xs font-medium text-warning-fg transition hover:brightness-95 active:scale-95">
                + Something you type each time
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3 lg:border-l lg:border-line lg:pl-6">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink">Preview</p>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink-muted">
              <input type="checkbox" checked={sample} onChange={e => setSample(e.target.checked)} className="accent-current" />
              Show with a sample student
            </label>
          </div>
          <div className="rounded-card bg-surface-muted p-4">
            {body.trim() ? (
              <div className="ml-auto max-w-[90%] rounded-2xl rounded-br-md bg-surface px-4 py-3 shadow-card ring-1 ring-line">
                <TemplateText body={sample ? fillTemplate(body, SAMPLE_VARS) : body} className="text-sm leading-relaxed text-ink" />
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-ink-subtle">Your message shows here as you type.</p>
            )}
          </div>
          <p className="text-xs text-ink-subtle">
            <Chip tone="fill">Green</Chip> is filled in for each student. <Chip tone="type">Yellow</Chip> is for you to type before sending: change the words in the [ ] to say what, e.g. [which document].
          </p>
        </div>
      </form>
    </Modal>
  );
}
