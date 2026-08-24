/**
 * Build-time constant injected by electron-vite `main.build.define` (and by
 * vitest `define`, so unit tests that import `src/main/**` don't throw
 * ReferenceError). See `electron.vite.config.ts`.
 *
 * `__PROD__` replaces the runtime `app.isPackaged` check on privileged
 * branches (anti-re guards, preload traps). At build time `__PROD__` is
 * replaced by the literal `true`, dev-only branches become dead code, and
 * esbuild eliminates them before obfuscation + V8 bytecode compilation — so
 * flipping `app.isPackaged` in the shipped bundle no longer unlocks them.
 *
 * Other `app.isPackaged` sites in main (devTools, menu, updater gate, app-icon
 * paths) stay on `app.isPackaged` intentionally: they are not security-critical
 * (an attacker who modifies the asar can patch them directly regardless), and
 * keeping them on `app.isPackaged` preserves test mockability without DCE
 * tradeoffs.
 *
 * Replaces a runtime Electron API with a compile-time constant on purpose:
 * unlike `app.isPackaged`, the constant has no single value to patch — flipping
 * the literal `true` in the `.jsc` requires decompiling V8 bytecode
 * (aynakeya/v8asm, suleram/View8), not a sed on the asar. It is a cost-raiser,
 * not a tamper-proof seal.
 */
declare const __PROD__: boolean;
