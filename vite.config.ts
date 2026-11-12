import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type Plugin} from 'vite';

// Starts the connections to Clerk and the API while the app's code is still
// loading (<link rel="preconnect">), which shaves time off the first sign-in
// check. Clerk's address is the one encoded in the publishable key (a
// public value: pk_test_/pk_live_ + base64 of "<host>$"), so it follows the
// key when switching to production. Nothing is added when a value is missing.
function preconnect(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const origins: string[] = [];
  const key = env.VITE_CLERK_PUBLISHABLE_KEY || '';
  const encoded = key.replace(/^pk_(test|live)_/, '');
  if (encoded && encoded !== key) {
    const host = Buffer.from(encoded, 'base64').toString('utf8').replace(/\$$/, '');
    if (/^[a-z0-9.-]+$/i.test(host)) origins.push(`https://${host}`);
  }
  try { if (env.VITE_API_BASE_URL) origins.push(new URL(env.VITE_API_BASE_URL).origin); } catch { /* not a URL */ }
  return {
    name: 'aniskolar-preconnect',
    transformIndexHtml: () => origins.map(href => ({ tag: 'link', attrs: { rel: 'preconnect', href, crossorigin: '' }, injectTo: 'head-prepend' as const })),
  };
}

export default defineConfig(({ mode }) => {
  return {
    plugins: [react(), tailwindcss(), preconnect(mode)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
