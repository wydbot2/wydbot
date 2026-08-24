/**
 * True for AbortError rejections from ANY realm. AbortSignal.reason is a
 * DOMException of the realm that called `abort()` — `instanceof DOMException`
 * fails cross-realm (and under jsdom, where Node's AbortController and the
 * global DOMException are different constructors), and DOMException does not
 * extend Error everywhere — so match structurally on `name`.
 */
export const isAbortError = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError';

/** Promise-based delay that rejects on AbortSignal cancellation. */
export const abortableDelay = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const id = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(id);
        reject(signal.reason);
      },
      { once: true },
    );
  });
