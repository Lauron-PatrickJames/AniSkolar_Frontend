import React, { useEffect, useState } from 'react';
import { ArrowUp, User } from 'lucide-react';
import Footer from '../components/Footer';
import logo from '/src/assets/logo.png';

interface PublicLayoutProps {
  children: React.ReactNode;
  onLoginClick: () => void;
  onLogoClick: () => void;
  id?: string;
}

// Back to the top of the page, and drop a section anchor (#scholarships)
// from the address so a refresh doesn't jump back down.
function toTop() {
  window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
}

export default function PublicLayout({ children, onLoginClick, onLogoClick, id }: PublicLayoutProps) {
  // The back-to-top button shows once the visitor has scrolled a screen down.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div id={id} className="min-h-dvh flex flex-col bg-slate-50">
      {/* Public Navigation Header */}
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-100 sticky top-0 z-50 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Branding */}
            {/* The logo goes home: the top of the landing page. */}
            <button
              type="button"
              onClick={() => { onLogoClick(); toTop(); }}
              aria-label="AniSkolar home"
              className="flex items-center space-x-3 rounded-xl text-left focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-4"
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
                <span className="text-xs text-slate-500 font-medium leading-none block">DLSU-D Portal</span>
              </div>
            </button>

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
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-brand-green hover:bg-brand-green-dark px-5 py-2.5 rounded-lg transition-colors duration-150 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2"
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

      <button
        type="button"
        onClick={toTop}
        aria-label="Back to top"
        tabIndex={scrolled ? 0 : -1}
        aria-hidden={!scrolled}
        className={`fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-brand-green text-white shadow-lg ring-1 ring-white/20 transition-all duration-200 hover:bg-brand-green-dark focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 motion-reduce:transition-none sm:right-8 ${scrolled ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'}`}
      >
        <ArrowUp className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}