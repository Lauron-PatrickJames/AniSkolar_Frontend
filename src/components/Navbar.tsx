import React, { useState, useEffect } from 'react';
import { Bell, User, LogOut, Settings, Shield, ChevronDown, Menu, X, ArrowRight } from 'lucide-react';
import { StudentProfile, Application } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { buildNotifications, markAllRead, markRead, clearAll, NotificationItem, DutyNotice } from '../utils/notifications';
import { displayName, nameInitials } from '../utils/names';

interface NavbarProps {
  pageTitle: string;
  student: StudentProfile;
  applications: Application[];
  onLogout: () => void;
  onNavigateToProfile: () => void;
  onToggleSidebar: () => void;
  // Fired when a notification tied to a specific scholarship is clicked —
  // takes the student straight to that scholarship's details/status.
  onViewScholarship: (scholarshipId: string) => void;
  // Fired for notifications with no specific scholarship (e.g. the welcome
  // message) — sends the student to browse available grants instead.
  onNavigate: (page: string) => void;
  // Scholarships held now, shown as a "Scholar" badge.
  heldScholarships?: { scholarshipId: string; scholarshipName: string }[];
  // This semester's duty hours (SFAG scholars), for the hours-done notice.
  dutyNotice?: DutyNotice | null;
  id?: string;
}

// Shared spring-like ease for dropdown open/close — gives a soft, deliberate
// motion instead of Framer's very fast default transition.
const dropdownTransition = { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const };

export default function Navbar({
  pageTitle,
  student,
  applications,
  onLogout,
  onNavigateToProfile,
  onToggleSidebar,
  onViewScholarship,
  onNavigate,
  heldScholarships = [],
  dutyNotice = null,
  id
}: NavbarProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  // Title case for display ("Patrick James Secuya Lauron"); the full name
  // shows on hover where it's truncated.
  const fullName = displayName(student);
  const [notifications, setNotifications] = useState<NotificationItem[]>(() =>
    buildNotifications(student, applications, dutyNotice)
  );

  // Recompute whenever the student or their applications change (e.g. right
  // after a new submission, or an application status update from the office).
  useEffect(() => {
    setNotifications(buildNotifications(student, applications, dutyNotice));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.studentNumber, applications, dutyNotice?.termKey, dutyNotice?.complete, dutyNotice?.evaluated]);

  const unreadCount = notifications.filter(n => !n.isRead).length;
  // Cap the displayed number so the badge doesn't stretch out of shape.
  const badgeLabel = unreadCount > 9 ? '9+' : String(unreadCount);

  const markAllAsRead = () => {
    markAllRead(student.studentNumber, notifications.map(n => n.id));
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const clearNotifications = () => {
    clearAll(student.studentNumber, notifications.map(n => n.id));
    setNotifications([]);
  };

  // Clicking a notification: mark it read and open its preview pop-up
  // (full message, the office's note); the pop-up's button then takes the
  // student to the scholarship, or to Explore for the welcome message.
  const [preview, setPreview] = useState<NotificationItem | null>(null);
  const handleNotificationClick = (item: NotificationItem) => {
    if (!item.isRead) {
      markRead(student.studentNumber, item.id);
      setNotifications(prev => prev.map(n => (n.id === item.id ? { ...n, isRead: true } : n)));
    }
    setShowNotifications(false);
    setPreview(item);
  };
  const openPreviewTarget = () => {
    if (!preview) return;
    const target = preview;
    setPreview(null);
    if (target.page) onNavigate(target.page);
    else if (target.scholarshipId) onViewScholarship(target.scholarshipId);
    else onNavigate('explore');
  };

  return (
    <>
    {preview && <NotificationPreview item={preview} onClose={() => setPreview(null)} onOpen={openPreviewTarget} />}
    <header id={id} className="h-16 glass-header px-3 sm:px-4 md:px-6 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
        {/* Toggle Sidebar Button (Mobile) */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onToggleSidebar}
          className="p-2 -ml-1 sm:-ml-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 md:hidden focus:outline-hidden shrink-0"
          aria-label="Toggle Sidebar"
        >
          <Menu className="w-5 h-5" />
        </motion.button>

        {/* Page Title */}
        <div className="overflow-hidden min-w-0">
          <AnimatePresence mode="wait">
            <motion.h1
              key={pageTitle}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="font-display font-bold text-base sm:text-lg md:text-xl text-slate-800 tracking-tight truncate"
            >
              {pageTitle}
            </motion.h1>
          </AnimatePresence>
        </div>
      </div>

      <div className="flex items-center space-x-2 sm:space-x-4 shrink-0">
        {/* Notifications Popover */}
        <div className="relative">
          <motion.button
            whileTap={{ scale: 0.9 }}
            animate={unreadCount > 0 ? { rotate: [0, -12, 10, -6, 0] } : {}}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowProfileMenu(false);
            }}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors relative focus:outline-hidden"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                className="absolute -top-1 -right-1 min-w-4.5 h-4.5 px-1 rounded-full bg-rose-500 ring-2 ring-white text-white text-[10px] font-bold leading-none flex items-center justify-center"
              >
                {badgeLabel}
              </motion.span>
            )}
          </motion.button>

          <AnimatePresence>
            {showNotifications && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowNotifications(false)}></div>
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.97 }}
                  transition={dropdownTransition}
                  style={{ transformOrigin: 'top right' }}
                  className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-16 sm:top-auto sm:mt-2 w-auto sm:w-80 bg-white rounded-xl border border-slate-200 shadow-xl z-20 overflow-hidden"
                >
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <span className="font-display font-semibold text-sm text-slate-800">Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className="text-xs text-brand-green font-medium hover:text-brand-green-dark"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 text-sm">
                        No notifications
                      </div>
                    ) : (
                      <AnimatePresence initial={false}>
                        {notifications.map((item, idx) => (
                          <motion.button
                            key={item.id}
                            type="button"
                            onClick={() => handleNotificationClick(item)}
                            layout
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0 }}
                            transition={{ duration: 0.18, delay: idx * 0.03, ease: 'easeOut' }}
                            className={`w-full p-4 hover:bg-slate-50 transition-colors text-left flex items-start space-x-2.5 focus:outline-hidden focus:bg-slate-50 ${
                              !item.isRead ? 'bg-brand-green/3' : ''
                            }`}
                          >
                            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${!item.isRead ? 'bg-brand-green' : 'bg-transparent'}`} />
                            <div className="min-w-0">
                              <p className="text-xs text-slate-700 leading-normal wrap-break-word">{item.text}</p>
                              <span className="text-[10px] text-slate-400 block mt-1">{item.time}</span>
                            </div>
                          </motion.button>
                        ))}
                      </AnimatePresence>
                    )}
                  </div>

                  {notifications.length > 0 && (
                    <div className="p-2 border-t border-slate-100 bg-slate-50 text-center">
                      <button
                        onClick={clearNotifications}
                        className="text-xs text-slate-500 hover:text-slate-700 font-medium w-full py-1"
                      >
                        Clear all
                      </button>
                    </div>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Profile Dropdown Menu */}
        <div className="relative">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              setShowProfileMenu(!showProfileMenu);
              setShowNotifications(false);
            }}
            className="flex items-center space-x-2 p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-left focus:outline-hidden"
          >
            {student.avatarUrl && !avatarFailed ? (
              <img
                src={student.avatarUrl}
                alt=""
                onError={() => setAvatarFailed(true)}
                className="w-8 h-8 rounded-full object-cover border border-emerald-100 shadow-inner shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-brand-green text-white font-display font-bold text-xs flex items-center justify-center border border-emerald-100 shadow-inner shrink-0">
                {nameInitials(fullName)}
              </div>
            )}
            <div className="hidden md:block min-w-0">
              <p className="text-xs font-bold text-slate-700 leading-none truncate max-w-40" title={fullName}>{fullName}</p>
              <p className="text-[10px] text-slate-400 font-medium leading-none mt-1">
                {student.studentNumber}
                {heldScholarships.length > 0 && <span className="ml-1.5 rounded-sm bg-emerald-50 px-1 py-px font-bold text-brand-green ring-1 ring-emerald-100">Scholar</span>}
              </p>
            </div>
            <motion.div
              animate={{ rotate: showProfileMenu ? 180 : 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="hidden md:block"
            >
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </motion.div>
          </motion.button>

          <AnimatePresence>
            {showProfileMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowProfileMenu(false)}></div>
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.97 }}
                  transition={dropdownTransition}
                  style={{ transformOrigin: 'top right' }}
                  className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-16 sm:top-auto sm:mt-2 w-auto sm:w-56 bg-white rounded-xl border border-slate-200 shadow-xl z-20 py-1 divide-y divide-slate-100"
                >
                  <div className="p-4 text-left min-w-0">
                    <p className="text-xs font-bold text-slate-800 leading-tight truncate" title={fullName}>{fullName}</p>
                    <p className="text-[10px] text-slate-500 truncate mt-1" title={student.email}>{student.email}</p>
                    <p className="text-[10px] font-bold text-brand-green mt-1.5 px-1.5 py-0.5 rounded-sm bg-brand-green/10 inline-block truncate max-w-full">
                      {student.course}
                    </p>
                    {heldScholarships.length > 0 && (
                      <p className="mt-1.5 text-[10px] font-semibold text-slate-600">Scholar · {heldScholarships.map(h => h.scholarshipName).join(', ')}</p>
                    )}
                  </div>

                  <div className="py-1">
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        onNavigateToProfile();
                      }}
                      className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-2"
                    >
                      <User className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>My Profile</span>
                    </button>
                    <div className="w-full text-left px-4 py-2 text-xs text-slate-400 flex items-center space-x-2">
                      <Shield className="w-4 h-4 text-slate-300 shrink-0" />
                      <span>Security Settings</span>
                    </div>
                  </div>

                  <div className="py-1">
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        onLogout();
                      }}
                      className="w-full text-left px-4 py-2 text-xs text-rose-600 hover:bg-rose-50 flex items-center space-x-2 font-medium"
                    >
                      <LogOut className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>Log Out</span>
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
    </>
  );
}
const STATUS_STYLE: Record<string, string> = {
  Approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
  'Needs Revision': 'bg-amber-50 text-amber-800 ring-amber-200',
  'Under Evaluation': 'bg-sky-50 text-sky-700 ring-sky-200',
};

// The pop-up a notification opens: the whole message, its status and the
// office's note, with a button to go to what it's about.
function NotificationPreview({ item, onClose, onOpen }: { item: NotificationItem; onClose: () => void; onOpen: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="notif-preview-title">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden />
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div className="min-w-0 space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Notification · {item.time}</p>
            <h2 id="notif-preview-title" className="font-display text-base font-bold text-slate-900">{item.title}</h2>
            {item.status && (
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLE[item.status] ?? 'bg-slate-50 text-slate-600 ring-slate-200'}`}>{item.status}</span>
            )}
          </div>
          <button type="button" onClick={onClose} autoFocus className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-sm leading-relaxed text-slate-700">{item.text}</p>
          {item.note && (
            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <p className="mb-1 text-xs font-semibold text-slate-500">Message from the office</p>
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-800">{item.note}</p>
            </div>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 p-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green">Close</button>
          <button type="button" onClick={onOpen} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-green px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-green-dark focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2">
            {item.page === 'duty-hours' ? 'Open Duty Hours' : item.scholarshipId ? 'View application' : 'Explore scholarships'}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
