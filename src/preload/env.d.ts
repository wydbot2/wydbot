/**
 * Build-time constant injected by electron-vite `preload.build.define` (and by
 * vitest `define` as `false`). Mirrors `src/main/build-constants.d.ts` but
 * scoped to the preload tsconfig. Used to gate the anti-RE traps so they only
 * run in production builds.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- build-time constant, mirrors src/main/build-constants.d.ts
declare const __PROD__: boolean;

// Minimal Chromium globals available in the sandboxed preload at runtime.
// tsconfig.node.json has lib: ["ESNext"] (no DOM), but the preload runs inside
// a Chromium renderer where navigator / addEventListener are real globals.
declare const navigator: { webdriver: boolean; userAgent: string };

interface PreloadEvent {
  isTrusted: boolean;
}

declare function addEventListener(
  type: string,
  listener: (event: PreloadEvent) => void,
  capture?: boolean,
): void;
