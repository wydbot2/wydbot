import { useSyncExternalStore } from 'react';

// `once: true` — listener fires once per DPR value. When it fires,
// useSyncExternalStore re-subscribes with a fresh matchMedia query
// for the new DPR, forming a re-subscription chain.
const subscribe = (callback: () => void): (() => void) => {
  const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  mq.addEventListener('change', callback, { once: true });
  return () => mq.removeEventListener('change', callback);
};

const getSnapshot = (): number => window.devicePixelRatio;

/** Reactive hook that tracks `window.devicePixelRatio` across monitor changes. */
export const useDevicePixelRatio = (): number => useSyncExternalStore(subscribe, getSnapshot);
