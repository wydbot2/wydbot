import { resolve } from 'path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cspPlugin, obfuscateRendererPlugin, scriptCtxCodegenPlugin } from './tools/vite-plugins';

export default defineConfig(({ command }) => {
  // `__PROD__` replaces `app.isPackaged` ONLY on the crypto-material dev-fallback
  // branch in `auth-manager.ts` (the V1 bypass vector). Other `app.isPackaged`
  // sites (devTools, menu, updater, app-icon) stay as-is — they are not
  // security-critical. In dev (`command === 'serve'`) `__PROD__` is `false`,
  // preserving the existing dev ergonomics. See `src/main/build-constants.d.ts`.
  const isBuild = command === 'build';

  return {
    main: {
      define: {
        __PROD__: JSON.stringify(isBuild),
      },
      resolve: {
        alias: {
          '@shared': resolve('src/shared'),
          '@main': resolve('src/main'),
        },
      },
      build: {
        minify: 'esbuild',
        sourcemap: false,
        // CJS entry is required for the post-build V8 bytecode protect step
        // (tools/compile-main-bytecode.ts). electron-vite's bytecode machinery only
        // supports CommonJS; with root "type":"module", a .js entry would be loaded
        // as ESM — use .cjs so require() works. Bytecode itself is NOT enabled here
        // (runs after obfuscate-main so decompile recovers obfuscated JS, not source).
        //
        // interop: 'auto' is required for pure-ESM externals (e.g. electron-serve)
        // whose require() returns { __esModule, default: fn } — without it, default
        // imports become "X is not a function" at load (breaks npm run dev + package).
        rollupOptions: {
          output: {
            format: 'cjs',
            entryFileNames: 'index.cjs',
            interop: 'auto',
          },
        },
      },
    },
    preload: {
      resolve: {
        alias: {
          '@shared': resolve('src/shared'),
        },
      },
      define: {
        __PROD__: JSON.stringify(isBuild),
      },
      build: {
        minify: 'esbuild',
        sourcemap: false,
        // Sandboxed preload requires CJS and must bundle all deps inline
        externalizeDeps: false,
        rollupOptions: {
          output: {
            format: 'cjs',
          },
        },
      },
    },
    renderer: {
      build: {
        minify: 'esbuild',
        sourcemap: false,
      },
      esbuild: {
        drop: ['debugger'],
        pure: ['console.log', 'console.debug', 'console.info', 'console.trace'],
      },
      plugins: [
        cspPlugin(),
        scriptCtxCodegenPlugin({
          sourcePath: 'src/renderer/lib/script-ctx.ts',
          outputDtsPath: 'src/renderer/lib/script-ctx-dts.generated.ts',
          outputJsonPath: 'src/renderer/lib/script-ctx-meta.generated.json',
          guidePath: 'docs-site/guias/primeiros-passos.md',
          outputDocsPath: 'src/renderer/lib/script-api-docs.generated.ts',
        }),
        // Obfuscates ONLY src/renderer/lib/** + stores/**, per-module, pre-bundle
        // (build-only — dev/HMR untouched). QuickJS/monaco/react live in
        // node_modules and are never matched. See tools/vite-plugins/obfuscate-renderer-plugin.ts.
        obfuscateRendererPlugin(),
        react(),
        tailwindcss(),
      ],
      resolve: {
        alias: {
          '@renderer': resolve('src/renderer'),
          '@shared': resolve('src/shared'),
        },
      },
      optimizeDeps: {
        // QuickJS ships a singlefile WASM build (base64-inlined) — Vite's
        // dep-pre-bundling has historically broken WASM resolution for this
        // package. Excluding it forces the renderer to import the published
        // ESM build verbatim, which works.
        //
        // monaco-editor is excluded for a different reason: Vite's pre-bundling
        // collapses its many side-effect imports (language registrations, theme
        // contributions) into a single chunk, which can re-order or drop the
        // registrations. Excluding keeps each import side-effect ordered as
        // authored — required for syntax highlighting to register correctly.
        exclude: ['quickjs-emscripten', 'monaco-editor'],
      },
    },
  };
});
