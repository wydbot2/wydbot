'use strict';
/**
 * Bytecode compile helper — runs as a REAL Electron MAIN process (never
 * ELECTRON_RUN_AS_NODE). On Electron 42+ / V8 14.8 the code cache is bound to a
 * per-process-type read-only snapshot checksum (header @16): the main/browser process
 * boots V8 from Chromium's `v8_context_snapshot`, which differs from the Node default
 * snapshot used by `ELECTRON_RUN_AS_NODE`. Compiling here means the produced `.jsc`
 * carries the checksum the main process will actually expect at load time.
 *
 * Also uses `vm.compileFunction` (not `vm.Script`) so the cache is function-shaped and
 * matches the loader. See electron-vite#911 / bytenode "Known Issues".
 *
 * In/out via env-pointed temp files (a GUI-subsystem process can't pipe stdio):
 *   BYTECODE_IN  — path to the JS source to compile
 *   BYTECODE_OUT — path to write the V8 code cache buffer
 */
const { app } = require('electron');
const fs = require('fs');
const vm = require('vm');
const v8 = require('v8');

v8.setFlagsFromString('--no-lazy');
v8.setFlagsFromString('--no-flush-bytecode');
app.disableHardwareAcceleration();

// Must match the loader's COMPILE_PARAMS in compile-main-bytecode.ts exactly —
// compileFunction binds the cache to these parameter names.
const COMPILE_PARAMS = ['exports', 'require', 'module', '__filename', '__dirname'];

app.whenReady().then(() => {
  try {
    const code = fs.readFileSync(process.env.BYTECODE_IN, 'utf-8');
    const fn = vm.compileFunction(code, COMPILE_PARAMS, { produceCachedData: true });
    if (!fn.cachedData || fn.cachedData.length === 0) {
      throw new Error('compileFunction produced empty cachedData');
    }
    fs.writeFileSync(process.env.BYTECODE_OUT, fn.cachedData);
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  }
  app.quit();
});
