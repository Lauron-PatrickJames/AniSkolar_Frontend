import { useEffect, useRef } from 'react';
import { useClerk, useSignIn, useSignUp } from '@clerk/react';

const ALLOWED_EMAIL_DOMAIN = 'dlsud.edu.ph';

// Must match App.tsx's SESSION_STORAGE_KEY. App.tsx persists { currentPage,
// selectedScholarshipId } here on every render, so whatever page was showing
// right before "Sign in with Microsoft" was clicked (i.e. 'login') is still
// sitting in storage when the browser comes back from Microsoft — a plain
// redirect to '/' does NOT reset it. Clearing it before redirecting is what
// lets App.tsx fall back to its 'landing' default on the next boot.
const APP_SESSION_STORAGE_KEY = 'aniskolar_session';

function isAllowedEmail(email?: string | null) {
  if (!email) return false;
  return email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}

function isLikelyDomainRestrictionError(error: { code?: string; message?: string } | null | undefined) {
  const code = typeof error?.code === 'string' ? error.code.toLowerCase() : '';
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  const allowedDomain = ALLOWED_EMAIL_DOMAIN.toLowerCase();

  return (
    code.includes('domain') ||
    code.includes('allowlist') ||
    code.includes('not_allowed') ||          // Clerk's actual allowlist-rejection code
    message.includes('domain') ||
    message.includes('allowlist') ||
    message.includes('not allowed to access') || // matches Clerk's current wording
    message.includes(allowedDomain)
  );
}

// The page Microsoft redirects the browser back to after the student
// approves sign-in (see redirectCallbackUrl in LoginPage's handleMicrosoftLogin).
// This is a real, separate browser navigation — not app state routing — so
// it's mounted directly from main.tsx based on window.location.pathname,
// outside App.tsx's own currentPage system.
export default function SsoCallbackPage() {
  const clerk = useClerk();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();

  // Guards against this whole flow running more than once. Two separate
  // things can trigger a second run if we're not careful:
  //   1. React StrictMode (see main.tsx) intentionally double-invokes
  //      effects in dev — mount, cleanup, mount again — specifically to
  //      surface bugs like this one.
  //   2. The effect's own dependency array ([clerk.loaded, signIn, signUp])
  //      can re-fire if signIn/signUp reference identity changes after the
  //      first run mutates Clerk's client-side state.
  // Either way, running signIn.finalize()/signUp.finalize() a second time
  // against state the first run already consumed can throw, hit a
  // different branch, or call rejectInvalidDomain() — stomping a success
  // redirect that's already in flight. hasRun must be set synchronously,
  // BEFORE any await, so no re-entrant call can slip through the gap.
  const hasRun = useRef(false);

  const goToSignIn = () => {
    window.location.href = '/';
  };

  // Domain check failed. This only ever runs from inside a finalize()/
  // setActive() navigate callback, which Clerk calls once the session is
  // genuinely active — so clerk.user is real at this point, not a guess.
  //
  // We DELETE the account rather than just signing out of it. Signing out
  // alone leaves a verified, Microsoft-linked User record behind; a second
  // attempt with the same Microsoft account then finds that existing user
  // and Clerk takes a "returning user" path instead of the "new signup"
  // path — a different route through the SDK that isn't covered by this
  // same check the same way. Deleting removes the account entirely so a
  // retry starts clean, every time. Requires "Allow users to delete their
  // own account" enabled in the Clerk Dashboard (User & Authentication →
  // Restrictions) — without it this call fails and we fall back to
  // sign-out only, which is why cleaning up any already-created
  // out-of-domain test users from the Dashboard directly is worth doing
  // once as well.
  const rejectInvalidDomain = async () => {
    try {
      await clerk.user?.delete();
    } catch {
      // Deletion can fail (self-delete disabled in Dashboard settings,
      // network error, etc) — sign-out below is the fallback either way.
    }
    try {
      await clerk.signOut();
    } catch {
      // best effort — we're leaving either way
    }
    try {
      sessionStorage.removeItem(APP_SESSION_STORAGE_KEY);
    } catch {
      // ignore — private browsing / storage disabled, etc.
    }
    window.location.href = '/?error=invalid_domain';
  };

  // The single point where we trust the email domain enough to act on it.
  // Called only from inside a navigate callback, i.e. only after Clerk has
  // actually activated the session — the one moment the SDK guarantees
  // clerk.user is populated. Checking any earlier (signIn.identifier,
  // signUp.emailAddress, etc, before finalize/setActive) reads fields that
  // aren't reliably hydrated yet in an OAuth flow, which is what let
  // out-of-domain accounts through intermittently before.
  const enforceDomainAndProceed = async () => {
    let email: string | null | undefined;

    // Retry a few times — on a brand-new sign-up, clerk.user.emailAddresses /
    // primaryEmailAddress requires Clerk to create and link a separate
    // EmailAddress resource after the account itself is created, which can
    // lag past a short retry window. clerk.user.externalAccounts holds the
    // raw OAuth provider data (email included) and is populated immediately
    // at account creation, with no extra linking step — so it's checked
    // first and is what actually fixes first-attempt false rejections for
    // never-before-seen accounts. emailAddresses stays as a fallback for
    // any account shape where externalAccounts isn't populated as expected.
    for (let attempt = 0; attempt < 5; attempt++) {
      await clerk.user?.reload();
      email =
        clerk.user?.externalAccounts?.find(
          (a) => a.emailAddress
        )?.emailAddress ??
        clerk.user?.primaryEmailAddress?.emailAddress ??
        clerk.user?.emailAddresses?.[0]?.emailAddress;

      if (email) break;
      await new Promise((r) => setTimeout(r, 400)); // small backoff
    }

    if (!email) {
      console.warn('SSO callback could not resolve an email after retries; proceeding and relying on Clerk allowlist.');
      window.location.href = '/';
      return;
    }

    if (!isAllowedEmail(email)) {
      await rejectInvalidDomain();
      return;
    }
    window.location.href = '/';
  };

  const finalizeSignIn = async () => {
    await signIn.finalize({ navigate: enforceDomainAndProceed });
  };

  const finalizeSignUp = async () => {
    await signUp.finalize({ navigate: enforceDomainAndProceed });
  };

  const handleTransferError = async (error: { code?: string; message?: string } | null | undefined) => {
    if (isLikelyDomainRestrictionError(error)) {
      await rejectInvalidDomain();
      return;
    }
    goToSignIn();
  };

  useEffect(() => {
    // Bail out early if Clerk isn't ready yet, or if we've already run.
    // Crucially, hasRun.current is set to true synchronously, right here,
    // BEFORE the async IIFE below ever starts — not inside it after an
    // early-return check. That closes the window where a second firing of
    // this effect (StrictMode's double-invoke, or a dependency changing)
    // could slip through while clerk.loaded was still settling on the
    // first pass.
    if (!clerk.loaded || hasRun.current) return;
    hasRun.current = true;

    (async () => {
      try {
        // signIn.status / signUp.status are typed as SignInFutureResource /
        // SignUpFutureResource in Clerk Core 3. Once an earlier branch in
        // this function has already narrowed one of these away from
        // 'complete' via a prior `if (x.status === 'complete') { ...; return }`,
        // TypeScript keeps that narrowed (non-'complete') type for the rest
        // of the function, even though the resource is live and its status
        // absolutely can become 'complete' again later (e.g. right after
        // signIn.create()/signUp.create()). Clerk's own custom-flow docs hit
        // this same false positive and work around it with this cast rather
        // than suppressing the check — so every status re-check below does
        // the same, instead of trusting a first check that's structurally
        // unreachable here anyway.

        // Sign-in completed outright (existing Microsoft-linked account).
        const initialSignInStatus = signIn.status as typeof signIn.status | 'complete';
        if (initialSignInStatus === 'complete') {
          await finalizeSignIn();
          return;
        }

        // First time this Microsoft account has been seen — Clerk transfers
        // the attempt from SignIn to SignUp automatically.
        if (signUp.isTransferable) {
          // create() returns errors as { error } rather than throwing (same
          // pattern as signIn.password()/signIn.sso() in LoginPage.tsx) — an
          // Allowlist rejection surfaces here, not in the outer try/catch.
          const { error } = await signIn.create({ transfer: true });
          if (error) {
            console.error('SSO callback failed (signIn.create):', error);
            await handleTransferError(error);
            return;
          }
          const signInStatus = signIn.status as typeof signIn.status | 'complete';
          if (signInStatus === 'complete') {
            await finalizeSignIn();
            return;
          }
          return goToSignIn();
        }

        if (
          signIn.status === 'needs_first_factor' &&
          !signIn.supportedFirstFactors?.every(f => f.strategy === 'enterprise_sso')
        ) {
          return goToSignIn();
        }

        if (signIn.isTransferable) {
          const { error } = await signUp.create({ transfer: true });

          if (error) {
            console.error('SSO callback failed (signUp.create):', error);
            await handleTransferError(error);
            return;
          }

          // NOTE: no polling/reload loop here. SignUpFutureResource has no
          // .reload() method (unlike the old legacy SignUp resource) — the
          // property is live and already reflects the post-create() state
          // the moment the promise above resolves. The previous version of
          // this file polled for up to 3s calling `signUp.reload?.()`, which
          // silently no-ops (optional chaining on a method that doesn't
          // exist) and just burns through the timeout before ever seeing an
          // updated status. That's what caused every brand-new account
          // (dlsud or not) to silently bounce back to '/' on its first
          // attempt without ever reaching enforceDomainAndProceed() — even
          // though Clerk had already finished creating the account
          // server-side. A second attempt then recognized the now-existing
          // account via the signIn.status === 'complete' branch above,
          // which is why things only ever "worked" on a retry.
          const signUpStatus = signUp.status as typeof signUp.status | 'complete';
          if (signUpStatus === 'complete') {
            await finalizeSignUp();
            return;
          }

          return goToSignIn();
        }

        const finalSignUpStatus = signUp.status as typeof signUp.status | 'complete';
        if (finalSignUpStatus === 'complete') {
          await finalizeSignUp();
          return;
        }

        if (signIn.status === 'needs_second_factor' || signIn.status === 'needs_new_password') {
          return goToSignIn();
        }

        // Already-active session on this client being reattached.
        if (signIn.existingSession || signUp.existingSession) {
          const sessionId = signIn.existingSession?.sessionId || signUp.existingSession?.sessionId;
          if (sessionId) {
            await clerk.setActive({
              session: sessionId,
              navigate: enforceDomainAndProceed,
            });
            return;
          }
        }

        // Nothing matched — safest fallback is back to the login screen.
        goToSignIn();
      } catch (err) {
        console.error('SSO callback failed:', err);
        goToSignIn();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clerk.loaded, signIn, signUp]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs font-semibold text-slate-500">Finishing sign-in...</p>
      </div>
      {/* A sign-in transferred to a sign-up can require captcha verification */}
      <div id="clerk-captcha" />
    </div>
  );
}