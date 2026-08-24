/**
 * Fail-closed check that `build:main-protect` produced a V8-bytecode main entry.
 * Used by CI after protect, before electron-builder.
 *
 *   npx tsx tools/assert-main-protect.ts
 */
import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'out', 'main');
const PRELOAD_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'out',
  'preload',
);
const REQUIRED = ['index.cjs', 'index.jsc', 'bytecode-loader.cjs'] as const;
const MIN_JSC_BYTES = 1024;

const main = async (): Promise<void> => {
  for (const name of REQUIRED) {
    const p = path.join(MAIN_DIR, name);
    try {
      await access(p);
    } catch {
      throw new Error(`missing ${path.relative(process.cwd(), p)} after build:main-protect`);
    }
  }

  const jscPath = path.join(MAIN_DIR, 'index.jsc');
  const jscStat = await stat(jscPath);
  if (jscStat.size < MIN_JSC_BYTES) {
    throw new Error(`index.jsc too small (${jscStat.size} bytes)`);
  }

  const stub = await readFile(path.join(MAIN_DIR, 'index.cjs'), 'utf-8');
  if (!stub.includes('index.jsc')) {
    throw new Error('index.cjs is not a bytecode stub');
  }

  await assertPreloadRetainsDebugger();

  console.log(`main protect OK: index.jsc ${jscStat.size} bytes`);
};

const assertPreloadRetainsDebugger = async (): Promise<void> => {
  try {
    const files = (await readdir(PRELOAD_DIR)).filter((f) => f.endsWith('.cjs'));
    for (const file of files) {
      const content = await readFile(path.join(PRELOAD_DIR, file), 'utf-8');
      if (!content.includes('debugger')) {
        throw new Error(
          `${file} has no 'debugger' statement — preload anti-RE timing trap was stripped (check electron.vite.config.ts preload esbuild.drop)`,
        );
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return; // preload not built yet
    throw err;
  }
};

main().catch((err) => {
  console.error(`[assert-main-protect] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
