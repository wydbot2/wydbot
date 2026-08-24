import { ipcRenderer } from 'electron';
import { IPC } from '@shared/ipc/ipc-channels';

const DELTA_THRESHOLD_MS = 150;
const CONSECUTIVE_HITS_REQUIRED = 2;
const BASE_INTERVAL_MS = 2000;
const JITTER_MS = 500;

let reported = false;

const report = (code: 1 | 2): void => {
  if (reported) return;
  reported = true;
  try {
    ipcRenderer.send(IPC.RUNTIME_FAULT, code);
  } catch {
    // IPC unavailable
  }
};

const installTimingTrap = (): void => {
  let consecutiveHits = 0;

  const tick = (): void => {
    const t0 = performance.now();
    debugger;
    const delta = performance.now() - t0;

    if (delta > DELTA_THRESHOLD_MS) {
      consecutiveHits++;
      if (consecutiveHits >= CONSECUTIVE_HITS_REQUIRED) {
        report(2);
      }
    } else {
      consecutiveHits = 0;
    }

    setTimeout(tick, BASE_INTERVAL_MS + Math.random() * JITTER_MS);
  };

  setTimeout(tick, 1500 + Math.random() * 1000);
};

const installConsoleGetterTrap = (): void => {
  let trapFired = false;

  const arm = (): void => {
    const probe: Record<string, unknown> = {};
    Object.defineProperty(probe, 'x', {
      get(): number {
        if (!trapFired) {
          trapFired = true;
          report(1);
        }
        return 0;
      },
      enumerable: true,
    });
    // eslint-disable-next-line no-console -- DevTools reads this getter when formatting the logged object
    console.log(probe);
  };

  const tick = (): void => {
    arm();
    setTimeout(tick, 4000 + Math.random() * 2000);
  };

  setTimeout(tick, 3000 + Math.random() * 1000);
};

if (__PROD__) {
  installTimingTrap();
  installConsoleGetterTrap();
}
