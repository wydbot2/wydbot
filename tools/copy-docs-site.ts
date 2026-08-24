/**
 * Copies the VitePress build output (`docs-site/.vitepress/dist/`) into the
 * Electron build output (`out/docs/`) so the packaged app can serve it from
 * a path relative to the main bundle.
 *
 * Cross-platform via `fs.cp` (no `cp -r` shell-out). Idempotent — clears the
 * destination first.
 */
import { cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(REPO_ROOT, 'docs-site', '.vitepress', 'dist');
const DEST = path.join(REPO_ROOT, 'out', 'docs');

const main = async (): Promise<void> => {
  await rm(DEST, { recursive: true, force: true });
  await cp(SRC, DEST, { recursive: true });
  console.log(`[copy-docs-site] copied ${SRC} → ${DEST}`);
};

main().catch((err) => {
  console.error(
    `[copy-docs-site] fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
  );
  process.exit(1);
});
