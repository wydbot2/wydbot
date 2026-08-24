/**
 * Build-only Vite plugin that obfuscates the renderer's OWN app modules
 * (`src/renderer/lib/**` + `src/renderer/stores/**`) per-module, BEFORE Rollup
 * bundles them. Complements `tools/obfuscate-main.ts` (which protects the main
 * bundle post-build): here the goal is to hide the macro-engine know-how
 * (decision logic, freshness guards, script-ctx wiring) from the shipped asar.
 *
 * Per-module + pre-bundle is deliberate: after each module is obfuscated,
 * Rollup resolves cross-module references normally, so there is none of the
 * cross-chunk identifier fragility a post-build chunk obfuscation would have.
 *
 * Hard invariants (breaking any of these breaks the app):
 * - `renameGlobals: false` — exported names (consumed by components/bridges)
 *   must survive for Rollup to link modules.
 * - NO `renameProperties` / `transformObjectKeys` — property names are a
 *   cross-process contract: IPC payloads (`window.wydAPI.*`, `ViewItem`),
 *   Zustand store shapes, and the QuickJS `ctx` API (all string-keyed via
 *   `qctx.setProp`/`defineProp`).
 * - NO `selfDefending` / `debugProtection` / `disableConsoleOutput` — they
 *   inject `eval`/`Function`, and the production CSP is `'self'
 *   'wasm-unsafe-eval'` with NO 'unsafe-eval' (src/shared/security/csp-policy.ts).
 *
 * Out of scope (never matched): node_modules (quickjs-emscripten glue uses
 * dynamic `Function(` paths; monaco workers are URL-referenced; react is
 * frame-critical), components, and bridges. `*.generated.ts` IS obfuscated on
 * purpose: `script-ctx-dts.generated.ts` carries the whole script API surface
 * (`distanceToPos`, …) as a template literal that lands in the bundle —
 * leaving it out would leak in plaintext everything the lib obfuscation hides.
 * The file on disk stays verbatim (transform is in-memory).
 *
 * QuickJS guest scripts are unaffected: they are TEXT evaluated inside the
 * WASM runtime, and the host ctx surface is string literals — stringArray
 * encodes them at rest but decodes at runtime.
 *
 * Fail-closed verification: `npm run assert:renderer-protect` (wired in both
 * publish workflows after the Compile step).
 *
 * Debug hatch: `OBFUSCATE_RENDERER=0 npm run build` skips the transform
 * (production-troubleshooting only — CI never sets it, and the assert would
 * fail the build if it ever shipped skipped).
 */
import { randomInt } from 'node:crypto';
import JavaScriptObfuscator, { type ObfuscatorOptions } from 'javascript-obfuscator';
import type { Plugin } from 'vite';

const INCLUDE_MARKERS = ['/src/renderer/lib/', '/src/renderer/stores/'] as const;

/** Regression-guard: force script-visible string literals into the string
 * array so the fail-closed assert can rely on their plaintext absence even
 * if a future change lowers stringArrayThreshold below 1. */
const FORCED_STRINGS = ['distanceToPos', 'useTeleportScroll'];

const BASE_OPTIONS: ObfuscatorOptions = {
  compact: true,
  target: 'browser',
  // NOTE: `build.minify: 'esbuild'` re-minifies the final chunks AFTER this
  // transform, renaming identifiers again — the `_0x…` style never reaches the
  // shipped bundle. What survives minification (and carries the hiding) is:
  // stringArray (base64 literals + decoder-call sites), splitStrings,
  // numbersToExpressions, and the CFF dispatcher structure. The generator
  // choice is therefore cosmetic; 'hexadecimal' kept for debuggability of
  // per-module transform output.
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  stringArray: true,
  stringArrayEncoding: ['base64', 'rc4'],
  stringArrayThreshold: 1,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
  numbersToExpressions: true,
  forceTransformStrings: FORCED_STRINGS,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: false,
  selfDefending: false,
  debugProtection: false,
  disableConsoleOutput: false,
  sourceMap: false,
  // Per-build polymorphism — see tools/obfuscate-main.ts for rationale.
  seed: process.env.OBFUSCATE_SEED
    ? parseInt(process.env.OBFUSCATE_SEED, 10)
    : randomInt(0, 2147483647),
};

/**
 * Per-file overrides for hot paths. The QuickJS interrupt handler runs on
 * guest loop back-edges, so `script-runtime.ts` skips control-flow flattening
 * (string/number/identifier hiding still applies).
 * Exported for unit tests.
 */
export const buildObfuscatorOptions = (normalizedId: string): ObfuscatorOptions => {
  if (normalizedId.endsWith('/src/renderer/lib/script-runtime.ts')) {
    return { ...BASE_OPTIONS, controlFlowFlattening: false };
  }
  // The generated DTS is one giant template literal holding the whole script
  // API surface; forceTransformStrings does not match template-literal
  // content. Pinning stringArrayThreshold: 1 here keeps the fail-closed
  // assert deterministic even if the base threshold is ever lowered.
  if (normalizedId.endsWith('/src/renderer/lib/script-ctx-dts.generated.ts')) {
    return { ...BASE_OPTIONS, stringArrayThreshold: 1 };
  }
  // Same deterministic-hiding pin for the ctx-wiring module: its pt-BR error
  // strings (`'[script] player.distanceToPos: …'`) embed the forced literal
  // as a substring, so forceTransformStrings (exact-match only) never
  // applies and splitStrings rolls each chunk independently. The threshold-1
  // pin guarantees these substrings never ship in plaintext.
  if (normalizedId.endsWith('/src/renderer/lib/script-ctx.ts')) {
    return { ...BASE_OPTIONS, stringArrayThreshold: 1 };
  }
  return BASE_OPTIONS;
};

/** Normalize to posix and strip any query suffix (Vite ids may carry `?v=`). */
const normalizeId = (id: string): string => id.replace(/\\/g, '/').split('?')[0];

export const isObfuscationTarget = (id: string): boolean => {
  const normalized = normalizeId(id);
  if (!normalized.endsWith('.ts')) return false;
  return INCLUDE_MARKERS.some((marker) => normalized.includes(marker));
};

export const obfuscateRendererPlugin = (): Plugin => {
  let moduleCount = 0;
  let inBytes = 0;
  let outBytes = 0;
  const disabled = process.env.OBFUSCATE_RENDERER === '0';

  return {
    name: 'wyd-obfuscate-renderer',
    apply: 'build',
    transform(code, id) {
      if (disabled) return null;
      if (!isObfuscationTarget(id)) return null;
      const obfuscated = JavaScriptObfuscator.obfuscate(
        code,
        buildObfuscatorOptions(normalizeId(id)),
      ).getObfuscatedCode();
      moduleCount += 1;
      inBytes += code.length;
      outBytes += obfuscated.length;
      return { code: obfuscated, map: null };
    },
    buildEnd() {
      if (moduleCount > 0) {
        console.log(
          `[obfuscate-renderer] ${moduleCount} módulos ofuscados ` +
            `(${(inBytes / 1024).toFixed(0)} KB → ${(outBytes / 1024).toFixed(0)} KB)`,
        );
      }
    },
  };
};
