import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Calculator, Check, Pencil, UserPlus, ChevronDown, ChevronUp, Download, FileSpreadsheet, GraduationCap, Percent, Trash2, Upload, Users } from 'lucide-react';
import { API_BASE_URL, academicYearOf, authHeaders, formatDate, formatDateTime } from './adminData';
import { ResultDialog,
  Alert, Badge, Button, Card, Checkbox, ConfirmDialog, DropdownMenu, EmptyState, ErrorState, Field, KpiCard, KpiGrid, Modal, PageHeader,
  SearchInput, Select, Table, TableSkeleton, Tabs, Td, Textarea, TextInput, Th, Toolbar, Tr
} from './AdminUI';
import {
  ALLOWANCE_LABELS, AllowanceKind, Allowances, CATEGORY_LABELS, FSE_TERMS, FseCategory, FseLine, FseReport, FseScholarship, FseSpecialFunding, FseTerm, ParseResult, SPECIAL_FUNDING_LABELS, allowanceTotal, formatFse,
  FseAdjustment, FseGrant, applyGrants, parseStudentIds, guessCategory, guessSpecialFunding, scholarCount, scholarshipFse, withoutAllowances, withEntered, withoutEntered,
  formatPct, parseRegistrarWorkbook, rememberCategories, summarize
} from './fse';
import { exportAcademicYear } from './fseExport';

// AdSO page for the Full Scholarship Equivalent: whenever a report is
// needed, upload the registrar's raw scholarship assessment report, review
// how each scholarship is counted and enter its allowances, and generate the
// report. Every generation is kept, newest first, to read or export.

// A generated report from GET /api/fse: its scholarships come without their scholar rows.
interface SavedSummary {
  id: string; academicYear: string; term: FseTerm; population: number; createdAt?: string; updatedAt?: string; updatedBy?: string;
  scholarships?: Pick<FseScholarship, 'code' | 'category' | 'specialFunding' | 'allowances'>[];
}

const termLabel = (r: { academicYear: string; term: string; createdAt?: string }) =>
  `${r.academicYear} · ${r.term}${r.createdAt ? ` · ${formatDateTime(r.createdAt)}` : ''}`;

const CATEGORIES = Object.keys(CATEGORY_LABELS) as FseCategory[];
// One colour per category, in the breakdown bar and its legend.
const CATEGORY_COLOR: Record<FseCategory, string> = {
  internalAcademic: 'bg-accent',
  internalNonAcademic: 'bg-success-solid',
  external: 'bg-info-solid',
  special: 'bg-warning-solid'
};
// Shorter names for the review's dropdowns.
const CATEGORY_SHORT: Record<FseCategory, string> = {
  internalAcademic: 'Internal · Academic',
  internalNonAcademic: 'Internal · Non-academic',
  external: 'Externally funded',
  special: 'Special program'
};
const peso = (n: number) => `₱${n.toLocaleString()}`;
// summarize() rows: the four categories and the institutional total.
const categoryLines = (lines: FseLine[]) => ({
  internalAcademic: lines[0], internalNonAcademic: lines[1], external: lines[3], special: lines[4]
}) as Record<FseCategory, FseLine>;

export default function FseReportPage({ getToken }: { getToken: () => Promise<string | null> }) {
  const [list, setList] = useState<SavedSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [report, setReport] = useState<FseReport | null>(null);
  const [reportError, setReportError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const loadList = useCallback(async (select?: string) => {
    setListLoading(true);
    setListError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/fse`, { headers: await authHeaders(getToken) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to load FSE reports.');
      const reports: SavedSummary[] = body.reports ?? [];
      setList(reports);
      setSelectedId(prev => select ?? (prev && reports.some(r => r.id === prev) ? prev : reports[0]?.id ?? null));
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to load FSE reports.');
    } finally {
      setListLoading(false);
    }
  }, [getToken]);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    if (!selectedId) { setReport(null); return; }
    let cancelled = false;
    (async () => {
      setReportError('');
      try {
        const res = await fetch(`${API_BASE_URL}/api/fse/${selectedId}`, { headers: await authHeaders(getToken) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Failed to load the report.');
        if (!cancelled) setReport(body.report);
      } catch (err) {
        if (!cancelled) setReportError(err instanceof Error ? err.message : 'Failed to load the report.');
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId, getToken]);

  // Exports the report shown, in the office's FSE workbook layout.
  const exportReport = async () => {
    if (!report) return;
    setReportError('');
    setExporting(true);
    try {
      // The office's workbook has both semesters side by side: this report
      // for its term, and the newest report of the other semester (the list
      // is newest first).
      const other = list.find(r => r.academicYear === report.academicYear && r.term !== report.term && r.term !== 'Midyear');
      let reports = [report];
      if (other && report.term !== 'Midyear') {
        const res = await fetch(`${API_BASE_URL}/api/fse/${other.id}`, { headers: await authHeaders(getToken) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Failed to load the other semester.');
        reports = [report, body.report as FseReport];
      }
      await exportAcademicYear(report.academicYear, reports);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const remove = async () => {
    if (!report?.id) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/fse/${report.id}`, { method: 'DELETE', headers: await authHeaders(getToken) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to delete.');
      setDeleting(false);
      setToast(`Moved ${termLabel(report)} to the Trash.`);
      setSelectedId(null);
      await loadList();
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Failed to delete.');
      setDeleting(false);
    } finally {
      setDeleteBusy(false);
    }
  };

  const firstLoad = listLoading && list.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Full Scholarship Equivalent"
        actions={
          <>
            {report && <Button icon={Download} onClick={exportReport} loading={exporting}>Export year to Excel</Button>}
            <Button variant="primary" icon={Upload} onClick={() => setUploading(true)}>Generate report</Button>
            {report && (
              <DropdownMenu
                label="More actions"
                items={[
                  { key: 'edit', label: 'Edit report', icon: Pencil, onSelect: () => setEditing(true) },
                  { key: 'delete', label: 'Delete report', icon: Trash2, tone: 'danger', onSelect: () => setDeleting(true) }
                ]}
              />
            )}
          </>
        }
      />

      {firstLoad ? (
        <Card flush><TableSkeleton rows={6} label="Loading FSE reports" /></Card>
      ) : listError && list.length === 0 ? (
        <Card flush><ErrorState title="Couldn't load FSE reports" message={listError} onRetry={() => loadList()} retrying={listLoading} /></Card>
      ) : list.length === 0 ? (
        <Card flush>
          <EmptyState
            icon={Calculator}
            title="No FSE reports yet"
            description="Upload the registrar's scholarship report to generate one."
            action={<Button variant="primary" icon={Upload} onClick={() => setUploading(true)}>Generate report</Button>}
          />
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <Select value={selectedId ?? ''} onChange={setSelectedId} label="Report" className="w-full sm:w-[28rem]">
              {list.map(r => <option key={r.id} value={r.id}>{termLabel(r)}</option>)}
            </Select>
            {report && (
              <p className="text-xs text-ink-subtle">
                {[
                  report.asOf ? `As of ${formatDate(report.asOf)}` : '',
                  report.updatedBy ? `By ${report.updatedBy}` : '',
                  report.updatedAt && report.createdAt && report.updatedAt !== report.createdAt ? `Edited ${formatDateTime(report.updatedAt)}` : ''
                ].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          {reportError && <Alert tone="danger" onDismiss={() => setReportError('')}>{reportError}</Alert>}
          {report ? <ReportView report={report} /> : !reportError && <Card flush><TableSkeleton rows={6} label="Loading report" /></Card>}
        </>
      )}

      {uploading && (
        <UploadModal
          getToken={getToken}
          existing={list}
          onClose={() => setUploading(false)}
          onSaved={saved => {
            setUploading(false);
            setToast(`Generated the FSE report for ${saved.academicYear} · ${saved.term}.`);
            loadList(saved.id);
          }}
        />
      )}

      {editing && report && (
        <UploadModal
          getToken={getToken}
          existing={list}
          editing={report}
          onClose={() => setEditing(false)}
          onSaved={saved => {
            setEditing(false);
            setReport(saved);
            setToast('Saved your changes to the report.');
            loadList(saved.id);
          }}
        />
      )}

      {deleting && report && (
        <ConfirmDialog
          title={`Delete ${termLabel(report)}?`}
          description="It moves to the Trash, where it can be restored for 30 days."
          confirmLabel="Move to Trash"
          confirmIcon={Trash2}
          tone="danger"
          busy={deleteBusy}
          onConfirm={remove}
          onCancel={() => setDeleting(false)}
        />
      )}

      {toast && <ResultDialog message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

// --- Shared pieces ------------------------------------------------------------------

// A bar split by each category's share of the FSE count, with its legend.
function CategoryBreakdown({ lines, compact }: { lines: FseLine[]; compact?: boolean }) {
  const byCat = categoryLines(lines);
  const total = lines[5].fse;
  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-neutral-bg" role="img"
        aria-label={CATEGORIES.map(c => `${CATEGORY_LABELS[c]} ${total ? Math.round(byCat[c].fse / total * 100) : 0}%`).join(', ')}>
        {total > 0 && CATEGORIES.map(c => byCat[c].fse > 0 && (
          <span key={c} className={`${CATEGORY_COLOR[c]} h-full border-r-2 border-surface last:border-r-0`} style={{ width: `${(byCat[c].fse / total) * 100}%` }} />
        ))}
      </div>
      <ul className={`grid gap-x-4 gap-y-2 ${compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'}`}>
        {CATEGORIES.map(c => (
          <li key={c} className="flex min-w-0 items-start gap-2">
            <span className={`mt-1 size-2.5 shrink-0 rounded-sm ${CATEGORY_COLOR[c]}`} aria-hidden />
            <span className="min-w-0">
              <span className="block truncate text-xs text-ink-muted">{CATEGORY_LABELS[c]}</span>
              <span className="block text-sm font-medium text-ink tabular-nums">
                {formatPct(byCat[c].fsePct)}
                <span className="font-normal text-ink-subtle"> · FSE {formatFse(byCat[c].fse)} · {byCat[c].scholars.toLocaleString()} scholars</span>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Report ----------------------------------------------------------------------

type ReportFilter = 'all' | FseCategory;

function ReportView({ report }: { report: FseReport }) {
  const lines = useMemo(() => summarize(report), [report]);
  const institutional = lines[5];
  const mainstream = lines[2];
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ReportFilter>('all');
  const all = useMemo(() => report.scholarships
    .map(s => ({ ...s, fse: scholarshipFse(s) }))
    .sort((a, b) => b.fse - a.fse), [report]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter(s => (filter === 'all' || s.category === filter) && (!q || s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)));
  }, [all, filter, search]);
  // Scholars with allowances or other financial assistance on their row.
  const withAllowance = report.scholarships.reduce((n, s) => n + s.scholars.filter(r => r.allowances > 0).length, 0);

  return (
    <>
      <KpiGrid>
        <KpiCard label="Institutional FSE" icon={Percent} tone="accent" value={formatPct(institutional.fsePct)}
          hint={`FSE count ${formatFse(institutional.fse)} of ${report.population.toLocaleString()} students`} />
        <KpiCard label="Scholars" icon={Users} value={institutional.scholars.toLocaleString()}
          hint={`${formatPct(institutional.headcountPct)} of the population`} />
        <KpiCard label="Mainstream FSE" icon={GraduationCap} value={formatPct(mainstream.fsePct)}
          hint={`Internally funded · FSE count ${formatFse(mainstream.fse)}`} />
        <KpiCard label="Scholarships" icon={FileSpreadsheet} value={report.scholarships.length}
          hint={withAllowance ? `${withAllowance} scholars with allowances` : 'No allowances'} />
      </KpiGrid>
      {(report.grants?.length ?? 0) > 0 && (
        <p className="text-xs text-ink-muted">
          Other grants added to listed scholars: {report.grants!.map(g => `${g.label} ${peso(g.amount)} × ${g.studentIds.length}`).join(' · ')}
        </p>
      )}

      <Card title="By category">
        <CategoryBreakdown lines={lines} />
      </Card>

      <Card flush>
        <Table label="FSE summary" minWidth="40rem">
          <thead>
            <tr>
              <Th sticky={false}>Category</Th>
              <Th sticky={false} numeric className="w-28">Scholars</Th>
              <Th sticky={false} numeric className="w-32">Headcount %</Th>
              <Th sticky={false} numeric className="w-28">FSE count</Th>
              <Th sticky={false} numeric className="w-28">FSE %</Th>
            </tr>
          </thead>
          <tbody>
            {lines.map(l => (
              <Tr key={l.label} className={l.total ? 'bg-surface-muted' : ''}>
                <Td><span className={l.total ? 'font-semibold text-ink' : 'text-ink'}>{l.label}</span></Td>
                <Td numeric><span className="text-ink">{l.scholars.toLocaleString()}</span></Td>
                <Td numeric>{formatPct(l.headcountPct)}</Td>
                <Td numeric><span className={l.total ? 'font-semibold text-ink' : 'text-ink'}>{formatFse(l.fse)}</span></Td>
                <Td numeric><span className={l.total ? 'font-semibold text-ink' : ''}>{formatPct(l.fsePct)}</span></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card flush title="By scholarship"
        headerSlot={
          <>
            <Tabs<ReportFilter>
              label="Filter by category"
              value={filter}
              onChange={setFilter}
              tabs={[
                { key: 'all' as ReportFilter, label: 'All', count: all.length },
                ...CATEGORIES.map(c => ({ key: c as ReportFilter, label: CATEGORY_LABELS[c], count: all.filter(s => s.category === c).length }))
              ]}
            />
            <Toolbar><SearchInput value={search} onChange={setSearch} label="Search scholarships" placeholder="Search code or name…" /></Toolbar>
          </>
        }>
        {rows.length === 0 ? (
          <EmptyState icon={Calculator} title="No scholarships match" description="Try another category or search." />
        ) : (
          <Table label="FSE by scholarship" minWidth="52rem">
            <thead>
              <tr>
                <Th sticky={false} className="w-20">Code</Th>
                <Th sticky={false}>Scholarship</Th>
                <Th sticky={false} className="w-52">Category</Th>
                <Th sticky={false} numeric className="w-24">Scholars</Th>
                <Th sticky={false} numeric className="w-40">Allowances</Th>
                <Th sticky={false} numeric className="w-24">FSE</Th>
                <Th sticky={false} numeric className="w-24">Share</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(s => (
                <Tr key={s.code}>
                  <Td><span className="font-mono text-xs">{s.code}</span></Td>
                  <Td><span className="block truncate text-ink" title={s.name}>{s.name}</span></Td>
                  <Td>
                    <span className="flex min-w-0 items-center gap-2">
                      {s.category && <span className={`size-2 shrink-0 rounded-sm ${CATEGORY_COLOR[s.category]}`} aria-hidden />}
                      <span className="truncate">
                        {s.category ? CATEGORY_LABELS[s.category] : '—'}
                        {s.category === 'special' && <span className="text-ink-subtle"> · {SPECIAL_FUNDING_LABELS[s.specialFunding ?? 'internal']}</span>}
                      </span>
                    </span>
                  </Td>
                  <Td numeric>{s.adjustment
                    ? <span title={`${s.scholars.length} from the file + ${s.adjustment.scholars} added: ${s.adjustment.note}`}>{scholarCount(s)} <Badge tone="info">+{s.adjustment.scholars} added</Badge></span>
                    : s.scholars.length}</Td>
                  <Td numeric>{(() => {
                    // Scholars with allowances, and their total.
                    const got = s.scholars.filter(r => r.allowances > 0);
                    return got.length ? <span title={`${got.length} of ${s.scholars.length} scholars`}>{peso(got.reduce((n, r) => n + r.allowances, 0))} · {got.length}</span> : '—';
                  })()}</Td>
                  <Td numeric><span className="font-medium text-ink">{formatFse(s.fse)}</span></Td>
                  <Td numeric>{institutional.fse ? `${((s.fse / institutional.fse) * 100).toFixed(1)}%` : '—'}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

// --- Generate ------------------------------------------------------------------------

// adjDraft: the "Add missing scholars" fields as typed.
interface AdjDraft { scholars: string; assessment: string; discount: string; note: string }
// entered: each scholar's allowances the AdSO typed, by student number.
interface ReviewRow extends FseScholarship { include: boolean; adjDraft?: AdjDraft | null; entered: Record<string, Allowances> }
const draftOf = (a?: FseAdjustment | { scholars: number; assessment: number; discount: number } | null): AdjDraft | null =>
  a ? { scholars: String(a.scholars), assessment: String(a.assessment), discount: String(a.discount), note: 'note' in a ? a.note : '' } : null;
// The adjustment from the fields: null when empty, 'invalid' when incomplete.
function adjustmentOf(d?: AdjDraft | null): FseAdjustment | null | 'invalid' {
  if (!d || [d.scholars, d.assessment, d.discount, d.note].every(v => !v.trim())) return null;
  const scholars = Number(d.scholars), assessment = Number(d.assessment), discount = Number(d.discount);
  if (!Number.isInteger(scholars) || scholars < 1 || !(assessment > 0) || !(discount >= 0) || d.discount.trim() === '' || !d.note.trim()) return 'invalid';
  return { scholars, assessment, discount, note: d.note.trim() };
}
const validAdjustment = (r: ReviewRow) => { const a = adjustmentOf(r.adjDraft); return a === 'invalid' ? null : a; };
type ReviewFilter = 'attention' | 'all' | FseCategory | 'excluded';

function UploadModal({ getToken, existing, editing, onClose, onSaved }: {
  getToken: () => Promise<string | null>;
  existing: SavedSummary[];
  // A generated report to edit: its term details, categories and
  // allowances change; the registrar's rows stay.
  editing?: FseReport;
  onClose: () => void;
  onSaved: (report: FseReport) => void;
}) {
  const currentAy = academicYearOf(new Date().toISOString());
  const startYear = Number(currentAy.slice(3, 7));
  const yearOptions = [...new Set([startYear + 1, startYear, startYear - 1, startYear - 2].map(y => `AY ${y}–${y + 1}`).concat(editing ? [editing.academicYear] : []))];

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [fileName, setFileName] = useState(editing?.fileName ?? '');
  const [parsed, setParsed] = useState<ParseResult | null>(editing ? { sheetName: '', scholarships: editing.scholarships, warnings: [] } : null);
  const [rows, setRows] = useState<ReviewRow[]>(() => applyGrants(editing?.scholarships ?? [], editing?.grants, -1).map(s => {
    // Older reports kept one amount for every scholar of a scholarship:
    // it becomes each scholar's own entry.
    const { scholarship, entered } = withoutEntered(withoutAllowances(s));
    const legacy = allowanceTotal(s.allowances) ? s.allowances! : null;
    if (legacy) for (const r of scholarship.scholars) entered[r.studentId] = { ...legacy, ...(entered[r.studentId] ?? {}) };
    return { ...scholarship, allowances: null, include: true, adjDraft: draftOf(s.adjustment), entered };
  }));
  // Other grants for listed scholars, as typed (student numbers as pasted).
  const [grants, setGrants] = useState<{ label: string; amount: string; ids: string }[]>(
    () => (editing?.grants ?? []).map(g => ({ label: g.label, amount: String(g.amount), ids: g.studentIds.join('\n') })));
  const [parseError, setParseError] = useState('');
  const [reading, setReading] = useState(false);
  const [academicYear, setAcademicYear] = useState(editing?.academicYear ?? currentAy);
  const [term, setTerm] = useState<FseTerm>(editing?.term ?? '1st Semester');
  const [population, setPopulation] = useState(editing ? String(editing.population) : '');
  const [asOf, setAsOf] = useState(editing?.asOf ? editing.asOf.slice(0, 10) : '');
  const [spoon, setSpoon] = useState(editing?.spoonRecipients != null ? String(editing.spoonRecipients) : '');
  const [attempted1, setAttempted1] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  // How many categories were filled in from the last report / the office's template.
  const [remembered, setRemembered] = useState(0);
  const [guessed, setGuessed] = useState(0);
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [search, setSearch] = useState('');
  // Which scholarships have their allowance fields open.
  const [openAllowances, setOpenAllowances] = useState<Set<string>>(new Set());
  // Which have their "Add missing scholars" fields open.
  const [openAdjust, setOpenAdjust] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const onFile = async (file: File | undefined) => {
    setParseError('');
    if (!file) return;
    setReading(true);
    try {
      const result = parseRegistrarWorkbook(await file.arrayBuffer(), term);
      // Where the file names no category (the registrar's report), use what
      // the scholarship was counted as last time, then how the office's FSE
      // template counts it. A category in the file wins.
      const memory = rememberCategories(existing);
      let filled = 0;
      let auto = 0;
      setRows(result.scholarships.map(s => {
        const last = memory.get(s.code);
        const known = guessCategory(s.code, s.name);
        const category = s.category ?? last?.category ?? known?.category ?? null;
        if (!s.category && last?.category) filled++;
        else if (!s.category && category) auto++;
        const specialFunding = guessSpecialFunding(s.subcategory)
          ?? (category === 'special' ? last?.specialFunding ?? (known?.category === 'special' ? known.funding : undefined) ?? null : null);
        // The allowances entered for this scholarship last time.
        return { ...s, category, include: true, specialFunding, allowances: null, entered: {} };
      }));
      setFileName(file.name);
      setParsed(result);
      setRemembered(filled);
      setGuessed(auto);
      setOpenAllowances(new Set());
    } catch (err) {
      setParsed(null);
      setParseError(err instanceof Error ? err.message : "Couldn't read that file.");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const setGrant = (i: number, patch: Partial<{ label: string; amount: string; ids: string }>) => setGrants(prev => prev.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  const grantOf = (g: { label: string; amount: string; ids: string }): FseGrant | null | 'invalid' => {
    const studentIds = parseStudentIds(g.ids);
    if (!g.label.trim() && !g.amount.trim() && !studentIds.length) return null;
    return g.label.trim() && Number(g.amount) > 0 && studentIds.length ? { label: g.label.trim(), amount: Number(g.amount), studentIds } : 'invalid';
  };
  const validGrants = grants.map(grantOf).filter((g): g is FseGrant => !!g && g !== 'invalid');
  // Which pasted students are in the file (any scholarship that's counted).
  const listedIds = useMemo(() => new Set(rows.filter(r => r.include).flatMap(r => r.scholars.map(x => x.studentId))), [rows]);
  // How many of a scholarship's SUB TOTAL gap are still unaccounted for:
  // less the students found for its grant under Other grants (the grant's
  // name is in the scholarship's, or its amount is the gap's per scholar)
  // and any added by hand.
  const gapLeft = (r: ReviewRow) => {
    const gap = r.subTotalGap;
    if (!gap) return 0;
    const perScholar = gap.discount / gap.scholars;
    const found = validGrants
      .filter(g => r.name.toLowerCase().includes(g.label.toLowerCase()) || Math.abs(g.amount - perScholar) <= perScholar * 0.01)
      .reduce((n, g) => n + g.studentIds.filter(id => listedIds.has(id)).length, 0);
    return Math.max(0, gap.scholars - found - (validAdjustment(r)?.scholars ?? 0));
  };
  const set = (code: string, patch: Partial<ReviewRow>) => setRows(prev => prev.map(r => (r.code === code ? { ...r, ...patch } : r)));
  // One scholar's allowance (studentId), or every scholar's (null).
  const setEntered = (code: string, studentId: string | null, kind: AllowanceKind, raw: string) => setRows(prev => prev.map(r => {
    if (r.code !== code) return r;
    const n = Number(raw);
    const entered = { ...r.entered };
    for (const id of studentId ? [studentId] : r.scholars.map(x => x.studentId)) {
      const next: Allowances = { ...(entered[id] ?? {}) };
      if (raw.trim() === '' || !Number.isFinite(n) || n <= 0) delete next[kind]; else next[kind] = n;
      if (Object.keys(next).length) entered[id] = next; else delete entered[id];
    }
    return { ...r, entered };
  }));
  const toggleAdjust = (code: string) => {
    setOpenAdjust(p => { const n = new Set(p); if (n.has(code)) n.delete(code); else n.add(code); return n; });
    // Opening it fills in what the file's SUB TOTAL says is missing.
    setRows(prev => prev.map(r => (r.code === code && !r.adjDraft && r.subTotalGap ? { ...r, adjDraft: { ...draftOf(r.subTotalGap)!, note: 'Missing from the registrar’s export; from its SUB TOTAL' } } : r)));
  };
  const setAdj = (code: string, patch: Partial<AdjDraft>) => setRows(prev => prev.map(r =>
    (r.code === code ? { ...r, adjDraft: { ...(r.adjDraft ?? { scholars: '', assessment: '', discount: '', note: '' }), ...patch } } : r)));
  const toggleAllowances = (code: string) => setOpenAllowances(p => { const n = new Set(p); if (n.has(code)) n.delete(code); else n.add(code); return n; });

  const included = rows.filter(r => r.include);
  const badAdjust = included.filter(r => adjustmentOf(r.adjDraft) === 'invalid');
  const unclassified = included.filter(r => !r.category);
  const noFunding = included.filter(r => r.category === 'special' && !r.specialFunding);
  const pop = Number(population);
  const spoonCount = spoon.trim() === '' ? null : Number(spoon);
  const errors1 = {
    file: !parsed ? 'Upload the registrar’s report.' : '',
    population: !Number.isFinite(pop) || pop < 1 ? 'Enter the student population for the term.' : '',
    spoon: spoonCount !== null && (!Number.isInteger(spoonCount) || spoonCount < 0) ? 'Enter a whole number, or leave it blank.' : ''
  };
  const errors2 = {
    category: unclassified.length ? `Choose a category for ${unclassified.length} scholarship${unclassified.length === 1 ? '' : 's'}, or leave ${unclassified.length === 1 ? 'it' : 'them'} out.` : '',
    funding: noFunding.length ? `Choose who funds ${noFunding.length} special program${noFunding.length === 1 ? '' : 's'}.` : '',
    grants: grants.some(g => grantOf(g) === 'invalid') ? 'Finish each added grant: its name, the amount per scholar, and the student numbers.' : '',
    adjustment: badAdjust.length ? `Finish the added scholars for ${badAdjust.map(r => r.code).join(', ')}: how many, their total assessment and discount, and where the numbers come from.` : '',
    empty: included.length === 0 ? 'Include at least one scholarship.' : ''
  };
  const preview = useMemo(
    () => (parsed && pop >= 1 ? summarize({ scholarships: applyGrants(included.map(r => withEntered({ ...r, adjustment: validAdjustment(r) }, r.entered)), validGrants), population: pop }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parsed, rows, pop, grants]
  );

  const focusFirstMissing = () => {
    requestAnimationFrame(() => {
      const target = bodyRef.current?.querySelector<HTMLElement>('[data-missing="true"]');
      if (!target) return;
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const controls = target.querySelectorAll<HTMLElement>('select:not([disabled]), input:not([type="checkbox"]):not([type="file"]):not([disabled])');
      (controls[controls.length - 1] ?? target).focus({ preventScroll: true });
    });
  };

  const save = async () => {
    setAttempted(true);
    if (Object.values(errors1).some(Boolean)) { setStep(1); return; }
    if (errors2.category || errors2.funding || errors2.empty) { setStep(2); return; }
    if (errors2.grants || errors2.adjustment) { setStep(3); return; }
    setSaving(true);
    setSaveError('');
    try {
      const details = { academicYear, term, population: pop, spoonRecipients: spoonCount, asOf: asOf || undefined };
      const funding = (s: Pick<FseScholarship, 'category' | 'specialFunding'>) => (s.category === 'special' ? s.specialFunding : null);
      // Editing sends only what the AdSO chose; the server keeps the registrar's rows.
      const res = await fetch(`${API_BASE_URL}/api/fse${editing?.id ? `/${editing.id}` : ''}`, {
        method: editing ? 'PUT' : 'POST',
        headers: await authHeaders(getToken, true),
        body: JSON.stringify(editing
          ? { ...details, grants: validGrants, scholarships: included.map(s => ({ code: s.code, category: s.category, specialFunding: funding(s), entered: s.entered, adjustment: validAdjustment(s) ?? undefined })) }
          : { ...details, fileName, grants: validGrants, scholarships: included.map(({ include: _include, part: _part, partLabel: _label, discountRule: _rule, subTotalGap: _gap, adjDraft: _draft, entered, ...s }) => ({ ...s, allowances: null, scholars: s.scholars.map(x => ({ ...x, entered: entered[x.studentId] })), specialFunding: funding(s), adjustment: validAdjustment({ ...s, include: true, adjDraft: _draft, entered }) ?? undefined })) })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to save the report.');
      onSaved(body.report);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save the report.');
    } finally {
      setSaving(false);
    }
  };

  const totalScholars = rows.reduce((n, r) => n + r.scholars.length, 0);
  // Step 2 is about categories only: what's missing there.
  const needsCategory = (r: ReviewRow) => r.include && (!r.category || (r.category === 'special' && !r.specialFunding));
  const catMissing = rows.filter(needsCategory);
  const filterTabs: { key: ReviewFilter; label: string; count?: number }[] = [
    ...(catMissing.length ? [{ key: 'attention' as ReviewFilter, label: 'Needs a category', count: catMissing.length }] : []),
    { key: 'all', label: 'All', count: rows.length },
    ...CATEGORIES.map(c => ({ key: c as ReviewFilter, label: CATEGORY_LABELS[c], count: included.filter(r => r.category === c).length })),
    ...(rows.length - included.length ? [{ key: 'excluded' as ReviewFilter, label: 'Left out', count: rows.length - included.length }] : [])
  ];
  const catShown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      const byFilter = filter === 'all' ? true : filter === 'attention' ? needsCategory(r) : filter === 'excluded' ? !r.include : r.include && r.category === filter;
      return byFilter && (!q || r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filter, search]);
  // Don't leave the view on a tab that just emptied.
  useEffect(() => {
    if (filter === 'attention' && catMissing.length === 0) setFilter('all');
    if (filter === 'excluded' && rows.length === included.length) setFilter('all');
  }, [filter, catMissing.length, rows.length, included.length]);

  // Step 3: scholarships short of their SUB TOTAL, or with scholars added by hand.
  const [extraAdjust, setExtraAdjust] = useState<string[]>([]);
  const adjustRows = included.filter(r => r.subTotalGap || r.adjDraft || extraAdjust.includes(r.code));
  const [allowSearch, setAllowSearch] = useState('');
  const allowShown = included.filter(r => !allowSearch.trim() || `${r.code} ${r.name}`.toLowerCase().includes(allowSearch.trim().toLowerCase()));
  const scholarsWithAllowances = included.reduce((n, r) => n + Object.keys(r.entered).length, 0);
  const allowanceSum = included.reduce((n, r) => n + Object.values(r.entered).reduce((m, a) => m + allowanceTotal(a), 0), 0);
  const stillMissing = included.filter(r => gapLeft(r) > 0);

  const scrollTop = () => bodyRef.current?.closest('[role="dialog"]')?.querySelector<HTMLElement>('.overflow-y-auto')?.scrollTo({ top: 0 });
  const go = (to: 1 | 2 | 3 | 4) => { setStep(to); scrollTop(); };
  const next = () => {
    if (step === 1) {
      setAttempted1(true);
      if (Object.values(errors1).some(Boolean)) { focusFirstMissing(); return; }
      setFilter(catMissing.length ? 'attention' : 'all');
      go(2);
    } else if (step === 2) {
      setAttempted(true);
      if (errors2.category || errors2.funding || errors2.empty) { if (catMissing.length) setFilter('attention'); focusFirstMissing(); return; }
      setAttempted(false);
      go(3);
    } else if (step === 3) {
      setAttempted(true);
      if (errors2.grants || errors2.adjustment) { focusFirstMissing(); return; }
      setAttempted(false);
      go(4);
    }
  };

  const stepError = step === 2 ? errors2.category || errors2.funding || errors2.empty : step === 3 ? errors2.grants || errors2.adjustment : '';

  return (
    <Modal
      size="xl"
      title={editing ? 'Edit FSE report' : 'Generate an FSE report'}
      description={<StepIndicator step={step} onGo={s => (s < step ? go(s) : undefined)} />}
      onClose={onClose}
      dismissible={!saving}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-muted tabular-nums">
            {step > 1 && preview ? <>Institutional FSE <span className="font-semibold text-ink">{formatPct(preview[5].fsePct)}</span> · FSE {formatFse(preview[5].fse)}</> : null}
          </p>
          <div className="flex gap-2">
            {step === 1
              ? <Button onClick={onClose}>Cancel</Button>
              : <Button icon={ArrowLeft} onClick={() => go((step - 1) as 1 | 2 | 3)} disabled={saving}>Back</Button>}
            {step < 4
              ? <Button variant="primary" iconRight={ArrowRight} onClick={next} disabled={reading}>Next</Button>
              : <Button variant="primary" onClick={save} loading={saving} disabled={saving}>{editing ? 'Save changes' : 'Generate report'}</Button>}
          </div>
        </div>
      }
    >
      <div ref={bodyRef} className="space-y-5">
        {step === 1 && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Academic year">
                <Select value={academicYear} onChange={setAcademicYear} label="Academic year">
                  {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                </Select>
              </Field>
              <Field label="Term">
                <Select value={term} onChange={v => setTerm(v as FseTerm)} label="Term">
                  {FSE_TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                </Select>
              </Field>
            </div>

            {editing ? (
              <div className="flex items-center gap-3 rounded-card bg-surface-muted px-4 py-3 ring-1 ring-line">
                <FileSpreadsheet className="size-5 shrink-0 text-accent" aria-hidden />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{fileName || 'Registrar’s report'}</p>
                  <p className="text-xs text-ink-muted">{rows.length} scholarships · {totalScholars.toLocaleString()} scholars. To use another file, generate a new report.</p>
                </div>
              </div>
            ) : (
              <Field label="Registrar’s scholarship report" error={(attempted1 && errors1.file && !parseError ? errors1.file : '') || parseError || undefined}>
                <label
                  data-missing={attempted1 && !parsed}
                  className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed px-4 py-6 text-center transition hover:border-accent hover:bg-accent-subtle/40 focus-within:border-accent ${
                    parsed ? 'border-accent/40 bg-accent-subtle/30' : 'border-line'
                  }`}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
                >
                  <input ref={fileRef} type="file" accept=".xls,.xlsx" className="sr-only" onChange={e => onFile(e.target.files?.[0])} />
                  {reading ? (
                    <span className="text-sm text-ink-muted">Reading the file…</span>
                  ) : parsed ? (
                    <>
                      <FileSpreadsheet className="size-6 text-accent" aria-hidden />
                      <span className="text-sm font-medium text-ink">{fileName}</span>
                      <span className="text-xs text-ink-muted">{rows.length} scholarships · {totalScholars.toLocaleString()} scholars · <span className="text-accent underline">choose another file</span></span>
                    </>
                  ) : (
                    <>
                      <Upload className="size-6 text-ink-subtle" aria-hidden />
                      <span className="text-sm font-medium text-ink">Drop the file here, or <span className="text-accent underline">choose a file</span></span>
                      <span className="text-xs text-ink-subtle">.xls or .xlsx</span>
                    </>
                  )}
                </label>
              </Field>
            )}
            {parsed && parsed.warnings.length > 0 && (
              <Alert tone="warning" title="Check the file">
                <ul className="list-disc space-y-0.5 pl-4">{parsed.warnings.map(w => <li key={w}>{w}</li>)}</ul>
              </Alert>
            )}
            {parsed && (parsed.notes?.length ?? 0) > 0 && (
              <Alert tone="info">
                <ul className="space-y-0.5">{parsed.notes!.map(n => <li key={n}>{n}</li>)}</ul>
              </Alert>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Student population" error={attempted1 && errors1.population ? errors1.population : undefined}>
                <TextInput data-missing={attempted1 && !!errors1.population} type="number" min={1} inputMode="numeric" value={population} onChange={e => setPopulation(e.target.value)} placeholder="e.g. 8541" />
              </Field>
              <Field label="As of" optional>
                <TextInput type="date" value={asOf} onChange={e => setAsOf(e.target.value)} />
              </Field>
              <Field label="Lasallian SPOON recipients" optional error={attempted1 && errors1.spoon ? errors1.spoon : undefined}>
                <TextInput data-missing={attempted1 && !!errors1.spoon} type="number" min={0} inputMode="numeric" value={spoon} onChange={e => setSpoon(e.target.value)} placeholder="e.g. 18" />
              </Field>
            </div>
          </>
        )}

        {step > 1 && attempted && stepError && <Alert tone="danger">{stepError}</Alert>}

        {step === 2 && (
          <>
            <p className="text-sm text-ink-muted">
              Check how each scholarship is counted. Untick any the office doesn’t count in the FSE.
              {(remembered > 0 || guessed > 0) && ' Categories are filled in automatically.'}
              {parsed?.fromTabs && ' Categories are from the workbook’s tabs.'}
            </p>
            <div className="overflow-hidden rounded-card ring-1 ring-line">
              <Tabs<ReviewFilter> label="Show scholarships" value={filter} onChange={setFilter} tabs={filterTabs} />
              <div className="border-b border-line p-3">
                <SearchInput value={search} onChange={setSearch} label="Search scholarships" placeholder="Search code or name…" />
              </div>
              {catShown.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-ink-muted">No scholarships here.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {catShown.map(r => {
                    const missing = attempted && needsCategory(r);
                    return (
                      <li key={r.code} data-missing={missing}
                        className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 scroll-mt-14 ${r.include ? '' : 'bg-surface-muted'} ${missing ? 'bg-warning-bg ring-2 ring-inset ring-warning-solid' : ''}`}>
                        <Checkbox checked={r.include} onChange={include => set(r.code, { include })}
                          label={<span className="sr-only">Count {r.code} in the FSE</span>} />
                        <div className={`min-w-0 flex-1 basis-64 ${r.include ? '' : 'opacity-60'}`}>
                          <p className="flex min-w-0 items-center gap-2">
                            <span className="font-mono text-xs text-ink-subtle">{r.code}</span>
                            <span className="truncate text-sm font-medium text-ink" title={r.name}>{r.name}</span>
                          </p>
                          <p className="text-xs text-ink-subtle">{r.scholars.length} scholar{r.scholars.length === 1 ? '' : 's'}{!r.include ? ' · not counted' : ''}</p>
                        </div>
                        {r.include && (
                          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                            <Select value={r.category ?? ''} onChange={v => set(r.code, { category: (v || null) as FseCategory | null })}
                              label={`Category for ${r.code}`} className="w-full sm:w-56">
                              <option value="">Choose category…</option>
                              {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_SHORT[c]}</option>)}
                            </Select>
                            {r.category === 'special' && (
                              <Select value={r.specialFunding ?? ''} onChange={v => set(r.code, { specialFunding: (v || null) as FseSpecialFunding | null })}
                                label={`Funding for ${r.code}`} className="w-full sm:w-40">
                                <option value="">Funded by…</option>
                                {(Object.keys(SPECIAL_FUNDING_LABELS) as FseSpecialFunding[]).map(f => <option key={f} value={f}>{SPECIAL_FUNDING_LABELS[f]}</option>)}
                              </Select>
                            )}
                          </div>
                        )}
                        {r.include && !r.category && <Badge tone="warning">Needs category</Badge>}
                        {r.include && r.category === 'special' && !r.specialFunding && <Badge tone="warning">Needs funding</Badge>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <p className="text-sm text-ink-muted">Add what the registrar’s file doesn’t have: other grants, scholars missing from the file, and donor allowances. Skip any that don’t apply.</p>

            <section className="rounded-card p-4 ring-1 ring-line">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-ink">Other grants</h3>
                  <p className="text-xs text-ink-subtle">A grant students hold on top of the scholarship they’re listed under, e.g. DOST. Added to each one’s row as other financial assistance; they still count once.</p>
                </div>
                <Button size="sm" icon={UserPlus} onClick={() => setGrants(g => [...g, { label: '', amount: '', ids: '' }])}>Add a grant</Button>
              </div>
              {grants.map((g, i) => {
                const ids = parseStudentIds(g.ids);
                const found = ids.filter(id => listedIds.has(id)).length;
                const bad = attempted && grantOf(g) === 'invalid';
                return (
                  <div key={i} data-missing={bad} className={`mt-3 rounded-control bg-surface-muted p-3 ring-1 ${bad ? 'ring-2 ring-warning-solid' : 'ring-line'}`}>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
                      <Field label="Grant"><TextInput value={g.label} maxLength={60} onChange={e => setGrant(i, { label: e.target.value })} placeholder="e.g. DOST" aria-label={`Name of grant ${i + 1}`} /></Field>
                      <Field label="Amount per scholar (₱)"><TextInput type="number" min={0} inputMode="decimal" value={g.amount} onChange={e => setGrant(i, { amount: e.target.value })} placeholder="e.g. 65000" aria-label={`Amount of grant ${i + 1}`} /></Field>
                      <Button size="sm" variant="ghost" onClick={() => setGrants(prev => prev.filter((_, j) => j !== i))}>Remove</Button>
                    </div>
                    <div className="mt-2">
                      <Field label="Student numbers" helper={ids.length ? `${found} of ${ids.length} found in the file${ids.length - found ? ` · ${ids.length - found} not found` : ''}` : 'Paste them from the grant’s list, one per line.'}>
                        <Textarea rows={3} value={g.ids} onChange={e => setGrant(i, { ids: e.target.value })} aria-label={`Student numbers for grant ${i + 1}`} />
                      </Field>
                    </div>
                  </div>
                );
              })}
            </section>

            <section className="rounded-card p-4 ring-1 ring-line">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-ink">Scholars missing from the file</h3>
                  <p className="text-xs text-ink-subtle">Only for scholars who aren’t in the file at all. Anyone listed under another scholarship goes under Other grants instead.</p>
                </div>
                <Select value="" onChange={v => { if (v) { setExtraAdjust(p => [...p, v]); toggleAdjust(v); } }} label="Add missing scholars to a scholarship" className="w-full sm:w-72">
                  <option value="">Add to a scholarship…</option>
                  {included.filter(r => !adjustRows.includes(r)).map(r => <option key={r.code} value={r.code}>{r.code} · {r.name}</option>)}
                </Select>
              </div>
              {adjustRows.length === 0 ? (
                <p className="mt-3 text-xs text-ink-subtle">Every scholarship’s rows match its SUB TOTAL.</p>
              ) : (
                <ul className="mt-3 divide-y divide-line rounded-control ring-1 ring-line">
                  {adjustRows.map(r => {
                    const adjOpen = openAdjust.has(r.code);
                    const adj = validAdjustment(r);
                    const left = gapLeft(r);
                    const bad = attempted && adjustmentOf(r.adjDraft) === 'invalid';
                    return (
                      <li key={r.code} data-missing={bad} className={`px-3 py-2.5 ${bad ? 'bg-warning-bg ring-2 ring-inset ring-warning-solid' : ''}`}>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                          <div className="min-w-0 flex-1 basis-56">
                            <p className="flex min-w-0 items-center gap-2">
                              <span className="font-mono text-xs text-ink-subtle">{r.code}</span>
                              <span className="truncate text-sm font-medium text-ink" title={r.name}>{r.name}</span>
                            </p>
                            <p className="text-xs text-ink-subtle">
                              {r.scholars.length} in the file{r.subTotalGap ? ` · SUB TOTAL counts ~${r.subTotalGap.scholars} more` : ''}{adj ? ` · ${adj.scholars} added` : ''}
                            </p>
                          </div>
                          {left > 0
                            ? <Badge tone="warning">~{left} {left === r.subTotalGap?.scholars ? 'missing from file' : 'still missing'}</Badge>
                            : r.subTotalGap && <Badge tone="success">Accounted for</Badge>}
                          <Button size="sm" variant={adj ? 'secondary' : 'ghost'} icon={UserPlus} iconRight={adjOpen ? ChevronUp : ChevronDown}
                            onClick={() => toggleAdjust(r.code)} aria-expanded={adjOpen}>
                            {adj ? `+${adj.scholars} added` : 'Add missing'}
                          </Button>
                        </div>
                        {adjOpen && (
                          <div className="mt-3 rounded-control bg-surface-muted p-3 ring-1 ring-line">
                            {r.subTotalGap && <p className="mb-2 text-xs text-ink-muted">The SUB TOTAL suggests {r.subTotalGap.scholars} (filled in below). Change them if you have the actual list.</p>}
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                              <Field label="Scholars to add">
                                <TextInput type="number" min={1} inputMode="numeric" value={r.adjDraft?.scholars ?? ''} onChange={e => setAdj(r.code, { scholars: e.target.value })} aria-label={`Scholars to add to ${r.code}`} />
                              </Field>
                              <Field label="Their total assessment (₱)">
                                <TextInput type="number" min={0} inputMode="decimal" value={r.adjDraft?.assessment ?? ''} onChange={e => setAdj(r.code, { assessment: e.target.value })} aria-label={`Total assessment of the added scholars for ${r.code}`} />
                              </Field>
                              <Field label="Their total discount (₱)">
                                <TextInput type="number" min={0} inputMode="decimal" value={r.adjDraft?.discount ?? ''} onChange={e => setAdj(r.code, { discount: e.target.value })} aria-label={`Total discount of the added scholars for ${r.code}`} />
                              </Field>
                            </div>
                            <div className="mt-2">
                              <Field label="Where these numbers come from">
                                <TextInput value={r.adjDraft?.note ?? ''} maxLength={300} onChange={e => setAdj(r.code, { note: e.target.value })} placeholder="e.g. DOST list from the AdSO, Nov 2026" aria-label={`Source of the added scholars for ${r.code}`} />
                              </Field>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs text-ink-subtle">{adj ? `Adds ${adj.scholars} scholars and FSE ${formatFse(adj.scholars * adj.discount / adj.assessment)}.` : 'Counted at the group’s average.'}</p>
                              {r.adjDraft && <Button size="sm" variant="ghost" onClick={() => set(r.code, { adjDraft: null })}>Remove</Button>}
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="overflow-hidden rounded-card ring-1 ring-line">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line p-4">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-ink">Allowances per scholar</h3>
                  <p className="text-xs text-ink-subtle">Open a scholarship and fill in only the scholars who get an allowance or other financial assistance from a donor or sponsor.</p>
                </div>
                <div className="w-full sm:w-72"><SearchInput value={allowSearch} onChange={setAllowSearch} label="Search scholarships for allowances" placeholder="Search code or name…" /></div>
              </div>
              <ul className="divide-y divide-line">
                {allowShown.map(r => {
                  const open = openAllowances.has(r.code);
                  const withAllowance = Object.keys(r.entered).length;
                  return (
                    <li key={r.code} className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <div className="min-w-0 flex-1 basis-56">
                          <p className="flex min-w-0 items-center gap-2">
                            <span className="font-mono text-xs text-ink-subtle">{r.code}</span>
                            <span className="truncate text-sm text-ink" title={r.name}>{r.name}</span>
                          </p>
                        </div>
                        <span className="text-xs text-ink-subtle tabular-nums">{withAllowance ? `${withAllowance} of ${r.scholars.length} with allowances` : `${r.scholars.length} scholar${r.scholars.length === 1 ? '' : 's'}`}</span>
                        <Button size="sm" variant={withAllowance ? 'secondary' : 'ghost'} iconRight={open ? ChevronUp : ChevronDown}
                          onClick={() => toggleAllowances(r.code)} aria-expanded={open} aria-label={`Allowances for ${r.code}`}>
                          {withAllowance ? `Allowances · ${withAllowance}` : 'Allowances'}
                        </Button>
                      </div>
                      {open && <ScholarAllowances row={r} grants={validGrants} onChange={(id, k, v) => setEntered(r.code, id, k, v)} />}
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}

        {step === 4 && preview && (
          <>
            <div className="rounded-card bg-surface-muted p-4 ring-1 ring-line">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-ink">{academicYear} · {term}</p>
                <p className="text-sm text-ink tabular-nums">
                  Institutional FSE <span className="font-semibold">{formatPct(preview[5].fsePct)}</span>
                  <span className="text-ink-subtle"> · FSE {formatFse(preview[5].fse)} · {preview[5].scholars.toLocaleString()} scholars of {pop.toLocaleString()}</span>
                </p>
              </div>
              <CategoryBreakdown lines={preview} compact />
            </div>

            <div className="overflow-hidden rounded-card ring-1 ring-line">
              <Table label="FSE summary preview" minWidth="36rem">
                <thead>
                  <tr>
                    <Th sticky={false}>Category</Th>
                    <Th sticky={false} numeric className="w-24">Scholars</Th>
                    <Th sticky={false} numeric className="w-28">Headcount %</Th>
                    <Th sticky={false} numeric className="w-24">FSE count</Th>
                    <Th sticky={false} numeric className="w-24">FSE %</Th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map(l => (
                    <Tr key={l.label} className={l.total ? 'bg-surface-muted' : ''}>
                      <Td><span className={l.total ? 'font-semibold text-ink' : 'text-ink'}>{l.label}</span></Td>
                      <Td numeric>{l.scholars.toLocaleString()}</Td>
                      <Td numeric>{formatPct(l.headcountPct)}</Td>
                      <Td numeric><span className={l.total ? 'font-semibold text-ink' : 'text-ink'}>{formatFse(l.fse)}</span></Td>
                      <Td numeric><span className={l.total ? 'font-semibold text-ink' : ''}>{formatPct(l.fsePct)}</span></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>

            <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              {[
                { label: 'Scholarships counted', value: `${included.length} of ${rows.length}`, step: 2 as const },
                { label: 'Scholars with allowances', value: scholarsWithAllowances ? `${scholarsWithAllowances} · ${peso(allowanceSum)}` : 'None', step: 3 as const },
                { label: 'Other grants', value: validGrants.length ? validGrants.map(g => `${g.label} × ${g.studentIds.filter(id => listedIds.has(id)).length}`).join(', ') : 'None', step: 3 as const },
                { label: 'Scholars added by hand', value: included.some(r => validAdjustment(r)) ? included.filter(r => validAdjustment(r)).map(r => `${r.code} +${validAdjustment(r)!.scholars}`).join(', ') : 'None', step: 3 as const }
              ].map(item => (
                <li key={item.label} className="flex items-center justify-between gap-3 rounded-control px-3 py-2 ring-1 ring-line">
                  <span className="min-w-0">
                    <span className="block text-xs text-ink-subtle">{item.label}</span>
                    <span className="block truncate text-ink">{item.value}</span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => go(item.step)} aria-label={`Change ${item.label.toLowerCase()}`}>Change</Button>
                </li>
              ))}
            </ul>
            {stillMissing.length > 0 && (
              <Alert tone="info">
                {stillMissing.map(r => `Code ${r.code}: about ${gapLeft(r)} scholar${gapLeft(r) === 1 ? '' : 's'} from the SUB TOTAL aren’t accounted for.`).join(' ')} You can still generate the report; add them in step 3 if you have their list.
              </Alert>
            )}
            {saveError && <Alert tone="danger">{saveError}</Alert>}
          </>
        )}
      </div>
    </Modal>
  );
}

// A scholarship's scholars with their allowance fields: the AdSO fills in
// only those who get one (from a donor or sponsor). "Same for all" fills a
// column for everyone.
function ScholarAllowances({ row, grants, onChange }: {
  row: ReviewRow;
  grants: FseGrant[];
  onChange: (studentId: string | null, kind: AllowanceKind, raw: string) => void;
}) {
  const [q, setQ] = useState('');
  const kinds = Object.keys(ALLOWANCE_LABELS) as AllowanceKind[];
  const grantFor = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of grants) for (const id of g.studentIds) m.set(id, (m.get(id) ?? 0) + g.amount);
    return m;
  }, [grants]);
  const shown = row.scholars.filter(x => !q.trim() || x.studentId.includes(q.trim()) || (x.program ?? '').toLowerCase().includes(q.trim().toLowerCase()));
  const same = (k: AllowanceKind) => {
    const v = row.scholars.map(x => row.entered[x.studentId]?.[k]);
    return v.length && v.every(x => x !== undefined && x === v[0]) ? String(v[0]) : '';
  };
  const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div className="mt-3 rounded-control bg-surface-muted p-3 ring-1 ring-line sm:ml-9">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-muted">Enter allowances only for the scholars who get them, per scholar this term.</p>
        <div className="w-full sm:w-64"><SearchInput value={q} onChange={setQ} label={`Search scholars of ${row.code}`} placeholder="Student no. or program…" /></div>
      </div>
      <div className="max-h-96 overflow-auto rounded-control bg-surface ring-1 ring-line">
        <table className="w-full min-w-[56rem] text-xs">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-line text-left text-ink-muted">
              <th className="px-2 py-2 font-medium">Student no.</th>
              <th className="px-2 py-2 font-medium">Program</th>
              <th className="px-2 py-2 text-right font-medium">Assessment</th>
              <th className="px-2 py-2 text-right font-medium">Discount</th>
              {kinds.map(k => <th key={k} className="px-1 py-2 font-medium">{ALLOWANCE_LABELS[k]}</th>)}
              <th className="px-2 py-2 text-right font-medium">FSE</th>
            </tr>
            <tr className="border-b border-line bg-surface-muted">
              <td className="px-2 py-1.5 font-medium text-ink" colSpan={4}>Same for all {row.scholars.length}</td>
              {kinds.map(k => (
                <td key={k} className="px-1 py-1.5">
                  <TextInput type="number" min={0} inputMode="decimal" value={same(k)} onChange={e => onChange(null, k, e.target.value)} placeholder="₱" className="!py-1 text-xs" aria-label={`${ALLOWANCE_LABELS[k]} for every scholar of ${row.code}`} />
                </td>
              ))}
              <td />
            </tr>
          </thead>
          <tbody>
            {shown.map(x => {
              const e = row.entered[x.studentId];
              const total = x.totalDiscount + allowanceTotal(e) + (grantFor.get(x.studentId) ?? 0);
              return (
                <tr key={x.studentId} className={`border-b border-line last:border-0 ${allowanceTotal(e) ? 'bg-accent-subtle/40' : ''}`}>
                  <td className="px-2 py-1 font-mono">{x.studentId}</td>
                  <td className="px-2 py-1">{x.program ?? '—'}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{money(x.matriculation)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{money(x.totalDiscount)}</td>
                  {kinds.map(k => (
                    <td key={k} className="px-1 py-1">
                      <TextInput type="number" min={0} inputMode="decimal" value={e?.[k] ?? ''} onChange={ev => onChange(x.studentId, k, ev.target.value)} className="!py-1 text-xs" aria-label={`${ALLOWANCE_LABELS[k]} for ${x.studentId}`} />
                    </td>
                  ))}
                  <td className="px-2 py-1 text-right font-medium tabular-nums text-ink">{(total / x.matriculation).toFixed(4)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StepIndicator({ step, onGo }: { step: 1 | 2 | 3 | 4; onGo: (step: 1 | 2 | 3 | 4) => void }) {
  const steps = ['Details', 'Categories', 'Allowances', 'Review'];
  return (
    <ol className="mt-1 flex flex-wrap items-center gap-2 text-xs" aria-label="Steps">
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3 | 4;
        const state = n < step ? 'done' : n === step ? 'current' : 'next';
        const content = (
          <>
            <span className={`flex size-5 items-center justify-center rounded-full text-[0.6875rem] font-semibold ${
              state === 'next' ? 'bg-neutral-bg text-ink-subtle' : 'bg-accent text-white'
            }`}>{state === 'done' ? <Check className="size-3" aria-hidden /> : n}</span>
            <span className={state === 'current' ? 'font-medium text-ink' : 'text-ink-subtle'}>{label}</span>
          </>
        );
        return (
          <li key={label} className="flex items-center gap-2" aria-current={state === 'current' ? 'step' : undefined}>
            {i > 0 && <span className="h-px w-4 bg-line sm:w-6" aria-hidden />}
            {state === 'done'
              ? <button type="button" onClick={() => onGo(n)} className="flex items-center gap-2 rounded hover:underline">{content}</button>
              : <span className="flex items-center gap-2">{content}</span>}
          </li>
        );
      })}
    </ol>
  );
}
