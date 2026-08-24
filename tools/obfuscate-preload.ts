import { randomInt } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JavaScriptObfuscator, { type ObfuscatorOptions } from 'javascript-obfuscator';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(REPO_ROOT, 'out', 'preload', 'index.cjs');

const OPTIONS: ObfuscatorOptions = {
  compact: true,
  target: 'browser',
  stringArray: true,
  stringArrayEncoding: ['base64', 'rc4'],
  stringArrayThreshold: 1,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  splitStrings: true,
  splitStringsChunkLength: 5,
  stringArrayWrappersCount: 3,
  numbersToExpressions: true,
  identifierNamesGenerator: 'mangled',
  renameGlobals: false,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.3,
  selfDefending: false,
  // Per-build polymorphism — see tools/obfuscate-main.ts for rationale.
  seed: process.env.OBFUSCATE_SEED
    ? parseInt(process.env.OBFUSCATE_SEED, 10)
    : randomInt(0, 2147483647),
};

const main = async (): Promise<void> => {
  try {
    await access(TARGET);
  } catch {
    const msg = `[obfuscate-preload] ${TARGET} not found — run electron-vite build first`;
    if (process.env.CI) {
      console.error(msg);
      process.exit(1);
    }
    console.log(`${msg} (skipping outside CI)`);
    return;
  }

  const source = await readFile(TARGET, 'utf-8');
  const obfuscated = JavaScriptObfuscator.obfuscate(source, OPTIONS).getObfuscatedCode();
  await writeFile(TARGET, obfuscated, 'utf-8');
  console.log(
    `[obfuscate-preload] obfuscated preload (${source.length} → ${obfuscated.length} bytes)`,
  );
};

main().catch((err) => {
  console.error(
    `[obfuscate-preload] fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
  );
  process.exit(1);
});
