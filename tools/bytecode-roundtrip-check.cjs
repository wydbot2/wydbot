'use strict';
/**
 * Bytecode roundtrip check — runs as a REAL Electron main process. Registers the
 * shipped bytecode-loader, requires a canary .jsc, and verifies the canary's
 * HOF/arrow-closure received its emitted payload (the exact secureListener pattern
 * that silently broke on V8 14.8 in the 0.40.0 incident).
 *
 * Env:
 *   LOADER_PATH — path to the shipped out/main/bytecode-loader.cjs
 *   CANARY_PATH — path to the compiled canary .jsc
 *   RESULT_PATH — where to write the JSON verdict
 */
const { app } = require('electron');
app.disableHardwareAcceleration();
app.whenReady().then(() => {
  const fs = require('fs');
  let out;
  try {
    require(process.env.LOADER_PATH);
    const result = require(process.env.CANARY_PATH);
    const r = result && result.received;
    const ok =
      result &&
      result.outcome === 'ACCEPTED' &&
      !!(r && r.server && r.server.ip === '1.2.3.4' && r.server.port === 8484);
    out = { ok, outcome: result && result.outcome, received: r === undefined ? 'undefined' : r };
  } catch (e) {
    out = { ok: false, error: String((e && e.message) || e) };
  }
  fs.writeFileSync(process.env.RESULT_PATH, JSON.stringify(out));
  app.exit(0);
});
