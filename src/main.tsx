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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      {isSsoCallback ? <SsoCallbackPage /> : <App />}
    </ClerkProvider>
  </StrictMode>
);