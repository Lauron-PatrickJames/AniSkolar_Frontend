import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookmarkPlus, ChevronDown, MessageSquareText, Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
import { API_BASE_URL, authHeaders } from './adminData';
import { Alert, Badge, Button, Field, Modal, SearchInput, Select, TextInput, Textarea } from './AdminUI';

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
const PLACEHOLDERS = ['{firstName}', '{scholarship}', '{referenceCode}', '{term}'];

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
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
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
    const maxHeight = Math.min(420, Math.max(below, above));
    setPos({ left, width, maxHeight, top: below >= Math.min(320, above) ? r.bottom + 4 : r.top - 4 - maxHeight });
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
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
          className="z-[1000] flex flex-col overflow-hidden rounded-card bg-surface shadow-lg ring-1 ring-line"
        >
          <div className="border-b border-line p-2">
            <SearchInput value={query} onChange={setQuery} label="Search templates" placeholder="Search templates…" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {error ? <p className="p-3 text-sm text-danger">{error}</p>
              : !templates ? <p className="p-3 text-sm text-ink-subtle">Loading…</p>
                : !list.length ? <p className="p-3 text-sm text-ink-subtle">{q ? 'No template matches.' : 'No templates here yet.'}</p>
                  : (
                    <>
                      {forDecision.length > 0 && (
                        <>
                          <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">For “{decision}”</p>
                          <ul>{forDecision.map(item)}</ul>
                        </>
                      )}
                      {others.length > 0 && (
                        <>
                          {forDecision.length > 0 && <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Others</p>}
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

function ManageTemplates({ getToken, templates, start, draft, onChanged, onClose }: {
  getToken: GetToken;
  templates: ReplyTemplate[];
  start: 'list' | 'new' | ReplyTemplate;
  draft?: { context: TemplateContext; decision: string | null; body: string };
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
      description="Shared with everyone in your office. {firstName}, {scholarship}, {referenceCode} and {term} are filled in when you insert one; [brackets] are for you to fill."
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
                  <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-xs text-ink-muted">{t.body}</p>
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
  draft?: { context: TemplateContext; decision: string | null; body: string };
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(template?.title ?? '');
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

  return (
    <Modal
      size="lg"
      title={template ? 'Edit template' : 'New template'}
      onClose={onCancel}
      dismissible={!saving}
      footer={<><Button onClick={onCancel} disabled={saving}>Cancel</Button><Button variant="primary" onClick={save} loading={saving}>Save template</Button></>}
    >
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); save(); }}>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Name" helper="What you'll pick it by, e.g. “Blurry document”.">
          <TextInput value={title} onChange={e => setTitle(e.target.value)} maxLength={80} autoFocus={!!draft || !template} />
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
          <Textarea ref={bodyRef} value={body} onChange={e => setBody(e.target.value)} rows={6} maxLength={2000} className="resize-y" />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-subtle">Insert:</span>
          {PLACEHOLDERS.map(p => <Button key={p} size="sm" variant="ghost" onClick={() => insertPlaceholder(p)}>{p}</Button>)}
        </div>
        <p className="text-xs text-ink-subtle">Filled in from the student and the application or renewal. Use [brackets] for parts to write each time, e.g. [which document].</p>
      </form>
    </Modal>
  );
}
