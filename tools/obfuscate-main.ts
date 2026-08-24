/**
 * Obfuscates the packaged MAIN-process bundle (`out/main/index.cjs`) in place,
 * BEFORE V8 bytecode compilation and electron-builder sealing (so the published
 * asar / sha256 cover the protected bytes). Wired into `build:main-protect` /
 * `build:dist` only — never dev.
 *
 * Scope: main ONLY. It holds the packet cipher (KEY_TABLE), the 0xBBF
 * challenge tables, and all protocol logic. Preload (just the IPC bridge, no
 * secrets) is intentionally left untouched. The renderer's app modules
 * (lib/stores) are obfuscated separately at build time by
 * tools/vite-plugins/obfuscate-renderer-plugin.ts — vendor chunks (Monaco /
 * QuickJS glue / React) stay minified-only.
 *
 * Order: obfuscate → compile-main-bytecode. Decompile of the shipped `.jsc`
 * recovers this obfuscated CJS, not the original TypeScript.
 *
 * Preset: "aggressive-balanced" — string-array (base64) + identifier mangling
 * + control-flow-flattening + dead-code injection, with selfDefending OFF
 * (anti-debug overhead not worth it in Node). Raises protocol-recovery /
 * gate-patching cost from minutes to hours; still a speed-bump, not real
 * confidentiality (impossible for client-side JS).
 *
 * HONEST POSTURE (read this before relying on bytecode as a seal):
 * V8 bytecode is decompilable. Open-source tooling covers every V8 version in
 * modern Electron:
 *   - `aynakeya/v8asm` (active, 2026) — V8 10.2 through 13.6, with dedicated
 *     Electron matrix scripts and `snapshot_blob.bin` matching; level-4
 *     decompile recovers `for…of`, `+=` folding, string-concat returns, and
 *     closure name recovery.
 *   - `suleram/View8` (release 2024) — V8 9.4 / 10.2 / 11.3 (Node 16–20),
 *     Python static decompiler producing readable JS.
 *   - `shouc/v8_opcodes` — opcode database for manual disassembly.
 * The bytecode layer raises one-time RE cost; it does NOT make each release's
 * crack more expensive once an attacker's workflow is set up. Client-side
 * tamper-resistance for THIS repo's privileged paths is enforced by
 * compile-time `__PROD__` DCE (see `src/main/build-constants.d.ts`) — not by
 * this obfuscator.
 */
import { randomInt } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JavaScriptObfuscator, { type ObfuscatorOptions } from 'javascript-obfuscator';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(REPO_ROOT, 'out', 'main', 'index.cjs');

const OPTIONS: ObfuscatorOptions = {
  compact: true,
  // Main bundle is CJS after electron-vite (require / module.exports). 'node'
  // keeps Node constructs intact for the subsequent bytecode compiler.
  target: 'node',
  // String hiding — KEY_TABLE / challenge tables / literal symbols become
  // base64 lookups, so they vanish from `strings`/grep on the asar.
  stringArray: true,
  stringArrayEncoding: ['base64', 'rc4'],
  stringArrayThreshold: 1,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  splitStrings: true,
  splitStringsChunkLength: 5,
  stringArrayWrappersCount: 3,
  // Number hiding — stringArray only encodes STRINGS, so without this the
  // numeric cipher tables (KEY_TABLE, serverlist DECRYPT_KEY, challenge tables)
  // would survive as readable byte arrays. This rewrites each number as an
  // arithmetic expression so the key bytes are not grep-able from the asar.
  numbersToExpressions: true,
  // Mangle locals only; keep globals so externalized Node modules
  // (electron, path, fs…) still resolve via require.
  identifierNamesGenerator: 'mangled',
  renameGlobals: false,
  // Flatten control flow + inject dead code. Safe: deps externalized, no eval/Function dispatch.
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 1,
  // selfDefending OFF: hot-path overhead, little value in Node.
  selfDefending: false,
  // Per-build polymorphism: each build produces structurally different output
  // (shuffled identifiers, reordered string arrays, different CFF dispatchers).
  // An attacker that reversed build N sees a new program in build N+1.
  seed: process.env.OBFUSCATE_SEED
    ? parseInt(process.env.OBFUSCATE_SEED, 10)
    : randomInt(0, 2147483647),
};

// Fail-closed: if the anti-RE webContents guard ever drops out of the bundle
// (bad refactor, esbuild define change killing the `__PROD__` gate wrongly),
// the bypass ships silently — the `.jsc` is not greppable post-bytecode, so
// this pre-obfuscation hook is the last greppable checkpoint.
const ANTI_RE_MARKERS = ['web-contents-created', 'devtools-opened', 'runtime-fault'];

const assertAntiReGuardRetained = (source: string): void => {
  for (const marker of ANTI_RE_MARKERS) {
    if (!source.includes(marker)) {
      throw new Error(
        `[obfuscate-main] anti-RE marker '${marker}' missing from main bundle — guard was dropped or the __PROD__ gate regressed`,
      );
    }
  }
};

const main = async (): Promise<void> => {
  try {
    await access(TARGET);
  } catch {
    const msg = `[obfuscate-main] ${TARGET} not found — run electron-vite build first`;
    if (process.env.CI) {
      console.error(msg);
      process.exit(1);
    }
    console.log(`${msg} (skipping outside CI)`);
    return;
  }

  const source = await readFile(TARGET, 'utf-8');
  assertAntiReGuardRetained(source);
  const obfuscated = JavaScriptObfuscator.obfuscate(source, OPTIONS).getObfuscatedCode();
  await writeFile(TARGET, obfuscated, 'utf-8');
  console.log(
    `[obfuscate-main] obfuscated main bundle (${source.length} → ${obfuscated.length} bytes, aggressive-balanced preset)`,
  );
};

main().catch((err) => {
  console.error(
    `[obfuscate-main] fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
  );
  process.exit(1);
});
