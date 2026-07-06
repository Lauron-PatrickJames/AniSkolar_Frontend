import React, { useState } from 'react';
import { Bell, User, LogOut, Settings, Shield, ChevronDown, Menu } from 'lucide-react';
import { StudentProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface NavbarProps {
  pageTitle: string;
  student: StudentProfile;
  onLogout: () => void;
  onNavigateToProfile: () => void;
  onToggleSidebar: () => void;
  id?: string;
}

interface NotificationItem {
  id: string;
  text: string;
  time: string;
  isRead: boolean;
}

export default function Navbar({
  pageTitle,
  student,
  onLogout,
  onNavigateToProfile,
  onToggleSidebar,
  id
}: NavbarProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    { id: 'n1', text: 'Your application for the Br. President Grant is under review.', time: '2 hours ago', isRead: false },
    { id: 'n2', text: 'Academic Scholarship application deadline is approaching soon.', time: '1 day ago', isRead: false },
    { id: 'n3', text: 'Welcome to the new AniSkolar Student Portal!', time: '3 days ago', isRead: true }
  ]);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, isRead: true })));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  return (
    <header id={id} className="h-16 glass-header px-4 md:px-6 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center space-x-3">
        {/* Toggle Sidebar Button (Mobile) */}
        <button
          onClick={onToggleSidebar}
          className="p-2 -ml-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 md:hidden focus:outline-hidden"
          aria-label="Toggle Sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Page Title */}
        <h1 className="font-display font-bold text-lg md:text-xl text-slate-800 tracking-tight">
          {pageTitle}
        </h1>
      </div>

      <div className="flex items-center space-x-4">
        {/* Notifications Popover */}
        <div className="relative">
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowProfileMenu(false);
            }}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors relative focus:outline-hidden"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white"></span>
            )}
          </button>

          <AnimatePresence>
            {showNotifications && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowNotifications(false)}></div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute right-0 mt-2 w-80 bg-white rounded-xl border border-slate-200 shadow-xl z-20 overflow-hidden"
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
                      notifications.map(item => (
                        <div
                          key={item.id}
                          className={`p-4 hover:bg-slate-50 transition-colors text-left flex items-start space-x-2.5 ${
                            !item.isRead ? 'bg-brand-green/3' : ''
                          }`}
                        >
                          <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${!item.isRead ? 'bg-brand-green' : 'bg-transparent'}`} />
                          <div>
                            <p className="text-xs text-slate-700 leading-normal">{item.text}</p>
                            <span className="text-[10px] text-slate-400 block mt-1">{item.time}</span>
                          </div>
                        </div>
                      ))
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
          <button
            onClick={() => {
              setShowProfileMenu(!showProfileMenu);
              setShowNotifications(false);
            }}
            className="flex items-center space-x-2 p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-left focus:outline-hidden"
          >
            <div className="w-8 h-8 rounded-full bg-brand-green text-white font-display font-bold text-xs flex items-center justify-center border border-emerald-100 shadow-inner">
              {student.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div className="hidden md:block">
              <p className="text-xs font-bold text-slate-700 leading-none">{student.name}</p>
              <p className="text-[10px] text-slate-400 font-medium leading-none mt-1">{student.studentNumber}</p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden md:block" />
          </button>

          <AnimatePresence>
            {showProfileMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowProfileMenu(false)}></div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute right-0 mt-2 w-56 bg-white rounded-xl border border-slate-200 shadow-xl z-20 py-1 divide-y divide-slate-100"
                >
                  <div className="p-4 text-left">
                    <p className="text-xs font-bold text-slate-800 leading-tight">{student.name}</p>
                    <p className="text-[10px] text-slate-500 truncate mt-1">{student.email}</p>
                    <p className="text-[10px] font-bold text-brand-green mt-1.5 px-1.5 py-0.5 rounded-sm bg-brand-green/10 inline-block">
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
                      <User className="w-4 h-4 text-slate-400" />
                      <span>My Profile</span>
                    </button>
                    <div className="w-full text-left px-4 py-2 text-xs text-slate-400 flex items-center space-x-2">
                      <Shield className="w-4 h-4 text-slate-300" />
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
                      <LogOut className="w-4 h-4 text-rose-400" />
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
