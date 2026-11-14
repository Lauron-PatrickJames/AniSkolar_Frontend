import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import SsoCallbackPage from './pages/SsoCallBackPage.tsx';
import { ClerkProvider } from '@clerk/react';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY — add it to your .env file.');
}

// /sso-callback is a real page Microsoft redirects the browser to after the
// student approves sign-in — unlike every other "page" in this app, it's
// not one of App.tsx's own currentPage states, since it has to survive a
// full browser navigation away and back. Route it here, before App ever
// mounts.
const isSsoCallback = window.location.pathname === '/sso-callback';

// Number inputs everywhere: browsers accept e, E, + and - in them
// (scientific notation), which no field here wants. Phone numbers and
// amounts typed as text are filtered by their fields (utils/numericInput).
document.addEventListener('keydown', e => {
  const t = e.target;
  if (t instanceof HTMLInputElement && t.type === 'number' && !e.ctrlKey && !e.metaKey && ['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
}, true);
document.addEventListener('paste', e => {
  const t = e.target;
  if (!(t instanceof HTMLInputElement) || t.type !== 'number') return;
  const text = e.clipboardData?.getData('text') ?? '';
  if (!/^\s*\d*\.?\d*\s*$/.test(text)) e.preventDefault();
}, true);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      {isSsoCallback ? <SsoCallbackPage /> : <App />}
    </ClerkProvider>
  </StrictMode>
);