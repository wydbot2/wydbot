/**
 * Fail-closed check that the renderer build obfuscated the app modules
 * (`src/renderer/lib/**` + `src/renderer/stores/**`) — see
 * `tools/vite-plugins/obfuscate-renderer-plugin.ts`.
 * Used by CI after the Compile step, before protect/pack.
 *
 *   npx tsx tools/assert-renderer-protect.ts
 *
 * Checks (any failure exits 1):
 * 1. Entry chunk `out/renderer/assets/index-*.js` exists.
 * 2. Structural obfuscation marker: string-array decoder-call sites
 *    (`n(243)`-style: 1-4-char identifier called with a 2-3 digit int) above
 *    threshold. Empirical calibration on this codebase: ~7.8k with
 *    obfuscation, ~500 without (monaco contributes background noise) — the
 *    `_0x…` identifier style is NOT a viable marker because the final esbuild
 *    minify pass re-renames identifiers.
 * 3. `distanceToPos` (string-only script-API literal, forced into the string
 *    array) absent as plaintext. `useTeleportScroll` is deliberately NOT
 *    checked: it also exists as a property name (API contract), which is
 *    correctly preserved.
 * 4. Scope sanity: the QuickJS `module-asyncify-*.js` chunk stays clean
 *    (<50 decoder-call matches; measured: 0) — proves the transform never
 *    touched the emscripten glue the guest runtime depends on.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ASSETS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'out',
  'renderer',
  'assets',
);
const DECODER_CALL_RE = /\b[\w$]{1,4}\(\d{2,3}\)/g;
const MIN_ENTRY_DECODER_CALLS = 2000;
const MAX_VENDOR_DECODER_CALLS = 50;
const FORBIDDEN_PLAINTEXT = ['distanceToPos'] as const;

const readAsset = async (name: string): Promise<string> =>
  readFile(path.join(ASSETS_DIR, name), 'utf-8');

const countDecoderCalls = (code: string): number => (code.match(DECODER_CALL_RE) ?? []).length;

const main = async (): Promise<void> => {
  let files: string[];
  try {
    files = await readdir(ASSETS_DIR);
  } catch {
    throw new Error(`${ASSETS_DIR} not found — run electron-vite build first`);
  }

  // Multiple index-*.js chunks can exist (a tiny loader + the real bundle) —
  // the app code lives in the largest one.
  const entryCandidates = files.filter((f) => /^index-.*\.js$/.test(f));
  if (entryCandidates.length === 0) {
    throw new Error('no index-*.js entry chunk under out/renderer/assets');
  }
  let entry = entryCandidates[0];
  let entrySize = 0;
  for (const f of entryCandidates) {
    const size = (await stat(path.join(ASSETS_DIR, f))).size;
    if (size > entrySize) {
      entry = f;
      entrySize = size;
    }
  }
  const entryCode = await readAsset(entry);

  const entryCalls = countDecoderCalls(entryCode);
  if (entryCalls < MIN_ENTRY_DECODER_CALLS) {
    throw new Error(
      `entry chunk has only ${entryCalls} string-array decoder-call sites ` +
        `(min ${MIN_ENTRY_DECODER_CALLS}) — obfuscateRendererPlugin did not run or matched nothing`,
    );
  }

  for (const literal of FORBIDDEN_PLAINTEXT) {
    if (entryCode.includes(literal)) {
      throw new Error(
        `entry chunk contains plaintext '${literal}' — stringArray did not absorb it ` +
          '(check forceTransformStrings / *.generated.ts coverage)',
      );
    }
  }

  const asyncifyChunk = files.find((f) => /^module-asyncify-.*\.js$/.test(f));
  if (asyncifyChunk) {
    const leaks = countDecoderCalls(await readAsset(asyncifyChunk));
    if (leaks > MAX_VENDOR_DECODER_CALLS) {
      throw new Error(
        `${asyncifyChunk} has ${leaks} decoder-call sites (max ${MAX_VENDOR_DECODER_CALLS}) — ` +
          'obfuscation leaked into the QuickJS emscripten chunk',
      );
    }
  }

  console.log(
    `renderer protect OK: ${entry} (${entryCalls} decoder-call sites, forced strings hidden, QuickJS chunk clean)`,
  );
};

main().catch((err) => {
  console.error(`[assert-renderer-protect] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
