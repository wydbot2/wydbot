/**
 * CLI wrapper for the script-ctx codegen pipeline. Reuses the same extractor
 * and renderers as the Vite plugin without spinning up Vite.
 *
 * Modes:
 * - default: regenerate the artefacts and write to disk.
 * - `--check`: regenerate in memory, normalize `generatedAt` to '' before
 *   comparison, exit code 1 if any artefact differs from disk, 0 otherwise.
 *
 * Used by the lefthook `pre-commit` hook (in `--check` mode) to block commits
 * where the generated files are out of sync with `script-ctx.ts`.
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Project } from 'ts-morph';
import { extractScriptCtxMeta } from './script-ctx-codegen-extract';
import {
  renderAiMarkdown,
  renderDts,
  renderJson,
  stripGeneratedAt,
} from './script-ctx-codegen-render';
import type { ScriptCtxMeta } from './script-ctx-codegen-types';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const SOURCE_PATH = 'src/renderer/lib/script-ctx.ts';
const GUIDE_PATH = 'docs-site/guias/primeiros-passos.md';
const OUTPUT_DTS_PATH = 'src/renderer/lib/script-ctx-dts.generated.ts';
const OUTPUT_JSON_PATH = 'src/renderer/lib/script-ctx-meta.generated.json';
const OUTPUT_DOCS_PATH = 'src/renderer/lib/script-api-docs.generated.ts';

const generate = async (): Promise<{
  dts: string;
  json: string;
  docs: string;
  meta: ScriptCtxMeta;
}> => {
  const absSrc = path.resolve(REPO_ROOT, SOURCE_PATH);
  const srcText = await fs.readFile(absSrc, 'utf8');
  const guideText = await fs.readFile(path.resolve(REPO_ROOT, GUIDE_PATH), 'utf8');

  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const sourceFile = project.createSourceFile(absSrc, srcText, {
    overwrite: true,
  });

  const meta = extractScriptCtxMeta(sourceFile, SOURCE_PATH);
  return {
    dts: renderDts(meta),
    json: renderJson(meta),
    docs: renderAiMarkdown(meta, guideText),
    meta,
  };
};

const writeMode = async (): Promise<void> => {
  const { dts, json, docs } = await generate();
  await fs.writeFile(path.resolve(REPO_ROOT, OUTPUT_DTS_PATH), dts, 'utf8');
  await fs.writeFile(path.resolve(REPO_ROOT, OUTPUT_JSON_PATH), json, 'utf8');
  await fs.writeFile(path.resolve(REPO_ROOT, OUTPUT_DOCS_PATH), docs, 'utf8');
  console.log('[script-ctx-codegen] regenerated:');
  console.log(`  - ${OUTPUT_DTS_PATH}`);
  console.log(`  - ${OUTPUT_JSON_PATH}`);
  console.log(`  - ${OUTPUT_DOCS_PATH}`);
};

const checkMode = async (): Promise<void> => {
  const { dts: nextDts, json: nextJson, docs: nextDocs } = await generate();
  const absDts = path.resolve(REPO_ROOT, OUTPUT_DTS_PATH);
  const absJson = path.resolve(REPO_ROOT, OUTPUT_JSON_PATH);
  const absDocs = path.resolve(REPO_ROOT, OUTPUT_DOCS_PATH);

  let currentDts: string | null = null;
  let currentJson: string | null = null;
  let currentDocs: string | null = null;
  try {
    currentDts = await fs.readFile(absDts, 'utf8');
  } catch {
    // file missing — counts as drift
  }
  try {
    currentJson = await fs.readFile(absJson, 'utf8');
  } catch {
    // file missing — counts as drift
  }
  try {
    currentDocs = await fs.readFile(absDocs, 'utf8');
  } catch {
    // file missing — counts as drift
  }

  const drifted: string[] = [];
  if (currentDts !== nextDts) drifted.push(OUTPUT_DTS_PATH);
  if (currentJson === null || stripGeneratedAt(currentJson) !== stripGeneratedAt(nextJson)) {
    drifted.push(OUTPUT_JSON_PATH);
  }
  if (currentDocs !== nextDocs) drifted.push(OUTPUT_DOCS_PATH);

  if (drifted.length === 0) {
    console.log('[script-ctx-codegen] check: in sync');
    return;
  }

  console.error('[script-ctx-codegen] check FAILED — generated files are out of sync with source:');
  for (const file of drifted) {
    console.error(`  - ${file}`);
  }
  console.error('\nFix with: npm run codegen:script-ctx');
  process.exit(1);
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  if (args.includes('--check')) {
    await checkMode();
  } else {
    await writeMode();
  }
};

main().catch((err) => {
  console.error(
    `[script-ctx-codegen] fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
  );
  process.exit(1);
});
