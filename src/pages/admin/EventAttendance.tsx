import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, FileText, Printer, Trash2, Upload } from 'lucide-react';
import { CreditedEvent, formatDutyDate, formatHours, termLabel, todayInManila, weekday } from '../../utils/dutyHours';
import { API_BASE_URL, authHeaders, titleCaseName } from './adminData';
import { Alert, Badge, Button, Checkbox, EmptyState, Modal, SearchInput, TableSkeleton, Textarea } from './AdminUI';

// Event attendance (Nov 2026): the AdSO prints a blank attendance sheet,
// scholars sign it at the event, and afterwards the AdSO uploads the signed
// sheets and ticks who attended. Ticking credits the scholar the event's
// hours; unticking takes the credit away. Backend: the attendance routes
// in routes/dutyHours.js.

type GetToken = () => Promise<string | null>;

export interface EventSheet { fileId: string; filename: string; mimetype: string; size: number; uploadedAt: string }
export interface AttendanceEvent extends CreditedEvent { sheets: EventSheet[]; attendanceSavedAt: string | null }
interface AttendanceScholar { studentNumber: string; name: string; program: string; yearLevel: string; attended: boolean }

const ROWS = 40;
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// A blank sheet to print and bring to the event: numbered rows to write the
// student number, name, program and year, time in and out, and sign.
export function printAttendanceSheet(event: CreditedEvent) {
  const win = window.open('', '_blank');
  if (!win) return false;
  const rows = Array.from({ length: ROWS }, (_, i) => `<tr><td class="n">${i + 1}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`).join('');
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Attendance – ${esc(event.name)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; font-size: 11px; }
  header { text-align: center; margin-bottom: 8px; }
  header p { margin: 0; }
  .school { font-weight: bold; font-size: 12px; letter-spacing: .02em; }
  .office { font-size: 11px; }
  h1 { font-size: 16px; margin: 6px 0 2px; text-transform: uppercase; letter-spacing: .04em; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 16px; margin: 8px 0; font-size: 11px; }
  .meta b { display: inline-block; min-width: 80px; }
  .note { font-size: 10px; margin: 0 0 6px; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th, td { border: 1px solid #333; padding: 0 4px; height: 22px; text-align: left; }
  th { background: #e8f1ec; font-size: 10px; height: 26px; }
  td.n, th.n { width: 26px; text-align: center; }
  .sn { width: 92px; } .prog { width: 96px; } .time { width: 54px; } .sig { width: 110px; }
  tr { page-break-inside: avoid; }
  footer { margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; font-size: 11px; }
  footer div { border-top: 1px solid #333; padding-top: 3px; }
  @media screen { body { max-width: 210mm; margin: 12px auto; } .print { position: fixed; top: 12px; right: 12px; padding: 8px 14px; } }
  @media print { .print { display: none; } }
</style></head><body>
<button class="print" onclick="window.print()">Print</button>
<header>
  <p class="school">DE LA SALLE UNIVERSITY-DASMARIÑAS</p>
  <p class="office">Admissions and Scholarship Office</p>
  <h1>SFAG Scholars' Attendance Sheet</h1>
</header>
<div class="meta">
  <div><b>Event:</b> ${esc(event.name)}</div>
  <div><b>Date:</b> ${esc(`${weekday(event.date)}, ${formatDutyDate(event.date, true)}`)}</div>
  <div><b>Organized by:</b> ${esc(event.organizer)}</div>
  <div><b>Credit:</b> ${esc(formatHours(event.creditHours))} duty hours</div>
</div>
<p class="note">Write your 9-digit student number clearly: it's how you're credited in AniSkolar. Sign once you arrive; the duty hours count once the scholarship office checks this sheet.</p>
<table>
  <thead><tr><th class="n">No.</th><th class="sn">Student number</th><th>Name (Last name, First name)</th><th class="prog">Program &amp; year</th><th class="time">Time in</th><th class="time">Time out</th><th class="sig">Signature</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<footer><div>Checked by (name and signature)</div><div>Date checked</div></footer>
<script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body></html>`);
  win.document.close();
  return true;
}

async function sheetUrl(eventId: string, fileId: string, getToken: GetToken): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/duty-hours/admin/events/${eventId}/sheets/${fileId}`, { headers: await authHeaders(getToken) });
  if (!res.ok) throw new Error('Couldn’t open the sheet.');
  return URL.createObjectURL(await res.blob());
}

export default function AttendanceDialog({ event: initialEvent, term, getToken, onClose, onChanged }: {
  event: AttendanceEvent;
  term: { academicYear: number; term: string };
  getToken: GetToken;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [event, setEvent] = useState(initialEvent);
  const [scholars, setScholars] = useState<AttendanceScholar[] | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [paste, setPaste] = useState('');
  const [pasteNote, setPasteNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [changed, setChanged] = useState(false);
  const [viewing, setViewing] = useState<string | null>(initialEvent.sheets[0]?.fileId ?? null);
  const [preview, setPreview] = useState<{ fileId: string; url: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const upcoming = event.date > todayInManila();

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/duty-hours/admin/events/${initialEvent._id}/attendance`, { headers: await authHeaders(getToken) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to load the scholars.');
      setEvent(body.event);
      setScholars(body.scholars);
      const attended = new Set<string>(body.scholars.filter((s: AttendanceScholar) => s.attended).map((s: AttendanceScholar) => s.studentNumber));
      setTicked(attended);
      setSaved(attended);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the scholars.');
    }
  }, [getToken, initialEvent._id]);
  useEffect(() => { load(); }, [load]);

  // The sheet being looked at, shown beside the list (images inline).
  useEffect(() => {
    const sheet = event.sheets.find(s => s.fileId === viewing);
    if (!sheet || sheet.mimetype === 'application/pdf') { setPreview(null); return; }
    let cancelled = false;
    let url: string | null = null;
    sheetUrl(event._id, sheet.fileId, getToken).then(u => { if (cancelled) URL.revokeObjectURL(u); else { url = u; setPreview({ fileId: sheet.fileId, url: u }); } }).catch(() => setPreview(null));
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [viewing, event._id, event.sheets, getToken]);

  const openSheet = async (fileId: string) => {
    const win = window.open('', '_blank');
    try {
      const url = await sheetUrl(event._id, fileId, getToken);
      if (win) win.location.href = url; else window.location.href = url;
    } catch (err) {
      win?.close();
      setError(err instanceof Error ? err.message : 'Couldn’t open the sheet.');
    }
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy('upload');
    setError('');
    try {
      const data = new FormData();
      Array.from(files).forEach(f => data.append('sheets', f));
      const res = await fetch(`${API_BASE_URL}/api/duty-hours/admin/events/${event._id}/sheets`, { method: 'POST', headers: await authHeaders(getToken), body: data });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to upload the sheets.');
      setEvent(e => ({ ...e, sheets: body.event.sheets }));
      if (!viewing) setViewing(body.event.sheets[0]?.fileId ?? null);
      setChanged(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload the sheets.');
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeSheet = async (sheet: EventSheet) => {
    if (!window.confirm(`Remove "${sheet.filename}"? Who's ticked as attended stays as it is.`)) return;
    setBusy(`del-${sheet.fileId}`);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/duty-hours/admin/events/${event._id}/sheets/${sheet.fileId}`, { method: 'DELETE', headers: await authHeaders(getToken) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to remove the sheet.');
      setEvent(e => ({ ...e, sheets: body.event.sheets }));
      if (viewing === sheet.fileId) setViewing(body.event.sheets[0]?.fileId ?? null);
      setChanged(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove the sheet.');
    } finally {
      setBusy(null);
    }
  };

  // Student numbers typed or pasted from the sheet: tick the ones on the list.
  const addPasted = () => {
    const numbers = [...new Set(paste.match(/\d{9}/g) ?? [])];
    if (!numbers.length) { setPasteNote('No 9-digit student numbers found.'); return; }
    const known = new Set((scholars ?? []).map(s => s.studentNumber));
    const found = numbers.filter(n => known.has(n));
    const unknown = numbers.filter(n => !known.has(n));
    setTicked(t => new Set([...t, ...found]));
    setPaste('');
    setPasteNote(`Ticked ${found.length}.${unknown.length ? ` Not an SFAG scholar this term: ${unknown.join(', ')}.` : ''}`);
  };

  const toggle = (n: string, on: boolean) => setTicked(t => { const next = new Set(t); if (on) next.add(n); else next.delete(n); return next; });
  const dirty = ticked.size !== saved.size || [...ticked].some(n => !saved.has(n));

  const save = async () => {
    setBusy('save');
    setError('');
    setNotice('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/duty-hours/admin/events/${event._id}/attendance`, {
        method: 'PUT',
        headers: await authHeaders(getToken, true),
        body: JSON.stringify({ studentNumbers: [...ticked] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to save the attendance.');
      setSaved(new Set(ticked));
      setEvent(e => ({ ...e, attendanceSavedAt: body.event.attendanceSavedAt }));
      setChanged(true);
      setNotice(`Saved. ${body.attended} scholar${body.attended === 1 ? '' : 's'} credited ${formatHours(event.creditHours)} hours${body.uncredited ? `; ${body.uncredited} no longer credited` : ''}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the attendance.');
    } finally {
      setBusy(null);
    }
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (scholars ?? []).filter(s => !q || s.studentNumber.includes(q) || s.name.toLowerCase().includes(q));
  }, [scholars, query]);

  const close = () => {
    if (dirty && !window.confirm('Leave without saving who attended?')) return;
    if (changed) onChanged();
    onClose();
  };
  const viewingSheet = event.sheets.find(s => s.fileId === viewing);

  return (
    <Modal
      size="xl"
      title={`Attendance: ${event.name}`}
      description={`${weekday(event.date)}, ${formatDutyDate(event.date, true)} · ${event.organizer} · ${formatHours(event.creditHours)} hours · ${termLabel(term)}`}
      onClose={close}
      dismissible={!busy}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-ink-muted">{ticked.size} of {scholars?.length ?? 0} ticked{dirty ? ' · not saved' : ''}</span>
          <div className="flex gap-2">
            <Button onClick={close} disabled={!!busy}>Close</Button>
            <Button variant="primary" onClick={save} loading={busy === 'save'} disabled={!dirty || upcoming || !!busy && busy !== 'save'}>Save attendance</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}
        {upcoming && <Alert tone="info">This event hasn’t happened yet. Print the sheet now; check attendance after the event.</Alert>}
        <div className="grid gap-5 lg:grid-cols-2">
          {/* The signed sheets */}
          <section className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">Signed sheets</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" icon={Printer} onClick={() => printAttendanceSheet(event)}>Print blank sheet</Button>
                <Button size="sm" icon={Upload} onClick={() => fileRef.current?.click()} loading={busy === 'upload'}>Upload</Button>
                <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" multiple className="hidden" onChange={e => upload(e.target.files)} />
              </div>
            </div>
            {event.sheets.length === 0 ? (
              <EmptyState icon={FileText} title="No sheets uploaded" description="After the event, upload photos or scans of the signed sheets (JPG, PNG or PDF)." />
            ) : (
              <>
                <ul className="flex flex-wrap gap-2">
                  {event.sheets.map((s, i) => (
                    <li key={s.fileId}>
                      <button
                        type="button"
                        onClick={() => setViewing(s.fileId)}
                        className={`rounded-control px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${viewing === s.fileId ? 'bg-accent-subtle text-accent ring-accent' : 'text-ink-muted ring-line hover:bg-surface-muted'}`}
                        title={s.filename}
                      >
                        Sheet {i + 1}{s.mimetype === 'application/pdf' ? ' (PDF)' : ''}
                      </button>
                    </li>
                  ))}
                </ul>
                {viewingSheet && (
                  <div className="space-y-2">
                    <div className="overflow-auto rounded-control bg-surface-muted ring-1 ring-line max-h-[55vh]">
                      {viewingSheet.mimetype === 'application/pdf'
                        ? <div className="p-6 text-center text-sm text-ink-muted">PDF sheets open in a new tab.</div>
                        : preview?.fileId === viewingSheet.fileId
                          ? <img src={preview.url} alt={`Signed sheet: ${viewingSheet.filename}`} className="w-full" />
                          : <div className="p-6"><TableSkeleton rows={3} label="Loading the sheet" /></div>}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="truncate text-xs text-ink-subtle">{viewingSheet.filename}</span>
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => openSheet(viewingSheet.fileId)}>Open</Button>
                        <Button size="sm" variant="ghost" icon={Trash2} onClick={() => removeSheet(viewingSheet)} loading={busy === `del-${viewingSheet.fileId}`}>Remove</Button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Who attended */}
          <section className="min-w-0 space-y-3">
            <h3 className="text-sm font-semibold text-ink">Who attended</h3>
            <div className="space-y-2">
              <Textarea value={paste} onChange={e => { setPaste(e.target.value); setPasteNote(''); }} rows={2} placeholder="Type or paste student numbers from the sheet, e.g. 202312345 202398765" aria-label="Student numbers from the sheet" disabled={upcoming} />
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={addPasted} disabled={!paste.trim() || upcoming}>Tick these</Button>
                {pasteNote && <span className="text-xs text-ink-muted">{pasteNote}</span>}
              </div>
            </div>
            <SearchInput value={query} onChange={setQuery} placeholder="Search name or student no." label="Search scholars" />
            {!scholars ? <TableSkeleton rows={5} label="Loading scholars" /> : scholars.length === 0 ? (
              <p className="text-sm text-ink-muted">No SFAG scholars this term.</p>
            ) : (
              <ul className="max-h-[45vh] divide-y divide-line overflow-y-auto rounded-control ring-1 ring-line">
                {shown.map(s => (
                  <li key={s.studentNumber} className="flex items-center justify-between gap-2 px-3 py-2">
                    <Checkbox
                      checked={ticked.has(s.studentNumber)}
                      onChange={on => toggle(s.studentNumber, on)}
                      disabled={upcoming}
                      label={<span>{s.name ? titleCaseName(s.name) : s.studentNumber} <span className="text-ink-subtle">· {s.studentNumber}</span></span>}
                      description={[s.program, s.yearLevel].filter(Boolean).join(' · ') || undefined}
                    />
                    {saved.has(s.studentNumber) && <Badge tone="success">Credited</Badge>}
                  </li>
                ))}
                {shown.length === 0 && <li className="px-3 py-4 text-sm text-ink-muted">No one matches.</li>}
              </ul>
            )}
          </section>
        </div>
      </div>
    </Modal>
  );
}
