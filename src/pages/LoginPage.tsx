import React, { useState } from 'react';
import { ShieldCheck, Mail, Lock, ArrowLeft, Eye, EyeOff, KeyRound } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface LoginPageProps {
  onLoginSuccess: (email: string) => void;
  onBackToLanding: () => void;
  id?: string;
}

type LoginMode = 'student' | 'admin';

// Editable SVG logo of AniSkolar (overlapping shield and graduation cap with center A)
export function AniSkolarLogo({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <div className={`bg-white rounded-2xl flex items-center justify-center p-2.5 shadow-md ${className}`}>
      <svg viewBox="0 0 64 64" className="w-full h-full text-brand-green" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M32 54C32 54 50 43.2 50 26.8V15.6L32 9L14 15.6V26.8C14 43.2 32 54 32 54Z" fill="white" stroke="#006937" strokeWidth="4" strokeLinejoin="round" />
        <path d="M32 7L52 14L32 21L12 14L32 7Z" fill="#006937" stroke="#006937" strokeWidth="2" strokeLinejoin="round" />
        <path d="M22 17.5V23C22 23 27 26 32 26C37 26 42 23 42 23V17.5" stroke="#006937" strokeWidth="3" strokeLinecap="round" />
        <path d="M44 18.2V26.5C44 28 42.5 29 42.5 29" stroke="#006937" strokeWidth="2" strokeLinecap="round" />
        <text x="32" y="44" fontSize="20" fontWeight="bold" fontFamily="system-ui, -apple-system, sans-serif" textAnchor="middle" fill="#006937" stroke="none">A</text>
      </svg>
    </div>
  );
}

export default function LoginPage({ onLoginSuccess, onBackToLanding, id }: LoginPageProps) {
  const [loginMode, setLoginMode] = useState<LoginMode>('student');
  const [email, setEmail] = useState('student@dlsud.edu.ph');
  const [password, setPassword] = useState('animo1911');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    if (!email.endsWith('@dlsud.edu.ph')) {
      setError('Please use your official university email (e.g., username@dlsud.edu.ph).');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      onLoginSuccess(email);
    }, 1000);
  };

  const handleMicrosoftLogin = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      onLoginSuccess('student@dlsud.edu.ph');
    }, 1200);
  };

  const switchToAdmin = () => {
    setError('');
    setLoginMode('admin');
  };

  const switchToStudent = () => {
    setError('');
    setLoginMode('student');
  };

  return (
    <div id={id} className="min-h-screen bg-[#f1f5f9] flex items-center justify-center p-4 sm:p-6 md:p-10 lg:p-12">
      <div className="w-full max-w-5xl bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col lg:flex-row min-h-160 border border-slate-100">
        
        {/* Left Side: Solid DLSU Green Branding Sidebar */}
        <div className="lg:w-[45%] bg-brand-green text-white p-8 sm:p-12 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(#ffffff_1px,transparent_1px)] bg-size-[16px_16px]"></div>
          {/* Soft glow accent */}
          <div className="absolute -top-24 -right-24 w-72 h-72 bg-white/5 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute -bottom-32 -left-16 w-72 h-72 bg-black/10 rounded-full blur-3xl pointer-events-none"></div>
          
          <button
            onClick={onBackToLanding}
            className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white rounded-full px-4.5 py-2 text-xs font-semibold tracking-wide transition-all self-start z-10 backdrop-blur-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to main site</span>
          </button>

          <div className="my-10 space-y-6 z-10">
            <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-lg ring-4 ring-white/10 overflow-hidden">
              <img 
                src="src\assets\logo.png" 
                alt="AniSkolar logo" 
                className="w-4/5 h-4/5 object-contain"
              />
            </div>
            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl font-display font-extrabold tracking-tight">AniSkolar Portal</h1>
              <p className="text-emerald-100/80 text-sm leading-relaxed max-w-xs">
                Sign in to track your scholarship renewal and access your scholar portal.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[10px] text-emerald-100/40 font-bold uppercase tracking-widest mt-auto z-10">
            <span className="w-1 h-1 rounded-full bg-emerald-100/40" />
            De La Salle University - Dasmariñas
          </div>
        </div>

        {/* Right Side: Simple & Elegant Form Area */}
        <div className="lg:w-[55%] p-8 sm:p-12 lg:p-16 flex flex-col justify-center bg-white">
          <div className="max-w-md w-full mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={loginMode}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="space-y-8"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-3xl font-display font-extrabold text-slate-900 tracking-tight">
                      {loginMode === 'admin' ? 'Admin Login' : 'Welcome Back'}
                    </h2>
                    <p className="text-slate-400 text-xs sm:text-sm mt-2 leading-relaxed">
                      {loginMode === 'admin'
                        ? 'Restricted access for scholarship office staff.'
                        : 'Sign in to track your scholarship renewal and access your scholar portal.'}
                    </p>
                  </div>
                  {loginMode === 'admin' && (
                    <div className="shrink-0 w-11 h-11 rounded-xl bg-brand-green/10 flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5 text-brand-green" />
                    </div>
                  )}
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-3 bg-rose-50 text-rose-800 rounded-lg border border-rose-100 text-xs font-semibold">
                        {error}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {loginMode === 'admin' ? (
                  <div className="space-y-6">
                    <form className="space-y-6" onSubmit={handleSubmit}>
                      <div>
                        <label htmlFor="email" className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                          Email
                        </label>
                        <div className="relative rounded-lg">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                            <Mail className="w-4 h-4" />
                          </div>
                          <input
                            id="email"
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="e.g. scholar@dlsud.edu.ph"
                            className="block w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/15 focus:border-brand-green transition-all"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <label htmlFor="password" className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            Password
                          </label>
                          <a href="#" className="text-xs font-bold text-brand-green hover:underline" onClick={(e) => e.preventDefault()}>
                            Forgot Password?
                          </a>
                        </div>
                        <div className="relative rounded-lg">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                            <Lock className="w-4 h-4" />
                          </div>
                          <input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="block w-full pl-10 pr-10 py-3 border border-slate-200 rounded-lg text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-green/15 focus:border-brand-green transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-hidden transition-colors"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <label htmlFor="remember-me" className="flex items-center gap-2.5 cursor-pointer select-none group">
                        <input
                          id="remember-me"
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-brand-green focus:ring-brand-green/15 accent-brand-green cursor-pointer"
                        />
                        <span className="text-xs font-medium text-slate-500 group-hover:text-slate-600 transition-colors">
                          Remember my session on this device
                        </span>
                      </label>

                      <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full font-display font-bold text-xs tracking-wider text-white bg-brand-green hover:bg-[#00542c] active:scale-[0.99] py-3.5 rounded-lg transition-all duration-150 shadow-sm hover:shadow-md flex items-center justify-center gap-2 focus:outline-hidden disabled:opacity-50 disabled:cursor-not-allowed uppercase"
                      >
                        {isLoading ? (
                          <>
                            <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            Signing in...
                          </>
                        ) : (
                          'Sign In'
                        )}
                      </button>
                    </form>

                    <button
                      type="button"
                      onClick={switchToStudent}
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold text-slate-400 hover:text-brand-green transition-colors focus:outline-hidden disabled:opacity-50"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Back to Student Login
                    </button>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <button
                      type="button"
                      onClick={handleMicrosoftLogin}
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-2.5 px-4 py-3.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300 active:scale-[0.99] transition-all focus:outline-hidden disabled:opacity-50 shadow-sm"
                    >
                      {isLoading ? (
                        <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                      ) : (
                        <svg className="h-4.5 w-4.5 shrink-0" viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M0 0H11V11H0V0Z" fill="#F25022"/>
                          <path d="M12 0H23V11H12V0Z" fill="#7FBA00"/>
                          <path d="M0 12H11V23H0V12Z" fill="#00A4EF"/>
                          <path d="M12 12H23V23H12V12Z" fill="#FFB900"/>
                        </svg>
                      )}
                      <span>{isLoading ? 'Signing in...' : 'Sign in with Microsoft'}</span>
                    </button>

                    <div className="relative py-1">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-slate-100"></div>
                      </div>
                      <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-widest">
                        <span className="bg-white px-3 text-slate-400">Or continue with</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={switchToAdmin}
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 bg-slate-50/50 hover:bg-slate-100 hover:text-slate-700 transition-colors focus:outline-hidden disabled:opacity-50"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      Admin Login
                    </button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

      </div>
    </div>
  );
}