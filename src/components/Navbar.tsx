import React, { useState, useEffect } from 'react';
import { Bell, User, LogOut, Settings, Shield, ChevronDown, Menu } from 'lucide-react';
import { StudentProfile, Application } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { buildNotifications, markAllRead, markRead, clearAll, NotificationItem } from '../utils/notifications';

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
  id
}: NavbarProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false); // add this
  const [notifications, setNotifications] = useState<NotificationItem[]>(() =>
    buildNotifications(student, applications)
  );

  // Recompute whenever the student or their applications change (e.g. right
  // after a new submission, or an application status update from the office).
  useEffect(() => {
    setNotifications(buildNotifications(student, applications));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.studentNumber, applications]);

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

  // Clicking a notification: mark just that one read, close the dropdown,
  // then take the student to whatever it's about — the scholarship's
  // details/status if it has one, otherwise the grants list (welcome msg).
  const handleNotificationClick = (item: NotificationItem) => {
    if (!item.isRead) {
      markRead(student.studentNumber, item.id);
      setNotifications(prev => prev.map(n => (n.id === item.id ? { ...n, isRead: true } : n)));
    }
    setShowNotifications(false);

    if (item.scholarshipId) {
      onViewScholarship(item.scholarshipId);
    } else {
      onNavigate('explore');
    }
  };

  return (
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
                alt={student.name}
                onError={() => setAvatarFailed(true)}
                className="w-8 h-8 rounded-full object-cover border border-emerald-100 shadow-inner shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-brand-green text-white font-display font-bold text-xs flex items-center justify-center border border-emerald-100 shadow-inner shrink-0">
                {student.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="hidden md:block min-w-0">
              <p className="text-xs font-bold text-slate-700 leading-none truncate max-w-35">{student.name}</p>
              <p className="text-[10px] text-slate-400 font-medium leading-none mt-1">{student.studentNumber}</p>
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
                    <p className="text-xs font-bold text-slate-800 leading-tight truncate">{student.name}</p>
                    <p className="text-[10px] text-slate-500 truncate mt-1">{student.email}</p>
                    <p className="text-[10px] font-bold text-brand-green mt-1.5 px-1.5 py-0.5 rounded-sm bg-brand-green/10 inline-block truncate max-w-full">
                      {student.course}
                    </p>
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
  );
}