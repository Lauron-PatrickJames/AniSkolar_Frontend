import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Download, ExternalLink, FileText, RotateCcw, ShieldCheck, XCircle
} from 'lucide-react';
import { AnswersStyleProvider, ApplicationFormAnswers, EvaluationSheetAnswers } from '../../components/grant-forms/GrantAnswersView';
import PolcaAdminFieldsCard from '../../components/grant-forms/PolcaAdminFieldsCard';
import { SfagAnswers, StandardProfileAnswers } from '../../components/grant-forms/StandardAnswersView';
import { mockScholarships, officeDisplayName } from '../../data/scholarships';
import { GrantApplicationDetails, PolcaAdminFields, Scholarship, SfagApplicationDetails } from '../../types';
import { isGrantFormType, toGrantDetails } from '../../utils/grantForms';
import {
  API_BASE_URL, AdminApplication, AdminDocument, AppStatus, applicantEmail, applicantName, applicantPhone,
  applicantProgram, applicantYearLevel, authHeaders, documentUrl, formatBytes, formatDate, formatDateTime,
  historyLabel, isOfficeApp, normalizeApplication, titleCaseName
} from './adminData';
import {
  Alert, Avatar, Badge, Button, ButtonVariant, Card, ConfirmDialog, CopyButton, EmptyState, Field, IconButton,
  LinkButton, PageHeader, Quote, StatusBadge, STATUS_META, Tabs, Textarea, Toast, Tooltip
} from './AdminUI';
import HistoryList from './HistoryList';
import { buildApplicationHistory, latestDecision, partnerOfficeDecision, relativeTime } from './history';

type ReviewTab = 'form' | 'documents' | 'activity';
type Decision = Exclude<AppStatus, 'Under Evaluation'>;

const DECISIONS: Record<Decision, {
  variant: ButtonVariant; confirmTone: 'primary' | 'danger'; icon: React.ElementType; action: string; done: string; noteRequired: boolean;
}> = {
  'Approved': { variant: 'primary', confirmTone: 'primary', icon: CheckCircle2, action: 'Approve', done: 'Approved', noteRequired: false },
  'Needs Revision': { variant: 'secondary', confirmTone: 'primary', icon: RotateCcw, action: 'Request revision', done: 'Revision requested', noteRequired: true },
  'Rejected': { variant: 'danger-ghost', confirmTone: 'danger', icon: XCircle, action: 'Reject', done: 'Rejected', noteRequired: true }
};
const DECISION_ORDER: Decision[] = ['Approved', 'Needs Revision', 'Rejected'];

interface ApplicationReviewProps {
  app: AdminApplication;
  // Office code for office admins (POLCA, ALUMNI); null for the AdSO.
  adminOffice: string | null;
  getToken: () => Promise<string | null>;
  onBack: () => void;
  onUpdated: (updated: AdminApplication) => void;
  onAdminFieldsSaved: (fields: PolcaAdminFields) => void;
  // Where this application sits in the list it was opened from.
  position: { index: number; total: number } | null;
  onPrev?: () => void;
  onNext?: () => void;
  onOpenScholar: (studentNumber: string) => void;
}

// One application: header with the applicant summary, Application form /
// Documents / Activity tabs, and the decision panel. Mount with
// key={app._id} so per-application state resets when switching.
export default function ApplicationReview({
  app, adminOffice, getToken, onUpdated, onAdminFieldsSaved, position, onPrev, onNext, onOpenScholar
}: ApplicationReviewProps) {
  const [activeTab, setActiveTab] = useState<ReviewTab>('form');
  const [toast, setToast] = useState<string | null>(null);

  const isGrant = isGrantFormType(app.applicationFormType);
  const scholarship = mockScholarships.find(s => s.id === app.scholarshipId);
  const grantDetails = isGrant && scholarship ? toGrantDetails(app, scholarship) : null;
  const name = titleCaseName(applicantName(app));
  const officeApp = isOfficeApp(app);
  const events = useMemo(() => buildApplicationHistory(app, name), [app, name]);
  const missing = useMemo(() => missingDocuments(app, scholarship, grantDetails), [app, scholarship, grantDetails]);

  // J / K move to the next / previous application, unless typing or a dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const key = e.key.toLowerCase();
      if (key === 'j' && onNext) { e.preventDefault(); onNext(); }
      if (key === 'k' && onPrev) { e.preventDefault(); onPrev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNext, onPrev]);

  const tabs: { key: ReviewTab; label: string; count?: number }[] = [
    { key: 'form', label: 'Application form' },
    { key: 'documents', label: 'Documents', count: app.documents.length },
    { key: 'activity', label: 'Activity', count: events.length }
  ];

  const program = applicantProgram(app);
  const yearLevel = applicantYearLevel(app);
  const summary: [string, React.ReactNode][] = [
    ['Student no.', <span className="tabular-nums">{app.studentNumber}</span>],
    ['Program', program || yearLevel
      ? <>{program}{program && yearLevel && ' · '}<span className="whitespace-nowrap">{yearLevel}</span></>
      : '—'],
    ['Email', applicantEmail(app) || '—'],
    ['Mobile', applicantPhone(app) || '—']
  ];

  return (
    <>
      <PageHeader
        leading={<Avatar name={name} avatarUrl={app.avatarUrl} size="lg" />}
        title={
          <button
            type="button"
            onClick={() => onOpenScholar(app.studentNumber)}
            className="rounded-badge text-left hover:underline hover:decoration-line-strong hover:underline-offset-4"
            title="Open scholar record"
          >
            {name}
          </button>
        }
        description={app.scholarshipName}
        meta={
          <>
            <StatusBadge status={app.status} />
            {officeApp && <Badge>via {officeDisplayName(app.office)}</Badge>}
            {officeApp && app.decisionOffice === 'LSO' && <Badge tone="warning" icon={ShieldCheck}>AdSO override</Badge>}
            <span className="flex items-center gap-1 text-xs text-ink-subtle">
              <span className="font-mono">{app.referenceCode}</span>
              <CopyButton value={app.referenceCode} label="Copy reference" />
              <span aria-hidden>·</span>
              <span>Submitted {formatDate(app.createdAt)}</span>
            </span>
          </>
        }
        actions={position && position.total > 1 && (
          <div className="flex items-center gap-1">
            <span className="mr-1 text-xs text-ink-subtle tabular-nums">{position.index + 1} of {position.total}</span>
            <IconButton icon={ChevronLeft} label="Previous application (K)" onClick={onPrev} disabled={!onPrev} variant="secondary" />
            <IconButton icon={ChevronRight} label="Next application (J)" onClick={onNext} disabled={!onNext} variant="secondary" />
          </div>
        )}
      />

      <dl className="grid grid-cols-2 gap-x-8 gap-y-3 border-y border-line py-4 md:grid-cols-4">
        {summary.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-ink-subtle">{label}</dt>
            <dd className={`mt-0.5 text-sm text-ink ${label === 'Program' ? 'wrap-break-word' : 'truncate'}`}>{value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <Card flush className="min-w-0 lg:col-span-2" headerSlot={<Tabs<ReviewTab> tabs={tabs} value={activeTab} onChange={setActiveTab} label="Application sections" />}>
          <div role="tabpanel" aria-label={tabs.find(t => t.key === activeTab)?.label} className="p-5 sm:p-6">
            {activeTab === 'form' && <FormTab app={app} scholarship={scholarship} grantDetails={grantDetails} />}
            {activeTab === 'documents' && <DocumentsTab docs={app.documents} missing={missing} />}
            {activeTab === 'activity' && <HistoryList events={events} empty="No history recorded for this application yet." label="Application activity" />}
          </div>
        </Card>

        {/* Decision column: stays in view while reading on desktop; below
            the tabs on smaller screens. */}
        <aside
          aria-label="Review decision"
          className="min-w-0 space-y-6 lg:sticky lg:top-20 lg:-m-1 lg:max-h-[calc(100dvh-var(--spacing-topbar)-3rem)] lg:overflow-y-auto lg:p-1"
        >
          {!adminOffice && officeApp && <PartnerDecision app={app} name={name} />}
          <DecisionPanel
            app={app}
            name={name}
            adminOffice={adminOffice}
            getToken={getToken}
            onDecided={(updated, status) => {
              onUpdated(updated);
              const sentToAdso = !!adminOffice && !app.forwardedAt && !!updated.forwardedAt;
              setToast(sentToAdso ? 'Approved and sent to the AdSO.' : `${DECISIONS[status].done}.`);
            }}
          />
          <InternalNotes app={app} getToken={getToken} onSaved={notes => onUpdated({ ...app, internalNotes: notes })} />
          {app.applicationFormType === 'polca' && (
            <PolcaAdminFieldsCard
              applicationId={app._id}
              fields={app.adminFields}
              getToken={getToken}
              apiBaseUrl={API_BASE_URL}
              onSaved={onAdminFieldsSaved}
            />
          )}
        </aside>
      </div>

      {toast && (
        <Toast
          message={toast}
          onClose={() => setToast(null)}
          action={onNext ? { label: 'Next application', onClick: onNext } : undefined}
        />
      )}
    </>
  );
}

// --- Application form tab ---------------------------------------------------------

// Only the answers the header doesn't already show (name, student no.,
// program, year level, email and mobile are left out), in the admin style.
function FormTab({ app, scholarship, grantDetails }: {
  app: AdminApplication;
  scholarship?: Scholarship;
  grantDetails: GrantApplicationDetails | null;
}) {
  let content: React.ReactNode;
  if (isGrantFormType(app.applicationFormType)) {
    content = grantDetails ? (
      <div className="space-y-8">
        <ApplicationFormAnswers details={grantDetails} scholarship={scholarship} />
        {grantDetails.evaluationSheet && (
          <section className="space-y-5 border-t border-line pt-6">
            <h2 className="text-base font-semibold text-ink">Evaluation sheet</h2>
            <EvaluationSheetAnswers sheet={grantDetails.evaluationSheet} />
          </section>
        )}
      </div>
    ) : (
      <EmptyState title="Form unavailable" description="This scholarship is no longer in the registry, so its form can't be displayed." />
    );
  } else if (app.applicationFormType === 'sfag' && app.personalInfo) {
    content = (
      <SfagAnswers details={{
        personalInfo: app.personalInfo,
        contactSchool: app.contactSchool,
        parentsGuardian: app.parentsGuardian,
        siblings: app.siblings ?? [],
        assetsExpenses: app.assetsExpenses,
        agreement: app.agreement
      } as unknown as SfagApplicationDetails} />
    );
  } else if (app.standardInfo) {
    content = <StandardProfileAnswers info={app.standardInfo} />;
  } else {
    content = <EmptyState title="No form answers on file" description="This application was saved without form answers." />;
  }
  return <AnswersStyleProvider variant="admin" hideSummary>{content}</AnswersStyleProvider>;
}

// --- Documents tab -------------------------------------------------------------------

// Required documents not attached, per the scholarship's requirements:
// upload slots for the grant forms (including conditional ones), the
// requirement labels for the other forms.
function missingDocuments(app: AdminApplication, scholarship: Scholarship | undefined, grantDetails: GrantApplicationDetails | null): string[] {
  if (!scholarship) return [];
  if (scholarship.documentSlots) {
    const present = new Set(app.documents.map(d => d.slotKey).filter(Boolean));
    return scholarship.documentSlots
      .filter(slot => slot.source !== 'form' && !slot.optional)
      .filter(slot => !slot.requiredWhen || (grantDetails ? slot.requiredWhen(grantDetails) : false))
      .filter(slot => !present.has(slot.key))
      .map(slot => slot.label);
  }
  const present = new Set(app.documents.map(d => d.docType));
  return scholarship.requirements.filter(req => !present.has(req));
}

function DocumentsTab({ docs, missing }: { docs: AdminDocument[]; missing: string[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(docs[0]?.fileId ?? null);
  const selected = docs.find(d => d.fileId === selectedId) ?? null;

  return (
    <div className="space-y-5">
      {missing.length > 0 ? (
        <Alert tone="warning" icon={AlertTriangle} title={`${missing.length} required ${missing.length === 1 ? 'document is' : 'documents are'} missing`}>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">{missing.map(m => <li key={m}>{m}</li>)}</ul>
        </Alert>
      ) : docs.length > 0 && (
        <p className="flex items-center gap-1.5 text-sm text-success-fg"><CheckCircle2 className="size-4" aria-hidden />All required documents are attached.</p>
      )}

      {docs.length === 0 ? (
        <EmptyState icon={FileText} title="No documents uploaded" description="The applicant didn't attach any files to this application." />
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
          <ul className="space-y-1 xl:col-span-2" aria-label="Documents">
            {docs.map(doc => {
              const active = doc.fileId === selectedId;
              return (
                <li key={doc.fileId}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedId(doc.fileId)}
                    className={`flex w-full items-start gap-2.5 rounded-control px-3 py-2 text-left transition-colors ${active ? 'bg-accent-subtle' : 'hover:bg-surface-muted'}`}
                  >
                    <FileText className={`mt-0.5 size-4 shrink-0 ${active ? 'text-accent' : 'text-ink-subtle'}`} aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm text-ink">{doc.docType}</span>
                      {doc.variant && <span className="block text-xs text-ink-muted">{doc.variant}</span>}
                      <span className="block truncate text-xs text-ink-subtle" title={doc.filename}>
                        {doc.filename}{doc.size ? ` · ${formatBytes(doc.size)}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="min-w-0 xl:col-span-3">
            {selected && <DocumentPreview key={selected.fileId} doc={selected} />}
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentPreview({ doc }: { doc: AdminDocument }) {
  const [failed, setFailed] = useState(false);
  const url = documentUrl(doc.fileId);
  const isImage = doc.mimetype?.startsWith('image/');
  const isPdf = doc.mimetype === 'application/pdf';
  return (
    <figure className="space-y-2">
      <div className="flex h-[26rem] items-center justify-center overflow-hidden rounded-control bg-surface-muted ring-1 ring-inset ring-line">
        {isImage && !failed ? (
          <img src={url} alt={doc.docType} className="max-h-full max-w-full object-contain" onError={() => setFailed(true)} />
        ) : isPdf ? (
          <iframe src={url} title={doc.docType} className="size-full bg-surface" />
        ) : (
          <p className="px-6 text-center text-sm text-ink-muted">{failed ? "This file couldn't be previewed." : "Preview isn't available for this file type."}</p>
        )}
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs text-ink-subtle">{doc.filename}</span>
        <span className="flex gap-2">
          <LinkButton href={url} target="_blank" rel="noreferrer" size="sm" icon={ExternalLink}>Open</LinkButton>
          <LinkButton href={url} download={doc.filename} size="sm" icon={Download}>Download</LinkButton>
        </span>
      </figcaption>
    </figure>
  );
}

// --- Decision panel ------------------------------------------------------------------

// The partner office's own decision, shown to the AdSO above its panel.
function PartnerDecision({ app, name }: { app: AdminApplication; name: string }) {
  const decision = partnerOfficeDecision(app, name);
  return (
    <Card title={`${officeDisplayName(app.office)} decision`}>
      {decision ? (
        <div className="space-y-2 text-sm">
          <Badge tone={STATUS_META[decision.status as AppStatus]?.tone} dot>{historyLabel(decision.status)}</Badge>
          <p className="text-xs text-ink-subtle">{decision.actor.label} · {formatDateTime(decision.at)}</p>
          {decision.note && <Quote>{decision.note}</Quote>}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">The {officeDisplayName(app.office)} hasn't recorded a decision yet.</p>
      )}
    </Card>
  );
}

function DecisionPanel({ app, name, adminOffice, getToken, onDecided }: {
  app: AdminApplication;
  name: string;
  adminOffice: string | null;
  getToken: () => Promise<string | null>;
  onDecided: (updated: AdminApplication, status: Decision) => void;
}) {
  const officeApp = isOfficeApp(app);
  const lockedByOverride = !!adminOffice && app.decisionOffice === 'LSO';
  const decided = app.status !== 'Under Evaluation';
  const [changing, setChanging] = useState(false);
  const [message, setMessage] = useState('');
  const [noteError, setNoteError] = useState('');
  const [confirming, setConfirming] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const last = latestDecision(app, name);
  // The AdSO looking at a partner office's decided application it hasn't
  // ruled on itself (the office's decision is shown above).
  const awaitingAdso = !adminOffice && officeApp && decided && app.decisionOffice !== 'LSO';

  const start = (status: Decision) => {
    setError('');
    const needsNote = DECISIONS[status].noteRequired || changing;
    if (needsNote && !message.trim()) {
      setNoteError(changing
        ? 'Explain the change to the applicant.'
        : status === 'Rejected' ? 'Tell the applicant why it was rejected.' : 'Tell the applicant what to revise.');
      return;
    }
    setNoteError('');
    setConfirming(status);
  };

  const submit = async (status: Decision) => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/applications/${app._id}/status`, {
        method: 'PATCH',
        headers: await authHeaders(getToken, true),
        body: JSON.stringify({ status, reviewNote: message.trim() || undefined })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Failed to update the application.');
      setConfirming(null);
      setChanging(false);
      setMessage('');
      onDecided(normalizeApplication(body.application), status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update the application.');
    } finally {
      setBusy(false);
    }
  };

  // What happens, for the confirm dialog.
  const consequences = (status: Decision): string[] => {
    const lines = [`The status changes to “${historyLabel(status)}”.`];
    lines.push(message.trim()
      ? 'The applicant sees the new status and your message in their portal.'
      : 'The applicant sees the new status in their portal.');
    if (status === 'Needs Revision') lines.push('They can update their documents and resubmit.');
    if (adminOffice && status === 'Approved' && !app.forwardedAt) lines.push('It is sent to the AdSO automatically.');
    if (!adminOffice && officeApp) lines.push(`This replaces the ${officeDisplayName(app.office)}'s decision; they can no longer change it.`);
    return lines;
  };

  const title = !adminOffice && officeApp ? 'AdSO decision' : 'Decision';

  if (lockedByOverride) {
    return (
      <Card title={title}>
        <DecisionSummary app={app} last={last} />
        <Alert tone="warning" icon={ShieldCheck}>The AdSO has overridden your office's decision, so it can no longer be changed here.</Alert>
      </Card>
    );
  }

  return (
    <Card title={title}>
      <div className="space-y-4">
        {error && <Alert tone="danger" onDismiss={() => setError('')}>{error}</Alert>}

        {awaitingAdso && !changing ? (
          <>
            <p className="text-sm text-ink-muted">
              No AdSO decision yet. The {officeDisplayName(app.office)}'s decision stands unless you change it.
            </p>
            <Button variant="secondary" size="sm" onClick={() => { setChanging(true); setNoteError(''); }}>
              Change decision
            </Button>
          </>
        ) : decided && !changing ? (
          <>
            <DecisionSummary app={app} last={last} />
            <Button variant="ghost" size="sm" className="-ml-2.5" onClick={() => { setChanging(true); setNoteError(''); }}>
              Change decision
            </Button>
          </>
        ) : (
          <>
            <Field
              label="Message to applicant"
              optional={!changing}
              helper={noteError ? undefined : changing ? 'Required: explain why the decision changed. The applicant will see this.' : 'The applicant will see this.'}
              error={noteError || undefined}
            >
              <Textarea
                value={message}
                onChange={e => { setMessage(e.target.value); if (noteError) setNoteError(''); }}
                rows={4}
                maxLength={2000}
                placeholder={changing ? 'Why the decision changed…' : 'What to revise, why it was rejected, or a note with the approval…'}
                className="resize-y"
                disabled={busy}
              />
            </Field>
            {adminOffice && !app.forwardedAt && (
              <p className="text-xs text-ink-subtle">Approving also sends this application to the AdSO.</p>
            )}
            <div className="space-y-2">
              {DECISION_ORDER.filter(status => status !== app.status || !decided).map(status => {
                const d = DECISIONS[status];
                return (
                  <Button
                    key={status}
                    variant={d.variant}
                    icon={d.icon}
                    disabled={busy}
                    onClick={() => start(status)}
                    className="w-full"
                  >
                    {d.action}
                  </Button>
                );
              })}
            </div>
            {changing && (
              <Button variant="ghost" size="sm" className="-ml-2.5" onClick={() => { setChanging(false); setMessage(''); setNoteError(''); }}>
                Cancel
              </Button>
            )}
          </>
        )}
      </div>

      {confirming && (
        <ConfirmDialog
          title={`${DECISIONS[confirming].action} ${name}'s application?`}
          confirmLabel={DECISIONS[confirming].action}
          confirmIcon={DECISIONS[confirming].icon}
          tone={DECISIONS[confirming].confirmTone}
          busy={busy}
          error={error}
          onConfirm={() => submit(confirming)}
          onCancel={() => { if (!busy) setConfirming(null); }}
        >
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">
            {consequences(confirming).map(line => <li key={line}>{line}</li>)}
          </ul>
          {message.trim() && <Quote className="mt-3">{message.trim()}</Quote>}
        </ConfirmDialog>
      )}
    </Card>
  );
}

// The current decision: status, who and when, and the message sent.
function DecisionSummary({ app, last }: { app: AdminApplication; last: ReturnType<typeof latestDecision> }) {
  const when = last?.at ?? app.reviewedAt;
  return (
    <div className="space-y-2">
      <StatusBadge status={app.status} />
      <p className="text-xs text-ink-subtle">
        {last ? `by ${last.actor.label}` : 'Decision recorded'}
        {when && <> · <Tooltip content={formatDateTime(when)} asChild><time dateTime={when} tabIndex={0} className="rounded-badge">{relativeTime(when)}</time></Tooltip></>}
      </p>
      {app.reviewNote
        ? <div><p className="mb-1 text-xs text-ink-subtle">Message sent to the applicant</p><Quote>{app.reviewNote}</Quote></div>
        : <p className="text-xs text-ink-subtle">No message was sent with this decision.</p>}
    </div>
  );
}

// --- Internal notes --------------------------------------------------------------------

function InternalNotes({ app, getToken, onSaved }: {
  app: AdminApplication;
  getToken: () => Promise<string | null>;
  onSaved: (notes: NonNullable<AdminApplication['internalNotes']>) => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const notes = [...(app.internalNotes ?? [])].reverse();

  const save = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/applications/${app._id}/internal-notes`, {
        method: 'POST',
        headers: await authHeaders(getToken, true),
        body: JSON.stringify({ text: text.trim() })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Failed to save the note.');
      onSaved(body.internalNotes ?? []);
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the note.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Internal notes" description="Staff only — never shown to the applicant.">
      <div className="space-y-3">
        {notes.length > 0 && (
          <ul className="divide-y divide-line">
            {notes.map((note, i) => (
              <li key={`${note.at}-${i}`} className="py-2.5 first:pt-0">
                <p className="text-sm text-ink whitespace-pre-line wrap-break-word">{note.text}</p>
                <p className="mt-0.5 text-xs text-ink-subtle">
                  {[note.office ? officeDisplayName(note.office) : null, note.byName || note.by].filter(Boolean).join(' · ')} · {relativeTime(note.at)}
                </p>
              </li>
            ))}
          </ul>
        )}
        <Field label="Internal note (staff only)" error={error || undefined}>
          <Textarea value={text} onChange={e => setText(e.target.value)} rows={2} maxLength={2000} disabled={busy} className="resize-y" placeholder="Visible to admins only…" />
        </Field>
        <Button size="sm" onClick={save} loading={busy} disabled={busy || !text.trim()}>Add note</Button>
      </div>
    </Card>
  );
}
