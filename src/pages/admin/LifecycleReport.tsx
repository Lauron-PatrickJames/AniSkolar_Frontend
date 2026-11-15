import React, { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { mockScholarships } from '../../data/scholarships';
import { findProgram } from '../../data/programs';
import { ExcelColumn, ExcelValue, downloadExcel, excelDate } from '../../utils/excelExport';
import {
  AdminApplication, applicantEmail, applicantName, applicantPhone, applicantProgram, applicantYearLevel, authHeaders, formatDate, titleCaseName
} from './adminData';
import { Alert, Button, Checkbox, Field, Modal, Select } from './AdminUI';

// Scholar lifecycle report (Scholars → Export → Scholar lifecycle report):
// one row per scholar per scholarship they were awarded, with the terms
// they held it and how it ended. Filter by term to get, say, everyone who
// was a scholar in the 1st semester of AY 2026–2027.

// --- Terms ------------------------------------------------------------------------

// Same semesters as the backend (utils/semester.js): June–December is the
// 1st semester of the academic year starting that June, January–May the
// 2nd. In Philippine time.
type TermName = '1st Semester' | '2nd Semester';
interface Term { academicYear: number; term: TermName }

const termKey = (t: Term) => t.academicYear * 2 + (t.term === '2nd Semester' ? 1 : 0);
const termFromKey = (key: number): Term => ({ academicYear: Math.floor(key / 2), term: key % 2 ? '2nd Semester' : '1st Semester' });

function termOfDate(iso: string): Term {
  const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' })
    .format(new Date(iso)).split('-').map(Number);
  return month >= 6 ? { academicYear: year, term: '1st Semester' } : { academicYear: year - 1, term: '2nd Semester' };
}

export function termLabel(key: number, short = false): string {
  const { academicYear: y, term } = termFromKey(key);
  const sem = term === '1st Semester' ? '1st Sem' : '2nd Sem';
  return short ? `${sem} ${y}–${String(y + 1).slice(2)}` : `${sem}, AY ${y}–${y + 1}`;
}

// --- Data -------------------------------------------------------------------------

export interface RenewalRecord {
  studentNumber: string;
  scholarshipId: string;
  academicYear: number;
  term: string;
  status: 'Under Evaluation' | 'Needs Revision' | 'Renewed' | 'Not Renewed' | 'Not Continuing';
  notContinuingReason?: string;
  gpa?: number;
}

type TermStatus = 'Awarded' | 'Renewed' | 'Renewal pending' | 'Held';

interface LifecycleRow {
  id: string;
  studentNumber: string;
  name: string;
  email: string;
  phone: string;
  college: string;
  program: string;
  yearLevel: string;
  scholarship: string;
  scholarshipId: string;
  office: string;
  referenceCode: string;
  awardedTerm: number;
  awardedOn: string;
  grant: number | null;
  // Status in each term they held it (key: termKey).
  terms: Map<number, TermStatus>;
  lastGpa: number | null;
  currentStatus: string;
  ended: boolean;
  endedOn: string | null;
  endReason: string;
}

function buildRows(applications: AdminApplication[], renewals: RenewalRecord[], nowKey: number): LifecycleRow[] {
  const renewalsFor = new Map<string, RenewalRecord[]>();
  for (const r of renewals) {
    if (r.term !== '1st Semester' && r.term !== '2nd Semester') continue;
    const k = `${r.studentNumber}|${r.scholarshipId}`;
    (renewalsFor.get(k) ?? renewalsFor.set(k, []).get(k)!).push(r);
  }

  return applications.filter(a => a.status === 'Approved').map(app => {
    const scholarship = mockScholarships.find(s => s.id === app.scholarshipId);
    const awardedOn = app.reviewedAt ?? app.createdAt;
    const start = termKey(termOfDate(awardedOn));
    const own = (renewalsFor.get(`${app.studentNumber}|${app.scholarshipId}`) ?? [])
      .map(r => ({ ...r, key: termKey({ academicYear: r.academicYear, term: r.term as TermName }) }))
      .filter(r => r.key > start)
      .sort((a, b) => a.key - b.key);
    const declined = app.endReason === 'Declined';
    // The last term they could have held it: now for scholarships kept
    // without renewals; with renewals, whatever has been filed so far.
    let last = scholarship?.noRenewal ? nowKey : Infinity;
    if (scholarship?.oneSemester) last = start;
    if (app.endedAt) last = Math.min(last, termKey(termOfDate(app.endedAt)));

    const terms = new Map<number, TermStatus>();
    if (!declined) {
      terms.set(start, 'Awarded');
      if (scholarship?.noRenewal) {
        for (let k = start + 1; k <= last; k++) terms.set(k, 'Held');
      } else {
        // Kept term by term through renewals; it stops at the first one
        // that isn't renewed.
        for (const r of own) {
          if (r.key > last) break;
          if (r.status === 'Renewed') terms.set(r.key, 'Renewed');
          else if (r.status === 'Under Evaluation' || r.status === 'Needs Revision') { terms.set(r.key, 'Renewal pending'); break; }
          else break;
        }
      }
    }

    const latest = own[own.length - 1];
    let currentStatus = 'Active';
    let endReason = '';
    if (app.endReason) {
      currentStatus = app.endReason === 'Declined' ? 'Declined by student' : app.endReason;
      endReason = currentStatus;
    } else if (scholarship?.oneSemester && nowKey > start) {
      currentStatus = 'Completed';
      endReason = 'One-semester grant';
    } else if (latest?.status === 'Not Renewed') {
      currentStatus = 'Not renewed';
      endReason = `Not renewed (${termLabel(latest.key, true)})`;
    } else if (latest?.status === 'Not Continuing') {
      currentStatus = 'Not continuing';
      endReason = latest.notContinuingReason || 'Not continuing';
    } else if (latest && (latest.status === 'Under Evaluation' || latest.status === 'Needs Revision')) {
      currentStatus = 'Renewal pending';
    }
    const ended = !['Active', 'Renewal pending'].includes(currentStatus);
    const gpas = own.filter(r => typeof r.gpa === 'number');

    return {
      id: app._id,
      studentNumber: app.studentNumber,
      name: titleCaseName(applicantName(app)),
      email: applicantEmail(app),
      phone: applicantPhone(app),
      college: app.currentProfile?.college || findProgram(app.currentProfile?.programCode)?.college || '',
      program: applicantProgram(app),
      yearLevel: applicantYearLevel(app),
      scholarship: app.scholarshipName,
      scholarshipId: app.scholarshipId,
      office: app.office || scholarship?.office || 'LSO',
      referenceCode: app.referenceCode,
      awardedTerm: start,
      awardedOn,
      grant: app.sfagPercentage ?? null,
      terms,
      lastGpa: gpas.length ? gpas[gpas.length - 1].gpa! : null,
      currentStatus,
      ended,
      endedOn: app.endedAt ?? null,
      endReason,
    };
  }).sort((a, b) => a.name.localeCompare(b.name) || a.awardedTerm - b.awardedTerm);
}

// --- Columns ----------------------------------------------------------------------

interface ReportColumn {
  key: string;
  label: (term: number | null) => string;
  format?: ExcelColumn['format'];
  numeric?: boolean;
  // Only with a term chosen.
  needsTerm?: boolean;
  value: (r: LifecycleRow, term: number | null) => ExcelValue;
  show?: (r: LifecycleRow, term: number | null) => string;
}

const heldTerms = (r: LifecycleRow) => [...r.terms.entries()].filter(([, s]) => s !== 'Renewal pending').map(([k]) => k);

const COLUMNS: ReportColumn[] = [
  { key: 'studentNumber', label: () => 'Student number', value: r => r.studentNumber },
  { key: 'name', label: () => 'Name', value: r => r.name },
  { key: 'email', label: () => 'Email', value: r => r.email || null },
  { key: 'phone', label: () => 'Phone', value: r => r.phone || null },
  { key: 'college', label: () => 'College', value: r => r.college || null },
  { key: 'program', label: () => 'Program', value: r => r.program || null },
  { key: 'yearLevel', label: () => 'Year level', value: r => r.yearLevel || null },
  { key: 'scholarship', label: () => 'Scholarship', value: r => r.scholarship },
  { key: 'office', label: () => 'Office', value: r => r.office },
  { key: 'referenceCode', label: () => 'Reference no.', value: r => r.referenceCode },
  { key: 'statusInTerm', label: t => `Status, ${t === null ? 'term' : termLabel(t, true)}`, needsTerm: true, value: (r, t) => (t === null ? null : r.terms.get(t) ?? null) },
  { key: 'awardedTerm', label: () => 'Awarded (term)', value: r => termLabel(r.awardedTerm) },
  { key: 'awardedOn', label: () => 'Awarded on', format: 'date', value: r => excelDate(r.awardedOn), show: r => formatDate(r.awardedOn) },
  { key: 'grant', label: () => 'Grant (%)', format: 'integer', numeric: true, value: r => r.grant },
  { key: 'termsHeld', label: () => 'Terms held', format: 'integer', numeric: true, value: r => heldTerms(r).length },
  { key: 'termList', label: () => 'Terms', value: r => heldTerms(r).map(k => termLabel(k, true)).join(', ') || null },
  { key: 'lastGpa', label: () => 'Latest renewal GPA', format: 'decimal', numeric: true, value: r => r.lastGpa, show: r => (r.lastGpa === null ? '—' : r.lastGpa.toFixed(2)) },
  { key: 'currentStatus', label: () => 'Current status', value: r => r.currentStatus },
  { key: 'endedOn', label: () => 'Ended on', format: 'date', value: r => excelDate(r.endedOn), show: r => (r.endedOn ? formatDate(r.endedOn) : '—') },
  { key: 'endReason', label: () => 'How it ended', value: r => r.endReason || null },
];
const DEFAULT_COLUMNS = ['studentNumber', 'name', 'program', 'yearLevel', 'scholarship', 'statusInTerm', 'awardedTerm', 'termsHeld', 'currentStatus'];

// --- Modal ------------------------------------------------------------------------

type StatusFilter = 'all' | 'active' | 'ended';
const PREVIEW_ROWS = 8;

export default function LifecycleReportModal({ applications, getToken, apiBaseUrl, onClose }: {
  applications: AdminApplication[];
  getToken: () => Promise<string | null>;
  apiBaseUrl: string;
  onClose: () => void;
}) {
  const [renewals, setRenewals] = useState<RenewalRecord[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [term, setTerm] = useState('all');
  const [scholarshipId, setScholarshipId] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set(DEFAULT_COLUMNS));
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/renewals/admin/all`, { headers: await authHeaders(getToken) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Couldn’t load renewals.');
        if (!cancelled) setRenewals(body.renewals ?? []);
      } catch (err) {
        if (!cancelled) {
          // Still useful without renewals: awards and how they ended.
          setRenewals([]);
          setLoadError(err instanceof Error ? err.message : 'Couldn’t load renewals.');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [apiBaseUrl, getToken]);

  const nowKey = termKey(termOfDate(new Date().toISOString()));
  const rows = useMemo(() => (renewals ? buildRows(applications, renewals, nowKey) : []), [applications, renewals, nowKey]);

  // Every term from the first award up to now, newest first.
  const termOptions = useMemo(() => {
    if (!rows.length) return [];
    const first = Math.min(...rows.map(r => r.awardedTerm));
    // Up to now, or later if a renewal for next term is already in.
    const latest = Math.max(nowKey, ...rows.flatMap(r => [...r.terms.keys()]));
    return Array.from({ length: latest - first + 1 }, (_, i) => latest - i);
  }, [rows, nowKey]);
  const scholarshipOptions = useMemo(
    () => [...new Map(rows.map(r => [r.scholarshipId, r.scholarship])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [rows]
  );

  const termKeyChosen = term === 'all' ? null : Number(term);
  const filtered = rows.filter(r =>
    (termKeyChosen === null || r.terms.has(termKeyChosen)) &&
    (scholarshipId === 'all' || r.scholarshipId === scholarshipId) &&
    (status === 'all' || (status === 'ended' ? r.ended : !r.ended))
  );
  const available = COLUMNS.filter(c => !c.needsTerm || termKeyChosen !== null);
  const columns = available.filter(c => selected.has(c.key));
  const scholarCount = new Set(filtered.map(r => r.studentNumber)).size;

  const toggle = (key: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(key); else next.delete(key);
    setSelected(next);
  };

  const subtitle = [
    termKeyChosen === null ? 'All terms' : `Scholars in the ${termLabel(termKeyChosen)}`,
    scholarshipId !== 'all' && scholarshipOptions.find(([id]) => id === scholarshipId)?.[1],
    status === 'active' ? 'Active only' : status === 'ended' ? 'Ended only' : null,
    `${scholarCount} ${scholarCount === 1 ? 'scholar' : 'scholars'}`,
  ].filter(Boolean).join('  ·  ');

  const download = async () => {
    setDownloading(true);
    setDownloadError('');
    try {
      const suffix = termKeyChosen === null ? 'all-terms' : termLabel(termKeyChosen, true).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      await downloadExcel(`scholar-lifecycle-${suffix}`, [{
        name: 'Lifecycle',
        title: 'Scholar lifecycle report',
        subtitle,
        columns: columns.map(c => ({ header: c.label(termKeyChosen), format: c.format })),
        rows: filtered.map(r => columns.map(c => c.value(r, termKeyChosen))),
      }]);
      onClose();
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Couldn’t create the file.');
    } finally {
      setDownloading(false);
    }
  };

  const cell = (c: ReportColumn, r: LifecycleRow) => {
    if (c.show) return c.show(r, termKeyChosen);
    const v = c.value(r, termKeyChosen);
    return v === null || v === undefined || v === '' ? '—' : String(v);
  };

  return (
    <Modal
      size="xl"
      title="Scholar lifecycle report"
      description="One row per scholar per scholarship: when they were awarded it, the terms they held it, and how it ended."
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Download} loading={downloading} disabled={!renewals || columns.length === 0 || filtered.length === 0} onClick={download}>
            Download for Excel ({filtered.length} {filtered.length === 1 ? 'row' : 'rows'})
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {loadError && <Alert tone="warning">Renewals couldn’t be loaded ({loadError}), so terms after the first may be missing.</Alert>}
        {downloadError && <Alert tone="danger" onDismiss={() => setDownloadError('')}>{downloadError}</Alert>}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Term">
            <Select value={term} onChange={setTerm} disabled={!renewals}>
              <option value="all">All terms</option>
              {termOptions.map(k => <option key={k} value={k}>{termLabel(k)}</option>)}
            </Select>
          </Field>
          <Field label="Scholarship">
            <Select value={scholarshipId} onChange={setScholarshipId} disabled={!renewals}>
              <option value="all">All scholarships</option>
              {scholarshipOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onChange={v => setStatus(v as StatusFilter)} disabled={!renewals}>
              <option value="all">Active and ended</option>
              <option value="active">Active only</option>
              <option value="ended">Ended only</option>
            </Select>
          </Field>
        </div>

        <div className="grid gap-5 lg:grid-cols-[14rem_1fr]">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs tabular-nums text-ink-subtle">{columns.length} of {available.length} columns</p>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(COLUMNS.map(c => c.key)))}>All</Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>None</Button>
              </div>
            </div>
            <fieldset className="space-y-2.5">
              <legend className="sr-only">Columns</legend>
              {available.map(c => (
                <Checkbox key={c.key} label={c.label(termKeyChosen)} checked={selected.has(c.key)} onChange={on => toggle(c.key, on)} />
              ))}
            </fieldset>
          </div>

          <div className="min-w-0 space-y-2">
            <p className="text-xs font-medium text-ink-muted">
              {renewals ? `${subtitle}${filtered.length > PREVIEW_ROWS ? ` · first ${PREVIEW_ROWS} of ${filtered.length} rows` : ''}` : 'Loading…'}
            </p>
            {!renewals ? (
              <div className="h-40 animate-pulse rounded-control bg-surface-muted" />
            ) : columns.length === 0 ? (
              <p className="rounded-control bg-surface-muted p-6 text-center text-sm text-danger">Select at least one column.</p>
            ) : filtered.length === 0 ? (
              <p className="rounded-control bg-surface-muted p-6 text-center text-sm text-ink-muted">
                {termKeyChosen === null ? 'No awarded scholars match these filters.' : `No scholars held a scholarship in the ${termLabel(termKeyChosen)} with these filters.`}
              </p>
            ) : (
              <div className="max-h-[50dvh] overflow-auto rounded-control ring-1 ring-line">
                <table className="w-full border-separate border-spacing-0 text-xs">
                  <thead className="sticky top-0 bg-surface-muted">
                    <tr>{columns.map(c => <th key={c.key} className={`whitespace-nowrap border-b border-line px-3 py-2 font-semibold text-ink ${c.numeric ? 'text-right' : 'text-left'}`}>{c.label(termKeyChosen)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, PREVIEW_ROWS).map(r => (
                      <tr key={r.id} className="odd:bg-surface even:bg-surface-muted/40">
                        {columns.map(c => <td key={c.key} className={`max-w-56 truncate border-b border-line px-3 py-1.5 text-ink-muted ${c.numeric ? 'text-right tabular-nums' : ''}`}>{cell(c, r)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
