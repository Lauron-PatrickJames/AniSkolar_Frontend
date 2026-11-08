import React, { useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { Announcement, Application, StudentProfile } from '../../types';
import { DutyNotice, NotificationItem, buildNotifications, markAllRead, markRead } from '../../utils/notifications';
import { NotificationPreview } from '../../components/Navbar';

// Every notification, read or not. Nothing can be cleared: this is the
// student's record of what happened to their applications and duties.
export default function NotificationsPage({ student, applications, dutyNotice, announcements = [], onNavigate, onViewScholarship }: {
  student: StudentProfile;
  applications: Application[];
  dutyNotice: DutyNotice | null;
  announcements?: Announcement[];
  onNavigate: (page: string) => void;
  onViewScholarship: (scholarshipId: string) => void;
}) {
  const build = () => buildNotifications(student, applications, dutyNotice, { includeCleared: true, announcements });
  const [items, setItems] = useState<NotificationItem[]>(build);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [preview, setPreview] = useState<NotificationItem | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setItems(build()), [student.studentNumber, applications, dutyNotice?.termKey, dutyNotice?.complete, dutyNotice?.evaluated, announcements]);

  const unread = items.filter(n => !n.isRead).length;
  const shown = filter === 'unread' ? items.filter(n => !n.isRead) : items;

  const open = (item: NotificationItem) => {
    if (!item.isRead) {
      markRead(student.studentNumber, item.id);
      setItems(prev => prev.map(n => (n.id === item.id ? { ...n, isRead: true } : n)));
    }
    setPreview(item);
  };
  const go = () => {
    if (!preview) return;
    const target = preview;
    setPreview(null);
    if (target.page) onNavigate(target.page);
    else if (target.scholarshipId) onViewScholarship(target.scholarshipId);
    else onNavigate('explore');
  };
  const readAll = () => {
    markAllRead(student.studentNumber, items.map(n => n.id));
    setItems(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {preview && <NotificationPreview item={preview} onClose={() => setPreview(null)} onOpen={go} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-slate-100 p-1 text-sm font-semibold" role="tablist" aria-label="Show">
          {(['all', 'unread'] as const).map(f => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3.5 py-1.5 transition-colors ${filter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {f === 'all' ? `All (${items.length})` : `Unread (${unread})`}
            </button>
          ))}
        </div>
        {unread > 0 && (
          <button type="button" onClick={readAll} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-green hover:bg-brand-green/10">
            <CheckCheck className="h-4 w-4" /> Mark all as read
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <Bell className="h-8 w-8 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">{filter === 'unread' ? 'You’re all caught up' : 'No notifications yet'}</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map(item => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  className={`flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50 focus:outline-hidden focus-visible:bg-slate-50 ${item.isRead ? '' : 'bg-brand-green/3'}`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.isRead ? 'bg-transparent' : 'bg-brand-green'}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${item.isRead ? 'font-medium text-slate-700' : 'font-bold text-slate-900'}`}>{item.title}</span>
                    <span className="mt-0.5 block text-sm text-slate-600">{item.text}</span>
                    <span className="mt-1 block text-xs text-slate-400">{item.time}{item.isRead ? '' : ' · Unread'}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
