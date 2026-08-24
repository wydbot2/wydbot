/**
 * Unit tests for the renderer obfuscation Vite plugin.
 *
 * Covers: scope filter (lib/stores only, never vendor/components), export-name
 * preservation (renameGlobals: false — Rollup links modules after obfuscation),
 * forced string hiding (deterministic markers for the fail-closed assert), and
 * the script-runtime.ts hot-path override (no control-flow flattening).
 *
 * Runs in `npm test` — the CI signal fires BEFORE the build step in release.yml.
 */
import { describe, expect, it } from 'vitest';
import type { Plugin } from 'vite';
import {
  buildObfuscatorOptions,
  isObfuscationTarget,
  obfuscateRendererPlugin,
} from '../../../tools/vite-plugins/obfuscate-renderer-plugin';

// Plain JS on purpose: in the real Vite pipeline, vite:esbuild strips TS types
// BEFORE normal plugins' transform hooks run, so the obfuscator always sees JS.
// The branchy shape gives control-flow flattening (threshold 0.75, probabilistic
// per node) enough nodes to make P(no flattening) negligible.
const FIXTURE = `
export const MACRO_TICK_MS = 250;
export const distanceLabel = 'distanceToPos';
const secret = 'distanceToPos';
export const computeTick = (base) => {
  let acc = base * 2;
  for (let i = 0; i < 8; i++) {
    if (i % 3 === 0) {
      acc += secret.length;
    } else if (i % 3 === 1) {
      acc -= distanceLabel.length;
    } else {
      acc ^= i * 7;
    }
    while (acc > 4096) {
      acc >>= 1;
    }
  }
  switch (acc % 4) {
    case 0:
      return acc + 1;
    case 1:
      return acc - 1;
    default:
      return acc;
  }
};
`;

type TransformResult = { code: string; map: null } | null;

const runTransform = (code: string, id: string): TransformResult => {
  const plugin: Plugin = obfuscateRendererPlugin();
  const transform = plugin.transform;
  if (typeof transform !== 'function' || Array.isArray(transform)) {
    throw new Error('plugin.transform is not a function hook');
  }
  return transform.call({} as never, code, id) as TransformResult;
};

describe('isObfuscationTarget', () => {
  it('matches lib and stores modules (posix + windows separators, query suffix)', () => {
    expect(isObfuscationTarget('/repo/src/renderer/lib/macro-engine.ts')).toBe(true);
    expect(isObfuscationTarget('/repo/src/renderer/stores/game-store.ts')).toBe(true);
    expect(isObfuscationTarget('C:\\repo\\src\\renderer\\lib\\macro-engine.ts')).toBe(true);
    expect(isObfuscationTarget('/repo/src/renderer/lib/macro-engine.ts?v=abc123')).toBe(true);
    expect(isObfuscationTarget('/repo/src/renderer/lib/script-ctx-dts.generated.ts')).toBe(true);
  });

  it('rejects vendor, components, bridges and non-ts', () => {
    expect(isObfuscationTarget('/repo/node_modules/quickjs-emscripten/dist/index.js')).toBe(false);
    expect(
      isObfuscationTarget('/repo/node_modules/monaco-editor/esm/vs/editor/editor.api.js'),
    ).toBe(false);
    expect(isObfuscationTarget('/repo/src/renderer/components/game/MiniMapCanvas.tsx')).toBe(false);
    expect(isObfuscationTarget('/repo/src/renderer/bridges/world-bridge.ts')).toBe(false);
    expect(isObfuscationTarget('/repo/src/renderer/lib/script-ctx-meta.generated.json')).toBe(
      false,
    );
  });
});

describe('transform', () => {
  it('returns null for out-of-scope modules', () => {
    expect(runTransform(FIXTURE, '/repo/src/renderer/bridges/world-bridge.ts')).toBeNull();
  });

  it('preserves exported names so Rollup can link modules post-obfuscation', () => {
    const out = runTransform(FIXTURE, '/repo/src/renderer/lib/macro-engine.ts');
    expect(out).not.toBeNull();
    expect(out!.code).toContain('MACRO_TICK_MS');
    expect(out!.code).toContain('computeTick');
    expect(out!.code).toContain('distanceLabel');
  });

  it('hides forced strings from plaintext (stringArray base64)', () => {
    const out = runTransform(FIXTURE, '/repo/src/renderer/lib/macro-engine.ts');
    expect(out!.code).not.toContain("'distanceToPos'");
    expect(out!.code).not.toContain('"distanceToPos"');
    expect(out!.code).toMatch(/_0x[0-9a-f]{4,}/);
  });

  it('resolves control-flow flattening on by default, off for script-runtime.ts', () => {
    expect(
      buildObfuscatorOptions('/repo/src/renderer/lib/macro-engine.ts').controlFlowFlattening,
    ).toBe(true);
    expect(
      buildObfuscatorOptions('/repo/src/renderer/lib/script-runtime.ts').controlFlowFlattening,
    ).toBe(false);
    // Windows-style separators hit the same override.
    expect(
      buildObfuscatorOptions('C:/repo/src/renderer/lib/script-runtime.ts').controlFlowFlattening,
    ).toBe(false);
  });

  it('pins stringArrayThreshold 1 on the generated DTS module (deterministic hiding)', () => {
    // The DTS is one giant template literal; forceTransformStrings does not
    // match template-literal content, so only threshold 1 guarantees the
    // script-API surface never leaks in plaintext (assert depends on it).
    // Redundant with the base; kept as a regression guard.
    expect(
      buildObfuscatorOptions('/repo/src/renderer/lib/script-ctx-dts.generated.ts')
        .stringArrayThreshold,
    ).toBe(1);
    expect(
      buildObfuscatorOptions('/repo/src/renderer/lib/macro-engine.ts').stringArrayThreshold,
    ).toBe(1);
  });
});
