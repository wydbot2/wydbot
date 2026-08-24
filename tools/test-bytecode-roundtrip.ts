/**
 * Bytecode roundtrip smoke test (fail-closed CI gate).
 *
 * Compiles a canary module — a HOF returning an arrow closure that reads its 2nd
 * arg, the exact `secureListener` shape that silently broke on V8 14.8 — through the
 * SAME real-Electron-main compile path as the shipped main, then loads it via the
 * SHIPPED `out/main/bytecode-loader.cjs` in a real Electron main process and asserts
 * the closure received its payload.
 *
 * On a broken pipeline (e.g. run-as-node compile on Electron 42+/V8 14.8), the loaded
 * closure reads `undefined` and this exits 1 — so a bad bytecode build fails loudly in
 * CI instead of shipping a client that hangs at "conectando...".
 *
 * Must run on the SAME platform as the release build (Windows CI): bytecode is
 * OS/arch/Electron-specific, and the misexecution only manifests where the run-as-node
 * and main-process snapshots diverge.
 *
 *   npx tsx tools/test-bytecode-roundtrip.ts
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, writeFile, rm, copyFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAIN_DIR = path.join(REPO_ROOT, 'out', 'main');
const SHIPPED_LOADER = path.join(MAIN_DIR, 'bytecode-loader.cjs');
const COMPILE_HELPER = path.join(REPO_ROOT, 'tools', 'bytecode-compile-main.cjs');
const CHECK_HELPER = path.join(REPO_ROOT, 'tools', 'bytecode-roundtrip-check.cjs');

/** Mirrors the real secureListener: HOF → arrow closure → schema.safeParse(raw). */
const CANARY_SOURCE = `"use strict";
const { z } = require("zod");
const { EventEmitter } = require("events");
const Schema = z.object({ server: z.object({ ip: z.string(), port: z.number() }) });
// Exact shape of src/main/ipc/secure-handler.ts secureListener.
const secureListener = (schema, listener) => (event, raw) => {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) { module.exports.outcome = "REJECTED"; return; }
  listener(parsed.data);
};
let received = "NOT_CALLED";
const ee = new EventEmitter();
ee.on("wyd:connect", secureListener(Schema, (data) => { received = data; }));
ee.emit("wyd:connect", { sender: { id: 1 } }, { server: { ip: "1.2.3.4", port: 8484 } });
module.exports = { outcome: received === "NOT_CALLED" ? "NOT_CALLED" : "ACCEPTED", received };
`;

const getElectronPath = (): string => {
  if (process.env.ELECTRON_EXEC_PATH) return process.env.ELECTRON_EXEC_PATH;
  const electronPath = require('electron') as string;
  if (typeof electronPath !== 'string' || electronPath.length === 0) {
    throw new Error(
      'require("electron") did not return a binary path — run `npx install-electron --no`',
    );
  }
  return electronPath;
};

const spawnElectron = (args: string[], env: NodeJS.ProcessEnv): Promise<number> =>
  new Promise((resolve, reject) => {
    const proc = spawn(getElectronPath(), args, { env, stdio: ['ignore', 'ignore', 'inherit'] });
    proc.on('error', reject);
    proc.on('close', (code) => resolve(code ?? 1));
  });

const main = async (): Promise<void> => {
  try {
    await access(SHIPPED_LOADER);
  } catch {
    console.error('[bytecode-roundtrip] shipped loader not found — run build:main-protect first');
    process.exit(1);
  }

  // Place the canary inside the repo so its require('zod')/'events' resolves against
  // the project's node_modules (the loader uses module.require, resolved from the
  // canary's own directory upward).
  const tmp = await mkdtemp(path.join(REPO_ROOT, 'out', '.bytecode-roundtrip-'));
  try {
    const inFile = path.join(tmp, 'canary.cjs');
    const jscFile = path.join(tmp, 'canary.jsc');
    const loaderFile = path.join(tmp, 'bytecode-loader.cjs');
    const resultFile = path.join(tmp, 'result.json');

    await writeFile(inFile, CANARY_SOURCE, 'utf-8');
    await copyFile(SHIPPED_LOADER, loaderFile);

    // 1. Compile the canary through the same real-Electron-main compile path.
    const compileEnv: NodeJS.ProcessEnv = {
      ...process.env,
      BYTECODE_IN: inFile,
      BYTECODE_OUT: jscFile,
    };
    delete compileEnv.ELECTRON_RUN_AS_NODE;
    const compileCode = await spawnElectron(['--no-sandbox', COMPILE_HELPER], compileEnv);
    if (compileCode !== 0) {
      console.error(`[bytecode-roundtrip] canary compile failed (exit ${compileCode})`);
      process.exit(1);
    }

    // 2. Load it via the SHIPPED loader in a real Electron main process and assert.
    const checkEnv: NodeJS.ProcessEnv = {
      ...process.env,
      LOADER_PATH: loaderFile,
      CANARY_PATH: jscFile,
      RESULT_PATH: resultFile,
    };
    delete checkEnv.ELECTRON_RUN_AS_NODE;
    await spawnElectron(['--no-sandbox', CHECK_HELPER], checkEnv);

    const verdict = JSON.parse(await readFile(resultFile, 'utf-8')) as {
      ok?: boolean;
      received?: unknown;
      error?: string;
    };
    if (!verdict.ok) {
      console.error(
        `[bytecode-roundtrip] FAIL — bytecoded closure did not receive its payload. ` +
          `received=${JSON.stringify(verdict.received)} error=${verdict.error ?? '(none)'}. ` +
          `The bytecode pipeline is misexecuting on this platform (see electron-vite#911).`,
      );
      process.exit(1);
    }
    console.log('[bytecode-roundtrip] OK — bytecoded closure received its payload correctly');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
};

main().catch((err) => {
  console.error(
    `[bytecode-roundtrip] fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
  );
  process.exit(1);
});
