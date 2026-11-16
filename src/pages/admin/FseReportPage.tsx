import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Calculator, Check, Pencil, ChevronDown, ChevronUp, Download, FileSpreadsheet, GraduationCap, Percent, Trash2, Upload, Users } from 'lucide-react';
import { API_BASE_URL, academicYearOf, authHeaders, formatDate, formatDateTime } from './adminData';
import { ResultDialog,
  Alert, Badge, Button, Card, Checkbox, ConfirmDialog, DropdownMenu, EmptyState, ErrorState, Field, KpiCard, KpiGrid, Modal, PageHeader,
  SearchInput, Select, Table, TableSkeleton, Tabs, Td, TextInput, Th, Toolbar, Tr
} from './AdminUI';
import {
  ALLOWANCE_LABELS, AllowanceKind, Allowances, CATEGORY_LABELS, FSE_TERMS, FseCategory, FseLine, FseReport, FseScholarship, FseSpecialFunding, FseTerm, ParseResult, SPECIAL_FUNDING_LABELS, allowanceTotal, formatFse,
  guessCategory, guessSpecialFunding, withAllowances, withoutAllowances,
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
      await exportAcademicYear(report.academicYear, [report]);
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
            {report && <Button icon={Download} onClick={exportReport} loading={exporting}>Export to Excel</Button>}
            {report && (
              <DropdownMenu
                label="More actions"
                items={[
                  { key: 'edit', label: 'Edit report', icon: Pencil, onSelect: () => setEditing(true) },
                  { key: 'delete', label: 'Delete report', icon: Trash2, tone: 'danger', onSelect: () => setDeleting(true) }
                ]}
              />
            )}
            <Button variant="primary" icon={Upload} onClick={() => setUploading(true)}>Generate report</Button>
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
    .map(s => ({ ...s, fse: s.scholars.reduce((n, r) => n + r.fse, 0) }))
    .sort((a, b) => b.fse - a.fse), [report]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter(s => (filter === 'all' || s.category === filter) && (!q || s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)));
  }, [all, filter, search]);
  const withAllowance = report.scholarships.filter(s => allowanceTotal(s.allowances) > 0).length;

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
          hint={withAllowance ? `${withAllowance} with allowances` : 'No allowances entered'} />
      </KpiGrid>

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
                <Th sticky={false} numeric className="w-32">Allowances</Th>
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
                  <Td numeric>{s.scholars.length}</Td>
                  <Td numeric>{allowanceTotal(s.allowances) ? <span title="Per scholar">{peso(allowanceTotal(s.allowances))}</span> : '—'}</Td>
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

interface ReviewRow extends FseScholarship { include: boolean }
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

  const [step, setStep] = useState<1 | 2>(1);
  const [fileName, setFileName] = useState(editing?.fileName ?? '');
  const [parsed, setParsed] = useState<ParseResult | null>(editing ? { sheetName: '', scholarships: editing.scholarships, warnings: [] } : null);
  const [rows, setRows] = useState<ReviewRow[]>(() => (editing?.scholarships ?? []).map(s => ({ ...withoutAllowances(s), include: true })));
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
        return { ...s, category, include: true, specialFunding, allowances: last?.allowances ?? null };
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

  const set = (code: string, patch: Partial<ReviewRow>) => setRows(prev => prev.map(r => (r.code === code ? { ...r, ...patch } : r)));
  const setAllowance = (code: string, kind: AllowanceKind, raw: string) => setRows(prev => prev.map(r => {
    if (r.code !== code) return r;
    const n = Number(raw);
    const next: Allowances = { ...(r.allowances ?? {}) };
    if (raw.trim() === '' || !Number.isFinite(n) || n <= 0) delete next[kind]; else next[kind] = n;
    return { ...r, allowances: Object.keys(next).length ? next : null };
  }));
  const toggleAllowances = (code: string) => setOpenAllowances(p => { const n = new Set(p); if (n.has(code)) n.delete(code); else n.add(code); return n; });

  const included = rows.filter(r => r.include);
  const needsAttention = (r: ReviewRow) => r.include && (!r.category || (r.category === 'special' && !r.specialFunding));
  const attention = rows.filter(needsAttention);
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
    empty: included.length === 0 ? 'Include at least one scholarship.' : ''
  };
  const preview = useMemo(
    () => (parsed && pop >= 1 ? summarize({ scholarships: included.map(withAllowances), population: pop }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parsed, rows, pop]
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      const byFilter = filter === 'all' ? true
        : filter === 'attention' ? needsAttention(r)
        : filter === 'excluded' ? !r.include
        : r.include && r.category === filter;
      return byFilter && (!q || r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filter, search]);

  const focusFirstMissing = () => {
    requestAnimationFrame(() => {
      const target = bodyRef.current?.querySelector<HTMLElement>('[data-missing="true"]');
      if (!target) return;
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const controls = target.querySelectorAll<HTMLElement>('select:not([disabled]), input:not([type="checkbox"]):not([type="file"]):not([disabled])');
      (controls[controls.length - 1] ?? target).focus({ preventScroll: true });
    });
  };

  const next = () => {
    setAttempted1(true);
    if (Object.values(errors1).some(Boolean)) { focusFirstMissing(); return; }
    setFilter(attention.length ? 'attention' : 'all');
    setStep(2);
    bodyRef.current?.closest('[role="dialog"]')?.querySelector<HTMLElement>('.overflow-y-auto')?.scrollTo({ top: 0 });
  };

  const save = async () => {
    setAttempted(true);
    if (Object.values(errors1).some(Boolean)) { setStep(1); return; }
    if (Object.values(errors2).some(Boolean)) {
      if (attention.length) setFilter('attention');
      focusFirstMissing();
      return;
    }
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
          ? { ...details, scholarships: included.map(s => ({ code: s.code, category: s.category, specialFunding: funding(s), allowances: s.allowances })) }
          : { ...details, fileName, scholarships: included.map(({ include: _include, part: _part, partLabel: _label, discountRule: _rule, ...s }) => ({ ...s, specialFunding: funding(s) })) })
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

  const scholarCount = rows.reduce((n, r) => n + r.scholars.length, 0);
  const filterTabs: { key: ReviewFilter; label: string; count?: number }[] = [
    ...(attention.length ? [{ key: 'attention' as ReviewFilter, label: 'Needs attention', count: attention.length }] : []),
    { key: 'all', label: 'All', count: rows.length },
    ...CATEGORIES.map(c => ({ key: c as ReviewFilter, label: CATEGORY_LABELS[c], count: included.filter(r => r.category === c).length })),
    ...(rows.length - included.length ? [{ key: 'excluded' as ReviewFilter, label: 'Left out', count: rows.length - included.length }] : [])
  ];
  // Don't leave the view on a tab that just emptied.
  useEffect(() => {
    if (filter === 'attention' && attention.length === 0) setFilter('all');
    if (filter === 'excluded' && rows.length === included.length) setFilter('all');
  }, [filter, attention.length, rows.length, included.length]);

  return (
    <Modal
      size="xl"
      title={editing ? 'Edit FSE report' : 'Generate an FSE report'}
      description={<StepIndicator step={step} />}
      onClose={onClose}
      dismissible={!saving}
      footer={
        step === 1 ? (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" iconRight={ArrowRight} onClick={next} disabled={reading}>Next</Button>
          </>
        ) : (
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-muted">
              {attention.length
                ? <span className="font-medium text-warning-fg">{attention.length} need{attention.length === 1 ? 's' : ''} a category or funding</span>
                : <span className="inline-flex items-center gap-1 text-success-fg"><Check className="size-3.5" aria-hidden /> All set</span>}
            </p>
            <div className="flex gap-2">
              <Button icon={ArrowLeft} onClick={() => setStep(1)} disabled={saving}>Back</Button>
              <Button variant="primary" onClick={save} loading={saving} disabled={saving}>{editing ? 'Save changes' : 'Generate report'}</Button>
            </div>
          </div>
        )
      }
    >
      <div ref={bodyRef} className="space-y-5">
        {step === 1 ? (
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
                  <p className="text-xs text-ink-muted">{rows.length} scholarships · {scholarCount.toLocaleString()} scholars. To use another file, generate a new report.</p>
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
                    <span className="text-xs text-ink-muted">{rows.length} scholarships · {scholarCount.toLocaleString()} scholars · <span className="text-accent underline">choose another file</span></span>
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
        ) : (
          <>
            <div className="rounded-card bg-surface-muted p-4 ring-1 ring-line">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-ink">
                  {academicYear} · {term}
                </p>
                {preview && (
                  <p className="text-sm text-ink tabular-nums">
                    Institutional FSE <span className="font-semibold">{formatPct(preview[5].fsePct)}</span>
                    <span className="text-ink-subtle"> · FSE {formatFse(preview[5].fse)} · {preview[5].scholars.toLocaleString()} scholars of {pop.toLocaleString()}</span>
                  </p>
                )}
              </div>
              {preview && <CategoryBreakdown lines={preview} compact />}
            </div>

            {(remembered > 0 || guessed > 0 || parsed?.fromTabs) && (
              <p className="text-xs text-ink-subtle">
                {[
                  parsed?.fromTabs ? 'Categories are from the workbook’s tabs.' : '',
                  remembered || guessed ? 'Categories are filled in automatically. Check them before generating.' : ''
                ].filter(Boolean).join(' ')}
              </p>
            )}
            {attempted && (errors2.category || errors2.funding || errors2.empty) && (
              <Alert tone="danger">{errors2.category || errors2.funding || errors2.empty}</Alert>
            )}

            <div className="overflow-hidden rounded-card ring-1 ring-line">
              <Tabs<ReviewFilter> label="Show scholarships" value={filter} onChange={setFilter} tabs={filterTabs} />
              <div className="border-b border-line p-3">
                <SearchInput value={search} onChange={setSearch} label="Search scholarships" placeholder="Search code or name…" />
              </div>
              {shown.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-ink-muted">No scholarships here.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {shown.map(r => {
                    const missing = attempted && needsAttention(r);
                    const open = openAllowances.has(r.code) && r.include;
                    const extra = allowanceTotal(r.allowances);
                    return (
                      <li key={r.code} data-missing={missing}
                        className={`px-4 py-3 scroll-mt-14 ${r.include ? '' : 'bg-surface-muted'} ${missing ? 'bg-warning-bg ring-2 ring-inset ring-warning-solid' : ''}`}>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          <Checkbox checked={r.include} onChange={include => set(r.code, { include })}
                            label={<span className="sr-only">Count {r.code} in the FSE</span>} />
                          <div className={`min-w-0 flex-1 basis-64 ${r.include ? '' : 'opacity-60'}`}>
                            <p className="flex min-w-0 items-center gap-2">
                              <span className="font-mono text-xs text-ink-subtle">{r.code}</span>
                              <span className="truncate text-sm font-medium text-ink" title={r.name}>{r.name}</span>
                            </p>
                            <p className="truncate text-xs text-ink-subtle">
                              {r.scholars.length} scholar{r.scholars.length === 1 ? '' : 's'}{!r.include ? ' · not counted' : ''}
                            </p>
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
                              <Button size="sm" variant={extra ? 'secondary' : 'ghost'} iconRight={open ? ChevronUp : ChevronDown}
                                onClick={() => toggleAllowances(r.code)} aria-expanded={open} className="w-36 justify-between">
                                {extra ? `${peso(extra)} / scholar` : 'Allowances'}
                              </Button>
                            </div>
                          )}
                          {r.include && !r.category && <Badge tone="warning">Needs category</Badge>}
                          {r.include && r.category === 'special' && !r.specialFunding && <Badge tone="warning">Needs funding</Badge>}
                        </div>
                        {open && (
                          <div className="mt-3 rounded-control bg-surface-muted p-3 ring-1 ring-line sm:ml-9">
                            <p className="mb-2 text-xs text-ink-muted">Amount per scholar this term.</p>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                              {(Object.keys(ALLOWANCE_LABELS) as AllowanceKind[]).map(k => (
                                <Field key={k} label={ALLOWANCE_LABELS[k]}>
                                  <TextInput type="number" min={0} inputMode="decimal" value={r.allowances?.[k] ?? ''}
                                    onChange={e => setAllowance(r.code, k, e.target.value)} placeholder="₱0" aria-label={`${ALLOWANCE_LABELS[k]} for ${r.code}, pesos per scholar`} />
                                </Field>
                              ))}
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {saveError && <Alert tone="danger">{saveError}</Alert>}
          </>
        )}
      </div>
    </Modal>
  );
}

function StepIndicator({ step }: { step: 1 | 2 }) {
  const steps = ['Details', 'Scholarships'];
  return (
    <ol className="mt-1 flex items-center gap-2 text-xs" aria-label="Steps">
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n < step ? 'done' : n === step ? 'current' : 'next';
        return (
          <li key={label} className="flex items-center gap-2" aria-current={state === 'current' ? 'step' : undefined}>
            {i > 0 && <span className="h-px w-6 bg-line" aria-hidden />}
            <span className={`flex size-5 items-center justify-center rounded-full text-[0.6875rem] font-semibold ${
              state === 'next' ? 'bg-neutral-bg text-ink-subtle' : 'bg-accent text-white'
            }`}>{state === 'done' ? <Check className="size-3" aria-hidden /> : n}</span>
            <span className={state === 'current' ? 'font-medium text-ink' : 'text-ink-subtle'}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
