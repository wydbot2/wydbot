import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { getWydAPI } from './lib/electron-api';
import { initStrdefLookup } from './lib/strdef-lookup';
import './lib/monaco-setup'; // configures Monaco to use bundled (no CDN)
import './styles/globals.css';

// Fire-and-forget: 0x105 popups may arrive pre-login, before any useEffect runs.
initStrdefLookup().catch(console.error);

if (import.meta.env.DEV) {
  void import('./lib/dev-reconnect-console').then((m) => m.installDevReconnectConsole());
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

// Mirror the host OS onto <html> before first paint so platform-scoped CSS
// (the macOS traffic-light navbar inset) applies without a layout shift.
const hostPlatform = getWydAPI()?.platform;
if (hostPlatform) document.documentElement.dataset.platform = hostPlatform;

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
