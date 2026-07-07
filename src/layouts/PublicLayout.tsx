import React from 'react';
import { ShieldCheck, User } from 'lucide-react';
import Footer from '../components/Footer';
import logo from '/src/assets/logo.png';

interface PublicLayoutProps {
  children: React.ReactNode;
  onLoginClick: () => void;
  onLogoClick: () => void;
  id?: string;
}

export default function PublicLayout({ children, onLoginClick, onLogoClick, id }: PublicLayoutProps) {
  return (
    <div id={id} className="min-h-screen flex flex-col bg-slate-50">
      {/* Public Navigation Header */}
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-100 sticky top-0 z-50 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Branding */}
            <div
              onClick={onLogoClick}
              className="flex items-center space-x-3 cursor-pointer"
            >
              <div className="w-13 h-13 rounded-full bg-white flex items-center justify-center shadow-md border-2 border-white overflow-hidden">
                <img 
                  src={logo} 
                  alt="AniSkolar logo" 
                  className="w-4/5 h-4/5 object-contain"
                />
              </div>
              <div>
                <span className="font-display font-black text-xl text-slate-900 tracking-tight block">AniSkolar</span>
                <span className="text-[10px] text-slate-500 font-bold tracking-widest uppercase leading-none block">DLSU-D PORTAL</span>
              </div>
            </div>

            {/* Public Links */}
            <nav className="hidden md:flex items-center space-x-8 text-sm font-semibold text-slate-600">
              <a href="#about" className="hover:text-brand-green transition-colors">About</a>
              <a href="#scholarships" className="hover:text-brand-green transition-colors">Scholarships</a>
              <a href="#how-to-apply" className="hover:text-brand-green transition-colors">How to Apply</a>
              <a href="#faqs" className="hover:text-brand-green transition-colors">FAQs</a>
            </nav>

            {/* Action Buttons */}
            <div className="flex items-center space-x-3">
              <button
                onClick={onLoginClick}
                className="flex items-center space-x-1.5 text-xs font-bold uppercase tracking-wider text-white bg-brand-green hover:bg-brand-green-dark px-5 py-3 rounded-lg transition-all duration-200 shadow-sm shadow-emerald-900/10 focus:outline-hidden"
              >
                <User className="w-4 h-4" />
                <span>Login</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Page Content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Shared Footer */}
      <Footer />
    </div>
  );
}