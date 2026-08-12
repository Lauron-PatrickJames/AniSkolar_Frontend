import React from 'react';
import { ShieldCheck, LogOut } from 'lucide-react';

interface AdminDashboardProps {
  onLogout: () => void;
}

export default function AdminDashboard({ onLogout }: AdminDashboardProps) {
  return (
    <div className="min-h-screen bg-[#f1f5f9] flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 sm:px-10 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-green/10 flex items-center justify-center">
            <ShieldCheck className="w-4.5 h-4.5 text-brand-green" />
          </div>
          <span className="font-display font-bold text-slate-900">AniSkolar Admin</span>
        </div>
        <button
          onClick={onLogout}
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-rose-600 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Log out
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="text-center space-y-2 max-w-md">
          <h1 className="font-display font-extrabold text-2xl text-slate-900">Admin Dashboard</h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            Placeholder — build out scholarship review, applicant management,
            and announcement tools here.
          </p>
        </div>
      </main>
    </div>
  );
}