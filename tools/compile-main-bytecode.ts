/**
 * Compiles the obfuscated MAIN bundle (`out/main/index.cjs`) to V8 bytecode.
 * Runs AFTER obfuscate-main and BEFORE electron-builder so the shipped asar
 * contains `.jsc` rather than editable JS.
 *
 * Why not `build.bytecode` in electron.vite.config?
 * That plugin compiles inside `electron-vite build`, which would run *before*
 * obfuscation. Post-build compile keeps: obfuscate → bytecode → package, so a
 * decompiler recovers obfuscated CJS, not clean TypeScript.
 *
 * ─── V8 14.8 / Electron 42 fix (electron-vite#911, bytenode "Known Issues") ───
 * The previous version compiled with `ELECTRON_RUN_AS_NODE=1` and loaded with
 * `vm.Script` + a shared `zeroWidthSpace` dummy + a flagHash-only header patch.
 * On V8 14.8 that pipeline silently misexecutes: the run-as-node code cache carries
 * a different read-only snapshot checksum (header @16) than the Electron main process
 * expects (electron/electron#51831), and `vm.Script` can report
 * `cachedDataRejected === false` while running the placeholder instead of the cache —
 * producing a mostly-working app with subtly-broken closures (the 0.40.0
 * "IPC payload invalid" incident, where a secureListener closure received `undefined`).
 *
 * This version follows the electron-vite#912 recipe:
 *   1. compile in a REAL Electron main process (bytecode-compile-main.cjs), never
 *      ELECTRON_RUN_AS_NODE, so the snapshot checksum matches the runtime;
 *   2. load via `vm.compileFunction` (which on 14.8 executes the cache, not the
 *      placeholder) with `--no-lazy`;
 *   3. unique placeholder per file (embeds the filename) to avoid V8's source-keyed
 *      CompilationCache returning a previously-compiled function for a same-length
 *      dummy;
 *   4. no header-byte patching — an incompatible cache fails loudly via
 *      `cachedDataRejected` instead of corrupting execution.
 *
 * Bytecode is OS/arch/Electron-version specific. Production Windows asars must be
 * produced on Windows with the same Electron the user runs (CI windows-latest). The
 * compile helper spawns the Electron browser process, so the build machine must run
 * Electron: Windows/macOS runners work out of the box; Linux runners need xvfb.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { access, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAIN_DIR = path.join(REPO_ROOT, 'out', 'main');
const SOURCE = path.join(MAIN_DIR, 'index.cjs');
const BYTECODE_OUT = path.join(MAIN_DIR, 'index.jsc');
const LOADER_OUT = path.join(MAIN_DIR, 'bytecode-loader.cjs');
const COMPILE_HELPER = path.join(REPO_ROOT, 'tools', 'bytecode-compile-main.cjs');

/**
 * Loader for the compiled `.jsc`. Loads via `vm.compileFunction` with a per-file
 * unique placeholder and NO header patching, so an incompatible cache is rejected
 * loudly (`cachedDataRejected`) rather than silently executing the wrong code on
 * V8 14.8. `COMPILE_PARAMS` must match tools/bytecode-compile-main.cjs.
 */
const BYTECODE_LOADER = `"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const v8 = require("v8");
const Module = require("module");
v8.setFlagsFromString("--no-lazy");
v8.setFlagsFromString("--no-flush-bytecode");
const COMPILE_PARAMS = ["exports", "require", "module", "__filename", "__dirname"];
const SOURCE_HASH_OFFSET = 8;
// The low 28 bits of the source-hash field hold the source length; the high bits are
// V8 source-hash flags (e.g. the "wrapped" bit vm.compileFunction sets).
function sourceLength(bytecodeBuffer) {
  return bytecodeBuffer.readUInt32LE(SOURCE_HASH_OFFSET) & 0x0fffffff;
};
// Same-length body so the source hash matches. Its CONTENT is ignored (V8 runs the
// cached bytecode) but it must be UNIQUE per file, otherwise V8's in-isolate
// compilation cache returns a previously-compiled function for an identical source.
function placeholderBody(len, filename) {
  const tag = "/*" + filename + " ";
  if (tag.length + 2 <= len) { return tag + " ".repeat(len - tag.length - 2) + "*/"; }
  if (len >= 4) { return "/*" + (filename + " ").slice(0, len - 4).padEnd(len - 4, " ") + "*/"; }
  return " ".repeat(len);
};
Module._extensions[".jsc"] = Module._extensions[".cjsc"] = function (module, filename) {
  const bytecodeBuffer = fs.readFileSync(filename);
  if (!Buffer.isBuffer(bytecodeBuffer)) {
    throw new Error("BytecodeBuffer must be a buffer object.");
  }
  const placeholder = placeholderBody(sourceLength(bytecodeBuffer), filename);
  const compiledWrapper = vm.compileFunction(placeholder, COMPILE_PARAMS, {
    filename: filename,
    cachedData: bytecodeBuffer
  });
  if (compiledWrapper.cachedDataRejected) {
    throw new Error("Invalid or incompatible cached data (cachedDataRejected)");
  }
  const require = function (id) {
    return module.require(id);
  };
  require.resolve = function (request, options) {
    return Module._resolveFilename(request, module, false, options);
  };
  if (process.mainModule) {
    require.main = process.mainModule;
  }
  require.extensions = Module._extensions;
  require.cache = Module._cache;
  const dirname = path.dirname(filename);
  return compiledWrapper.call(module.exports, module.exports, require, module, filename, dirname);
};
`;

const ENTRY_STUB = `"use strict";
require("./bytecode-loader.cjs");
require("./index.jsc");
`;

/**
 * Path to the Electron binary for this project's Electron version.
 *
 * Official install model (Electron 42+): the npm package does not ship the
 * binary; `require('electron')` runs getElectronPath() and downloads via
 * install.js if `path.txt` / dist are missing. Do NOT use require.resolve()
 * alone — that never executes index.js and never materializes the binary (CI
 * clean `npm ci` then fails with a fake "Electron uninstall").
 *
 * @see https://www.electronjs.org/docs/latest/tutorial/installation
 */
const getElectronPath = (): string => {
  if (process.env.ELECTRON_EXEC_PATH) return process.env.ELECTRON_EXEC_PATH;
  // module.exports = getElectronPath() → string path; may download on first call
  const electronPath = require('electron') as string;
  if (typeof electronPath !== 'string' || electronPath.length === 0) {
    throw new Error(
      'require("electron") did not return a binary path — run `npx install-electron --no`',
    );
  }
  return electronPath;
};

/**
 * Compiles `code` to a V8 code cache by spawning a real Electron MAIN process
 * (bytecode-compile-main.cjs). Code in / cache out go through temp files because a
 * GUI-subsystem Electron process can't pipe stdio. Never sets ELECTRON_RUN_AS_NODE.
 */
const compileToBytecode = (code: string): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const electronPath = getElectronPath();
    const id = `${process.pid}-${Date.now()}`;
    const tmp = os.tmpdir();
    const inFile = path.join(tmp, `wyd-bytecode-${id}.in.cjs`);
    const outFile = path.join(tmp, `wyd-bytecode-${id}.jsc`);

    const run = async (): Promise<void> => {
      await writeFile(inFile, code, 'utf-8');
      const env: NodeJS.ProcessEnv = { ...process.env, BYTECODE_IN: inFile, BYTECODE_OUT: outFile };
      delete env.ELECTRON_RUN_AS_NODE;

      // Real Electron browser (main) process. --no-sandbox keeps it runnable in
      // containers / elevated CI; no window is created so no display is needed on
      // Windows/macOS (Linux would need xvfb).
      const proc = spawn(electronPath, ['--no-sandbox', COMPILE_HELPER], {
        env,
        stdio: ['ignore', 'ignore', 'pipe'],
      });

      const stderr: Buffer[] = [];
      proc.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk));
      proc.on('error', reject);
      proc.on('close', async (code2) => {
        try {
          const out = await readFile(outFile);
          if (code2 !== 0 || out.length === 0) {
            reject(
              new Error(
                `bytecode compile failed (exit ${code2}): ${Buffer.concat(stderr).toString('utf8') || '(no stderr)'}`,
              ),
            );
            return;
          }
          resolve(out);
        } catch {
          reject(
            new Error(
              `bytecode compile produced no output (exit ${code2}): ${Buffer.concat(stderr).toString('utf8') || '(no stderr)'}`,
            ),
          );
        } finally {
          await rm(inFile, { force: true });
          await rm(outFile, { force: true });
        }
      });
    };

    run().catch(reject);
  });

const main = async (): Promise<void> => {
  if (process.env.CI && process.platform !== 'win32') {
    console.error(
      '[compile-main-bytecode] CI is set but platform is not win32 — refusing to emit non-Windows bytecode for a Windows release pipeline',
    );
    process.exit(1);
  }
  if (!process.env.CI && process.platform !== 'win32') {
    console.warn(
      `[compile-main-bytecode] warning: compiling on ${process.platform} — bytecode will only run on this OS/arch/Electron; Windows releases must be built on Windows CI`,
    );
  }

  try {
    await access(SOURCE);
  } catch {
    console.error(
      `[compile-main-bytecode] ${SOURCE} not found — run electron-vite build (+ obfuscate) first`,
    );
    process.exit(1);
  }

  const source = await readFile(SOURCE, 'utf-8');
  if (source.includes('require("./index.jsc")') || source.includes("require('./index.jsc')")) {
    console.error(
      '[compile-main-bytecode] index.cjs already looks like a bytecode stub — refusing to re-compile',
    );
    process.exit(1);
  }

  console.log(
    `[compile-main-bytecode] compiling ${SOURCE} (${source.length} bytes) in a real Electron main process…`,
  );
  const bytecode = await compileToBytecode(source);
  await mkdir(MAIN_DIR, { recursive: true });
  await writeFile(BYTECODE_OUT, bytecode);
  await writeFile(LOADER_OUT, BYTECODE_LOADER, 'utf-8');
  await writeFile(SOURCE, ENTRY_STUB, 'utf-8');

  console.log(
    `[compile-main-bytecode] wrote index.jsc (${bytecode.length} bytes), bytecode-loader.cjs, and entry stub`,
  );
};

main().catch((err) => {
  console.error(
    `[compile-main-bytecode] fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
  );
  process.exit(1);
});
