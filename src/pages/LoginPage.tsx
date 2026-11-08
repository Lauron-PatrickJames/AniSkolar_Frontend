import React, { useEffect, useState } from 'react';
import { ShieldCheck, Mail, Lock, ArrowLeft, Eye, EyeOff, KeyRound, AlertCircle, Smartphone, RotateCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useSignIn } from '@clerk/react';
import logo from '../assets/logo.png';
import campusImage from '../assets/sample hero 1.jpg';

interface LoginPageProps {
  onBackToLanding: () => void;
  id?: string;
}

type LoginMode = 'student' | 'admin';

// Once Clerk's session is activated, App.tsx's own useUser()/useAuth()
// effect takes over routing — this page doesn't navigate anywhere itself.
const noopNavigate = () => {};

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

// Second-step methods Clerk can ask an admin for after the password, in
// the order we offer them. Clerk asks for one when two-step verification
// is on for the account, or when Client Trust sees a sign-in from a new
// device (status 'needs_second_factor' / 'needs_client_trust').
type VerifyMethod = 'email_code' | 'phone_code' | 'totp' | 'backup_code';
const VERIFY_METHOD_ORDER: VerifyMethod[] = ['email_code', 'phone_code', 'totp', 'backup_code'];
const VERIFY_METHOD_LABELS: Record<VerifyMethod, string> = {
  email_code: 'Email a code',
  phone_code: 'Text a code',
  totp: 'Authenticator app',
  backup_code: 'Backup code'
};

interface VerifyStep {
  method: VerifyMethod;
  available: VerifyMethod[];
  destinations: Partial<Record<VerifyMethod, string>>;  // masked email / phone
  reason: 'new_device' | 'two_factor';
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_domain: 'Please sign in with your official DLSU-D email address (@dlsud.edu.ph). Other email accounts are not allowed.',
};

export default function LoginPage({ onBackToLanding, id }: LoginPageProps) {
  const { signIn, errors, fetchStatus } = useSignIn();

  const [loginMode, setLoginMode] = useState<LoginMode>(
    () => (new URLSearchParams(window.location.search).get('mode') === 'admin' ? 'admin' : 'student')
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [verifyStep, setVerifyStep] = useState<VerifyStep | null>(null);
  const [code, setCode] = useState('');
  const [codeNotice, setCodeNotice] = useState('');
  // Forgot password (admin accounts): email → code → new password.
  const [resetStep, setResetStep] = useState<'email' | 'code' | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Surfaces the reason when SsoCallbackPage bounces someone back here
  // (e.g. ?error=invalid_domain for a non-DLSU-D email). Read once on
  // mount, then strip the param so a page refresh doesn't re-show it.
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorCode = params.get('error');
    if (errorCode && AUTH_ERROR_MESSAGES[errorCode]) {
      setAuthError(AUTH_ERROR_MESSAGES[errorCode]);
      params.delete('error');
      const newSearch = params.toString();
      const newUrl = `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}${window.location.hash}`;
      window.history.replaceState(window.history.state, '', newUrl);
    }
  }, []);

  const isLoading = fetchStatus === 'fetching';

  // Students authenticate exclusively through Microsoft — there's no
  // password form for this path at all. Clerk's own allowlist (configured
  // in the Dashboard for dlsud.edu.ph) is what actually restricts which
  // Microsoft accounts can complete this.
  const handleMicrosoftLogin = async () => {
    setError('');
    console.log('[SSO DEBUG] handleMicrosoftLogin fired, fetchStatus:', fetchStatus);
    try {
      // Clear any pending attempt left over from a different strategy first
      // (e.g. a failed admin password submit for this same identifier can
      // leave the SignIn sitting at 'needs_first_factor'). reset() clears
      // local state back to null with no API call, so sso() below always
      // starts a genuinely fresh attempt instead of resolving against a
      // stuck one and silently not redirecting.
      await signIn.reset();

      const { error: ssoError } = await signIn.sso({
        strategy: 'oauth_microsoft',
        redirectCallbackUrl: `${window.location.origin}/sso-callback`,
        redirectUrl: `${window.location.origin}/`,
      });
      console.log('[SSO DEBUG] signIn.sso() resolved:', { ssoError, signInStatus: signIn.status });
      if (ssoError) {
        setError(ssoError.message || 'Unable to start Microsoft sign-in. Please try again.');
      }
    } catch (err) {
      console.error('[SSO DEBUG] signIn.sso() threw:', err);
      setError('Unable to start Microsoft sign-in. Please try again.');
    }
    // On success this redirects the whole page to Microsoft — nothing left
    // to do here; /sso-callback (see SsoCallback.tsx, rendered directly by
    // App.tsx for that path) picks the flow back up after the redirect.
  };

  // Admin sign-in is plain email + password, and deliberately has no
  // sign-up fallback: admin accounts are provisioned manually (Clerk
  // Dashboard or a seed script), never self-registered here. A student
  // account — which only ever has a Microsoft credential, no password —
  // simply has nothing for signIn.password() to match against.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    const { error: signInError } = await signIn.password({ emailAddress: email, password });

    if (signInError) {
      setError(signInError.message || 'Invalid email or password.');
      return;
    }

    if (signIn.status === 'complete') {
      await signIn.finalize({ navigate: noopNavigate });
      return;
    }
    if (signIn.status === 'needs_second_factor' || signIn.status === 'needs_client_trust') {
      await startVerification(signIn.status === 'needs_client_trust' ? 'new_device' : 'two_factor');
      return;
    }
    if (signIn.status === 'needs_new_password') {
      setError('This account has to set a new password before it can sign in. Ask the system administrator to reset it in the Clerk Dashboard.');
      return;
    }
    setError(`This account can\u2019t finish signing in here (Clerk status: ${signIn.status ?? 'unknown'}). Ask the system administrator to check the account in the Clerk Dashboard.`);
  };

  // Sends the code for email / phone methods; authenticator and backup
  // codes need nothing sent.
  const sendCode = async (method: VerifyMethod): Promise<boolean> => {
    if (method !== 'email_code' && method !== 'phone_code') return true;
    const { error: sendError } = method === 'email_code'
      ? await signIn.mfa.sendEmailCode()
      : await signIn.mfa.sendPhoneCode();
    if (sendError) {
      setError(sendError.message || 'Couldn\u2019t send the verification code. Please try again.');
      return false;
    }
    return true;
  };

  const startVerification = async (reason: VerifyStep['reason']) => {
    const factors = signIn.supportedSecondFactors ?? [];
    const destinations: VerifyStep['destinations'] = {};
    for (const f of factors) {
      const id = (f as { safeIdentifier?: string }).safeIdentifier;
      if (id && (f.strategy === 'email_code' || f.strategy === 'phone_code')) destinations[f.strategy] = id;
    }
    const available = VERIFY_METHOD_ORDER.filter(m => factors.some(f => f.strategy === m));
    if (available.length === 0) {
      setError('This account needs a verification method that isn\u2019t set up. Ask the system administrator to check the account in the Clerk Dashboard.');
      return;
    }
    const method = available[0];
    if (!(await sendCode(method))) return;
    setCode('');
    setCodeNotice('');
    setVerifyStep({ method, available, destinations, reason });
  };

  const switchMethod = async (method: VerifyMethod) => {
    if (!verifyStep) return;
    setError('');
    setCode('');
    setCodeNotice('');
    if (!(await sendCode(method))) return;
    setVerifyStep({ ...verifyStep, method });
  };

  const resendCode = async () => {
    if (!verifyStep) return;
    setError('');
    if (await sendCode(verifyStep.method)) setCodeNotice('A new code is on its way.');
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyStep) return;
    setError('');
    const trimmed = code.trim();
    if (!trimmed) {
      setError('Enter the verification code.');
      return;
    }
    const params = { code: trimmed };
    const { error: verifyError } =
      verifyStep.method === 'email_code' ? await signIn.mfa.verifyEmailCode(params)
      : verifyStep.method === 'phone_code' ? await signIn.mfa.verifyPhoneCode(params)
      : verifyStep.method === 'totp' ? await signIn.mfa.verifyTOTP(params)
      : await signIn.mfa.verifyBackupCode(params);
    if (verifyError) {
      setError(verifyError.message || 'That code didn\u2019t work. Check it and try again.');
      return;
    }
    if (signIn.status === 'complete') {
      await signIn.finalize({ navigate: noopNavigate });
    } else {
      setError('Verification didn\u2019t complete the sign-in. Please start again.');
    }
  };

  const cancelVerification = async () => {
    await signIn.reset();
    setVerifyStep(null);
    setCode('');
    setCodeNotice('');
    setError('');
    setPassword('');
  };

  // Forgot password: Clerk emails a code to the account's address; the code
  // and a new password sign the admin in (other devices are signed out).
  const startReset = () => {
    setError('');
    setPassword('');
    setCode('');
    setCodeNotice('');
    setResetStep('email');
  };

  const sendResetCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter the email address of your account.');
      return;
    }
    const { error: createError } = await signIn.create({ identifier: email.trim() });
    if (createError) {
      setError(createError.message || 'We couldn\u2019t find an account with that email.');
      return;
    }
    const { error: sendError } = await signIn.resetPasswordEmailCode.sendCode();
    if (sendError) {
      setError(sendError.message || 'Couldn\u2019t send the reset code. Please try again.');
      return;
    }
    setCode('');
    setNewPassword('');
    setConfirmPassword('');
    setCodeNotice(resetStep === 'code' ? 'A new code is on its way.' : '');
    setResetStep('code');
  };

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!code.trim()) return setError('Enter the code we emailed you.');
    if (newPassword.length < 8) return setError('Use at least 8 characters for the new password.');
    if (newPassword !== confirmPassword) return setError('The two passwords don\u2019t match.');
    if (signIn.status !== 'needs_new_password') {
      const { error: verifyError } = await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() });
      if (verifyError) return setError(verifyError.message || 'That code didn\u2019t work. Check it and try again.');
    }
    const { error: submitError } = await signIn.resetPasswordEmailCode.submitPassword({ password: newPassword, signOutOfOtherSessions: true });
    if (submitError) return setError(submitError.message || 'Couldn\u2019t save the new password. Try a stronger one.');
    setResetStep(null);
    if (signIn.status === 'complete') {
      await signIn.finalize({ navigate: noopNavigate });
    } else if (signIn.status === 'needs_second_factor' || signIn.status === 'needs_client_trust') {
      await startVerification(signIn.status === 'needs_client_trust' ? 'new_device' : 'two_factor');
    } else {
      setError('Your password was changed. Sign in with the new one.');
    }
  };

  const cancelReset = async () => {
    await signIn.reset();
    setResetStep(null);
    setCode('');
    setCodeNotice('');
    setError('');
  };

  // Admin (password) and student (Microsoft SSO) both drive the same shared
  // `signIn` resource from useSignIn(). A failed attempt in one mode (e.g. a
  // dlsud.edu.ph email — which has no password, only SSO — submitted through
  // the admin form) can leave that shared resource in a state a different
  // strategy can't cleanly recover from afterward, which is why the Microsoft
  // button can silently stop responding until a real sign-in + sign-out fully
  // resets Clerk's client-side session state. Switching modes is rare and
  // cheap to hard-reload, so force a full reload instead of trusting the
  // shared signIn resource to reset itself.
  const switchToAdmin = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('mode', 'admin');
    window.location.href = url.toString();
  };

  const switchToStudent = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('mode');
    window.location.href = url.toString();
  };

  return (
    <div
      id={id}
      className="min-h-screen bg-slate-900 bg-cover bg-center flex items-center justify-center p-4 sm:p-6 md:p-10 lg:p-12"
      // The campus photo from the landing page hero, tinted dark green so the card stands out.
      style={{ backgroundImage: `linear-gradient(135deg, rgba(0, 40, 22, 0.82), rgba(0, 60, 32, 0.9)), url(${campusImage})` }}
    >
      <div className="w-full max-w-5xl bg-white rounded-3xl shadow-2xl shadow-black/40 overflow-hidden flex flex-col lg:flex-row min-h-160">

        {/* Left Side: Solid DLSU Green Branding Sidebar */}
        <div className="lg:w-[45%] bg-brand-green text-white p-8 sm:p-12 flex flex-col justify-between">

          <button
            onClick={onBackToLanding}
            className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white rounded-full px-4 py-2 text-sm font-semibold transition-colors self-start focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden />
            <span>Back to main site</span>
          </button>

          <div className="my-10 space-y-6">
            <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center overflow-hidden">
              <img
                src={logo}
                alt="AniSkolar logo"
                className="w-4/5 h-4/5 object-contain"
              />
            </div>
            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl font-display font-extrabold tracking-tight text-balance">AniSkolar Portal</h1>
              <p className="text-emerald-50 text-base leading-relaxed max-w-xs text-pretty">
                Sign in to access variety of scholarship programs and supportive services.
              </p>
            </div>
          </div>

          <div className="text-sm text-emerald-100/80 font-medium mt-auto">
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
                    <h2 className="text-3xl font-display font-extrabold text-slate-900 tracking-tight text-balance">
                      {loginMode === 'admin' ? 'Admin Login' : 'Sign in'}
                    </h2>
                    {/* The student line is on the green panel already. */}
                    {loginMode === 'admin' && (
                      <p className="text-slate-600 text-base mt-2 leading-relaxed text-pretty">
                        Restricted access for scholarship office staff.
                      </p>
                    )}
                  </div>
                  {loginMode === 'admin' && (
                    <div className="shrink-0 w-11 h-11 rounded-xl bg-brand-green/10 flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5 text-brand-green" />
                    </div>
                  )}
                </div>

                <AnimatePresence>
                  {authError && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-3 flex items-start gap-2 bg-rose-50 text-rose-800 rounded-lg ring-1 ring-rose-100 text-sm font-medium">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{authError}</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {(error || errors.fields?.identifier || errors.fields?.password) && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-3 bg-rose-50 text-rose-800 rounded-lg ring-1 ring-rose-100 text-sm font-medium">
                        {error || errors.fields?.identifier?.message || errors.fields?.password?.message}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {loginMode === 'admin' && verifyStep ? (
                  <div className="space-y-6">
                    <div className="p-4 rounded-lg bg-slate-50 border border-slate-100 flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-brand-green/10 text-brand-green flex items-center justify-center shrink-0">
                        {verifyStep.method === 'email_code' ? <Mail className="w-4 h-4" /> : verifyStep.method === 'backup_code' ? <KeyRound className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
                      </div>
                      <div className="text-sm text-slate-600 leading-relaxed">
                        <p className="font-semibold text-slate-900">
                          {verifyStep.reason === 'new_device' ? 'Verify it\u2019s you on this device' : 'Two-step verification'}
                        </p>
                        <p className="mt-0.5">
                          {verifyStep.method === 'email_code'
                            ? <>We emailed a verification code to <strong>{verifyStep.destinations.email_code ?? email}</strong>.</>
                            : verifyStep.method === 'phone_code'
                            ? <>We texted a verification code to <strong>{verifyStep.destinations.phone_code ?? 'your phone'}</strong>.</>
                            : verifyStep.method === 'totp'
                            ? 'Enter the 6-digit code from your authenticator app.'
                            : 'Enter one of your backup codes.'}
                        </p>
                      </div>
                    </div>

                    <form className="space-y-6" onSubmit={handleVerify}>
                      <div>
                        <label htmlFor="verify-code" className="block text-sm font-medium text-slate-700 mb-1.5">
                          Verification code
                        </label>
                        <input
                          id="verify-code"
                          type="text"
                          inputMode={verifyStep.method === 'backup_code' ? 'text' : 'numeric'}
                          autoComplete="one-time-code"
                          autoFocus
                          value={code}
                          onChange={(e) => setCode(e.target.value)}
                          placeholder={verifyStep.method === 'backup_code' ? 'Backup code' : '123456'}
                          className="block w-full px-4 py-3 border border-slate-200 rounded-lg text-base tracking-[0.3em] text-center font-semibold tabular-nums bg-white hover:border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-colors"
                        />
                        {codeNotice && <p className="mt-2 text-sm font-medium text-brand-green">{codeNotice}</p>}
                      </div>

                      <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full text-sm font-semibold text-white bg-brand-green hover:bg-brand-green-dark active:scale-[0.99] py-3 rounded-lg transition-colors duration-150 flex items-center justify-center gap-2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isLoading ? (
                          <>
                            <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            Verifying...
                          </>
                        ) : (
                          'Verify and Sign In'
                        )}
                      </button>
                    </form>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium">
                      {(verifyStep.method === 'email_code' || verifyStep.method === 'phone_code') ? (
                        <button type="button" onClick={resendCode} disabled={isLoading} className="inline-flex items-center gap-1.5 text-brand-green hover:underline disabled:opacity-50">
                          <RotateCw className="w-4 h-4" aria-hidden /> Resend code
                        </button>
                      ) : <span />}
                      {verifyStep.available.length > 1 && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-500">
                          <span>Other ways:</span>
                          {verifyStep.available.filter(m => m !== verifyStep.method).map(m => (
                            <button key={m} type="button" onClick={() => switchMethod(m)} disabled={isLoading} className="text-slate-600 hover:text-brand-green disabled:opacity-50">
                              {VERIFY_METHOD_LABELS[m]}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={cancelVerification}
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-slate-600 hover:text-brand-green transition-colors focus:outline-hidden focus-visible:text-brand-green disabled:opacity-50"
                    >
                      <ArrowLeft className="w-4 h-4" aria-hidden />
                      Use a different account
                    </button>
                  </div>
                ) : loginMode === 'admin' && resetStep ? (
                  <div className="space-y-6">
                    <div className="p-4 rounded-lg bg-slate-50 border border-slate-100 flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-brand-green/10 text-brand-green flex items-center justify-center shrink-0">
                        <KeyRound className="w-4 h-4" />
                      </div>
                      <div className="text-sm text-slate-600 leading-relaxed">
                        <p className="font-semibold text-slate-900">Reset your password</p>
                        <p className="mt-0.5">
                          {resetStep === 'email'
                            ? 'Enter your account\u2019s email. We\u2019ll send you a code to set a new password.'
                            : <>We emailed a code to <strong>{email.trim()}</strong>. Enter it with your new password.</>}
                        </p>
                      </div>
                    </div>

                    {resetStep === 'email' ? (
                      <form className="space-y-6" onSubmit={sendResetCode}>
                        <div>
                          <label htmlFor="reset-email" className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                          <input id="reset-email" type="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. staff@dlsud.edu.ph" className="block w-full px-4 py-3 border border-slate-200 rounded-lg text-sm bg-white hover:border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-colors" />
                        </div>
                        <button type="submit" disabled={isLoading} className="w-full text-sm font-semibold text-white bg-brand-green hover:bg-brand-green-dark active:scale-[0.99] py-3 rounded-lg transition-colors duration-150 flex items-center justify-center gap-2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed">
                          {isLoading ? 'Sending...' : 'Send reset code'}
                        </button>
                      </form>
                    ) : (
                      <form className="space-y-5" onSubmit={submitReset}>
                        <div>
                          <label htmlFor="reset-code" className="block text-sm font-medium text-slate-700 mb-1.5">Code</label>
                          <input id="reset-code" type="text" inputMode="numeric" autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" className="block w-full px-4 py-3 border border-slate-200 rounded-lg text-sm bg-white hover:border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-colors tracking-[0.3em] text-center font-semibold tabular-nums" />
                          {codeNotice && <p className="mt-2 text-sm font-medium text-brand-green">{codeNotice}</p>}
                        </div>
                        <div>
                          <label htmlFor="new-password" className="block text-sm font-medium text-slate-700 mb-1.5">New password</label>
                          <input id="new-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" className="block w-full px-4 py-3 border border-slate-200 rounded-lg text-sm bg-white hover:border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-colors" />
                        </div>
                        <div>
                          <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700 mb-1.5">Confirm new password</label>
                          <input id="confirm-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="block w-full px-4 py-3 border border-slate-200 rounded-lg text-sm bg-white hover:border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-colors" />
                          <label className="mt-2 inline-flex items-center gap-2 text-sm text-slate-600">
                            <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} className="rounded-sm border-slate-300 text-brand-green focus:ring-brand-green" />
                            Show passwords
                          </label>
                        </div>
                        <p className="text-sm text-slate-600">Saving signs you out on every other device.</p>
                        <button type="submit" disabled={isLoading} className="w-full text-sm font-semibold text-white bg-brand-green hover:bg-brand-green-dark active:scale-[0.99] py-3 rounded-lg transition-colors duration-150 flex items-center justify-center gap-2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed">
                          {isLoading ? 'Saving...' : 'Set new password and sign in'}
                        </button>
                        <button type="button" onClick={() => sendResetCode()} disabled={isLoading} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-green hover:underline disabled:opacity-50">
                          <RotateCw className="w-4 h-4" aria-hidden /> Resend code
                        </button>
                      </form>
                    )}

                    <button
                      type="button"
                      onClick={cancelReset}
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-slate-600 hover:text-brand-green transition-colors focus:outline-hidden focus-visible:text-brand-green disabled:opacity-50"
                    >
                      <ArrowLeft className="w-4 h-4" aria-hidden />
                      Back to sign in
                    </button>
                  </div>
                ) : loginMode === 'admin' ? (
                  <div className="space-y-6">
                    <form className="space-y-6" onSubmit={handleSubmit}>
                      <div>
                        <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
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
                            placeholder="e.g. staff@dlsud.edu.ph"
                            className="block w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg text-sm bg-white hover:border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-colors"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1.5">
                          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                            Password
                          </label>
                          <button type="button" className="text-sm font-medium text-brand-green hover:underline" onClick={startReset}>
                            Forgot password?
                          </button>
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
                            className="block w-full pl-10 pr-10 py-3 border border-slate-200 rounded-lg text-sm bg-white hover:border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-colors"
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

                      <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full text-sm font-semibold text-white bg-brand-green hover:bg-brand-green-dark active:scale-[0.99] py-3 rounded-lg transition-colors duration-150 flex items-center justify-center gap-2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
                      className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-slate-600 hover:text-brand-green transition-colors focus:outline-hidden focus-visible:text-brand-green disabled:opacity-50"
                    >
                      <ArrowLeft className="w-4 h-4" aria-hidden />
                      Back to Student Login
                    </button>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <button
                      type="button"
                      onClick={handleMicrosoftLogin}
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-3 px-4 py-3.5 border border-slate-300 rounded-lg text-base font-semibold text-slate-900 bg-white hover:bg-slate-50 hover:border-slate-400 active:scale-[0.99] transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 disabled:opacity-50 shadow-sm"
                    >
                      {isLoading ? (
                        <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                      ) : (
                        <svg className="h-5 w-5 shrink-0" viewBox="0 0 23 23" aria-hidden fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M0 0H11V11H0V0Z" fill="#F25022"/>
                          <path d="M12 0H23V11H12V0Z" fill="#7FBA00"/>
                          <path d="M0 12H11V23H0V12Z" fill="#00A4EF"/>
                          <path d="M12 12H23V23H12V12Z" fill="#FFB900"/>
                        </svg>
                      )}
                      <span>{isLoading ? 'Redirecting...' : 'Sign in with Microsoft'}</span>
                    </button>

                    <div className="flex items-center gap-3 text-sm text-slate-500">
                      <span className="h-px flex-1 bg-slate-200" aria-hidden />
                      Or continue with
                      <span className="h-px flex-1 bg-slate-200" aria-hidden />
                    </div>

                    <button
                      type="button"
                      onClick={switchToAdmin}
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-green disabled:opacity-50"
                    >
                      <KeyRound className="w-4 h-4" aria-hidden />
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