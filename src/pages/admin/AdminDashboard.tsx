import React, { useState, useEffect, useMemo } from 'react';
import { useAuth, useUser } from '@clerk/react';
import {
  FileText, CheckCircle, XCircle, Clock, Eye, Download, AlertCircle, ArrowLeft, Menu, RefreshCw,
  ChevronRight, Building2, ClipboardList, Paperclip, RotateCcw, Save, Inbox
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import AdminAnalytics from './AdminAnalytics';
import AdminAnnouncements from './AdminAnnouncements';
import AdminScholars from './AdminScholars';
import AdminSidebar from './AdminSidebar';
import { ApplicationFormAnswers, EvaluationSheetAnswers } from '../../components/grant-forms/GrantAnswersView';
import PolcaAdminFieldsCard from '../../components/grant-forms/PolcaAdminFieldsCard';
import { OFFICE_LABELS, mockScholarships, officeOf } from '../../data/scholarships';
import { isGrantFormType, toGrantDetails } from '../../utils/grantForms';
import { PolcaAdminFields, SfagApplicationDetails } from '../../types';
import { SfagAnswers, StandardProfileAnswers } from '../../components/grant-forms/StandardAnswersView';
import {
  AdminAvatar, Button, DetailField, EmptyState, ErrorBanner, KpiCard, PageHeader, Pagination, Panel,
  SearchInput, SelectInput, SkeletonRows, StatusBadge, TabBar, Tag, Td, Th, controlClass, usePagination
} from './AdminUI';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

type AppStatus = 'Under Evaluation' | 'Approved' | 'Rejected' | 'Needs Revision';

const STATUS_OPTIONS: AppStatus[] = ['Under Evaluation', 'Approved', 'Rejected', 'Needs Revision'];


// A history entry represents a single lifecycle event on an application:
// initial submission, a student resubmission after revision was requested,
// or an admin review decision. 'Submitted' / 'Resubmitted' are
// student-originated events; the four AppStatus values are admin-originated
// review decisions. Populated server-side (see routes/applications.js) —
// existing pre-migration applications may have no history at all, which
// ApplicationTimeline handles gracefully.
type HistoryStatus = AppStatus | 'Submitted' | 'Resubmitted';

interface HistoryEntry {
  status: HistoryStatus;
  note?: string;
  changedBy?: string;
  changedAt: string;
}

// --- Types matching models/Application.js -------------------------------

interface AdminDocument {
  docType: string;
  slotKey?: string;
  variant?: string;
  fileId: string;
  filename: string;
  mimetype: string;
  size: number;
}

interface StandardInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  studentNumber: string;
  program: string;
  yearLevel: string;
  gpa: string;
}

interface SfagPersonalInfo {
  lastName: string; firstName: string; middleInitial: string; suffix: string;
  studentNumber: string; course: string; yearLevel: string;
  placeOfBirth: string; dateOfBirth: string; age: string; civilStatus: string;
  gender: string; nationality: string; isPwd: boolean; religion: string; specifyReligion: string;
}

interface SfagContactSchool {
  streetAddress: string; municipality: string; province: string; country: string;
  mobileNo: string; landlineNo: string; email: string;
  secondarySchool: string; schoolAddress: string; schoolType: string;
}

interface SfagParent {
  fullName: string; occupation: string; company: string; companyTel: string;
  monthlyIncome: string; isSoloParent: boolean;
}

interface SfagGuardian {
  fullName: string; occupation: string; monthlyIncome: string;
  relationship: string; contactNo: string;
}

interface SfagParentsGuardian { father: SfagParent; mother: SfagParent; guardian: SfagGuardian; }

interface SfagSibling {
  id: string; fullName: string; socialStatus: string; civilStatus: string; age: string;
  schoolOrCompany: string; schoolType: string; tuitionOrIncome: string; isDlsudScholar: boolean;
}

interface SfagAssetsExpenses {
  houseAndLot: string; automobile: string; incomeSources: string;
  combinedNonTaxableIncome: string; affidavitNonFilingIncomeTax: string;
  waterBill: string; electricityBill: string; telephoneBill: string;
  mobilePhoneBill: string; internetBill: string; amortizationHouse: string; amortizationAuto: string;
}

interface SfagAgreement { certifyConsulted: boolean; certifyAccuracy: boolean; }

interface AdminApplication {
  _id: string;
  studentNumber: string;
  avatarUrl?: string;
  scholarshipId: string;
  scholarshipName: string;
  applicationFormType: 'standard' | 'sfag' | 'polca' | 'alumni';
  office?: string;
  documents: AdminDocument[];
  referenceCode: string;
  status: AppStatus;
  reviewNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  history?: HistoryEntry[];
  standardInfo?: StandardInfo;
  personalInfo?: SfagPersonalInfo;
  contactSchool?: SfagContactSchool;
  parentsGuardian?: SfagParentsGuardian;
  siblings?: SfagSibling[];
  assetsExpenses?: SfagAssetsExpenses;
  agreement?: SfagAgreement;
  // Grant-form (POLCA / Alumni) only — rendered via toGrantDetails.
  eligibilityAnswers?: Record<string, unknown>;
  evaluationSheet?: Record<string, unknown>;
  adminFields?: PolcaAdminFields;
}

interface AdminDashboardProps {
  onLogout: () => void;
}

// --- Derived helpers ------------------------------------------------------

// SFAG and the grant forms (POLCA / Alumni) all keep the applicant's name,
// course and year level on personalInfo and the mobile number on
// contactSchool; only the standard form uses standardInfo.
function usesSectionForm(app: AdminApplication): boolean {
  return app.applicationFormType !== 'standard';
}

function applicantName(app: AdminApplication): string {
  if (usesSectionForm(app) && app.personalInfo) {
    return `${app.personalInfo.firstName} ${app.personalInfo.lastName}`;
  }
  if (app.standardInfo) return `${app.standardInfo.firstName} ${app.standardInfo.lastName}`;
  return 'Unknown Applicant';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function applicantEmail(app: AdminApplication): string {
  if (!usesSectionForm(app)) return app.standardInfo?.email ?? '';
  // Grant forms store the email with the student data.
  return app.contactSchool?.email || (app.personalInfo as { email?: string } | undefined)?.email || '';
}

function applicantPhone(app: AdminApplication): string {
  return usesSectionForm(app) ? app.contactSchool?.mobileNo ?? '' : app.standardInfo?.phone ?? '';
}

function applicantProgram(app: AdminApplication): string {
  return usesSectionForm(app) ? app.personalInfo?.course ?? '' : app.standardInfo?.program ?? '';
}

function applicantYearLevel(app: AdminApplication): string {
  return usesSectionForm(app) ? app.personalInfo?.yearLevel ?? '' : app.standardInfo?.yearLevel ?? '';
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatShortDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}

function formatBytes(bytes: number): string {
  if (!bytes) return '';
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function documentUrl(fileId: string): string {
  return `${API_BASE_URL}/api/applications/documents/${fileId}`;
}

const FORM_TYPE_LABELS: Record<string, string> = {
  standard: 'Entrance form',
  sfag: 'SFA Grant form',
  polca: 'POLCA form',
  alumni: 'Alumni form'
};

// --- Timeline ---------------------------------------------------------

// Distinct visual treatment per history-entry status. 'Submitted' and
// 'Resubmitted' are student-originated (neutral slate dot); the four
// AppStatus values reuse the same color language as StatusBadge/STATUS_STYLES
// elsewhere in this file so a glance at the timeline matches the badge
// colors the admin already associates with each outcome.
const TIMELINE_STYLES: Record<HistoryStatus, { dot: string; icon: React.ElementType }> = {
  'Submitted': { dot: 'bg-slate-400', icon: FileText },
  'Resubmitted': { dot: 'bg-slate-400', icon: RefreshCw },
  'Under Evaluation': { dot: 'bg-amber-500', icon: Clock },
  'Approved': { dot: 'bg-emerald-500', icon: CheckCircle },
  'Rejected': { dot: 'bg-rose-500', icon: XCircle },
  'Needs Revision': { dot: 'bg-sky-500', icon: AlertCircle }
};

function ApplicationTimeline({ history }: { history?: HistoryEntry[] }) {
  const entries = useMemo(
    () => [...(history ?? [])].sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime()),
    [history]
  );

  if (entries.length === 0) {
    return <p className="text-sm text-slate-500">No history recorded for this application yet.</p>;
  }

  return (
    <ol className="relative">
      {entries.map((entry, idx) => {
        const style = TIMELINE_STYLES[entry.status] ?? TIMELINE_STYLES['Under Evaluation'];
        const Icon = style.icon;
        const last = idx === entries.length - 1;
        return (
          <li key={idx} className="relative flex gap-3 pb-5 last:pb-0">
            {!last && <span className="absolute left-3.5 top-8 bottom-0 w-px bg-slate-200" aria-hidden />}
            <span className={`relative w-7 h-7 rounded-full flex items-center justify-center shrink-0 ring-4 ring-white ${style.dot}`}>
              <Icon className="w-3.5 h-3.5 text-white" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <p className="text-sm font-medium text-slate-900">{entry.status}</p>
                <time className="text-xs text-slate-400 tabular-nums">{formatDateTime(entry.changedAt)}</time>
              </div>
              {entry.changedBy && (
                <p className="text-xs text-slate-500 mt-0.5">by {entry.changedBy === 'student' ? 'Student' : entry.changedBy}</p>
              )}
              {entry.note && (
                <p className="text-sm text-slate-600 mt-2 bg-slate-50 ring-1 ring-inset ring-slate-200 rounded-lg px-3 py-2 wrap-break-word">{entry.note}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// --- Document preview -------------------------------------------------------

function DocumentThumb({ doc }: { doc: AdminDocument }) {
  const [imgFailed, setImgFailed] = useState(false);
  const isImage = doc.mimetype?.startsWith('image/') && !imgFailed;
  return (
    <div className="w-12 h-12 rounded-md ring-1 ring-slate-200 bg-slate-50 overflow-hidden shrink-0 flex items-center justify-center">
      {isImage ? (
        <img src={documentUrl(doc.fileId)} alt="" className="w-full h-full object-cover" onError={() => setImgFailed(true)} />
      ) : (
        <FileText className="w-5 h-5 text-slate-300" />
      )}
    </div>
  );
}

function DocumentPreviewModal({ doc, onClose }: { doc: AdminDocument; onClose: () => void }) {
  const [imgFailed, setImgFailed] = useState(false);
  const isImage = doc.mimetype?.startsWith('image/') && !imgFailed;
  const isPdf = doc.mimetype === 'application/pdf';

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
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-0 sm:p-4 lg:p-8"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.97 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="bg-white sm:rounded-2xl shadow-2xl w-full h-full sm:h-auto sm:max-w-4xl sm:max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-100 shrink-0">
          <div className="min-w-0 flex items-center gap-2.5">
            <FileText className="w-4 h-4 text-brand-green shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800 truncate">{doc.docType}</p>
              <p className="text-[11px] text-slate-400 truncate">
                {doc.filename} {doc.size ? `· ${formatBytes(doc.size)}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0 pl-2">
            <a
              href={documentUrl(doc.fileId)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-brand-green transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Open in new tab</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 transition-colors"
              aria-label="Close preview"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-slate-100 flex items-center justify-center min-h-60 sm:min-h-75">
          {isImage ? (
            <img
              src={documentUrl(doc.fileId)}
              alt={doc.filename}
              className="max-w-full max-h-[70vh] sm:max-h-[75vh] object-contain"
              onError={() => setImgFailed(true)}
            />
          ) : isPdf ? (
            <iframe
              src={documentUrl(doc.fileId)}
              title={doc.filename}
              className="w-full h-full sm:h-[75vh] bg-white"
            />
          ) : (
            <div className="p-6 sm:p-10 text-center">
              <FileText className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-xs font-semibold text-slate-500 mb-3">Preview isn't available for this file type.</p>
              <a
                href={documentUrl(doc.fileId)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-green hover:text-brand-green-dark"
              >
                <Download className="w-3.5 h-3.5" />
                Download instead
              </a>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// Detail-view tabs. Every form type shows its answers grouped by section
// on "form"; POLCA adds the evaluation sheet.
type ReviewTabKey = 'form' | 'sheet' | 'documents';

// Top-level view: the applications list/review flow, the analytics
// dashboard, the scholar lifecycle view, or announcements. Kept separate
// from ReviewTabKey (which only applies within a single application's
// detail view).
type MainView = 'applications' | 'analytics' | 'lifecycle' | 'announcements';

// --- Main component --------------------------------------------------------

export default function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const { getToken } = useAuth();
  const { user } = useUser();
  // Office-scoped admins (publicMetadata.office, e.g. "POLCA") only get
  // their office's applications from the API; this just labels the view
  // and limits the scholarship filter to match. LSO / unset = all offices.
  const adminOfficeRaw = (user?.publicMetadata as { office?: string } | undefined)?.office?.trim().toUpperCase();
  const adminOffice = adminOfficeRaw && adminOfficeRaw !== 'LSO' ? adminOfficeRaw : null;

  const [applications, setApplications] = useState<AdminApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [mainView, setMainView] = useState<MainView>('applications');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AppStatus | 'All'>('All');
  const [scholarshipFilter, setScholarshipFilter] = useState<string>('All');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ReviewTabKey>('form');
  const [isUpdating, setIsUpdating] = useState(false);
  const [pendingAction, setPendingAction] = useState<AppStatus | 'note' | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [justUpdatedStatus, setJustUpdatedStatus] = useState<AppStatus | null>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteJustSaved, setNoteJustSaved] = useState(false);
  const [noteSaveError, setNoteSaveError] = useState('');
  const [previewDoc, setPreviewDoc] = useState<AdminDocument | null>(null);

  const fetchApplications = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/applications`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      if (response.status === 403) throw new Error('This account does not have admin access.');
      if (!response.ok) throw new Error('Failed to load applications.');
      const body = await response.json();
      setApplications(body.applications ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Something went wrong loading applications.');
    } finally {
      setIsLoading(false);
    }
  };

    useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setLoadError('');
      try {
        const token = await getToken();
        const response = await fetch(`${API_BASE_URL}/api/applications`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        if (response.status === 403) throw new Error('This account does not have admin access.');
        if (!response.ok) throw new Error('Failed to load applications.');
        const body = await response.json();
        if (!cancelled) setApplications(body.applications ?? []);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Something went wrong loading applications.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scholarshipOptions = useMemo(() => {
    const map = new Map<string, string>();
    // Every scholarship this admin's office handles, even before it has
    // any applications, plus anything else that shows up in the data.
    mockScholarships
      .filter(s => !adminOffice || officeOf(s) === adminOffice)
      .forEach(s => map.set(s.id, s.name));
    applications.forEach(a => map.set(a.scholarshipId, a.scholarshipName));
    return Array.from(map.entries());
  }, [applications, adminOffice]);

  const stats = useMemo(() => ({
    total: applications.length,
    pending: applications.filter(a => a.status === 'Under Evaluation').length,
    approved: applications.filter(a => a.status === 'Approved').length,
    rejected: applications.filter(a => a.status === 'Rejected').length,
    revision: applications.filter(a => a.status === 'Needs Revision').length
  }), [applications]);

  const filtered = useMemo(() => {
    return applications.filter(app => {
      if (statusFilter !== 'All' && app.status !== statusFilter) return false;
      if (scholarshipFilter !== 'All' && app.scholarshipId !== scholarshipFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matches =
          applicantName(app).toLowerCase().includes(q) ||
          app.studentNumber.toLowerCase().includes(q) ||
          app.scholarshipName.toLowerCase().includes(q) ||
          app.referenceCode.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [applications, search, statusFilter, scholarshipFilter]);

  const pager = usePagination(filtered, 15, `${search}|${statusFilter}|${scholarshipFilter}`);

  const selected = applications.find(a => a._id === selectedId) ?? null;

  const openApplication = (app: AdminApplication) => {
    setSelectedId(app._id);
    setActiveTab('form');
    setReviewNote('');
    setJustUpdatedStatus(null);
    setNoteJustSaved(false);
    setNoteSaveError('');
    setPreviewDoc(null);
    setPendingAction(null); // add this
  };

  const updateStatus = async (appId: string, status: AppStatus) => {
    setIsUpdating(true);
    setLoadError('');
    setJustUpdatedStatus(null);
    setNoteJustSaved(false);
    setNoteSaveError('');
    try {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/applications/${appId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ status, reviewNote: reviewNote || undefined })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to update status.');
      }
      const body = await response.json();
      // Normalize: the API returns Mongo's _id, keep the same shape the
      // list view uses so the merge below actually matches.
      const updated: AdminApplication = { ...body.application, _id: body.application._id?.toString?.() ?? body.application._id };
      // PATCH /:id/status doesn't run the avatarUrl $lookup that GET / does,
      // so `updated` won't have one — fall back to whatever avatarUrl was
      // already in state for this application rather than letting it get
      // wiped out and the avatar silently revert to initials.
      setApplications(prev => prev.map(a => (a._id === appId ? { ...updated, avatarUrl: updated.avatarUrl ?? a.avatarUrl } : a)));
      // Reflect whatever the server actually stored (updated.reviewNote)
      // rather than blanking the field — it should keep showing the note
      // that's now on file, same as reopening the application would.
      setReviewNote('');
      setJustUpdatedStatus(status);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to update application status.');
    } finally {
      setIsUpdating(false);
    }
  };

  // The three decision buttons below (Approve / Request Revision / Reject)
  // all go through updateStatus, which is the only route that persists
  // reviewNote server-side. That meant a note could only ever be saved
  // alongside a status change — there was no way to jot a note while
  // leaving the status as-is, and worse, nothing told you whether a note
  // had actually made it to the server at all versus just sitting typed
  // in the box. This reuses the same PATCH /:id/status endpoint but sends
  // the application's OWN current status back unchanged, so only the note
  // moves — then shows an explicit "Note saved" confirmation (noteJustSaved)
  // separate from the status-change confirmation, and surfaces a
  // dedicated error if the save fails instead of leaving it ambiguous.
  const saveNote = async () => {
    if (!selected) return;
    setIsSavingNote(true);
    setNoteSaveError('');
    setNoteJustSaved(false);
    try {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/applications/${selected._id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ status: selected.status, reviewNote: reviewNote || undefined })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to save note.');
      }
      const body = await response.json();
      const updated: AdminApplication = { ...body.application, _id: body.application._id?.toString?.() ?? body.application._id };
      // Same avatarUrl fallback as updateStatus above.
      setApplications(prev => prev.map(a => (a._id === selected._id ? { ...updated, avatarUrl: updated.avatarUrl ?? a.avatarUrl } : a)));
      setReviewNote('');
      setNoteJustSaved(true);
    } catch (err) {
      setNoteSaveError(err instanceof Error ? err.message : 'Failed to save note. Please try again.');
    } finally {
      setIsSavingNote(false);
    }
  };

  const officeLabel = adminOffice
    ? (OFFICE_LABELS[adminOffice as keyof typeof OFFICE_LABELS] ?? adminOffice)
    : 'LSO · all offices';

  const VIEW_TITLES: Record<MainView, string> = {
    applications: 'Applications',
    analytics: 'Statistics',
    lifecycle: 'Scholars',
    announcements: 'Announcements'
  };

  const TopBar = (
    <header className="h-16 bg-white/90 backdrop-blur border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3 sticky top-0 z-20">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="p-2 -ml-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 md:hidden focus:outline-hidden shrink-0"
          aria-label="Open navigation"
        >
          <Menu className="w-5 h-5" />
        </button>
        <nav className="flex items-center gap-1.5 text-sm min-w-0" aria-label="Breadcrumb">
          {selected ? (
            <>
              <button onClick={() => setSelectedId(null)} className="text-slate-500 hover:text-slate-900 font-medium shrink-0">
                {VIEW_TITLES[mainView]}
              </button>
              <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
              <span className="font-semibold text-slate-900 truncate">{applicantName(selected)}</span>
            </>
          ) : (
            <span className="font-semibold text-slate-900 truncate">{VIEW_TITLES[mainView]}</span>
          )}
        </nav>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-xs font-medium text-slate-600">
          <Building2 className="w-3.5 h-3.5 text-slate-400" />
          {officeLabel}
        </span>
      </div>
    </header>
  );

  const renderShell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-slate-50 flex">
      <AdminSidebar
        currentView={mainView}
        onNavigate={view => { setMainView(view); setSelectedId(null); }}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onLogout={onLogout}
        adminEmail={user?.primaryEmailAddress?.emailAddress}
        officeLabel={officeLabel}
        pendingCount={stats.pending}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        {TopBar}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 max-w-7xl mx-auto w-full min-w-0">
          {children}
        </main>
      </div>
    </div>
  );

  // === Detail / review view ================================================
  if (selected) {
    const isGrant = isGrantFormType(selected.applicationFormType);
    const grantScholarship = isGrant ? mockScholarships.find(s => s.id === selected.scholarshipId) : undefined;
    const grantDetails = grantScholarship ? toGrantDetails(selected, grantScholarship) : null;
    const name = applicantName(selected);
    const tabs: { key: ReviewTabKey; label: string; icon: React.ElementType; count?: number }[] = [
      { key: 'form', label: 'Application form', icon: FileText },
      ...(grantDetails?.evaluationSheet ? [{ key: 'sheet' as const, label: 'Evaluation sheet', icon: ClipboardList }] : []),
      { key: 'documents', label: 'Documents', icon: Paperclip, count: selected.documents.length }
    ];
    const meta: [string, React.ReactNode][] = [
      ['Reference', <span className="font-mono text-[13px]">{selected.referenceCode}</span>],
      ['Student no.', selected.studentNumber],
      ['Submitted', formatDate(selected.createdAt)],
      ['Program', [applicantProgram(selected), applicantYearLevel(selected)].filter(Boolean).join(' · ')],
      ['Email', applicantEmail(selected)],
      ['Mobile', applicantPhone(selected)]
    ];

    const decisionStyles: Record<AppStatus, { variant: 'success' | 'info' | 'danger'; icon: React.ElementType; action: string; done: string }> = {
      'Approved': { variant: 'success', icon: CheckCircle, action: 'Approve', done: 'Approved' },
      'Needs Revision': { variant: 'info', icon: RotateCcw, action: 'Request revision', done: 'Revision requested' },
      'Rejected': { variant: 'danger', icon: XCircle, action: 'Reject', done: 'Rejected' },
      'Under Evaluation': { variant: 'info', icon: Clock, action: '', done: '' }
    };

    return (
      renderShell(<>
        <button
          onClick={() => setSelectedId(null)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to applications
        </button>

        {/* Applicant header */}
        <Panel bodyClassName="p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-5">
            <AdminAvatar name={name} avatarUrl={selected.avatarUrl} size="lg" />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">{name}</h1>
                <StatusBadge status={selected.status} />
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <span className="text-sm text-slate-600">{selected.scholarshipName}</span>
                <Tag>{FORM_TYPE_LABELS[selected.applicationFormType] ?? selected.applicationFormType}</Tag>
                {selected.office && selected.office !== 'LSO' && <Tag tone="blue">{selected.office}</Tag>}
              </div>
              <dl className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 mt-5 pt-5 border-t border-slate-100">
                {meta.map(([label, value]) => <DetailField key={label} label={label} value={value} />)}
              </dl>
            </div>
          </div>
        </Panel>

        <ErrorBanner message={loadError} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Answers */}
          <div className="lg:col-span-2 min-w-0">
            <section className="bg-white rounded-xl border border-slate-200/80 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
              <div className="px-3 sm:px-4">
                <TabBar<ReviewTabKey> tabs={tabs} value={activeTab} onChange={setActiveTab} className="border-slate-100" />
              </div>
              <div className="p-5 sm:p-6">
                {activeTab === 'form' && (
                  isGrant ? (
                    grantDetails
                      ? <ApplicationFormAnswers details={grantDetails} scholarship={grantScholarship} />
                      : <EmptyState title="Form unavailable" description="This scholarship is no longer in the registry, so its form can't be displayed." />
                  ) : selected.applicationFormType === 'sfag' && selected.personalInfo ? (
                    <SfagAnswers details={{
                      personalInfo: selected.personalInfo,
                      contactSchool: selected.contactSchool,
                      parentsGuardian: selected.parentsGuardian,
                      siblings: selected.siblings ?? [],
                      assetsExpenses: selected.assetsExpenses,
                      agreement: selected.agreement
                    } as unknown as SfagApplicationDetails} />
                  ) : selected.standardInfo ? (
                    <StandardProfileAnswers info={selected.standardInfo} />
                  ) : (
                    <EmptyState title="No form answers on file" />
                  )
                )}
                {activeTab === 'sheet' && grantDetails?.evaluationSheet && (
                  <EvaluationSheetAnswers sheet={grantDetails.evaluationSheet} />
                )}
                {activeTab === 'documents' && (
                  selected.documents.length === 0 ? (
                    <EmptyState icon={Paperclip} title="No documents uploaded" />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {selected.documents.map(doc => (
                        <button
                          key={doc.fileId}
                          type="button"
                          onClick={() => setPreviewDoc(doc)}
                          className="group flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-left transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green/40"
                        >
                          <DocumentThumb doc={doc} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-900 line-clamp-2">{doc.docType}</p>
                            {doc.variant && <p className="text-xs text-brand-green mt-0.5 truncate">{doc.variant}</p>}
                            <p className="text-xs text-slate-500 mt-0.5 truncate">{doc.filename}{doc.size ? ` · ${formatBytes(doc.size)}` : ''}</p>
                          </div>
                          <Eye className="w-4 h-4 text-slate-300 group-hover:text-slate-600 shrink-0" />
                        </button>
                      ))}
                    </div>
                  )
                )}
              </div>
            </section>
          </div>

          {/* Decision sidebar */}
          <div className="space-y-6 lg:sticky lg:top-24 min-w-0">
            <Panel title="Review decision" description={`Current status: ${selected.status}`}>
              <div className="space-y-4">
                {justUpdatedStatus && (
                  <div className="p-3 bg-emerald-50 text-emerald-800 rounded-lg ring-1 ring-inset ring-emerald-200 text-sm flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    Marked as {justUpdatedStatus}.
                  </div>
                )}

                <div>
                  <label htmlFor="review-note" className="block text-xs font-medium text-slate-700 mb-1.5">
                    Note to applicant <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    id="review-note"
                    value={reviewNote}
                    onChange={e => {
                      setReviewNote(e.target.value);
                      setNoteJustSaved(false);
                      setNoteSaveError('');
                      if (pendingAction === 'note') setPendingAction(null);
                    }}
                    rows={3}
                    placeholder="Reason for revision or rejection, or internal remarks…"
                    className={`${controlClass} px-3 py-2 resize-none`}
                  />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    {pendingAction === 'note' ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-600">Save without changing status?</span>
                        <Button size="sm" variant="primary" loading={isSavingNote} onClick={async () => { await saveNote(); setPendingAction(null); }}>Save</Button>
                        <Button size="sm" variant="ghost" disabled={isSavingNote} onClick={() => setPendingAction(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Save}
                        onClick={() => setPendingAction('note')}
                        disabled={isSavingNote || isUpdating || reviewNote.trim() === ''}
                        className="-ml-2.5"
                      >
                        Save note only
                      </Button>
                    )}
                    {noteJustSaved && !isSavingNote && <span className="text-xs font-medium text-emerald-700 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Note saved</span>}
                    {noteSaveError && <span className="text-xs font-medium text-rose-600 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5 shrink-0" /> {noteSaveError}</span>}
                  </div>
                </div>

                <div className="space-y-2 pt-4 border-t border-slate-100">
                  {(['Approved', 'Needs Revision', 'Rejected'] as AppStatus[]).map(status => {
                    const s = decisionStyles[status];
                    const isCurrent = selected.status === status;
                    if (pendingAction === status) {
                      return (
                        <div key={status} className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-slate-50 ring-1 ring-inset ring-slate-200">
                          <span className="flex-1 min-w-24 text-sm text-slate-700 pl-1">{s.action}?</span>
                          <Button size="sm" variant={s.variant} icon={s.icon} loading={isUpdating} disabled={isSavingNote} onClick={() => { updateStatus(selected._id, status); setPendingAction(null); }}>
                            Confirm
                          </Button>
                          <Button size="sm" variant="ghost" disabled={isUpdating} onClick={() => setPendingAction(null)}>Cancel</Button>
                        </div>
                      );
                    }
                    return (
                      <Button
                        key={status}
                        variant={s.variant}
                        icon={s.icon}
                        disabled={isUpdating || isSavingNote || isCurrent}
                        onClick={() => setPendingAction(status)}
                        className="w-full"
                      >
                        {isCurrent ? s.done : s.action}
                      </Button>
                    );
                  })}
                </div>

                {selected.reviewNote && (
                  <div className="pt-4 border-t border-slate-100">
                    <p className="text-xs text-slate-500">
                      Last note{selected.reviewedBy ? ` · ${selected.reviewedBy}` : ''}{selected.reviewedAt ? ` · ${formatShortDate(selected.reviewedAt)}` : ''}
                    </p>
                    <p className="text-sm text-slate-700 mt-1 wrap-break-word">{selected.reviewNote}</p>
                  </div>
                )}
              </div>
            </Panel>

            {selected.applicationFormType === 'polca' && (
              <PolcaAdminFieldsCard
                applicationId={selected._id}
                fields={selected.adminFields}
                getToken={() => getToken()}
                apiBaseUrl={API_BASE_URL}
                onSaved={adminFields => setApplications(prev => prev.map(a => (a._id === selected._id ? { ...a, adminFields } : a)))}
              />
            )}

            <Panel title="Activity">
              <ApplicationTimeline history={selected.history} />
            </Panel>
          </div>
        </div>

        <AnimatePresence>
          {previewDoc && <DocumentPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />}
        </AnimatePresence>
      </>)
    );
  }

  // === Other sections ======================================================
  if (mainView === 'analytics') {
    return renderShell(<><ErrorBanner message={loadError} /><AdminAnalytics applications={applications} isLoading={isLoading} onRefresh={fetchApplications} /></>);
  }
  if (mainView === 'lifecycle') {
    return renderShell(<><ErrorBanner message={loadError} /><AdminScholars applications={applications} isLoading={isLoading} getToken={getToken} apiBaseUrl={API_BASE_URL} onRefresh={fetchApplications} /></>);
  }
  if (mainView === 'announcements') {
    return renderShell(<><AdminAnnouncements /></>);
  }

  // === Applications list ===================================================
  const statusTabs: { key: AppStatus | 'All'; label: string; count: number }[] = [
    { key: 'All', label: 'All', count: stats.total },
    { key: 'Under Evaluation', label: 'Awaiting review', count: stats.pending },
    { key: 'Needs Revision', label: 'Needs revision', count: stats.revision },
    { key: 'Approved', label: 'Approved', count: stats.approved },
    { key: 'Rejected', label: 'Rejected', count: stats.rejected }
  ];
  const decided = stats.approved + stats.rejected;
  const approvalRate = decided > 0 ? Math.round((stats.approved / decided) * 100) : null;
  const filtersActive = search.trim() !== '' || scholarshipFilter !== 'All' || statusFilter !== 'All';

  return (
    renderShell(<>
      <PageHeader
        title="Applications"
        description="Review submissions, verify documents, and record a decision for each applicant."
        actions={<Button icon={RefreshCw} onClick={fetchApplications} disabled={isLoading}>Refresh</Button>}
      />

      <ErrorBanner message={loadError} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total applications" value={stats.total} hint="All submissions on file" icon={Inbox} tone="slate" />
        <KpiCard label="Awaiting review" value={stats.pending} hint="Under evaluation" icon={Clock} tone="amber" active={statusFilter === 'Under Evaluation'} onClick={() => setStatusFilter(statusFilter === 'Under Evaluation' ? 'All' : 'Under Evaluation')} />
        <KpiCard label="Needs revision" value={stats.revision} hint="Waiting on applicants" icon={RotateCcw} tone="sky" active={statusFilter === 'Needs Revision'} onClick={() => setStatusFilter(statusFilter === 'Needs Revision' ? 'All' : 'Needs Revision')} />
        <KpiCard label="Approval rate" value={approvalRate === null ? '—' : `${approvalRate}%`} hint={`${stats.approved} approved of ${decided} decided`} icon={CheckCircle} tone="green" />
      </div>

      <section className="bg-white rounded-xl border border-slate-200/80 shadow-[0_1px_2px_rgba(16,24,40,0.04)] min-w-0">
        <div className="px-3 sm:px-4">
          <TabBar<AppStatus | 'All'> tabs={statusTabs} value={statusFilter} onChange={setStatusFilter} className="border-slate-100" />
        </div>
        <div className="p-4 flex flex-col md:flex-row gap-3 border-b border-slate-100">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, student no., scholarship or reference…" className="flex-1" />
          <SelectInput value={scholarshipFilter} onChange={setScholarshipFilter} className="md:w-72" ariaLabel="Filter by scholarship">
            <option value="All">All scholarships</option>
            {scholarshipOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </SelectInput>
        </div>

        {isLoading ? (
          <SkeletonRows />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={filtersActive ? 'No applications match your filters' : 'No applications yet'}
            description={filtersActive ? 'Try a different search term, status or scholarship.' : 'New submissions will appear here as students apply.'}
            action={filtersActive ? <Button size="sm" onClick={() => { setSearch(''); setStatusFilter('All'); setScholarshipFilter('All'); }}>Clear filters</Button> : undefined}
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50/70 border-b border-slate-100">
                  <tr>
                    <Th>Applicant</Th>
                    <Th>Scholarship</Th>
                    <Th>Reference</Th>
                    <Th>Submitted</Th>
                    <Th>Status</Th>
                    <Th className="w-10"><span className="sr-only">Open</span></Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pager.pageItems.map(app => {
                    const name = applicantName(app);
                    return (
                      <tr
                        key={app._id}
                        onClick={() => openApplication(app)}
                        className="group cursor-pointer hover:bg-slate-50/80 transition-colors"
                      >
                        <Td>
                          <div className="flex items-center gap-3 min-w-0">
                            <AdminAvatar name={name} avatarUrl={app.avatarUrl} size="sm" />
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); openApplication(app); }}
                                className="text-sm font-medium text-slate-900 truncate hover:text-brand-green focus:outline-hidden focus-visible:underline text-left"
                              >
                                {name}
                              </button>
                              <p className="text-xs text-slate-500 tabular-nums">{app.studentNumber}</p>
                            </div>
                          </div>
                        </Td>
                        <Td>
                          <p className="text-sm text-slate-700 truncate max-w-64">{app.scholarshipName}</p>
                          <p className="text-xs text-slate-400">{FORM_TYPE_LABELS[app.applicationFormType] ?? app.applicationFormType}</p>
                        </Td>
                        <Td><span className="font-mono text-xs text-slate-500">{app.referenceCode}</span></Td>
                        <Td className="whitespace-nowrap tabular-nums">{formatShortDate(app.createdAt)}</Td>
                        <Td><StatusBadge status={app.status} /></Td>
                        <Td><ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-600" /></Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <ul className="md:hidden divide-y divide-slate-100">
              {pager.pageItems.map(app => {
                const name = applicantName(app);
                return (
                  <li key={app._id}>
                    <button onClick={() => openApplication(app)} className="w-full flex items-start gap-3 p-4 text-left hover:bg-slate-50">
                      <AdminAvatar name={name} avatarUrl={app.avatarUrl} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-slate-900 truncate">{name}</p>
                          <StatusBadge status={app.status} />
                        </div>
                        <p className="text-xs text-slate-500 truncate mt-0.5">{app.scholarshipName}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{app.studentNumber} · {formatShortDate(app.createdAt)}</p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="px-4 py-3 border-t border-slate-100">
              <Pagination page={pager.page} pageCount={pager.pageCount} total={pager.total} pageSize={pager.pageSize} onChange={pager.setPage} noun="applications" />
            </div>
          </>
        )}
      </section>
    </>)
  );
}
