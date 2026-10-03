import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calculator, Download, FileSpreadsheet, Trash2, Upload } from 'lucide-react';
import { API_BASE_URL, academicYearOf, authHeaders, formatDate, formatDateTime } from './adminData';
import {
  Alert, Badge, Button, Card, Checkbox, ConfirmDialog, DropdownMenu, EmptyState, ErrorState, Field, Modal, PageHeader,
  SearchInput, Select, Table, TableSkeleton, Td, TextInput, Th, Toast, Tr
} from './AdminUI';
import {
  CATEGORY_LABELS, FSE_TERMS, FseCategory, FseReport, FseScholarship, FseTerm, ParseResult, exportReport, formatFse,
  formatPct, parseRegistrarWorkbook, summarize
} from './fse';

// AdSO page for the Full Scholarship Equivalent: upload a term's registrar
// export, review how each scholarship is counted, save it, and read or
// export the FSE summary.

interface SavedSummary { id: string; academicYear: string; term: FseTerm; population: number; updatedAt?: string; updatedBy?: string }

const termLabel = (r: { academicYear: string; term: string }) => `${r.academicYear} · ${r.term}`;

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

  const remove = async () => {
    if (!report?.id) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/fse/${report.id}`, { method: 'DELETE', headers: await authHeaders(getToken) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to delete.');
      setDeleting(false);
      setToast(`Deleted ${termLabel(report)}.`);
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
        description="Upload a term's scholarship export from the registrar to compute headcount and FSE by fund source."
        actions={
          <>
            {report && (
              <DropdownMenu
                label="More actions"
                items={[
                  { key: 'export', label: 'Export to Excel', icon: Download, onSelect: () => exportReport(report) },
                  { key: 'delete', label: 'Delete this term', icon: Trash2, tone: 'danger', onSelect: () => setDeleting(true) }
                ]}
              />
            )}
            <Button variant="primary" icon={Upload} onClick={() => setUploading(true)}>Upload term</Button>
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
            description="Upload the registrar's scholarship export (.xls) for a term to compute its FSE."
            action={<Button variant="primary" icon={Upload} onClick={() => setUploading(true)}>Upload term</Button>}
          />
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={selectedId ?? ''} onChange={setSelectedId} label="Term" className="w-72">
              {list.map(r => <option key={r.id} value={r.id}>{termLabel(r)}</option>)}
            </Select>
            {report && (
              <span className="text-xs text-ink-subtle">
                Population {report.population.toLocaleString()}
                {report.asOf ? ` · as of ${formatDate(report.asOf)}` : ''}
                {report.updatedAt ? ` · saved ${formatDateTime(report.updatedAt)}${report.updatedBy ? ` by ${report.updatedBy}` : ''}` : ''}
              </span>
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
            setToast(`Saved ${termLabel(saved)}.`);
            loadList(saved.id);
          }}
        />
      )}

      {deleting && report && (
        <ConfirmDialog
          title={`Delete ${termLabel(report)}?`}
          description="The saved FSE report for this term is removed. You can upload the export again later."
          confirmLabel="Delete"
          confirmIcon={Trash2}
          tone="danger"
          busy={deleteBusy}
          onConfirm={remove}
          onCancel={() => setDeleting(false)}
        />
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

// --- Report ----------------------------------------------------------------------

function ReportView({ report }: { report: FseReport }) {
  const lines = useMemo(() => summarize(report), [report]);
  const [search, setSearch] = useState('');
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return report.scholarships
      .filter(s => !q || s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
      .map(s => ({ ...s, fse: s.scholars.reduce((n, r) => n + r.fse, 0) }))
      .sort((a, b) => b.fse - a.fse);
  }, [report, search]);

  return (
    <>
      <Card flush title="Summary" description="Headcount % and FSE % are out of the student population for the term.">
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
                <Td><span className={l.total ? 'font-medium text-ink' : 'text-ink'}>{l.label}</span></Td>
                <Td numeric><span className="text-ink">{l.scholars.toLocaleString()}</span></Td>
                <Td numeric>{formatPct(l.headcountPct)}</Td>
                <Td numeric><span className={l.total ? 'font-medium text-ink' : 'text-ink'}>{formatFse(l.fse)}</span></Td>
                <Td numeric><span className={l.total ? 'font-medium text-ink' : ''}>{formatPct(l.fsePct)}</span></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card flush title="By scholarship" description={report.fileName ? `From ${report.fileName}` : undefined}
        headerSlot={<div className="border-b border-line p-4"><SearchInput value={search} onChange={setSearch} label="Search scholarships" placeholder="Search code or name…" /></div>}>
        <Table label="FSE by scholarship" minWidth="48rem">
          <thead>
            <tr>
              <Th sticky={false} className="w-20">Code</Th>
              <Th sticky={false}>Scholarship</Th>
              <Th sticky={false} className="w-56">Category</Th>
              <Th sticky={false} numeric className="w-24">Scholars</Th>
              <Th sticky={false} numeric className="w-24">FSE</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(s => (
              <Tr key={s.code}>
                <Td><span className="font-mono text-xs">{s.code}</span></Td>
                <Td><span className="block truncate text-ink" title={s.name}>{s.name}</span></Td>
                <Td><span className="block truncate">{s.category ? CATEGORY_LABELS[s.category] : '—'}</span></Td>
                <Td numeric>{s.scholars.length}</Td>
                <Td numeric><span className="text-ink">{formatFse(s.fse)}</span></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}

// --- Upload ------------------------------------------------------------------------

interface ReviewRow extends FseScholarship { include: boolean }

function UploadModal({ getToken, existing, onClose, onSaved }: {
  getToken: () => Promise<string | null>;
  existing: SavedSummary[];
  onClose: () => void;
  onSaved: (report: FseReport) => void;
}) {
  const currentAy = academicYearOf(new Date().toISOString());
  const startYear = Number(currentAy.slice(3, 7));
  const yearOptions = [startYear + 1, startYear, startYear - 1, startYear - 2].map(y => `AY ${y}–${y + 1}`);

  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [parseError, setParseError] = useState('');
  const [academicYear, setAcademicYear] = useState(currentAy);
  const [term, setTerm] = useState<FseTerm>('1st Semester');
  const [population, setPopulation] = useState('');
  const [asOf, setAsOf] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const onFile = async (file: File | undefined) => {
    setParseError('');
    setParsed(null);
    if (!file) return;
    setFileName(file.name);
    try {
      const result = parseRegistrarWorkbook(await file.arrayBuffer());
      setParsed(result);
      setRows(result.scholarships.map(s => ({ ...s, include: true })));
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Couldn't read that file.");
    }
  };

  const set = (code: string, patch: Partial<ReviewRow>) => setRows(prev => prev.map(r => (r.code === code ? { ...r, ...patch } : r)));
  const included = rows.filter(r => r.include);
  const unclassified = included.filter(r => !r.category);
  const pop = Number(population);
  const errors = {
    population: !Number.isFinite(pop) || pop < 1 ? 'Enter the student population for the term.' : '',
    category: unclassified.length ? `Choose a category for ${unclassified.length} scholarship(s), or leave them out.` : '',
    empty: included.length === 0 ? 'Include at least one scholarship.' : ''
  };
  const replacing = existing.find(r => r.academicYear === academicYear && r.term === term);
  const preview = parsed && !errors.population ? summarize({ scholarships: included, population: pop }) : null;

  const save = async () => {
    setAttempted(true);
    if (errors.population || errors.category || errors.empty) return;
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/fse`, {
        method: 'PUT',
        headers: await authHeaders(getToken, true),
        body: JSON.stringify({
          academicYear, term, population: pop, asOf: asOf || undefined, fileName,
          scholarships: included.map(({ include: _include, ...s }) => s)
        })
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

  return (
    <Modal
      size="lg"
      title="Upload a term"
      description="Use the registrar's scholarship export (.xls or .xlsx), like the Raw sheet of the FSE template."
      onClose={onClose}
      dismissible={!saving}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!parsed || saving}>
            {replacing ? 'Replace saved term' : 'Save term'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Registrar export" error={parseError || undefined}>
          <input
            type="file"
            accept=".xls,.xlsx"
            onChange={e => onFile(e.target.files?.[0])}
            className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-control file:border-0 file:bg-neutral-bg file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink"
          />
        </Field>

        {parsed && (
          <>
            <p className="flex items-center gap-2 text-sm text-ink-muted">
              <FileSpreadsheet className="size-4 text-accent" aria-hidden />
              Sheet “{parsed.sheetName}”: {rows.length} scholarships, {rows.reduce((n, r) => n + r.scholars.length, 0).toLocaleString()} scholars.
            </p>
            {parsed.warnings.length > 0 && (
              <Alert tone="warning"><ul className="list-disc space-y-0.5 pl-4">{parsed.warnings.map(w => <li key={w}>{w}</li>)}</ul></Alert>
            )}

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
              <Field label="Student population" helper="Total enrolled (or FTE) for the term." error={attempted && errors.population ? errors.population : undefined}>
                <TextInput type="number" min={1} inputMode="numeric" value={population} onChange={e => setPopulation(e.target.value)} placeholder="e.g. 8541" />
              </Field>
              <Field label="As of" optional>
                <TextInput type="date" value={asOf} onChange={e => setAsOf(e.target.value)} />
              </Field>
            </div>
            {replacing && <Alert tone="warning">A report for {termLabel(replacing)} is already saved. Saving replaces it.</Alert>}

            <div>
              <p className="mb-1 text-sm font-medium text-ink">Scholarships</p>
              <p className="mb-2 text-xs text-ink-subtle">Leave out any the office doesn't count in the FSE, and set a category where the export has none.</p>
              {attempted && (errors.category || errors.empty) && <p className="mb-2 text-sm text-danger-fg">{errors.category || errors.empty}</p>}
              <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-control ring-1 ring-inset ring-line">
                {rows.map(r => (
                  <li key={r.code} className={`flex flex-wrap items-center gap-3 px-3 py-2 ${r.include ? '' : 'opacity-60'}`}>
                    <Checkbox checked={r.include} onChange={include => set(r.code, { include })} label={<span className="font-mono text-xs">{r.code}</span>} />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink" title={r.name}>{r.name}</span>
                    <span className="text-xs text-ink-subtle tabular-nums">{r.scholars.length}</span>
                    <Select
                      value={r.category ?? ''}
                      onChange={v => set(r.code, { category: (v || null) as FseCategory | null })}
                      label={`Category for ${r.code}`}
                      className="w-56"
                      disabled={!r.include}
                    >
                      <option value="">Choose category…</option>
                      {(Object.keys(CATEGORY_LABELS) as FseCategory[]).map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                    </Select>
                    {r.include && !r.category && <Badge tone="warning">Needs category</Badge>}
                  </li>
                ))}
              </ul>
            </div>

            {preview && (
              <div className="rounded-control bg-surface-muted p-3 text-xs text-ink-muted">
                Preview: {preview.slice(-1).map(l => `${l.scholars.toLocaleString()} scholars · FSE ${formatFse(l.fse)} · ${formatPct(l.fsePct)} of ${pop.toLocaleString()}`)}
              </div>
            )}
            {saveError && <Alert tone="danger">{saveError}</Alert>}
          </>
        )}
      </div>
    </Modal>
  );
}
