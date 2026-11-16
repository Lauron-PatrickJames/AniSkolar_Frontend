import * as Sentry from '@sentry/react';

// Sentry error reporting for the browser. Off unless VITE_SENTRY_DSN is set
// (Vercel) and this is a production build, so local runs send nothing.
// Errors only: no session replay, tracing, or console logs; request data,
// user info, student numbers and emails are removed before sending.

const STUDENT_NUMBER = /\b\d{9,10}\b/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const mask = (s?: string) => (typeof s === 'string' ? s.replace(EMAIL, '[email]').replace(STUDENT_NUMBER, '[number]') : s);

export function scrubEvent<T extends Sentry.ErrorEvent>(event: T): T {
  delete event.user;
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.query_string;
    if (event.request.url) event.request.url = mask(event.request.url);
  }
  if (event.message) event.message = mask(event.message);
  for (const ex of event.exception?.values ?? []) ex.value = mask(ex.value);
  event.breadcrumbs = (event.breadcrumbs ?? [])
    // Console messages and clicked elements can contain what's on screen.
    .filter(b => b.category !== 'console' && b.category !== 'ui.click' && b.category !== 'ui.input')
    .map(b => ({ ...b, message: mask(b.message), data: b.data ? JSON.parse(mask(JSON.stringify(b.data)) as string) : b.data }));
  return event;
}

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn || !import.meta.env.PROD) return;
  Sentry.init({
    dsn,
    environment: 'production',
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  });
}

export { Sentry };
