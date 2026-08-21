import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@clerk/react';
import {
  Search, FileText, CheckCircle, XCircle, Clock, Eye, Download,
  AlertCircle, ChevronDown, ShieldCheck, LogOut, ArrowLeft, User,
  MapPin, Users, PiggyBank, ClipboardCheck, Phone, Mail, GraduationCap,
  RefreshCw, BarChart3, LayoutList, Megaphone, History
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import AdminAnalytics from './AdminAnalytics';
import AdminAnnouncements from './AdminAnnouncements';
import AdminScholars from './AdminScholars';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

type AppStatus = 'Under Evaluation' | 'Approved' | 'Rejected' | 'Needs Revision';

const STATUS_OPTIONS: AppStatus[] = ['Under Evaluation', 'Approved', 'Rejected', 'Needs Revision'];

const STATUS_STYLES: Record<AppStatus, { badge: string; dot: string }> = {
  'Under Evaluation': { badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  'Approved': { badge: 'bg-emerald-50 text-brand-green border-emerald-200', dot: 'bg-brand-green' },
  'Rejected': { badge: 'bg-rose-50 text-rose-700 border-rose-200', dot: 'bg-rose-500' },
  'Needs Revision': { badge: 'bg-sky-50 text-sky-700 border-sky-200', dot: 'bg-sky-500' }
};

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
  scholarshipId: string;
  scholarshipName: string;
  applicationFormType: 'standard' | 'sfag';
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
}

interface AdminDashboardProps {
  onLogout: () => void;
}

// --- Derived helpers ------------------------------------------------------

function applicantName(app: AdminApplication): string {
  if (app.applicationFormType === 'sfag' && app.personalInfo) {
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
  return app.applicationFormType === 'sfag' ? app.contactSchool?.email ?? '' : app.standardInfo?.email ?? '';
}

function applicantPhone(app: AdminApplication): string {
  return app.applicationFormType === 'sfag' ? app.contactSchool?.mobileNo ?? '' : app.standardInfo?.phone ?? '';
}

function applicantProgram(app: AdminApplication): string {
  return app.applicationFormType === 'sfag' ? app.personalInfo?.course ?? '' : app.standardInfo?.program ?? '';
}

function applicantYearLevel(app: AdminApplication): string {
  return app.applicationFormType === 'sfag' ? app.personalInfo?.yearLevel ?? '' : app.standardInfo?.yearLevel ?? '';
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

// --- Small presentational pieces ------------------------------------------

// Mirrors the student portal's DashboardCard: icon chip top-right, big
// number top-left, label above and description below — same shape and
// hover-lift so the admin metrics read as the same design system.
function StatCard({ label, value, icon: Icon, accent, description, onClick }: { label: string; value: string | number; icon: React.ElementType; accent: string; description?: string; onClick?: () => void }) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
      onClick={onClick}
      className={`p-3.5 sm:p-5 rounded-xl border border-slate-100 bg-white card-shadow transition-all min-w-0 flex flex-col justify-between ${onClick ? 'cursor-pointer hover:border-slate-200' : ''}`}
    >
      <div className="flex justify-between items-start mb-2.5 sm:mb-3 gap-2">
        <div className="min-w-0">
          <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{label}</p>
          <h3 className="text-2xl sm:text-3xl font-display font-extrabold text-brand-green mt-1 sm:mt-1.5">{value}</h3>
        </div>
        <div className={`p-2 sm:p-2.5 rounded-lg shrink-0 ${accent}`}>
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
      </div>
      {description && <p className="text-[11px] sm:text-xs text-slate-600 font-medium truncate">{description}</p>}
    </motion.div>
  );
}

// Same pill shape/weight as AnnouncementCard's category badges elsewhere
// in the portal, reusing this file's own status palette.
function StatusBadge({ status }: { status: AppStatus }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES['Under Evaluation'];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold whitespace-nowrap ${style.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
      {status}
    </span>
  );
}

// Same treatment as the profile avatar in Navbar: brand-green circle,
// soft inner shadow, subtle emerald ring.
function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'w-14 h-14 sm:w-16 sm:h-16 text-base sm:text-lg' : size === 'sm' ? 'w-8 h-8 text-[10px]' : 'w-9 h-9 sm:w-10 sm:h-10 text-[11px] sm:text-xs';
  return (
    <div className={`${dims} rounded-full bg-brand-green text-white font-display font-bold flex items-center justify-center shrink-0 shadow-inner border border-emerald-100`}>
      {initials(name)}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm text-slate-700 font-semibold break-words">{value || value === 0 ? value : <span className="text-slate-300 font-normal">—</span>}</p>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 card-shadow p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-5 pb-3 border-b border-slate-100">
        <Icon className="w-4 h-4 text-brand-green shrink-0" />
        <h3 className="font-display font-bold text-sm text-slate-900 uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  );
}

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
  'Approved': { dot: 'bg-brand-green', icon: CheckCircle },
  'Rejected': { dot: 'bg-rose-500', icon: XCircle },
  'Needs Revision': { dot: 'bg-sky-500', icon: AlertCircle }
};

function ApplicationTimeline({ history }: { history?: HistoryEntry[] }) {
  const entries = useMemo(
    () =>
      [...(history ?? [])].sort(
        (a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime()
      ),
    [history]
  );

  if (entries.length === 0) {
    return (
      <p className="text-xs text-slate-400">
        No history recorded for this application yet.
      </p>
    );
  }

  return (
    <div className="relative pl-6">
      <div className="absolute left-[7px] top-1.5 bottom-1.5 w-px bg-slate-200" />
      <div className="space-y-6">
        {entries.map((entry, idx) => {
          const style = TIMELINE_STYLES[entry.status] ?? TIMELINE_STYLES['Under Evaluation'];
          const Icon = style.icon;
          return (
            <div key={idx} className="relative flex gap-3 min-w-0">
              <div className={`absolute -left-6 top-0.5 w-3.5 h-3.5 rounded-full ring-4 ring-white flex items-center justify-center shrink-0 ${style.dot}`} />
              <Icon className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <p className="text-sm font-bold text-slate-800">{entry.status}</p>
                  <span className="text-[11px] text-slate-400">{formatDateTime(entry.changedAt)}</span>
                </div>
                {entry.changedBy && (
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    by {entry.changedBy === 'student' ? 'Student' : entry.changedBy}
                  </p>
                )}
                {entry.note && (
                  <p className="text-xs text-slate-600 mt-1.5 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 leading-relaxed break-words">
                    {entry.note}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Document preview -------------------------------------------------------

function DocumentThumb({ doc, onOpen }: { doc: AdminDocument; onOpen: () => void }) {
  const [imgFailed, setImgFailed] = useState(false);
  const isImage = doc.mimetype?.startsWith('image/') && !imgFailed;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg border border-slate-200 bg-white overflow-hidden shrink-0 flex items-center justify-center hover:ring-2 hover:ring-brand-green/30 transition-all"
    >
      {isImage ? (
        <img
          src={documentUrl(doc.fileId)}
          alt={doc.filename}
          className="w-full h-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <FileText className="w-5 h-5 text-slate-300" />
      )}
    </button>
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

        <div className="flex-1 overflow-auto bg-slate-100 flex items-center justify-center min-h-[240px] sm:min-h-[300px]">
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

// Tabs for the detail-view content pane. Timeline used to live here as a
// tab; it now renders as its own sidebar card next to Review Decision
// (see the "Sticky decision sidebar" block below), so it's no longer in
// this list.
const REVIEW_TABS = [
  { key: 'personal', label: 'Personal', icon: User },
  { key: 'contact', label: 'Contact & School', icon: MapPin },
  { key: 'family', label: 'Parents & Guardian', icon: Users },
  { key: 'financial', label: 'Assets & Expenses', icon: PiggyBank },
  { key: 'documents', label: 'Documents', icon: ClipboardCheck }
] as const;
type ReviewTabKey = typeof REVIEW_TABS[number]['key'];

// Top-level view: the applications list/review flow, the analytics
// dashboard, the scholar lifecycle view, or announcements. Kept separate
// from ReviewTabKey (which only applies within a single application's
// detail view).
type MainView = 'applications' | 'analytics' | 'lifecycle' | 'announcements';

// --- Main component --------------------------------------------------------

export default function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const { getToken } = useAuth();

  const [applications, setApplications] = useState<AdminApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [mainView, setMainView] = useState<MainView>('applications');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AppStatus | 'All'>('All');
  const [scholarshipFilter, setScholarshipFilter] = useState<string>('All');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ReviewTabKey>('personal');
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
    applications.forEach(a => map.set(a.scholarshipId, a.scholarshipName));
    return Array.from(map.entries());
  }, [applications]);

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

  const selected = applications.find(a => a._id === selectedId) ?? null;

  const openApplication = (app: AdminApplication) => {
    setSelectedId(app._id);
    setActiveTab('personal');
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
      setApplications(prev => prev.map(a => (a._id === appId ? updated : a)));
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
      setApplications(prev => prev.map(a => (a._id === selected._id ? updated : a)));
      setReviewNote('');
      setNoteJustSaved(true);
    } catch (err) {
      setNoteSaveError(err instanceof Error ? err.message : 'Failed to save note. Please try again.');
    } finally {
      setIsSavingNote(false);
    }
  };

  // Same frosted sticky bar as the student portal's Navbar (glass-header),
  // rather than a plain white border-bottom header.
  const Header = (
    <header className="h-16 glass-header px-4 sm:px-6 lg:px-10 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white flex items-center justify-center shadow-md border-2 border-white shrink-0">
          <ShieldCheck className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-brand-green" />
        </div>
        <div className="min-w-0">
          <span className="font-display font-bold text-slate-900 text-sm sm:text-base leading-none truncate block">AniSkolar Admin</span>
          <span className="text-[10px] text-slate-400 font-semibold tracking-widest uppercase hidden sm:block">DLSU-D Portal</span>
        </div>
      </div>
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={onLogout}
        className="inline-flex items-center gap-1.5 sm:gap-2 text-xs font-bold text-rose-600 hover:bg-rose-50 px-3 py-2 rounded-lg transition-colors shrink-0"
      >
        <LogOut className="w-3.5 h-3.5" />
        <span className="hidden xs:inline">Log out</span>
      </motion.button>
    </header>
  );

  // === Detail / review view ================================================
  if (selected) {
    const isSfag = selected.applicationFormType === 'sfag';
    const name = applicantName(selected);
    const tabs = isSfag
      ? REVIEW_TABS
      : REVIEW_TABS.filter(t => t.key === 'personal' || t.key === 'documents');

    return (
      <div className="min-h-screen bg-[#f1f5f9] flex flex-col">
        {Header}
        <main className="flex-1 px-4 sm:px-6 lg:px-10 py-5 sm:py-8 space-y-5 sm:space-y-6 max-w-7xl mx-auto w-full">
          <button
            onClick={() => setSelectedId(null)}
            className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-500 hover:text-brand-green transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Applications</span>
          </button>

          {/* Applicant summary header */}
          <div className="bg-white rounded-xl border border-slate-100 p-5 sm:p-6 md:p-8 card-shadow">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="flex items-center gap-4 sm:contents">
                <Avatar name={name} size="lg" />
                <div className="flex-1 min-w-0 sm:hidden">
                  <h2 className="font-display font-black text-lg text-slate-900 tracking-tight truncate">{name}</h2>
                  <StatusBadge status={selected.status} />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="hidden sm:flex flex-wrap items-center gap-2.5">
                  <h2 className="font-display font-black text-xl md:text-2xl text-slate-900 tracking-tight truncate">{name}</h2>
                  <StatusBadge status={selected.status} />
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                    {selected.applicationFormType}
                  </span>
                </div>
                <span className="sm:hidden inline-block mt-2 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                  {selected.applicationFormType}
                </span>
                <p className="text-xs text-slate-500 mt-2 sm:mt-1.5 truncate">{selected.scholarshipName}</p>
                <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-[11px] text-slate-400 font-semibold">
                  <span>Student No. {selected.studentNumber}</span>
                  <span>Ref. {selected.referenceCode}</span>
                  <span>Submitted {formatDate(selected.createdAt)}</span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:flex sm:flex-col gap-2 sm:gap-1.5 sm:text-right shrink-0 pt-4 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                <div className="flex items-center gap-1.5 text-xs text-slate-600 sm:justify-end min-w-0">
                  <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{applicantEmail(selected) || '—'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-600 sm:justify-end min-w-0">
                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{applicantPhone(selected) || '—'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-600 sm:justify-end min-w-0">
                  <GraduationCap className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{applicantProgram(selected) || '—'} &middot; {applicantYearLevel(selected) || '—'}</span>
                </div>
              </div>
            </div>
          </div>

          {loadError && (
            <div className="p-4 bg-rose-50 text-rose-800 rounded-xl border border-rose-100 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{loadError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6 items-start">
            <div className="lg:col-span-2 space-y-5 sm:space-y-6 min-w-0">
              {/* Tabs */}
              <div className="bg-white rounded-xl border border-slate-100 card-shadow overflow-hidden">
                <div className="flex overflow-x-auto border-b border-slate-100 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  {tabs.map(tab => {
                    const isActive = activeTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-3.5 sm:py-4 text-[11px] sm:text-xs font-bold whitespace-nowrap border-b-2 transition-colors shrink-0 ${
                          isActive
                            ? 'border-brand-green text-brand-green bg-brand-green/5'
                            : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <tab.icon className="w-3.5 h-3.5 shrink-0" />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="p-5 sm:p-6 md:p-8 space-y-6">
                  {/* --- Personal --- */}
                  {activeTab === 'personal' && (
                    isSfag && selected.personalInfo ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-5">
                        <Field label="Last Name" value={selected.personalInfo.lastName} />
                        <Field label="First Name" value={selected.personalInfo.firstName} />
                        <Field label="M.I. / Suffix" value={[selected.personalInfo.middleInitial, selected.personalInfo.suffix].filter(Boolean).join(' / ')} />
                        <Field label="Student No." value={selected.personalInfo.studentNumber} />
                        <Field label="Course" value={selected.personalInfo.course} />
                        <Field label="Year Level" value={selected.personalInfo.yearLevel} />
                        <Field label="Place of Birth" value={selected.personalInfo.placeOfBirth} />
                        <Field label="Date of Birth" value={formatDate(selected.personalInfo.dateOfBirth)} />
                        <Field label="Age" value={selected.personalInfo.age} />
                        <Field label="Civil Status" value={selected.personalInfo.civilStatus} />
                        <Field label="Gender" value={selected.personalInfo.gender} />
                        <Field label="Nationality" value={selected.personalInfo.nationality} />
                        <Field label="PWD" value={selected.personalInfo.isPwd ? 'Yes' : 'No'} />
                        <Field
                          label="Religion"
                          value={selected.personalInfo.religion === 'OTHERS' ? selected.personalInfo.specifyReligion : selected.personalInfo.religion}
                        />
                      </div>
                    ) : selected.standardInfo ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-5">
                        <Field label="First Name" value={selected.standardInfo.firstName} />
                        <Field label="Last Name" value={selected.standardInfo.lastName} />
                        <Field label="Email" value={selected.standardInfo.email} />
                        <Field label="Phone" value={selected.standardInfo.phone} />
                        <Field label="Student No." value={selected.standardInfo.studentNumber} />
                        <Field label="Program" value={selected.standardInfo.program} />
                        <Field label="Year Level" value={selected.standardInfo.yearLevel} />
                        <Field label="GPA" value={selected.standardInfo.gpa} />
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">No personal information on file.</p>
                    )
                  )}

                  {/* --- Contact & School (SFAG only) --- */}
                  {activeTab === 'contact' && selected.contactSchool && (
                    <div className="space-y-6">
                      <div>
                        <p className="text-[11px] font-bold text-brand-green uppercase tracking-wider mb-3">Home Address</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-5">
                          <Field label="Street / Subdivision / Brgy." value={selected.contactSchool.streetAddress} />
                          <Field label="Municipality / City" value={selected.contactSchool.municipality} />
                          <Field label="Province" value={selected.contactSchool.province} />
                          <Field label="Country" value={selected.contactSchool.country} />
                        </div>
                      </div>
                      <div className="border-t border-slate-100 pt-6">
                        <p className="text-[11px] font-bold text-brand-green uppercase tracking-wider mb-3">Contact Details</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-5">
                          <Field label="Mobile No." value={selected.contactSchool.mobileNo} />
                          <Field label="Landline No." value={selected.contactSchool.landlineNo} />
                          <Field label="Email" value={selected.contactSchool.email} />
                        </div>
                      </div>
                      <div className="border-t border-slate-100 pt-6">
                        <p className="text-[11px] font-bold text-brand-green uppercase tracking-wider mb-3">Secondary School</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-5">
                          <Field label="School Attended" value={selected.contactSchool.secondarySchool} />
                          <Field label="School Address" value={selected.contactSchool.schoolAddress} />
                          <Field label="Type" value={selected.contactSchool.schoolType} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* --- Parents & Guardian --- */}
                  {activeTab === 'family' && selected.parentsGuardian && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {(['father', 'mother'] as const).map(key => {
                          const p = selected.parentsGuardian![key];
                          return (
                            <div key={key} className="rounded-xl border border-slate-200 overflow-hidden">
                              <div className="bg-brand-green text-white px-4 py-2.5 font-display font-bold text-xs uppercase tracking-wider flex items-center justify-between gap-2">
                                <span>{key}</span>
                                {p.isSoloParent && (
                                  <span className="text-[10px] font-semibold bg-white/15 px-2 py-0.5 rounded-full normal-case tracking-normal shrink-0">Solo Parent</span>
                                )}
                              </div>
                              <div className="p-4 grid grid-cols-2 gap-x-3 gap-y-4">
                                <Field label="Full Name" value={p.fullName} />
                                <Field label="Occupation" value={p.occupation} />
                                <Field label="Company" value={p.company} />
                                <Field label="Company Tel." value={p.companyTel} />
                                <Field label="Monthly Income" value={p.monthlyIncome} />
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {selected.parentsGuardian.guardian?.fullName && (
                        <div className="border-t border-slate-100 pt-6">
                          <p className="text-[11px] font-bold text-brand-green uppercase tracking-wider mb-3">Guardian</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-5">
                            <Field label="Full Name" value={selected.parentsGuardian.guardian.fullName} />
                            <Field label="Occupation" value={selected.parentsGuardian.guardian.occupation} />
                            <Field label="Monthly Income" value={selected.parentsGuardian.guardian.monthlyIncome} />
                            <Field label="Relationship" value={selected.parentsGuardian.guardian.relationship} />
                            <Field label="Contact No." value={selected.parentsGuardian.guardian.contactNo} />
                          </div>
                        </div>
                      )}

                      {(selected.siblings?.length ?? 0) > 0 && (
                        <div className="border-t border-slate-100 pt-6">
                          <p className="text-[11px] font-bold text-brand-green uppercase tracking-wider mb-3">Siblings</p>
                          <div className="overflow-x-auto rounded-xl border border-slate-200 -mx-5 sm:mx-0 px-5 sm:px-0">
                            <table className="w-full text-xs min-w-[720px]">
                              <thead>
                                <tr className="bg-emerald-50 text-left text-slate-700">
                                  <th className="p-3 font-bold">Name</th>
                                  <th className="p-3 font-bold">Status</th>
                                  <th className="p-3 font-bold">Civil</th>
                                  <th className="p-3 font-bold">Age</th>
                                  <th className="p-3 font-bold">School/Company</th>
                                  <th className="p-3 font-bold">Type</th>
                                  <th className="p-3 font-bold">Tuition/Salary</th>
                                  <th className="p-3 font-bold">DLSU-D</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {selected.siblings!.map(sib => (
                                  <tr key={sib.id}>
                                    <td className="p-3 font-semibold text-slate-800">{sib.fullName}</td>
                                    <td className="p-3 text-slate-600">{sib.socialStatus}</td>
                                    <td className="p-3 text-slate-600">{sib.civilStatus}</td>
                                    <td className="p-3 text-slate-600">{sib.age}</td>
                                    <td className="p-3 text-slate-600">{sib.schoolOrCompany}</td>
                                    <td className="p-3 text-slate-600">{sib.schoolType}</td>
                                    <td className="p-3 text-slate-600">{sib.tuitionOrIncome}</td>
                                    <td className="p-3 text-slate-600">{sib.isDlsudScholar ? 'Yes' : 'No'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* --- Assets & Expenses / Agreement --- */}
                  {activeTab === 'financial' && selected.assetsExpenses && (
                    <div className="space-y-6">
                      <div>
                        <p className="text-[11px] font-bold text-brand-green uppercase tracking-wider mb-3">Market Value of Assets</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                          <Field label="House and Lot" value={selected.assetsExpenses.houseAndLot} />
                          <Field label="Automobile" value={selected.assetsExpenses.automobile} />
                        </div>
                      </div>
                      <div className="border-t border-slate-100 pt-6">
                        <p className="text-[11px] font-bold text-brand-green uppercase tracking-wider mb-3">Income</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-5">
                          <Field label="Income Sources" value={selected.assetsExpenses.incomeSources} />
                          <Field label="Combined Non-Taxable Income" value={selected.assetsExpenses.combinedNonTaxableIncome} />
                          <Field label="Affidavit of Non-Filing" value={selected.assetsExpenses.affidavitNonFilingIncomeTax} />
                        </div>
                      </div>
                      <div className="border-t border-slate-100 pt-6">
                        <p className="text-[11px] font-bold text-brand-green uppercase tracking-wider mb-3">Latest Monthly Bills</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-5">
                          <Field label="Water" value={selected.assetsExpenses.waterBill} />
                          <Field label="Electricity" value={selected.assetsExpenses.electricityBill} />
                          <Field label="Telephone" value={selected.assetsExpenses.telephoneBill} />
                          <Field label="Mobile Phone" value={selected.assetsExpenses.mobilePhoneBill} />
                          <Field label="Internet" value={selected.assetsExpenses.internetBill} />
                          <Field label="Amortization (House)" value={selected.assetsExpenses.amortizationHouse} />
                          <Field label="Amortization (Auto)" value={selected.assetsExpenses.amortizationAuto} />
                        </div>
                      </div>
                      {selected.agreement && (
                        <div className="border-t border-slate-100 pt-6">
                          <p className="text-[11px] font-bold text-brand-green uppercase tracking-wider mb-3">Certifications</p>
                          <div className="space-y-2">
                            <div className={`flex items-start gap-2 text-xs font-semibold ${selected.agreement.certifyConsulted ? 'text-brand-green' : 'text-rose-500'}`}>
                              {selected.agreement.certifyConsulted ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                              <span>Consulted family members on the information provided</span>
                            </div>
                            <div className={`flex items-start gap-2 text-xs font-semibold ${selected.agreement.certifyAccuracy ? 'text-brand-green' : 'text-rose-500'}`}>
                              {selected.agreement.certifyAccuracy ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                              <span>Certifies veracity and completeness of the form</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* --- Documents --- */}
                  {activeTab === 'documents' && (
                    <div className="space-y-2">
                      {selected.documents.length === 0 && (
                        <p className="text-xs text-slate-400">No documents uploaded.</p>
                      )}
                      {selected.documents.map(doc => (
                        <div
                          key={doc.fileId}
                          className="flex items-center justify-between gap-3 p-3 sm:p-3.5 bg-slate-50/60 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
                          onClick={() => setPreviewDoc(doc)}
                        >
                          <div className="flex items-center gap-3 truncate min-w-0">
                            <DocumentThumb doc={doc} onOpen={() => setPreviewDoc(doc)} />
                            <div className="truncate min-w-0">
                              <p className="text-xs font-semibold text-slate-800 truncate">{doc.docType}</p>
                              <p className="text-[10px] text-slate-400 truncate">{doc.filename} {doc.size ? `· ${formatBytes(doc.size)}` : ''}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setPreviewDoc(doc); }}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-green hover:text-brand-green-dark shrink-0"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Preview</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sticky decision sidebar */}
            <div className="space-y-5 sm:space-y-6 lg:sticky lg:top-24 min-w-0">
              <div className="bg-white rounded-xl border border-slate-100 p-5 sm:p-6 card-shadow space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display font-bold text-sm text-slate-900 uppercase tracking-wider">Review Decision</h3>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">
                    Current: <span className="text-slate-600">{selected.status}</span>
                  </span>
                </div>

                {justUpdatedStatus && (
                  <div className="p-3 bg-emerald-50 text-brand-green rounded-lg border border-emerald-100 text-xs font-bold flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span>Marked as {justUpdatedStatus}.</span>
                  </div>
                )}

                <div>
                  <label className="flex items-center gap-1 text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Note (optional)
                  </label>
                  <textarea
                    value={reviewNote}
                    onChange={e => {
                      setReviewNote(e.target.value);
                      setNoteJustSaved(false);
                      setNoteSaveError('');
                      if (pendingAction === 'note') setPendingAction(null); // editing after arming re-disarms it
                    }}
                    rows={3}
                    placeholder="Reason for revision or rejection, or internal remarks..."
                    className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs bg-slate-50/50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all resize-none"
                  />

                  {pendingAction === 'note' ? (
                    <div className="mt-2 flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50/60">
                      <span className="flex-1 text-[11px] font-bold text-slate-600 pl-1">Save this note?</span>
                      <button
                        type="button"
                        disabled={isSavingNote}
                        onClick={async () => { await saveNote(); setPendingAction(null); }}
                        className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-white bg-brand-green hover:bg-brand-green-dark px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                      >
                        {isSavingNote ? (
                          <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        ) : (
                          <CheckCircle className="w-3.5 h-3.5" />
                        )}
                        Confirm
                      </button>
                      <button
                        type="button"
                        disabled={isSavingNote}
                        onClick={() => setPendingAction(null)}
                        className="text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 px-2 py-1.5"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 gap-y-1.5">
                      <button
                        type="button"
                        onClick={() => setPendingAction('note')}
                        disabled={isSavingNote || isUpdating || reviewNote.trim() === ''}
                        className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-green hover:text-brand-green-dark disabled:text-slate-300 disabled:cursor-not-allowed transition-colors"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Save Note
                      </button>
                      {noteJustSaved && !isSavingNote && (
                        <span className="text-[11px] font-bold text-brand-green flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Note saved
                        </span>
                      )}
                      {noteSaveError && (
                        <span className="text-[11px] font-bold text-rose-500 flex items-center gap-1 text-right">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          {noteSaveError}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  {(['Approved', 'Needs Revision', 'Rejected'] as AppStatus[]).map(status => {
                    const isArmed = pendingAction === status;
                    const isCurrent = selected.status === status;
                    const styleMap: Record<AppStatus, string> = {
                      'Approved': 'text-white bg-brand-green hover:bg-brand-green-dark shadow-md shadow-emerald-900/10',
                      'Needs Revision': 'text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200',
                      'Rejected': 'text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200',
                      'Under Evaluation': ''
                    };
                    const iconMap: Record<AppStatus, React.ElementType> = {
                      'Approved': CheckCircle,
                      'Needs Revision': AlertCircle,
                      'Rejected': XCircle,
                      'Under Evaluation': Clock
                    };
                    const labelMap: Record<AppStatus, string> = {
                      'Approved': 'Already Approved',
                      'Needs Revision': 'Revision Requested',
                      'Rejected': 'Already Rejected',
                      'Under Evaluation': ''
                    };
                    const actionLabelMap: Record<AppStatus, string> = {
                      'Approved': 'Approve',
                      'Needs Revision': 'Request Revision',
                      'Rejected': 'Reject',
                      'Under Evaluation': ''
                    };
                    const Icon = iconMap[status];

                    if (isArmed) {
                      return (
                        <div key={status} className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50/60">
                          <span className="flex-1 text-[11px] font-bold text-slate-600 pl-1">
                            Confirm {actionLabelMap[status].toLowerCase()}?
                          </span>
                          <button
                            type="button"
                            disabled={isUpdating || isSavingNote}
                            onClick={() => { updateStatus(selected._id, status); setPendingAction(null); }}
                            className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg transition-all disabled:opacity-50 ${styleMap[status]}`}
                          >
                            {isUpdating ? <span className="w-3 h-3 border-2 border-current/40 border-t-current rounded-full animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
                            Confirm
                          </button>
                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() => setPendingAction(null)}
                            className="text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 px-2 py-1.5"
                          >
                            Cancel
                          </button>
                        </div>
                      );
                    }

                    return (
                      <button
                        key={status}
                        type="button"
                        disabled={isUpdating || isSavingNote || isCurrent}
                        onClick={() => setPendingAction(status)}
                        className={`w-full inline-flex items-center justify-center gap-1.5 font-display font-bold uppercase text-xs tracking-wider px-4 py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed ${styleMap[status]}`}
                      >
                        <Icon className="w-4 h-4" />
                        {isCurrent ? labelMap[status] : actionLabelMap[status]}
                      </button>
                    );
                  })}
                </div>
                {selected.reviewNote && (
                  <div className="pt-3 border-t border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Last Note {selected.reviewedBy ? `— ${selected.reviewedBy}` : ''}{selected.reviewedAt ? ` · ${formatDate(selected.reviewedAt)}` : ''}
                    </p>
                    <p className="text-xs text-slate-600 leading-relaxed break-words">{selected.reviewNote}</p>
                  </div>
                )}
              </div>

              {/* Timeline card — same shell/styling as Review Decision above,
                  just below it in the sidebar, instead of living inside the
                  tab strip on the left. */}
              <div className="bg-white rounded-xl border border-slate-100 p-5 sm:p-6 card-shadow space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-bold text-sm text-slate-900 uppercase tracking-wider">Timeline</h3>
                  <Clock className="w-4 h-4 text-slate-300 shrink-0" />
                </div>
                <ApplicationTimeline history={selected.history} />
              </div>
            </div>
          </div>
        </main>

        <AnimatePresence>
          {previewDoc && (
            <DocumentPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
          )}
        </AnimatePresence>
      </div>
    );
  }

  // === List / overview view =================================================
  return (
    <div className="min-h-screen bg-[#f1f5f9] flex flex-col">
      {Header}
      <main className="flex-1 px-4 sm:px-6 lg:px-10 py-5 sm:py-8 space-y-5 sm:space-y-6 max-w-7xl mx-auto w-full">
        {/* Same hero-placeholder treatment as the student portal's welcome
            banner, so the admin's landing view opens with the same signature
            moment instead of a plain white card. */}
        <div className="hero-placeholder min-h-[9.5rem] sm:h-40 sm:min-h-0 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-5 py-6 sm:px-8 md:px-10 text-white card-shadow shrink-0 relative overflow-hidden">
          <div className="relative z-10 min-w-0">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-display font-extrabold tracking-tight leading-tight">
              {mainView === 'analytics' ? 'Statistics & Trends' : mainView === 'lifecycle' ? 'Scholar Lifecycle' : mainView === 'announcements' ? 'Announcements' : 'Scholarship Applications'}
            </h2>
            <p className="text-xs sm:text-sm text-emerald-100/90 leading-relaxed font-normal mt-1.5 max-w-xl">
              {mainView === 'analytics'
                ? 'Volume, outcomes, and processing performance across every scholarship.'
                : mainView === 'lifecycle'
                ? 'Follow each scholar\'s applications and outcomes across every cycle.'
                : mainView === 'announcements'
                ? 'Post and manage official updates shown to applicants.'
                : 'Review submissions, verify documents, and update application status for every applicant.'}
            </p>
          </div>
          {mainView !== 'announcements' && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={fetchApplications}
              disabled={isLoading}
              className="relative z-10 inline-flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl px-4 py-2.5 transition-colors disabled:opacity-50 shrink-0 self-start"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </motion.button>
          )}
        </div>

        {/* View switcher — toggles between the applications queue, the
            analytics dashboard, the scholar lifecycle view, and
            announcements, all driven by the same `applications` state so
            switching views never re-fetches. */}
        <div className="flex gap-1.5 bg-white rounded-xl border border-slate-100 card-shadow p-1.5 w-fit overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setMainView('applications')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors shrink-0 ${
              mainView === 'applications' ? 'bg-brand-green text-white' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <LayoutList className="w-3.5 h-3.5" />
            Applications
          </button>
          <button
            type="button"
            onClick={() => setMainView('analytics')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors shrink-0 ${
              mainView === 'analytics' ? 'bg-brand-green text-white' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Statistics
          </button>
          <button
            type="button"
            onClick={() => setMainView('lifecycle')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors shrink-0 ${
              mainView === 'lifecycle' ? 'bg-brand-green text-white' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Scholars
          </button>
          <button
            type="button"
            onClick={() => setMainView('announcements')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors shrink-0 ${
              mainView === 'announcements' ? 'bg-brand-green text-white' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Megaphone className="w-3.5 h-3.5" />
            Announcements
          </button>
        </div>

        {loadError && (
          <div className="p-4 bg-rose-50 text-rose-800 rounded-xl border border-rose-100 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{loadError}</span>
          </div>
        )}

        {mainView === 'analytics' ? (
          <AdminAnalytics applications={applications} isLoading={isLoading} />
        ) : mainView === 'lifecycle' ? (
          <AdminScholars applications={applications} isLoading={isLoading} />
        ) : mainView === 'announcements' ? (
          <AdminAnnouncements />
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
              <StatCard
                label="Total Applications"
                value={stats.total}
                description="All submissions on file"
                icon={Users}
                accent="bg-slate-50 text-slate-500"
                onClick={() => setStatusFilter('All')}
              />
              <StatCard
                label="Under Evaluation"
                value={stats.pending}
                description="Awaiting your review"
                icon={Clock}
                accent="bg-amber-50 text-amber-600"
                onClick={() => setStatusFilter('Under Evaluation')}
              />
              <StatCard
                label="Needs Revision"
                value={stats.revision}
                description="Sent back to applicants"
                icon={AlertCircle}
                accent="bg-sky-50 text-sky-600"
                onClick={() => setStatusFilter('Needs Revision')}
              />
              <StatCard
                label="Approved"
                value={stats.approved}
                description="Granted scholarships"
                icon={CheckCircle}
                accent="bg-emerald-50 text-brand-green"
                onClick={() => setStatusFilter('Approved')}
              />
              <StatCard
                label="Rejected"
                value={stats.rejected}
                description="Did not qualify"
                icon={XCircle}
                accent="bg-rose-50 text-rose-600"
                onClick={() => setStatusFilter('Rejected')}
              />
            </div>

            <div className="bg-white rounded-xl border border-slate-100 card-shadow">
              <div className="p-4 md:p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center gap-3">
                <div className="relative flex-1 min-w-0">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search by name, student no., scholarship, or ref. code..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all placeholder:text-slate-300"
                  />
                </div>
                <div className="flex gap-3">
                  <div className="relative flex-1 md:flex-none">
                    <select
                      value={statusFilter}
                      onChange={e => setStatusFilter(e.target.value as AppStatus | 'All')}
                      className="w-full appearance-none pl-3.5 pr-9 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all"
                    >
                      <option value="All">All Statuses</option>
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  {scholarshipOptions.length > 0 && (
                    <div className="relative flex-1 md:flex-none">
                      <select
                        value={scholarshipFilter}
                        onChange={e => setScholarshipFilter(e.target.value)}
                        className="w-full appearance-none pl-3.5 pr-9 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all md:max-w-[180px]"
                      >
                        <option value="All">All Scholarships</option>
                        {scholarshipOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  )}
                </div>
              </div>

              {isLoading ? (
                <div className="p-12 text-center text-xs text-slate-400 font-semibold">Loading applications...</div>
              ) : filtered.length === 0 ? (
                <div className="p-12 text-center">
                  <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-400">No applications match your filters.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filtered.map(app => {
                    const name = applicantName(app);
                    return (
                      <button
                        key={app._id}
                        onClick={() => openApplication(app)}
                        className="w-full flex items-center gap-3 sm:gap-4 p-3.5 sm:p-4 md:p-5 hover:bg-slate-50/60 transition-colors text-left group"
                      >
                        <Avatar name={name} size="sm" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold text-slate-800 truncate">{name}</p>
                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 shrink-0">
                              {app.applicationFormType}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            {app.scholarshipName} &middot; Student No. {app.studentNumber}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5 md:hidden">{formatShortDate(app.createdAt)}</p>
                        </div>
                        <div className="hidden md:block text-xs text-slate-400 shrink-0 w-32">{formatDate(app.createdAt)}</div>
                        <div className="shrink-0"><StatusBadge status={app.status} /></div>
                        <Eye className="hidden sm:block w-4 h-4 text-slate-300 group-hover:text-brand-green transition-colors shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}