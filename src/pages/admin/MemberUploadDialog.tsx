import React, { useRef, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { Alert, Button, Checkbox, Field, Modal, Select, Table, Td, Textarea, Th, Tr } from './AdminUI';
import { API_BASE_URL, authHeaders } from './adminData';
import { parseCsv } from '../../utils/excelExport';
import { OFFICE_FORMS } from '../../data/officeForms';

// The members-only offices (SDO, ROTC, Vicissitude, Heraldo Filipino) upload
// their member list (Excel or CSV) and every member on it becomes a scholar
// (panel, Nov 2026). Columns: student number (required), and for members
// who haven't signed in to AniSkolar yet, first name, last name and DLSU-D
// email. Members already listed as current scholars are skipped, so the
// same list can be uploaded again each term.
// Backend: POST /api/applications/direct-award/bulk.

export interface MemberRow { studentNumber: string; firstName: string; lastName: string; email: string }

const HEADERS: [keyof MemberRow, RegExp][] = [
  ['studentNumber', /student\s*(no|number|num|#|id)|^id\s*(no|number)?$|^sn$/i],
  ['firstName', /first|given/i],
  ['lastName', /last|surname|family/i],
  ['email', /e-?mail/i],
];

// Rows of cells → members. Any layout works (the Registrar's file isn't a
// fixed format): a header row naming the columns, if there is one in the
// first rows, finds the names and emails; the student number is that
// column, or else any cell in the row with 9 digits. Rows without a
// student number (titles, totals, blank lines) are left out.
export function rowsToMembers(rows: string[][]): MemberRow[] {
  const cells = rows.map(r => r.map(c => String(c ?? '').trim())).filter(r => r.some(Boolean));
  if (!cells.length) return [];
  const headerAt = cells.findIndex(r => r.some(c => HEADERS.some(([, re]) => re.test(c))));
  let cols: Partial<Record<keyof MemberRow, number>> = { studentNumber: 0 };
  let body = cells;
  if (headerAt >= 0 && headerAt < 15) {
    cols = {};
    cells[headerAt].forEach((c, i) => {
      const hit = HEADERS.find(([key, re]) => re.test(c) && cols[key] === undefined);
      if (hit) cols[hit[0]] = i;
    });
    body = cells.slice(headerAt + 1);
  }
  const at = (r: string[], k: keyof MemberRow) => (cols[k] === undefined ? '' : r[cols[k]!] ?? '');
  const digits = (v: string) => v.replace(/[\s-]/g, '');
  return body
    .map(r => {
      const fromColumn = digits(at(r, 'studentNumber'));
      const studentNumber = /^\d{9}$/.test(fromColumn) ? fromColumn : (r.map(digits).find(c => /^\d{9}$/.test(c)) ?? '');
      return { studentNumber, firstName: at(r, 'firstName'), lastName: at(r, 'lastName'), email: at(r, 'email').toLowerCase() };
    })
    .filter(m => m.studentNumber);
}

async function readFile(file: File): Promise<string[][]> {
  if (/\.csv$/i.test(file.name) || file.type === 'text/csv') return parseCsv(await file.text());
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' }).map(r => r.map(c => String(c ?? '')));
}

function downloadTemplate() {
  const csv = 'Student number,First name,Last name,DLSU-D email\n202399001,Juan,Dela Cruz,jdc99001@dlsud.edu.ph\n';
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'member-list-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function MemberUploadDialog({ scholarships, getToken, onClose, onDone, adsoRole }: {
  scholarships: { id: string; name: string }[];
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onDone: () => void;
  adsoRole?: 'associate' | 'head' | 'director';
}) {
  // The AdSO's list is the Registrar's (no approval chain: the list is the decision).
  const registrarList = !!adsoRole;
  const [scholarshipId, setScholarshipId] = useState(scholarships[0]?.id ?? '');
  const [fileName, setFileName] = useState('');
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [approved, setApproved] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ added: string[]; skipped: { studentNumber: string; reason: string }[]; awaiting?: 'head' | 'director' } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const approver = OFFICE_FORMS[scholarshipId]?.approver ?? 'office head';

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setMembers(null);
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) { setError('Upload an Excel (.xlsx) or CSV file.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('The file must be under 5MB.'); return; }
    try {
      const list = rowsToMembers(await readFile(file));
      if (!list.length) { setError('No 9-digit student numbers were found in the file.'); return; }
      setFileName(file.name);
      setMembers(list);
    } catch {
      setError('That file couldn’t be read. Save it as .xlsx or .csv and try again.');
    }
  };

  const submit = async () => {
    if (!members?.length || !approved || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/applications/direct-award/bulk`, {
        method: 'POST',
        headers: { ...(await authHeaders(getToken)), 'Content-Type': 'application/json' },
        body: JSON.stringify({ scholarshipId, members, approved: true, note: note.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to add the members.');
      setResult({ added: body.added ?? [], skipped: body.skipped ?? [], awaiting: body.awaiting });
      if (body.added?.length) onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add the members.');
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <Modal title="Member list uploaded" onClose={onClose} size="md" footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm text-ink">
            <CheckCircle2 className="size-5 text-success-fg" aria-hidden />
            {result.awaiting
              ? `${result.added.length === 1 ? '1 student was' : `${result.added.length} students were`} added and sent to the ${result.awaiting === 'head' ? 'Head for a recommendation' : 'Director for approval'}. They become scholars once the Director approves them in Applications.`
              : <>{result.added.length === 1 ? '1 is now a scholar.' : `${result.added.length} are now scholars.`} We emailed them.</>}
          </p>
          {result.skipped.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-ink">{result.skipped.length} not added</p>
              <Table label="Members not added">
                <thead><tr><Th>Student number</Th><Th>Why</Th></tr></thead>
                <tbody>
                  {result.skipped.map((s, i) => <Tr key={`${s.studentNumber}-${i}`}><Td className="font-mono">{s.studentNumber || '—'}</Td><Td>{s.reason}</Td></Tr>)}
                </tbody>
              </Table>
            </div>
          )}
        </div>
      </Modal>
    );
  }

  const incomplete = (members ?? []).filter(m => !/^\d{9}$/.test(m.studentNumber)).length;
  return (
    <Modal
      title={adsoRole ? 'Upload list of scholars' : 'Upload member list'}
      description="Everyone on the list becomes a scholar and we email them. Anyone already a scholar is skipped."
      onClose={onClose}
      dismissible={!busy}
      size="md"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" icon={Upload} onClick={submit} loading={busy} disabled={!members?.length || !approved}>
            {registrarList
              ? (members?.length ? `Add ${members.length} ${members.length === 1 ? 'scholar' : 'scholars'}` : 'Add scholars')
              : (members?.length ? `Add ${members.length} ${members.length === 1 ? 'member' : 'members'}` : 'Add members')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error && <Alert tone="danger">{error}</Alert>}
        {scholarships.length > 1 && (
          <Field label="Scholarship">
            <Select value={scholarshipId} onChange={setScholarshipId}>
              {scholarships.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
        )}
        <div className="rounded-control border border-dashed border-line-strong p-4">
          <div className="flex flex-wrap items-center gap-3">
            <FileSpreadsheet className="size-8 shrink-0 text-ink-subtle" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{fileName || 'Excel or CSV file'}</p>
              <p className="text-xs text-ink-muted">
                {members
                  ? `${members.length} ${registrarList ? (members.length === 1 ? 'student' : 'students') : (members.length === 1 ? 'member' : 'members')} found`
                  : registrarList
                    ? 'The file from the Registrar, as it is. AniSkolar finds the student numbers in it.'
                    : 'Student number, and for members not yet on AniSkolar: first name, last name and DLSU-D email.'}
              </p>
            </div>
            <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={e => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
            <Button size="sm" icon={Upload} onClick={() => input.current?.click()} disabled={busy}>{members ? 'Choose another' : 'Choose file'}</Button>
          </div>
          {/* The Registrar's file comes as it is: no template for it. */}
          {!registrarList && (
            <button type="button" onClick={downloadTemplate} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline">
              <Download className="size-3.5" aria-hidden /> Download the template
            </button>
          )}
        </div>

        {members && members.length > 0 && (
          <div className="max-h-56 overflow-y-auto rounded-control border border-line">
            <Table label="Members to add">
              <thead><tr><Th>Student number</Th><Th>Name</Th><Th>Email</Th></tr></thead>
              <tbody>
                {members.slice(0, 100).map((m, i) => (
                  <Tr key={`${m.studentNumber}-${i}`}>
                    <Td className={`font-mono ${/^\d{9}$/.test(m.studentNumber) ? '' : 'text-danger'}`}>{m.studentNumber || 'Missing'}</Td>
                    <Td>{[m.firstName, m.lastName].filter(Boolean).join(' ') || '—'}</Td>
                    <Td>{m.email || '—'}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            {members.length > 100 && <p className="p-2 text-center text-xs text-ink-muted">and {members.length - 100} more</p>}
          </div>
        )}
        {incomplete > 0 && <Alert tone="warning">{incomplete === 1 ? '1 row doesn’t' : `${incomplete} rows don’t`} have a 9-digit student number and will be skipped.</Alert>}

        <Field label={registrarList ? 'Message to the scholars' : 'Message to the members'} optional>
          <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={2000} disabled={busy} placeholder={registrarList ? 'e.g. Congratulations on your Academic Scholarship!' : 'e.g. Thank you for your service this semester!'} />
        </Field>
        <Checkbox checked={approved} onChange={setApproved} disabled={busy} label={registrarList ? 'This is the Registrar’s list of students granted this scholarship' : `The ${approver} approved this list`} />
      </div>
    </Modal>
  );
}
