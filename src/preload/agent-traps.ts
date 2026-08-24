import { ipcRenderer } from 'electron';
import { IPC } from '@shared/ipc/ipc-channels';

const UNTRUSTED_HITS_REQUIRED = 3;
const UNTRUSTED_WINDOW_MS = 5000;

let reported = false;

const report = (): void => {
  if (reported) return;
  reported = true;
  try {
    ipcRenderer.send(IPC.RUNTIME_FAULT, 3);
  } catch {
    // IPC unavailable
  }
};

const detectLaunchAutomation = (): boolean => {
  if (navigator.webdriver) return true;
  if (navigator.userAgent.includes('HeadlessChrome')) return true;
  return false;
};

const installImmediateCheck = (): void => {
  if (detectLaunchAutomation()) {
    report();
    return;
  }
  setTimeout(
    () => {
      if (detectLaunchAutomation()) report();
    },
    3000 + Math.random() * 1000,
  );
};

const installUntrustedInputTrap = (): void => {
  const hits: number[] = [];

  const handler = (e: PreloadEvent): void => {
    if (e.isTrusted) {
      hits.length = 0;
      return;
    }
    const now = Date.now();
    hits.push(now);
    while (hits.length > 0 && hits[0] < now - UNTRUSTED_WINDOW_MS) hits.shift();
    if (hits.length >= UNTRUSTED_HITS_REQUIRED) report();
  };
  addEventListener('mousedown', handler, true);
  addEventListener('keydown', handler, true);
};

if (__PROD__) {
  installImmediateCheck();
  installUntrustedInputTrap();
}
