import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import { AlertCircle, CheckCircle, FileText, Loader2 } from 'lucide-react';
import { Application, DocumentSlot, GrantApplicationDetails, Scholarship, StoredDocument, StudentProfile } from '../../types';
import { OFFICE_LABELS, officeOf } from '../../data/scholarships';
import {
  FieldErrors, GRANT_PART_LABELS, GrantPart, GrantSectionKey, getGrantSections, initialGrantValues,
  isSlotRequired, mergeDefaults, setIn, uploadSlots, validateGrantSection
} from '../../utils/grantForms';
import { GrantFormProvider, GrantFormContextValue, FileSlotField, MAX_FILE_BYTES, useGrantForm } from '../../components/grant-forms/fields';
import {
  CertificationSection, EligibilitySection, FamilyContactSection, FinancialInfoSection, SiblingsSection, StudentDataSection
} from '../../components/grant-forms/ApplicationFormSections';
import {
  AssetsSection, BoardingSection, EducationSection, EmploymentSection, FamilyDataSection, FinancingSection,
  MembershipsSection, StatementsSection, TravelSection
} from '../../components/grant-forms/EvaluationSheetSections';
import { ApplicationFormAnswers, EvaluationSheetAnswers } from '../../components/grant-forms/GrantAnswersView';
import {
  BackLink, DraftIndicator, DraftStatus, FormBanner, PrivacyNote, RevisionNote, SectionNav, SectionPanel,
  SubmittedScreen, WizardFooter, WizardHeader
} from '../../components/grant-forms/WizardShell';

// Application wizard for the grant-form scholarships (POLCA, DLSU-D Alumni
// Association). Rendered by ApplyScholarship.tsx when the scholarship's
// applicationFormType is 'polca' or 'alumni'. Submits to the same
// POST /api/applications (PATCH /:id on resubmit) multipart contract as
// the other flows, with files stored in GridFS server-side.
//
// Drafts: typed answers autosave to the server (/api/application-drafts)
// so the long evaluation sheet can be finished across sessions/devices,
// with a localStorage copy as an offline fallback. Selected files can't be
// saved in a draft (browsers can't restore File objects), so the student
// is reminded which ones to re-select.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
const DRAFT_STORAGE_PREFIX = 'aniskolar_draft_'; // App.tsx clears this prefix on logout
const DRAFT_VERSION = 1;
const AUTOSAVE_DELAY_MS = 2000;

interface GrantApplicationProps {
  scholarship: Scholarship;
  student: StudentProfile;
  onBack: () => void;
  onSubmitApplication: (application: Application) => void;
  onResubmitApplication?: (application: Application) => void;
  existingApplication?: Application;
  id?: string;
}

interface DraftData {
  version: number;
  values: GrantApplicationDetails;
  currentKey: GrantSectionKey;
  visited: GrantSectionKey[];
  variants: Record<string, string>;
  selectedFileNames: Record<string, string[]>;
  savedAt: string;
}

const SECTION_COMPONENTS: Record<GrantSectionKey, React.ComponentType | null> = {
  eligibility: EligibilitySection,
  student: StudentDataSection,
  family: FamilyContactSection,
  siblings: SiblingsSection,
  financial: FinancialInfoSection,
  certification: CertificationSection,
  'ev-education': EducationSection,
  'ev-boarding': BoardingSection,
  'ev-employment': EmploymentSection,
  'ev-financing': FinancingSection,
  'ev-memberships': MembershipsSection,
  'ev-travel': TravelSection,
  'ev-family': FamilyDataSection,
  'ev-assets': AssetsSection,
  'ev-statements': StatementsSection,
  documents: null,
  review: null
};

function localDraftKey(scholarshipId: string, student: StudentProfile) {
  return `${DRAFT_STORAGE_PREFIX}${scholarshipId}_${student.studentNumber}_${student.clerkId || '_'}`;
}

function readLocalDraft(key: string): DraftData | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.version === DRAFT_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

function groupStoredDocs(docs?: StoredDocument[]): Record<string, StoredDocument[]> {
  const out: Record<string, StoredDocument[]> = {};
  for (const doc of docs ?? []) {
    if (!doc.slotKey) continue;
    (out[doc.slotKey] ??= []).push(doc);
  }
  return out;
}

// Drops year/model entries beyond each vehicle count before sending.
function normalizeForSubmit(values: GrantApplicationDetails): GrantApplicationDetails {
  if (!values.evaluationSheet) return values;
  const vehicles = Object.fromEntries(
    Object.entries(values.evaluationSheet.assets.vehicles).map(([k, v]) => [k, { count: v.count, models: v.models.slice(0, v.count) }])
  );
  return setIn(values, 'evaluationSheet.assets.vehicles', vehicles);
}

export default function GrantApplication({
  scholarship,
  student,
  onBack,
  onSubmitApplication,
  onResubmitApplication,
  existingApplication,
  id
}: GrantApplicationProps) {
  const { getToken } = useAuth();
  const isResubmit = !!existingApplication;
  const office = officeOf(scholarship);
  const officeLabel = OFFICE_LABELS[office];
  const sections = useMemo(() => getGrantSections(scholarship), [scholarship]);
  const draftKey = localDraftKey(scholarship.id, student);
  const draftUrl = `${API_BASE_URL}/api/application-drafts/${scholarship.id}`;

  const freshValues = useCallback(() => initialGrantValues(scholarship, student), [scholarship, student]);
  const storedDocs = useMemo(() => groupStoredDocs(existingApplication?.storedDocuments), [existingApplication]);

  const [values, setValues] = useState<GrantApplicationDetails>(() =>
    existingApplication?.grantDetails ? mergeDefaults(freshValues(), existingApplication.grantDetails) : freshValues()
  );
  const [currentKey, setCurrentKey] = useState<GrantSectionKey>('eligibility');
  const [visited, setVisited] = useState<Set<GrantSectionKey>>(() => new Set(isResubmit ? sections.map(s => s.key) : []));
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [variants, setVariants] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    Object.entries(storedDocs).forEach(([key, docs]) => { if (docs[0]?.variant) out[key] = docs[0].variant; });
    return out;
  });
  const [reselectNames, setReselectNames] = useState<Record<string, string[]>>({});
  const [banner, setBanner] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ referenceCode: string } | null>(null);

  // --- Draft loading ---------------------------------------------------------
  const [hydrated, setHydrated] = useState(isResubmit);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>(isResubmit ? 'idle' : 'loading');
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const applyDraft = useCallback((draft: DraftData) => {
    setValues(mergeDefaults(freshValues(), draft.values));
    setCurrentKey(sections.some(s => s.key === draft.currentKey) ? draft.currentKey : 'eligibility');
    setVisited(new Set(draft.visited ?? []));
    setVariants(draft.variants ?? {});
    setReselectNames(draft.selectedFileNames ?? {});
    setSavedAt(draft.savedAt);
  }, [freshValues, sections]);

  useEffect(() => {
    if (isResubmit) return;
    let cancelled = false;
    const local = readLocalDraft(draftKey);
    (async () => {
      let server: DraftData | null = null;
      let reachable = true;
      try {
        const token = await getToken();
        const res = await fetch(draftUrl, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        if (body.draft?.data?.version === DRAFT_VERSION) server = body.draft.data;
      } catch {
        reachable = false;
      }
      if (cancelled) return;
      // Whichever copy was saved most recently wins.
      const newest = [local, server]
        .filter((d): d is DraftData => !!d)
        .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())[0];
      if (newest) applyDraft(newest);
      setDraftStatus(reachable ? (newest ? 'saved' : 'idle') : 'offline');
      setHydrated(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Draft saving -------------------------------------------------------------
  const buildDraft = useCallback((): DraftData => ({
    version: DRAFT_VERSION,
    values,
    currentKey,
    visited: Array.from(visited),
    variants,
    selectedFileNames: Object.fromEntries(Object.entries(files).map(([k, list]) => [k, list.map(f => f.name)])),
    savedAt: new Date().toISOString()
  }), [values, currentKey, visited, variants, files]);

  const saveTimer = useRef<number | null>(null);
  const lastSavedKey = useRef<GrantSectionKey | null>(null);
  // Set by discardDraft so resetting the form doesn't immediately re-save it.
  const skipNextAutosave = useRef(false);

  const saveDraftToServer = useCallback(async (draft: DraftData) => {
    setDraftStatus('saving');
    try {
      const token = await getToken();
      const res = await fetch(draftUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ data: draft })
      });
      if (!res.ok) throw new Error(String(res.status));
      setSavedAt(draft.savedAt);
      setDraftStatus('saved');
    } catch {
      setDraftStatus('offline');
    }
  }, [draftUrl, getToken]);

  useEffect(() => {
    if (!hydrated || isResubmit || submitted) return;
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      lastSavedKey.current = null;
      return;
    }
    const draft = buildDraft();
    try {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // Storage can fail (private browsing, quota) — the server copy still saves.
    }
    // Typing is debounced; moving to another section saves right away.
    const sectionChanged = lastSavedKey.current !== null && lastSavedKey.current !== currentKey;
    lastSavedKey.current = currentKey;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveDraftToServer(draft), sectionChanged ? 0 : AUTOSAVE_DELAY_MS);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, currentKey, visited, variants, hydrated]);

  const saveNow = () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveDraftToServer(buildDraft());
  };

  const discardDraft = async () => {
    if (!window.confirm('Discard your saved answers for this application and start over?')) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    skipNextAutosave.current = true;
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
    try {
      const token = await getToken();
      await fetch(draftUrl, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : undefined });
    } catch { /* ignore — the next autosave overwrites it anyway */ }
    setValues(freshValues());
    setCurrentKey('eligibility');
    setVisited(new Set());
    setFiles({});
    setVariants({});
    setReselectNames({});
    setSavedAt(null);
    setBanner('');
    setDraftStatus('idle');
  };

  // --- Form context -----------------------------------------------------------
  const setValue = useCallback((path: string, value: unknown) => {
    setValues(prev => setIn(prev, path, value));
  }, []);

  const addFiles = useCallback((slot: DocumentSlot, picked: File[]): string | null => {
    for (const file of picked) {
      const isJpeg = file.type === 'image/jpeg' || /\.(jpe?g)$/i.test(file.name);
      if (!isJpeg) return 'Only JPG files are allowed. Please convert your file and try again.';
      if (file.size > MAX_FILE_BYTES) return `"${file.name}" is over 10MB.`;
    }
    const max = slot.multiple ? (slot.maxFiles ?? 10) : 1;
    const existing = slot.multiple ? (files[slot.key] ?? []) : [];
    const next = [...existing, ...picked];
    const error = next.length > max ? `You can upload up to ${max} files here.` : null;
    setFiles(prev => ({ ...prev, [slot.key]: next.slice(0, max) }));
    setReselectNames(prev => {
      if (!(slot.key in prev)) return prev;
      const copy = { ...prev };
      delete copy[slot.key];
      return copy;
    });
    return error;
  }, [files]);

  const removeFile = useCallback((slotKey: string, index: number) => {
    setFiles(prev => ({ ...prev, [slotKey]: (prev[slotKey] ?? []).filter((_, i) => i !== index) }));
  }, []);

  const setVariant = useCallback((slotKey: string, variant: string) => {
    setVariants(prev => ({ ...prev, [slotKey]: variant }));
  }, []);

  // New selections replace what's on record for that slot.
  const fileCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const slot of scholarship.documentSlots ?? []) {
      out[slot.key] = (files[slot.key]?.length ?? 0) || (storedDocs[slot.key]?.length ?? 0);
    }
    return out;
  }, [scholarship.documentSlots, files, storedDocs]);

  const allErrors = useMemo(() => {
    const ctx = { scholarship, values, fileCounts, variants };
    const out = {} as Record<GrantSectionKey, FieldErrors>;
    for (const section of sections) out[section.key] = validateGrantSection(section.key, ctx);
    return out;
  }, [scholarship, values, fileCounts, variants, sections]);

  const sectionDone = (key: GrantSectionKey) =>
    key !== 'review' && visited.has(key) && Object.keys(allErrors[key]).length === 0;
  const eligibilityBlocked = Object.keys(allErrors.eligibility).length > 0;
  const shownErrors = visited.has(currentKey) ? allErrors[currentKey] : {};

  const contextValue: GrantFormContextValue = {
    scholarship, values, setValue, errors: shownErrors, files, storedDocs, variants, addFiles, removeFile, setVariant
  };

  // --- Navigation ---------------------------------------------------------------
  const currentIndex = sections.findIndex(s => s.key === currentKey);
  const current = sections[currentIndex];
  const markVisited = (key: GrantSectionKey) => setVisited(prev => (prev.has(key) ? prev : new Set(prev).add(key)));

  const goTo = (key: GrantSectionKey) => {
    markVisited(currentKey);
    if (key !== 'eligibility' && eligibilityBlocked) {
      markVisited('eligibility');
      setCurrentKey('eligibility');
      setBanner('Complete the eligibility check first — it decides whether you can apply for this scholarship.');
      return;
    }
    setBanner('');
    setCurrentKey(key);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goNext = () => {
    markVisited(currentKey);
    const count = Object.keys(allErrors[currentKey]).length;
    if (count > 0) {
      setBanner(currentKey === 'eligibility' && allErrors.eligibility.eligibility
        ? allErrors.eligibility.eligibility
        : `Please fix ${count} ${count === 1 ? 'item' : 'items'} in this section before continuing.`);
      return;
    }
    goTo(sections[currentIndex + 1].key);
  };

  // --- Progress ---------------------------------------------------------------
  const countable = sections.filter(s => s.key !== 'review');
  const doneCount = countable.filter(s => sectionDone(s.key)).length;
  const progressPct = Math.round((doneCount / countable.length) * 100);

  // --- Submit -------------------------------------------------------------------
  const handleSubmit = async () => {
    setVisited(new Set(sections.map(s => s.key)));
    const firstInvalid = sections.find(s => Object.keys(allErrors[s.key]).length > 0);
    if (firstInvalid) {
      setBanner(`Some sections still need attention. Starting with: ${firstInvalid.label}.`);
      setCurrentKey(firstInvalid.key);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setIsSubmitting(true);
    setBanner('');
    try {
      const formData = new FormData();
      const labels: string[] = [];
      const meta: { slotKey: string; variant?: string }[] = [];
      for (const slot of uploadSlots(scholarship)) {
        for (const file of files[slot.key] ?? []) {
          formData.append('documents', file, file.name);
          labels.push(slot.label);
          meta.push({ slotKey: slot.key, variant: slot.variants ? variants[slot.key] : undefined });
        }
      }
      formData.append('documentLabels', JSON.stringify(labels));
      formData.append('documentMeta', JSON.stringify(meta));
      formData.append('studentNumber', student.studentNumber);
      formData.append('scholarshipId', scholarship.id);
      formData.append('scholarshipName', scholarship.name);
      formData.append('applicationFormType', scholarship.applicationFormType!);

      const payload = normalizeForSubmit(values);
      formData.append('personalInfo', JSON.stringify(payload.personalInfo));
      formData.append('contactSchool', JSON.stringify(payload.contactSchool));
      formData.append('parentsGuardian', JSON.stringify(payload.parentsGuardian));
      formData.append('siblings', JSON.stringify(payload.siblings));
      formData.append('assetsExpenses', JSON.stringify(payload.assetsExpenses));
      formData.append('agreement', JSON.stringify(payload.agreement));
      formData.append('eligibilityAnswers', JSON.stringify(payload.eligibilityAnswers));
      if (payload.evaluationSheet) formData.append('evaluationSheet', JSON.stringify(payload.evaluationSheet));

      const token = await getToken();
      const url = isResubmit ? `${API_BASE_URL}/api/applications/${existingApplication!.id}` : `${API_BASE_URL}/api/applications`;
      const res = await fetch(url, {
        method: isResubmit ? 'PATCH' : 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Failed to ${isResubmit ? 'resubmit' : 'submit'} application. Please try again.`);

      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }

      const saved = body.application;
      const application: Application = {
        id: saved._id,
        scholarshipId: scholarship.id,
        scholarshipName: scholarship.name,
        personalInfo: {
          firstName: payload.personalInfo.firstName,
          lastName: payload.personalInfo.lastName,
          email: payload.personalInfo.email,
          phone: payload.contactSchool.mobileNo,
          studentNumber: student.studentNumber
        },
        program: payload.personalInfo.course,
        yearLevel: payload.personalInfo.yearLevel,
        gpa: student.gpa,
        documents: uploadSlots(scholarship).map(slot => ({
          name: slot.label,
          uploaded: fileCounts[slot.key] > 0,
          fileName: files[slot.key]?.map(f => f.name).join(', ')
        })),
        status: 'Under Evaluation',
        submittedAt: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        applicationFormType: scholarship.applicationFormType,
        office,
        grantDetails: payload,
        storedDocuments: saved.documents
      };

      setSubmitted({ referenceCode: saved.referenceCode || '' });
      if (isResubmit && onResubmitApplication) onResubmitApplication(application);
      else onSubmitApplication(application);
    } catch (err) {
      setBanner(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Render -------------------------------------------------------------------
  if (submitted) {
    return (
      <SubmittedScreen
        isResubmit={isResubmit}
        referenceCode={submitted.referenceCode}
        scholarshipName={scholarship.name}
        officeLabel={officeLabel}
        submissionNote={scholarship.submissionNote}
        onBack={onBack}
      />
    );
  }

  if (!hydrated) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
        <Loader2 className="w-7 h-7 animate-spin text-brand-green" />
        <p className="text-xs font-semibold">Loading your saved progress…</p>
      </div>
    );
  }

  const SectionBody = SECTION_COMPONENTS[currentKey];
  const reselect = Object.entries(reselectNames).filter(([, names]) => names.length > 0);
  const prev = currentIndex > 0 ? sections[currentIndex - 1] : null;
  const statusOf = (key: string) => {
    const k = key as GrantSectionKey;
    if (sectionDone(k)) return 'done' as const;
    return visited.has(k) && Object.keys(allErrors[k]).length > 0 ? 'error' as const : 'todo' as const;
  };

  return (
    <GrantFormProvider value={contextValue}>
      <div id={id} className="space-y-6">
        <BackLink onClick={onBack} />

        <WizardHeader
          scholarshipName={scholarship.name}
          isResubmit={isResubmit}
          subtitle={<>{scholarship.formId ? `${scholarship.formId} · ` : ''}Reviewed by the {officeLabel}</>}
          right={!isResubmit && <DraftIndicator status={draftStatus} savedAt={savedAt} onSave={saveNow} />}
          doneCount={doneCount}
          total={countable.length}
        />

        {isResubmit && <RevisionNote note={existingApplication?.reviewNote} />}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          <SectionNav
            sections={sections}
            currentKey={currentKey}
            statusOf={statusOf}
            onSelect={key => goTo(key as GrantSectionKey)}
            partLabels={GRANT_PART_LABELS}
          />

          <div className="lg:col-span-3 space-y-4 min-w-0">
            <FormBanner message={banner} />
            <SectionPanel
              partLabel={GRANT_PART_LABELS[current.part as GrantPart]}
              title={current.label}
              sectionKey={currentKey}
              footer={
                <WizardFooter
                  prevLabel={prev?.label}
                  onPrev={prev ? () => goTo(prev.key) : undefined}
                  onDiscard={!isResubmit ? discardDraft : undefined}
                  isLast={currentKey === 'review'}
                  onNext={goNext}
                  onSubmit={handleSubmit}
                  isSubmitting={isSubmitting}
                  submitLabel={isResubmit ? 'Resubmit Application' : 'Submit Application'}
                />
              }
            >
              {SectionBody && <SectionBody />}
              {currentKey === 'documents' && <DocumentsStep reselect={reselect} />}
              {currentKey === 'review' && <ReviewStep />}
            </SectionPanel>
            <PrivacyNote officeLabel={officeLabel} />
          </div>
        </div>
      </div>
    </GrantFormProvider>
  );
}

function DocumentsStep({ reselect }: { reselect: [string, string[]][] }) {
  const { scholarship, values } = useGrantForm();
  const slots = scholarship.documentSlots ?? [];
  const generated = slots.filter(s => s.source === 'form');
  const uploads = slots.filter(s => s.source !== 'form' && s.placement !== 'form');
  const labelOf = (key: string) => slots.find(s => s.key === key)?.label ?? key;

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-500">Upload a clear JPG scan or photo for each requirement (max 10MB per file).</p>
      {reselect.length > 0 && (
        <div className="p-4 bg-amber-50 text-amber-800 rounded-xl border border-amber-100 text-xs font-semibold flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>
            Your answers were restored, but browsers can't restore selected files. Please re-select:{' '}
            {reselect.map(([key, names]) => `${labelOf(key)} (${names.join(', ')})`).join('; ')}.
          </span>
        </div>
      )}
      {generated.length > 0 && (
        <div className="space-y-2">
          {generated.map(slot => (
            <div key={slot.key} className="p-3.5 border border-emerald-100 bg-emerald-50/50 rounded-xl flex items-start gap-2.5">
              <FileText className="w-4 h-4 text-brand-green shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-slate-700">{slot.label}</p>
                <p className="text-[11px] text-slate-500">{slot.hint ?? 'Generated from your answers in this wizard.'}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-3">
        {uploads.map(slot => (
          <FileSlotField key={slot.key} slot={slot} required={isSlotRequired(slot, values)} />
        ))}
      </div>
    </div>
  );
}

function ReviewStep() {
  const { scholarship, values, files, storedDocs } = useGrantForm();
  const slots = uploadSlots(scholarship).filter(slot => isSlotRequired(slot, values) || (files[slot.key]?.length ?? 0) > 0 || (storedDocs[slot.key]?.length ?? 0) > 0);
  return (
    <div className="space-y-8">
      <p className="text-xs text-slate-500">Review your answers below. Use the section list to go back and edit anything before submitting.</p>
      <ApplicationFormAnswers details={values} scholarship={scholarship} />
      {values.evaluationSheet && (
        <div className="pt-6 border-t border-slate-100">
          <h4 className="font-display font-bold text-sm text-slate-900 mb-5">Evaluation Sheet</h4>
          <EvaluationSheetAnswers sheet={values.evaluationSheet} />
        </div>
      )}
      <div className="pt-6 border-t border-slate-100 space-y-2">
        <h4 className="font-display font-bold text-sm text-slate-900 mb-3">Documents</h4>
        {slots.map(slot => {
          const selected = files[slot.key] ?? [];
          const onRecord = storedDocs[slot.key] ?? [];
          const ok = selected.length > 0 || onRecord.length > 0;
          return (
            <div key={slot.key} className="flex items-start gap-2 text-xs">
              {ok ? <CheckCircle className="w-4 h-4 text-brand-green shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />}
              <span className="text-slate-700">
                <span className="font-semibold">{slot.label}</span>
                <span className="text-slate-400"> — {selected.length ? selected.map(f => f.name).join(', ') : onRecord.length ? `${onRecord.length} file(s) on record` : 'missing'}</span>
              </span>
            </div>
          );
        })}
      </div>
      {scholarship.submissionNote && (
        <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 text-xs text-amber-800 font-semibold flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{scholarship.submissionNote}</span>
        </div>
      )}
    </div>
  );
}
