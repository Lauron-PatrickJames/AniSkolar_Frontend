import React, { useState } from 'react';
import { ShieldCheck, Mail, Lock, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { motion } from 'motion/react';

interface LoginPageProps {
  onLoginSuccess: (email: string) => void;
  onBackToLanding: () => void;
  id?: string;
}

// Editable SVG logo of AniSkolar (overlapping shield and graduation cap with center A)
export function AniSkolarLogo({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <div className={`bg-white rounded-2xl flex items-center justify-center p-2.5 shadow-md ${className}`}>
      <svg viewBox="0 0 64 64" className="w-full h-full text-[#006937]" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
        {/* Shield Body */}
        <path d="M32 54C32 54 50 43.2 50 26.8V15.6L32 9L14 15.6V26.8C14 43.2 32 54 32 54Z" fill="white" stroke="#006937" strokeWidth="4" strokeLinejoin="round" />
        
        {/* Graduation Cap (Mortarboard) */}
        <path d="M32 7L52 14L32 21L12 14L32 7Z" fill="#006937" stroke="#006937" strokeWidth="2" strokeLinejoin="round" />
        <path d="M22 17.5V23C22 23 27 26 32 26C37 26 42 23 42 23V17.5" stroke="#006937" strokeWidth="3" strokeLinecap="round" />
        {/* Tassel */}
        <path d="M44 18.2V26.5C44 28 42.5 29 42.5 29" stroke="#006937" strokeWidth="2" strokeLinecap="round" />
        
        {/* Capital A inside shield */}
        <text x="32" y="44" fontSize="20" fontWeight="bold" fontFamily="system-ui, -apple-system, sans-serif" textAnchor="middle" fill="#006937" stroke="none">A</text>
      </svg>
    </div>
  );
}

export default function LoginPage({ onLoginSuccess, onBackToLanding, id }: LoginPageProps) {
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

    // Simulate standard university identity server delay
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

  return (
    <div id={id} className="min-h-screen bg-[#f1f5f9] flex items-center justify-center p-4 sm:p-6 md:p-10 lg:p-12">
      <div className="w-full max-w-5xl bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col lg:flex-row min-h-[640px] border border-slate-100">
        
        {/* Left Side: Solid DLSU Green Branding Sidebar */}
        <div className="lg:w-[45%] bg-[#006937] text-white p-8 sm:p-12 flex flex-col justify-between relative overflow-hidden">
          {/* Subtle design helper grid background */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]"></div>
          
          <button
            onClick={onBackToLanding}
            className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/15 text-white rounded-full px-4.5 py-2 text-xs font-semibold tracking-wide transition-all self-start z-10"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to main site</span>
          </button>

          <div className="my-10 space-y-6 z-10">
            <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-md border-2 border-white overflow-hidden">
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

          <div className="text-[10px] text-emerald-100/40 font-bold uppercase tracking-widest mt-auto z-10">
            De La Salle University - Dasmariñas
          </div>
        </div>

        {/* Right Side: Simple & Elegant Form Area */}
        <div className="lg:w-[55%] p-8 sm:p-12 lg:p-16 flex flex-col justify-center bg-white">
          <div className="max-w-md w-full mx-auto space-y-8">
            <div>
              <h2 className="text-3xl font-display font-extrabold text-slate-900 tracking-tight">Welcome Back</h2>
              <p className="text-slate-400 text-xs sm:text-sm mt-2">
                Sign in to track your scholarship renewal and access your scholar portal.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 text-rose-800 rounded-lg border border-rose-100 text-xs font-semibold">
                {error}
              </div>
            )}

            <form className="space-y-6" onSubmit={handleSubmit}>
              {/* Institutional Email Field */}
              <div>
                <label htmlFor="email" className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  Institutional Email
                </label>
                <div className="relative rounded-lg shadow-2xs">
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
                    className="block w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#006937]/10 focus:border-[#006937] transition-all"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label htmlFor="password" className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Password
                  </label>
                  <a href="#" className="text-xs font-bold text-[#006937] hover:underline" onClick={(e) => e.preventDefault()}>
                    Forgot Password?
                  </a>
                </div>
                <div className="relative rounded-lg shadow-2xs">
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
                    className="block w-full pl-10 pr-10 py-3 border border-slate-200 rounded-lg text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#006937]/10 focus:border-[#006937] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-hidden"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Remember Me Checkbox */}
              <div className="flex items-center">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[#006937] focus:ring-[#006937]/10 accent-[#006937] cursor-pointer"
                />
                <label htmlFor="remember-me" className="ml-2.5 block text-xs font-medium text-slate-500 select-none cursor-pointer">
                  Remember my session on this device
                </label>
              </div>

              {/* Submit Button */}
              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full font-display font-bold text-xs tracking-wider text-white bg-[#006937] hover:bg-[#00542c] py-3.5 rounded-lg transition-all duration-200 shadow-sm flex items-center justify-center focus:outline-hidden disabled:opacity-50 disabled:cursor-not-allowed uppercase"
                >
                  {isLoading ? 'SIGNING IN...' : 'SIGN IN'}
                </button>
              </div>
            </form>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-100"></div>
              </div>
              <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-widest">
                <span className="bg-white px-3 text-slate-400">Or continue with</span>
              </div>
            </div>

            {/* Microsoft SSO Button */}
            <div>
              <button
                type="button"
                onClick={handleMicrosoftLogin}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2.5 px-4 py-3 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 transition-colors focus:outline-hidden disabled:opacity-50 shadow-2xs"
              >
                <svg className="h-4.5 w-4.5 shrink-0" viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M0 0H11V11H0V0Z" fill="#F25022"/>
                  <path d="M12 0H23V11H12V0Z" fill="#7FBA00"/>
                  <path d="M0 12H11V23H0V12Z" fill="#00A4EF"/>
                  <path d="M12 12H23V23H12V12Z" fill="#FFB900"/>
                </svg>
                <span>Sign in with Microsoft</span>
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
