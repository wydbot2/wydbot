/**
 * Readiness barrier for raw game-asset reads. Files exist only AFTER the boot
 * gate downloads them into the userData store. Renderer-triggered asset handlers
 * `await assetsReady()` so an early read waits for the store instead of failing
 * with ENOENT.
 *
 * Resolve-only (never rejects) so a failed gate keeps handlers pending while the
 * splash shows the retry screen; a successful BOOT_RETRY then resolves it.
 */
let resolveReady: () => void = () => {};
const ready = new Promise<void>((resolve) => {
  resolveReady = resolve;
});

/** Awaited by asset-reading IPC handlers before touching the store. */
export const assetsReady = (): Promise<void> => ready;

/** Called by the boot sequence once assets are present. Idempotent. */
export const markAssetsReady = (): void => resolveReady();
