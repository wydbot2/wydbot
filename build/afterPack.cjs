const fs = require('fs');
const path = require('path');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');

// Chromium UI locales to keep. en-US is the fallback Chromium expects; the
// app's own UI is pt-BR in code and does not depend on these .pak files.
const KEEP_LOCALES = new Set(['pt-BR', 'en-US']);

// On Windows/Linux electron-builder's `electronLanguages` is a no-op, so the
// flat `locales/*.pak` files are pruned here instead (mac uses
// mac.electronLanguages). `locales/` lives outside app.asar, so deleting
// files does not affect the EnableEmbeddedAsarIntegrityValidation fuse.
const pruneLocales = (appOutDir) => {
  const localesDir = path.join(appOutDir, 'locales');
  if (!fs.existsSync(localesDir)) return;
  for (const file of fs.readdirSync(localesDir)) {
    if (file.endsWith('.pak') && !KEEP_LOCALES.has(path.basename(file, '.pak'))) {
      fs.rmSync(path.join(localesDir, file));
    }
  }
};

module.exports = async (context) => {
  const ext = { darwin: '.app', win32: '.exe', linux: '' }[context.electronPlatformName];
  const binary = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}${ext}`,
  );

  await flipFuses(binary, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: context.electronPlatformName === 'darwin',
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    // Off: the portable build ships asar-only updates, and the .exe's baked hash
    // would reject a swapped app.asar. Integrity is enforced via SHA-256 at
    // download time. NOTE: without Windows code signing, enabling this fuse
    // alone adds no real protection — the fuse wire is a single byte after the
    // fixed sentinel `dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX` and is trivially
    // reversible with a hex editor (the OS only enforces fuses via signature
    // validation, which an unsigned build skips). Client-side tamper-resistance
    // for this repo's privileged paths is instead enforced by compile-time
    // `__PROD__` DCE + `strip-embedded-crypto-plugin`; see
    // `src/main/build-constants.d.ts` and `docs/security.md` §5.
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
  });

  if (context.electronPlatformName !== 'darwin') {
    pruneLocales(context.appOutDir);
  }
};
