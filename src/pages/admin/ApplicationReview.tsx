import React, { useMemo, useState } from 'react';
import {
  CheckCircle2, ClipboardList, ExternalLink, Eye, FileText, History, Paperclip, RotateCcw, Save, Send, ShieldCheck, XCircle
} from 'lucide-react';
import { ApplicationFormAnswers, EvaluationSheetAnswers } from '../../components/grant-forms/GrantAnswersView';
import PolcaAdminFieldsCard from '../../components/grant-forms/PolcaAdminFieldsCard';
import { SfagAnswers, StandardProfileAnswers } from '../../components/grant-forms/StandardAnswersView';
import { mockScholarships } from '../../data/scholarships';
import { PolcaAdminFields, SfagApplicationDetails } from '../../types';
import { isGrantFormType, toGrantDetails } from '../../utils/grantForms';
import {
  API_BASE_URL, AdminApplication, AdminDocument, AppStatus, applicantEmail, applicantName, applicantPhone,
  applicantProgram, applicantYearLevel, authHeaders, documentUrl, formTypeLabel, formatBytes, formatDate,
  formatDateTime, formatShortDate, isOfficeApp, normalizeApplication, officeName
} from './adminData';
import {
  Alert, Avatar, Badge, Button, ButtonVariant, Card, DetailField, EmptyState, Field, LinkButton, Modal,
  PageHeader, Quote, StatusBadge, Tabs, Textarea, Timeline, TimelineEntry
} from './AdminUI';

type ReviewTab = 'form' | 'sheet' | 'documents' | 'activity';
type Decision = Exclude<AppStatus, 'Under Evaluation'>;

const DECISIONS: Record<Decision, { variant: ButtonVariant; confirmVariant: ButtonVariant; icon: React.ElementType; action: string; done: string }> = {
  'Approved': { variant: 'primary', confirmVariant: 'primary', icon: CheckCircle2, action: 'Approve', done: 'Approved' },
  'Needs Revision': { variant: 'secondary', confirmVariant: 'primary', icon: RotateCcw, action: 'Request revision', done: 'Revision requested' },
  'Rejected': { variant: 'danger-secondary', confirmVariant: 'danger', icon: XCircle, action: 'Reject', done: 'Rejected' }
};

interface ApplicationReviewProps {
  app: AdminApplication;
  // Office code for office admins (POLCA, ALUMNI); null for the AdSO.
  adminOffice: string | null;
  getToken: () => Promise<string | null>;
  onBack: () => void;
  onUpdated: (updated: AdminApplication) => void;
  onAdminFieldsSaved: (fields: PolcaAdminFields) => void;
}

// One application: applicant details, answers/documents/activity tabs, and
// the decision panel. Mount with key={app._id} so per-application state
// (note draft, confirmations) resets when switching applications.
export default function ApplicationReview({ app, adminOffice, getToken, onBack, onUpdated, onAdminFieldsSaved }: ApplicationReviewProps) {
  const [activeTab, setActiveTab] = useState<ReviewTab>('form');
  const [previewDoc, setPreviewDoc] = useState<AdminDocument | null>(null);

  const [reviewNote, setReviewNote] = useState('');
  const [pendingAction, setPendingAction] = useState<Decision | 'note' | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [justUpdatedStatus, setJustUpdatedStatus] = useState<AppStatus | null>(null);
  // True when the last status change itself sent the application to the
  // AdSO (an office approving an application it hadn't sent yet).
  const [justSentToLso, setJustSentToLso] = useState(false);
  const [noteJustSaved, setNoteJustSaved] = useState(false);
  const [noteSaveError, setNoteSaveError] = useState('');
  const [actionError, setActionError] = useState('');

  const isGrant = isGrantFormType(app.applicationFormType);
  const grantScholarship = isGrant ? mockScholarships.find(s => s.id === app.scholarshipId) : undefined;
  const grantDetails = grantScholarship ? toGrantDetails(app, grantScholarship) : null;
  const name = applicantName(app);
  const officeApp = isOfficeApp(app);
  const lockedByOverride = !!adminOffice && app.decisionOffice === 'LSO';
  const busy = isUpdating || isSavingNote;

  const timeline = useMemo<TimelineEntry[]>(
    () => [...(app.history ?? [])]
      .sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime())
      .map((h, i) => ({ ...h, key: `${h.changedAt}-${i}` })),
    [app.history]
  );

  // PATCH /:id/status is also how a note is saved on its own: the
  // application's current status is sent back unchanged.
  const patchStatus = async (status: AppStatus): Promise<AdminApplication> => {
    const response = await fetch(`${API_BASE_URL}/api/applications/${app._id}/status`, {
      method: 'PATCH',
      headers: await authHeaders(getToken, true),
      body: JSON.stringify({ status, reviewNote: reviewNote || undefined })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Failed to update the application.');
    return normalizeApplication(body.application);
  };

  const updateStatus = async (status: Decision) => {
    setIsUpdating(true);
    setActionError('');
    setJustUpdatedStatus(null);
    setJustSentToLso(false);
    setNoteJustSaved(false);
    setNoteSaveError('');
    const wasSent = !!app.forwardedAt;
    try {
      const updated = await patchStatus(status);
      onUpdated(updated);
      setReviewNote('');
      setJustUpdatedStatus(status);
      setJustSentToLso(!wasSent && !!updated.forwardedAt);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update application status.');
    } finally {
      setIsUpdating(false);
      setPendingAction(null);
    }
  };

  const saveNote = async () => {
    setIsSavingNote(true);
    setNoteSaveError('');
    setNoteJustSaved(false);
    try {
      const updated = await patchStatus(app.status);
      onUpdated(updated);
      setReviewNote('');
      setNoteJustSaved(true);
    } catch (err) {
      setNoteSaveError(err instanceof Error ? err.message : 'Failed to save note. Please try again.');
    } finally {
      setIsSavingNote(false);
      setPendingAction(null);
    }
  };

  const tabs: { key: ReviewTab; label: string; icon: React.ElementType; count?: number }[] = [
    { key: 'form', label: 'Application form', icon: FileText },
    ...(grantDetails?.evaluationSheet ? [{ key: 'sheet' as const, label: 'Evaluation sheet', icon: ClipboardList }] : []),
    { key: 'documents', label: 'Documents', icon: Paperclip, count: app.documents.length },
    { key: 'activity', label: 'Activity', icon: History, count: timeline.length }
  ];

  const details: [string, React.ReactNode][] = [
    ['Reference', <span className="font-mono">{app.referenceCode}</span>],
    ['Student no.', <span className="tabular-nums">{app.studentNumber}</span>],
    ['Submitted', formatDate(app.createdAt)],
    ['Program', [applicantProgram(app), applicantYearLevel(app)].filter(Boolean).join(' · ')],
    ['Email', applicantEmail(app)],
    ['Mobile', applicantPhone(app)]
  ];

  const decidedBy = officeApp && app.decisionOffice
    ? ` · set by ${app.decisionOffice === 'LSO' ? 'the AdSO' : officeName(app.decisionOffice)}`
    : '';

  return (
    <>
      <PageHeader
        back={{ label: 'All applications', onClick: onBack }}
        title={name}
        meta={
          <>
            <StatusBadge status={app.status} />
            {officeApp && app.decisionOffice === 'LSO' && <Badge tone="warning" icon={ShieldCheck}>AdSO override</Badge>}
            <Badge>{formTypeLabel(app.applicationFormType)}</Badge>
            {officeApp && <Badge>{officeName(app.office)}</Badge>}
            <span className="text-sm text-ink-muted">{app.scholarshipName}</span>
          </>
        }
      />

      {officeApp && (
        <Alert tone={app.forwardedAt ? 'accent' : 'neutral'} icon={Send}>
          {app.forwardedAt ? (
            <>
              Sent to the AdSO by the {officeName(app.office)} on {formatDate(app.forwardedAt)}
              {app.forwardedBy ? ` (${app.forwardedBy})` : ''}.{' '}
              {adminOffice
                ? 'You can keep reviewing it; the AdSO can override your decision.'
                : "The office's decision stands unless you override it."}
            </>
          ) : (
            <>Not sent to the AdSO yet. It goes with the office's next "Send to AdSO".</>
          )}
        </Alert>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card title="Applicant">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <Avatar name={name} avatarUrl={app.avatarUrl} size="lg" />
              <dl className="grid flex-1 grid-cols-1 gap-x-6 gap-y-4 min-[480px]:grid-cols-2 xl:grid-cols-3">
                {details.map(([label, value]) => <DetailField key={label} label={label} value={value} />)}
              </dl>
            </div>
          </Card>

          <Card flush headerSlot={<Tabs<ReviewTab> tabs={tabs} value={activeTab} onChange={setActiveTab} label="Application sections" />}>
            <div role="tabpanel" aria-label={tabs.find(t => t.key === activeTab)?.label} className="p-5 sm:p-6">
              {activeTab === 'form' && (
                isGrant ? (
                  grantDetails
                    ? <ApplicationFormAnswers details={grantDetails} scholarship={grantScholarship} />
                    : <EmptyState title="Form unavailable" description="This scholarship is no longer in the registry, so its form can't be displayed." />
                ) : app.applicationFormType === 'sfag' && app.personalInfo ? (
                  <SfagAnswers details={{
                    personalInfo: app.personalInfo,
                    contactSchool: app.contactSchool,
                    parentsGuardian: app.parentsGuardian,
                    siblings: app.siblings ?? [],
                    assetsExpenses: app.assetsExpenses,
                    agreement: app.agreement
                  } as unknown as SfagApplicationDetails} />
                ) : app.standardInfo ? (
                  <StandardProfileAnswers info={app.standardInfo} />
                ) : (
                  <EmptyState title="No form answers on file" description="This application was saved without form answers." />
                )
              )}

              {activeTab === 'sheet' && grantDetails?.evaluationSheet && (
                <EvaluationSheetAnswers sheet={grantDetails.evaluationSheet} />
              )}

              {activeTab === 'documents' && (
                app.documents.length === 0 ? (
                  <EmptyState icon={Paperclip} title="No documents uploaded" description="The applicant didn't attach any files to this application." />
                ) : (
                  <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {app.documents.map(doc => (
                      <li key={doc.fileId}>
                        <button
                          type="button"
                          onClick={() => setPreviewDoc(doc)}
                          className="group flex w-full items-center gap-3 rounded-control p-3 text-left ring-1 ring-inset ring-line transition-colors hover:bg-surface-muted"
                        >
                          <DocumentThumb doc={doc} />
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-sm font-medium text-ink">{doc.docType}</p>
                            {doc.variant && <p className="mt-0.5 truncate text-xs text-accent">{doc.variant}</p>}
                            <p className="mt-0.5 truncate text-xs text-ink-subtle" title={doc.filename}>
                              {doc.filename}{doc.size ? ` · ${formatBytes(doc.size)}` : ''}
                            </p>
                          </div>
                          <Eye className="size-4 shrink-0 text-ink-subtle group-hover:text-ink" aria-hidden />
                          <span className="sr-only">Preview</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              )}

              {activeTab === 'activity' && (
                <Timeline entries={timeline} empty="No history recorded for this application yet." formatTime={formatDateTime} />
              )}
            </div>
          </Card>
        </div>

        {/* Decision column: stays in view while reading the form, and
            scrolls on its own if it's taller than the window. */}
        <aside
          aria-label="Review decision"
          className="min-w-0 space-y-6 lg:sticky lg:top-20 lg:-m-1 lg:max-h-[calc(100dvh-var(--spacing-topbar)-3rem)] lg:overflow-y-auto lg:p-1"
        >
          <Card
            title={!adminOffice && officeApp ? 'Override decision' : 'Review decision'}
            description={`Current status: ${app.status}${decidedBy}`}
          >
            <div className="space-y-4">
              {justUpdatedStatus && (
                <Alert tone="success">
                  {justSentToLso ? 'Approved and sent to the AdSO.' : `Marked as ${justUpdatedStatus}.`}
                </Alert>
              )}
              {actionError && <Alert tone="danger" onDismiss={() => setActionError('')}>{actionError}</Alert>}

              {lockedByOverride ? (
                // The AdSO overrode this office's decision; the backend
                // rejects further status/note changes from the office.
                <Alert tone="warning" icon={ShieldCheck}>
                  The AdSO has overridden your office's decision. The status and note can no longer be changed here.
                </Alert>
              ) : (
                <>
                  <div>
                    <Field
                      label="Note to applicant"
                      optional
                      helper={noteSaveError ? undefined : 'Saved with your decision, or on its own with "Save note".'}
                      error={noteSaveError || undefined}
                    >
                      <Textarea
                        value={reviewNote}
                        onChange={e => {
                          setReviewNote(e.target.value);
                          setNoteJustSaved(false);
                          setNoteSaveError('');
                          if (pendingAction === 'note') setPendingAction(null);
                        }}
                        rows={4}
                        placeholder="Reason for revision or rejection, or remarks…"
                        className="resize-y"
                        disabled={busy}
                      />
                    </Field>
                    <div className="mt-2 flex min-h-8 flex-wrap items-center justify-between gap-2">
                      {pendingAction === 'note' ? (
                        <InlineConfirm
                          question="Save without changing the status?"
                          confirmLabel="Save note"
                          confirmVariant="primary"
                          busy={isSavingNote}
                          onConfirm={saveNote}
                          onCancel={() => setPendingAction(null)}
                        />
                      ) : (
                        <Button
                          size="sm"
                          icon={Save}
                          onClick={() => setPendingAction('note')}
                          disabled={busy || reviewNote.trim() === ''}
                        >
                          Save note
                        </Button>
                      )}
                      {noteJustSaved && !isSavingNote && (
                        <span role="status" className="flex items-center gap-1 text-xs font-medium text-success-fg">
                          <CheckCircle2 className="size-3.5" aria-hidden /> Note saved
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 border-t border-line pt-4">
                    {adminOffice && !app.forwardedAt && (
                      <p className="flex items-start gap-1.5 text-xs text-ink-subtle">
                        <Send className="mt-px size-3.5 shrink-0" aria-hidden />
                        Approving also sends this application to the AdSO.
                      </p>
                    )}
                    {(Object.keys(DECISIONS) as Decision[]).map(status => {
                      const d = DECISIONS[status];
                      const isCurrent = app.status === status;
                      if (pendingAction === status) {
                        return (
                          <InlineConfirm
                            key={status}
                            question={`${d.action} this application?`}
                            confirmLabel={d.action}
                            confirmVariant={d.confirmVariant}
                            confirmIcon={d.icon}
                            busy={isUpdating}
                            onConfirm={() => updateStatus(status)}
                            onCancel={() => setPendingAction(null)}
                            boxed
                          />
                        );
                      }
                      return (
                        <Button
                          key={status}
                          variant={d.variant}
                          icon={d.icon}
                          disabled={busy || isCurrent || pendingAction !== null}
                          onClick={() => { setJustUpdatedStatus(null); setPendingAction(status); }}
                          className="w-full"
                        >
                          {isCurrent ? d.done : d.action}
                        </Button>
                      );
                    })}
                  </div>
                </>
              )}

              {app.reviewNote && (
                <div className="border-t border-line pt-4">
                  <p className="text-xs text-ink-subtle">
                    Last note{app.reviewedBy ? ` · ${app.reviewedBy}` : ''}{app.reviewedAt ? ` · ${formatShortDate(app.reviewedAt)}` : ''}
                  </p>
                  <Quote className="mt-1.5">{app.reviewNote}</Quote>
                </div>
              )}
            </div>
          </Card>

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

      {previewDoc && <DocumentPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />}
    </>
  );
}

// Two-step confirmation shown in place of the button that triggered it.
function InlineConfirm({ question, confirmLabel, confirmVariant, confirmIcon, busy, onConfirm, onCancel, boxed }: {
  question: string;
  confirmLabel: string;
  confirmVariant: ButtonVariant;
  confirmIcon?: React.ElementType;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  boxed?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={question}
      className={`flex flex-wrap items-center gap-2 ${boxed ? 'rounded-control bg-surface-muted p-2.5 ring-1 ring-inset ring-line' : ''}`}
    >
      <span className="min-w-24 flex-1 text-sm text-ink">{question}</span>
      <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
      <Button size="sm" variant={confirmVariant} icon={confirmIcon} loading={busy} onClick={onConfirm} autoFocus>
        {confirmLabel}
      </Button>
    </div>
  );
}

function DocumentThumb({ doc }: { doc: AdminDocument }) {
  const [imgFailed, setImgFailed] = useState(false);
  const isImage = doc.mimetype?.startsWith('image/') && !imgFailed;
  return (
    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-control bg-surface-muted ring-1 ring-line">
      {isImage ? (
        <img src={documentUrl(doc.fileId)} alt="" className="size-full object-cover" onError={() => setImgFailed(true)} />
      ) : (
        <FileText className="size-5 text-ink-subtle" aria-hidden />
      )}
    </span>
  );
}

function DocumentPreviewModal({ doc, onClose }: { doc: AdminDocument; onClose: () => void }) {
  const [imgFailed, setImgFailed] = useState(false);
  const isImage = doc.mimetype?.startsWith('image/') && !imgFailed;
  const isPdf = doc.mimetype === 'application/pdf';
  const url = documentUrl(doc.fileId);

  return (
    <Modal
      size="lg"
      title={doc.docType}
      description={<span className="block truncate">{doc.filename}{doc.size ? ` · ${formatBytes(doc.size)}` : ''}</span>}
      onClose={onClose}
      bodyClassName="flex items-center justify-center bg-surface-muted"
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <LinkButton href={url} target="_blank" rel="noreferrer" icon={ExternalLink}>Open in new tab</LinkButton>
        </>
      }
    >
      {isImage ? (
        <img src={url} alt={doc.docType} className="max-h-[70dvh] max-w-full object-contain" onError={() => setImgFailed(true)} />
      ) : isPdf ? (
        <iframe src={url} title={doc.docType} className="h-[70dvh] w-full bg-surface" />
      ) : (
        <EmptyState
          icon={FileText}
          title="Preview isn't available for this file type"
          description="Use “Open in new tab” to view or download it."
        />
      )}
    </Modal>
  );
}
