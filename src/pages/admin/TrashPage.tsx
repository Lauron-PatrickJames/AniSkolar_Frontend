import React, { useCallback, useEffect, useState } from 'react';
import { Calculator, CalendarDays, FileImage, FileText, Megaphone, MessageSquareText, RotateCcw, Trash2 } from 'lucide-react';
import { API_BASE_URL, authHeaders, formatDateTime } from './adminData';
import { Alert, Button, Card, ConfirmDialog, EmptyState, ErrorState, MobileList, PageHeader, Table, TableSkeleton, Td, Th, Toast, Tr } from './AdminUI';
import { OFFICE_SHORT_LABELS } from '../../data/scholarships';
import { ScholarshipOffice } from '../../types';

// The Trash (backend routes/trash.js): announcements, duty events,
// attendance sheets, FSE reports, created scholarships and message
// templates deleted in the last 30 days. Restore puts one back as it was;
// after 30 days it's deleted for good. Each office sees its own; the AdSO
// sees everything.

interface TrashRow {
  id: string;
  kind: 'announcement' | 'dutyEvent' | 'attendanceSheet' | 'fseReport' | 'scholarship' | 'replyTemplate';
  title: string;
  office: string;
  deletedAt: string;
  deletedBy: string | null;
  purgeAt: string;
}

const KINDS: Record<TrashRow['kind'], { label: string; icon: React.ElementType }> = {
  announcement: { label: 'Announcement', icon: Megaphone },
  dutyEvent: { label: 'Duty event', icon: CalendarDays },
  attendanceSheet: { label: 'Attendance sheet', icon: FileImage },
  fseReport: { label: 'FSE report', icon: Calculator },
  scholarship: { label: 'Scholarship', icon: FileText },
  replyTemplate: { label: 'Message template', icon: MessageSquareText },
};

const daysLeft = (purgeAt: string) => Math.max(0, Math.ceil((new Date(purgeAt).getTime() - Date.now()) / 86_400_000));

export default function TrashPage({ getToken, isAdso }: { getToken: () => Promise<string | null>; isAdso: boolean }) {
  const [items, setItems] = useState<TrashRow[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [toast, setToast] = useState('');
  const [confirmPurge, setConfirmPurge] = useState<TrashRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/trash`, { headers: await authHeaders(getToken) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to load the Trash.');
      setItems(body.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the Trash.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { load(); }, [load]);

  const restore = async (item: TrashRow) => {
    setBusy(item.id);
    setActionError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/trash/${item.id}/restore`, { method: 'POST', headers: await authHeaders(getToken) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't restore it.");
      setItems(prev => prev?.filter(i => i.id !== item.id) ?? prev);
      setToast(`Restored “${item.title}”.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't restore it.");
    } finally {
      setBusy(null);
    }
  };

  const purge = async (item: TrashRow) => {
    setBusy(item.id);
    setActionError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/trash/${item.id}`, { method: 'DELETE', headers: await authHeaders(getToken) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't delete it.");
      setItems(prev => prev?.filter(i => i.id !== item.id) ?? prev);
      setConfirmPurge(null);
      setToast(`Deleted “${item.title}” for good.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't delete it.");
      setConfirmPurge(null);
    } finally {
      setBusy(null);
    }
  };

  const officeLabel = (code: string) => OFFICE_SHORT_LABELS[code as ScholarshipOffice] ?? code;
  const actions = (item: TrashRow) => (
    <div className="flex items-center justify-end gap-2">
      <Button size="sm" icon={RotateCcw} onClick={() => restore(item)} loading={busy === item.id} disabled={!!busy}>Restore</Button>
      <Button size="sm" variant="danger-secondary" icon={Trash2} onClick={() => setConfirmPurge(item)} disabled={!!busy}>Delete forever</Button>
    </div>
  );

  return (
    <>
      <PageHeader title="Trash" description="Deleted items are kept here for 30 days, then deleted for good. Restore puts one back exactly as it was." />
      {actionError && <div className="mb-4"><Alert tone="danger">{actionError}</Alert></div>}
      <Card flush>
        {!items && loading ? (
          <TableSkeleton label="Loading the Trash" />
        ) : !items && error ? (
          <ErrorState title="Couldn't load the Trash" message={error} onRetry={load} retrying={loading} />
        ) : !items?.length ? (
          <EmptyState icon={Trash2} title="The Trash is empty" description="Deleted announcements, events, attendance sheets, FSE reports, scholarships and message templates show up here." />
        ) : (
          <>
            <div className="hidden lg:block">
              <Table label="Deleted items" minWidth="52rem">
                <thead>
                  <tr>
                    <Th sticky={false}>Item</Th>
                    {isAdso && <Th sticky={false} className="w-28">Office</Th>}
                    <Th sticky={false} className="w-56">Deleted</Th>
                    <Th sticky={false} className="w-32">Kept for</Th>
                    <Th sticky={false} className="w-72"><span className="sr-only">Actions</span></Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const Kind = KINDS[item.kind];
                    const left = daysLeft(item.purgeAt);
                    return (
                      <Tr key={item.id}>
                        <Td>
                          <div className="flex min-w-0 items-center gap-3">
                            <Kind.icon className="size-4 shrink-0 text-ink-subtle" aria-hidden />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-ink" title={item.title}>{item.title}</p>
                              <p className="text-xs text-ink-subtle">{Kind.label}</p>
                            </div>
                          </div>
                        </Td>
                        {isAdso && <Td>{officeLabel(item.office)}</Td>}
                        <Td>
                          <span className="block text-sm">{formatDateTime(item.deletedAt)}</span>
                          {item.deletedBy && <span className="block truncate text-xs text-ink-subtle">by {item.deletedBy}</span>}
                        </Td>
                        <Td><span className={left <= 3 ? 'text-warning-fg' : ''}>{left === 0 ? 'Less than a day' : `${left} more day${left === 1 ? '' : 's'}`}</span></Td>
                        <Td>{actions(item)}</Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
            <MobileList>
              {items.map(item => {
                const Kind = KINDS[item.kind];
                const left = daysLeft(item.purgeAt);
                return (
                  <li key={item.id} className="space-y-2 px-4 py-3">
                    <div className="flex items-start gap-3">
                      <Kind.icon className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">{item.title}</p>
                        <p className="text-xs text-ink-subtle">
                          {[Kind.label, isAdso ? officeLabel(item.office) : null, `deleted ${formatDateTime(item.deletedAt)}`, left === 0 ? 'less than a day left' : `${left} day${left === 1 ? '' : 's'} left`].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                    {actions(item)}
                  </li>
                );
              })}
            </MobileList>
          </>
        )}
      </Card>

      {confirmPurge && (
        <ConfirmDialog
          title={`Delete “${confirmPurge.title}” for good?`}
          description={confirmPurge.kind === 'announcement'
            ? 'It can’t be restored after this. Its images are deleted too, and its Facebook post is removed if it was shared there.'
            : 'It can’t be restored after this, and any files with it are deleted too.'}
          confirmLabel="Delete forever"
          tone="danger"
          busy={busy === confirmPurge.id}
          onConfirm={() => purge(confirmPurge)}
          onCancel={() => { if (!busy) setConfirmPurge(null); }}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}
