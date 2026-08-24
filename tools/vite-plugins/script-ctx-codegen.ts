/**
 * Vite plugin that keeps `script-ctx-dts.generated.ts`,
 * `script-ctx-meta.generated.json` and `script-api-docs.generated.ts` in sync
 * with the `ScriptCtx` interface declared in `src/renderer/lib/script-ctx.ts`
 * (plus the `docs-site/guias/primeiros-passos.md` guide for the docs artefact).
 *
 * Lifecycle:
 * - `buildStart`: regenerate the artefacts at the start of every build
 *   and dev server boot.
 * - `hotUpdate`: regenerate when the source or guide file changes in dev. The hook
 *   filters by absolute path so writes to the generated files do not
 *   re-trigger it (anti-loop). An in-closure cache compares new bytes to
 *   the last written bytes and skips writes if equal — second line of
 *   defense against unnecessary HMR churn.
 *
 * Behaviour on extraction error:
 * - Build mode: hard fail (`this.error`).
 * - Dev mode: soft warn — autocomplete goes stale but the dev server
 *   keeps running.
 *
 * `strict: true` forces hard fail in dev too.
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import type { Plugin } from 'vite';
import { Project, type SourceFile } from 'ts-morph';
import { extractScriptCtxMeta } from './script-ctx-codegen-extract';
import {
  renderAiMarkdown,
  renderDts,
  renderJson,
  stripGeneratedAt,
} from './script-ctx-codegen-render';

export interface ScriptCtxCodegenOptions {
  /** Source file path, relative to Vite root. */
  readonly sourcePath: string;
  /** Generated DTS path, relative to Vite root. */
  readonly outputDtsPath: string;
  /** Generated JSON path, relative to Vite root. */
  readonly outputJsonPath: string;
  /** Guide markdown (primeiros-passos) that feeds the docs artefact. */
  readonly guidePath: string;
  /** Generated docs module path (`SCRIPT_API_DOCS_MD`), relative to Vite root. */
  readonly outputDocsPath: string;
  /** When true, fail loudly on extraction errors even in dev. Default: false in dev, true in build. */
  readonly strict?: boolean;
}

export const scriptCtxCodegenPlugin = (opts: ScriptCtxCodegenOptions): Plugin => {
  let resolvedSrc = '';
  let resolvedDts = '';
  let resolvedJson = '';
  let resolvedGuide = '';
  let resolvedDocs = '';
  let isDev = false;
  let project: Project | null = null;
  let lastDtsBytes: string | null = null;
  // Cache stores the JSON with `generatedAt` stripped, so a regeneration that
  // only changes the timestamp does not trigger a redundant disk write. The
  // file on disk keeps the full JSON (timestamp included) for traceability.
  let lastJsonStripped: string | null = null;
  let lastDocsBytes: string | null = null;

  const regenerate = async (): Promise<{ changed: boolean }> => {
    if (!project) {
      project = new Project({ skipAddingFilesFromTsConfig: true });
    }
    const srcText = await fs.readFile(resolvedSrc, 'utf8');
    const guideText = await fs.readFile(resolvedGuide, 'utf8');
    const sf: SourceFile = project.createSourceFile(resolvedSrc, srcText, {
      overwrite: true,
    });

    const meta = extractScriptCtxMeta(sf, opts.sourcePath);
    const nextDts = renderDts(meta);
    const nextJson = renderJson(meta);
    const nextDocs = renderAiMarkdown(meta, guideText);

    let changed = false;
    if (nextDts !== lastDtsBytes) {
      await fs.writeFile(resolvedDts, nextDts, 'utf8');
      lastDtsBytes = nextDts;
      changed = true;
    }
    const nextJsonStripped = stripGeneratedAt(nextJson);
    if (nextJsonStripped !== lastJsonStripped) {
      await fs.writeFile(resolvedJson, nextJson, 'utf8');
      lastJsonStripped = nextJsonStripped;
      changed = true;
    }
    if (nextDocs !== lastDocsBytes) {
      await fs.writeFile(resolvedDocs, nextDocs, 'utf8');
      lastDocsBytes = nextDocs;
      changed = true;
    }
    return { changed };
  };

  return {
    name: 'wyd:script-ctx-codegen',

    configResolved(config) {
      // Electron-vite gives each environment its own `config.root` (e.g.
      // `src/renderer/` for the renderer build), but our paths are relative
      // to the repo root. `process.cwd()` is the repo root when running
      // npm scripts (`npm run dev`, `npm run build`).
      const repoRoot = process.cwd();
      resolvedSrc = path.resolve(repoRoot, opts.sourcePath);
      resolvedDts = path.resolve(repoRoot, opts.outputDtsPath);
      resolvedJson = path.resolve(repoRoot, opts.outputJsonPath);
      resolvedGuide = path.resolve(repoRoot, opts.guidePath);
      resolvedDocs = path.resolve(repoRoot, opts.outputDocsPath);
      isDev = config.command === 'serve';
    },

    async buildStart() {
      try {
        await regenerate();
      } catch (err) {
        const msg = `[script-ctx-codegen] extraction failed: ${err instanceof Error ? err.message : String(err)}`;
        if (opts.strict ?? !isDev) {
          this.error(msg);
        } else {
          this.warn(msg);
        }
      }
    },

    async hotUpdate(ctx) {
      if (ctx.file !== resolvedSrc && ctx.file !== resolvedGuide) return;
      try {
        await regenerate();
        // Vite's file watcher picks up the regenerated outputs separately
        // and fires HMR for their consumers — no need to invalidate here.
      } catch (err) {
        ctx.server.config.logger.warn(
          `[script-ctx-codegen] regen failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  };
};
