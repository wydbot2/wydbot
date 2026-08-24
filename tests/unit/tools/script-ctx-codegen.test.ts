/**
 * Unit tests for the script-ctx codegen pipeline.
 *
 * Covers: extractor (AST → meta), DTS renderer, JSON renderer. Uses
 * ts-morph's in-memory file system so tests never touch disk.
 *
 * Smoke test E reads the real `src/renderer/lib/script-ctx.ts` to catch
 * regressions when the source interface changes.
 */
import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractScriptCtxMeta } from '../../../tools/vite-plugins/script-ctx-codegen-extract';
import {
  renderAiMarkdown,
  renderDts,
  renderJson,
} from '../../../tools/vite-plugins/script-ctx-codegen-render';
import type {
  MemberMeta,
  PropertyMemberMeta,
  ScriptCtxMeta,
  TypeMeta,
} from '../../../tools/vite-plugins/script-ctx-codegen-types';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const buildProject = (sourceText: string) => {
  const project = new Project({ useInMemoryFileSystem: true });
  const sf = project.createSourceFile('script-ctx.ts', sourceText);
  return { project, sf };
};

const findInterface = (meta: ScriptCtxMeta, name: string) =>
  meta.interfaces.find((i) => i.name === name);

const findMember = (members: readonly MemberMeta[], name: string): MemberMeta | undefined =>
  members.find((m) => m.name === name);

// Prelude of referenced types every fixture needs (both are EXPOSED_INTERFACES).
const MIN_SCRIPT_ITEM = `
export interface Item {
  readonly slot: number;
  readonly itemId: number;
  readonly name: string;
}
export interface ItemShort {
  readonly itemId: number;
  readonly name: string;
}
`;

const minimalSource =
  MIN_SCRIPT_ITEM +
  `
export interface Entidade {
  readonly index: number;
  readonly name: string;
  readonly position: Readonly<{ x: number; y: number }>;
}
export interface ScriptCtx {
  readonly player: { readonly hp: number };
  readonly npcs: ReadonlyArray<Entidade>;
  readonly api: Readonly<{
    move(x: number, y: number): Promise<void>;
  }>;
  log(message: string): void;
}
`;

// ─── Suite A — Extractor ─────────────────────────────────────────────

describe('A — extractScriptCtxMeta', () => {
  it('finds Item, Entidade and ScriptCtx', () => {
    const { sf } = buildProject(minimalSource);
    const meta = extractScriptCtxMeta(sf, 'script-ctx.ts');
    expect(meta.interfaces.map((i) => i.name)).toEqual([
      'Item',
      'ItemShort',
      'Entidade',
      'ScriptCtx',
    ]);
  });

  it('throws when ScriptCtx is missing', () => {
    const { sf } = buildProject(`
      export interface Entidade { readonly index: number; readonly name: string; readonly position: Readonly<{ x: number; y: number }>; }
    `);
    expect(() => extractScriptCtxMeta(sf, 'x.ts')).toThrowError(/ScriptCtx/);
  });

  it('unwraps Readonly<{...}> propagating readonly to property members', () => {
    const { sf } = buildProject(minimalSource);
    const meta = extractScriptCtxMeta(sf, 'x.ts');
    const ctx = findInterface(meta, 'ScriptCtx');
    const api = findMember(ctx!.members, 'api') as PropertyMemberMeta;
    expect(api.type.kind).toBe('object'); // unwrapped, not 'reference' to Readonly
  });

  it('encodes ReadonlyArray<T> with readonly: true', () => {
    const { sf } = buildProject(minimalSource);
    const meta = extractScriptCtxMeta(sf, 'x.ts');
    const ctx = findInterface(meta, 'ScriptCtx');
    const npcs = findMember(ctx!.members, 'npcs') as PropertyMemberMeta;
    expect(npcs.type).toMatchObject({
      kind: 'array',
      readonly: true,
      element: { kind: 'reference', name: 'Entidade' },
    });
  });

  it('encodes Promise<void> as { kind: "promise", resolved: { kind: "primitive", name: "void" } }', () => {
    const { sf } = buildProject(minimalSource);
    const meta = extractScriptCtxMeta(sf, 'x.ts');
    const ctx = findInterface(meta, 'ScriptCtx');
    const api = findMember(ctx!.members, 'api') as PropertyMemberMeta;
    if (api.type.kind !== 'object') throw new Error('expected object');
    const move = findMember(api.type.members, 'move');
    if (!move || move.kind !== 'method') throw new Error('expected method');
    expect(move.returns).toEqual({
      kind: 'promise',
      resolved: { kind: 'primitive', name: 'void' },
    });
  });

  it('captures optional question token on parameters', () => {
    const { sf } = buildProject(
      MIN_SCRIPT_ITEM +
        `
      export interface Entidade { readonly index: number; readonly name: string; readonly position: Readonly<{ x: number; y: number }>; }
      export interface ScriptCtx {
        pause(reason?: string): void;
      }
    `,
    );
    const meta = extractScriptCtxMeta(sf, 'x.ts');
    const ctx = findInterface(meta, 'ScriptCtx');
    const pause = findMember(ctx!.members, 'pause');
    if (!pause || pause.kind !== 'method') throw new Error('expected method');
    expect(pause.params[0]?.optional).toBe(true);
  });

  it('captures @param descriptions and merges into ParamMeta', () => {
    const { sf } = buildProject(
      MIN_SCRIPT_ITEM +
        `
      export interface Entidade { readonly index: number; readonly name: string; readonly position: Readonly<{ x: number; y: number }>; }
      export interface ScriptCtx {
        /**
         * Walk to (x, y).
         * @param x Coord X.
         * @param y Coord Y.
         */
        move(x: number, y: number): Promise<void>;
      }
    `,
    );
    const meta = extractScriptCtxMeta(sf, 'x.ts');
    const move = findMember(findInterface(meta, 'ScriptCtx')!.members, 'move');
    if (!move || move.kind !== 'method') throw new Error('expected method');
    expect(move.params[0]?.description).toBe('Coord X.');
    expect(move.params[1]?.description).toBe('Coord Y.');
  });

  it('captures multi-line description preserving newlines', () => {
    const { sf } = buildProject(
      MIN_SCRIPT_ITEM +
        `
      export interface Entidade { readonly index: number; readonly name: string; readonly position: Readonly<{ x: number; y: number }>; }
      /**
       * First line.
       *
       * Second paragraph.
       */
      export interface ScriptCtx {
        log(message: string): void;
      }
    `,
    );
    const meta = extractScriptCtxMeta(sf, 'x.ts');
    const desc = findInterface(meta, 'ScriptCtx')?.jsDoc?.description;
    expect(desc).toContain('First line.');
    expect(desc).toContain('Second paragraph.');
  });

  it('falls back to "unsupported" for unrecognised type nodes', () => {
    const { sf } = buildProject(
      MIN_SCRIPT_ITEM +
        `
      export interface Entidade { readonly index: number; readonly name: string; readonly position: Readonly<{ x: number; y: number }>; }
      export interface ScriptCtx {
        readonly weird: [number, string];
      }
    `,
    );
    const meta = extractScriptCtxMeta(sf, 'x.ts');
    const weird = findMember(
      findInterface(meta, 'ScriptCtx')!.members,
      'weird',
    ) as PropertyMemberMeta;
    expect(weird.type.kind).toBe('unsupported');
  });
});

// ─── Suite B — Renderer DTS ──────────────────────────────────────────

describe('B — renderDts', () => {
  it('emits the @generated banner', () => {
    const { sf } = buildProject(minimalSource);
    const meta = extractScriptCtxMeta(sf, 'x.ts');
    expect(renderDts(meta)).toMatch(/^\/\* @generated/);
  });

  it('terminates with `declare const ctx: ScriptCtx;` followed by closing backtick', () => {
    const { sf } = buildProject(minimalSource);
    const meta = extractScriptCtxMeta(sf, 'x.ts');
    expect(renderDts(meta)).toMatch(/declare const ctx: ScriptCtx;\n`;\n$/);
  });

  it('round-trips: render → parse → re-extract gives equivalent shape', () => {
    const { sf } = buildProject(minimalSource);
    const meta1 = extractScriptCtxMeta(sf, 'x.ts');

    // Extract just the inner DTS body from the rendered output and parse it.
    // The body is a string template; we need to strip wrapping `export const SCRIPT_CTX_DTS = ...;` and unescape.
    const dtsSource = renderDts(meta1);
    const inner = dtsSource
      .replace(/^[\s\S]*?export const SCRIPT_CTX_DTS = `\n/, '')
      .replace(/`;\n$/, '')
      .replace(/\\\$\{/g, '${')
      .replace(/\\`/g, '`')
      .replace(/\\\\/g, '\\')
      // strip `declare ` so ts-morph parses the interfaces normally
      .replace(/declare interface/g, 'interface')
      .replace(/declare const ctx: ScriptCtx;/, '');

    const project2 = new Project({ useInMemoryFileSystem: true });
    const sf2 = project2.createSourceFile('round.ts', inner);
    const meta2 = extractScriptCtxMeta(sf2, 'round.ts');

    // generatedAt and sourcePath differ; compare interface trees only
    expect(meta2.interfaces).toEqual(meta1.interfaces);
  });
});

// ─── Suite C — Renderer JSON ─────────────────────────────────────────

describe('C — renderJson', () => {
  it('produces valid JSON with schemaVersion 1', () => {
    const { sf } = buildProject(minimalSource);
    const meta = extractScriptCtxMeta(sf, 'x.ts');
    const json = renderJson(meta);
    const parsed = JSON.parse(json);
    expect(parsed.schemaVersion).toBe(1);
  });

  it('terminates with a trailing newline', () => {
    const { sf } = buildProject(minimalSource);
    const meta = extractScriptCtxMeta(sf, 'x.ts');
    expect(renderJson(meta).endsWith('\n')).toBe(true);
  });

  it('is byte-identical when re-rendered with the same meta', () => {
    const { sf } = buildProject(minimalSource);
    const meta = extractScriptCtxMeta(sf, 'x.ts');
    expect(renderJson(meta)).toBe(renderJson(meta));
  });
});

// ─── Suite C2 — Renderer single-file markdown ─────────────────────────────────

describe('C2 — renderAiMarkdown', () => {
  const GUIDE = '# Primeiros passos\n\nTexto do guia com `ctx` inline.\n';

  // Undoes the template-literal escaping so assertions read the real markdown.
  const unwrap = (out: string): string =>
    out
      .replace(/^[\s\S]*?export const SCRIPT_API_DOCS_MD = `\n/, '')
      .replace(/`;\n$/, '')
      .replace(/\\\$\{/g, '${')
      .replace(/\\`/g, '`')
      .replace(/\\\\/g, '\\');

  const renderMd = (source: string): string => {
    const { sf } = buildProject(source);
    return unwrap(renderAiMarkdown(extractScriptCtxMeta(sf, 'x.ts'), GUIDE));
  };

  it('wraps the markdown in a SCRIPT_API_DOCS_MD template-literal export with banner', () => {
    const { sf } = buildProject(minimalSource);
    const out = renderAiMarkdown(extractScriptCtxMeta(sf, 'x.ts'), GUIDE);
    expect(out).toMatch(/^\/\* @generated/);
    expect(out).toContain('export const SCRIPT_API_DOCS_MD = `\n');
    expect(out.endsWith('`;\n')).toBe(true);
  });

  it('includes the guide prose and the reference heading', () => {
    const out = renderMd(minimalSource);
    expect(out).toContain('Texto do guia com `ctx` inline.');
    expect(out).toContain('# Referência da API');
  });

  it('renders object members as single-line bullets under `## ctx.<name>`', () => {
    const out = renderMd(minimalSource);
    expect(out).toContain('## ctx.player');
    expect(out).toContain('`hp: number`');
  });

  it('points array-of-interface members to the aux interface section', () => {
    const out = renderMd(minimalSource);
    expect(out).toContain('## ctx.npcs');
    expect(out).toContain('Cada item é um `Entidade` — veja a seção **Entidade** abaixo.');
    expect(out).toContain('## Entidade');
  });

  it('renders method sections with signature, params and return', () => {
    const out = renderMd(
      MIN_SCRIPT_ITEM +
        `
      export interface Entidade { readonly index: number; readonly name: string; readonly position: Readonly<{ x: number; y: number }>; }
      export interface ScriptCtx {
        /** Mostra um aviso.
         * @param message Texto do aviso.
         * @returns Quando fechar. */
        alert(message: string): Promise<void>;
      }
      `,
    );
    expect(out).toContain('## ctx.alert()');
    expect(out).toContain('- `alert(message: string): Promise<void>`');
    expect(out).toContain('  - `message` — Texto do aviso.');
    expect(out).toContain('  - Retorna Quando fechar.');
  });

  it('renders @example blocks under `Exemplo de`', () => {
    const out = renderMd(
      MIN_SCRIPT_ITEM +
        `
      export interface Entidade { readonly index: number; readonly name: string; readonly position: Readonly<{ x: number; y: number }>; }
      export interface ScriptCtx {
        readonly macro: Readonly<{
          /** Pausa.
           * @example \`\`\`js\nctx.macro.pause();\n\`\`\` */
          pause(): void;
        }>;
      }
      `,
    );
    expect(out).toContain('Exemplo de `pause`:');
    expect(out).toContain('```js\nctx.macro.pause();\n```');
  });

  it('collapses multi-line descriptions into a single bullet line', () => {
    const out = renderMd(
      MIN_SCRIPT_ITEM +
        `
      export interface Entidade { readonly index: number; readonly name: string; readonly position: Readonly<{ x: number; y: number }>; }
      export interface ScriptCtx {
        readonly bag: {
          /** Primeira linha
           * segunda linha. */
          readonly total: number;
        };
      }
      `,
    );
    expect(out).toContain('`total: number` — Primeira linha segunda linha.');
  });

  it('omits the reference body when ScriptCtx is absent from the meta', () => {
    const meta: ScriptCtxMeta = {
      schemaVersion: 1,
      sourcePath: 'x.ts',
      generatedAt: '',
      interfaces: [],
    };
    const out = unwrap(renderAiMarkdown(meta, GUIDE));
    expect(out).toContain('# Referência da API');
    expect(out).not.toContain('## ctx.');
  });

  it('escapes backticks and `${` so the emitted module parses as valid TS', () => {
    const { sf } = buildProject(
      MIN_SCRIPT_ITEM +
        `
      export interface Entidade { readonly index: number; readonly name: string; readonly position: Readonly<{ x: number; y: number }>; }
      export interface ScriptCtx {
        /** Usa \\\`crases\\\` e cifrão. */
        readonly note: string;
      }
      `,
    );
    const out = renderAiMarkdown(extractScriptCtxMeta(sf, 'x.ts'), GUIDE);
    // Every backtick inside the template body must be escaped.
    const body = out
      .replace(/^[\s\S]*?export const SCRIPT_API_DOCS_MD = `\n/, '')
      .replace(/`;\n$/, '');
    expect(body).not.toMatch(/(?<!\\)`/);
    expect(body).not.toMatch(/(?<!\\)\$\{/);
  });
});

// ─── Suite D — Edge cases ────────────────────────────────────────────

describe('D — edge cases', () => {
  it('handles empty object literal type', () => {
    const { sf } = buildProject(
      MIN_SCRIPT_ITEM +
        `
      export interface Entidade { readonly index: number; readonly name: string; readonly position: Readonly<{ x: number; y: number }>; }
      export interface ScriptCtx {
        readonly bag: {};
      }
    `,
    );
    const meta = extractScriptCtxMeta(sf, 'x.ts');
    const bag = findMember(findInterface(meta, 'ScriptCtx')!.members, 'bag') as PropertyMemberMeta;
    expect(bag.type).toEqual({ kind: 'object', members: [] });
  });

  it('preserves union types', () => {
    const { sf } = buildProject(
      MIN_SCRIPT_ITEM +
        `
      export interface Entidade { readonly index: number; readonly name: string; readonly position: Readonly<{ x: number; y: number }>; }
      export interface ScriptCtx {
        readonly mode: 'a' | 'b';
      }
    `,
    );
    const meta = extractScriptCtxMeta(sf, 'x.ts');
    const mode = findMember(
      findInterface(meta, 'ScriptCtx')!.members,
      'mode',
    ) as PropertyMemberMeta;
    expect(mode.type.kind).toBe('union');
    if (mode.type.kind !== 'union') return;
    const variants = mode.type.variants as readonly TypeMeta[];
    expect(variants).toHaveLength(2);
    expect(variants[0]).toMatchObject({ kind: 'literal', value: 'a' });
  });
});

// ─── Suite E — Smoke (real source) ───────────────────────────────────

describe('E — smoke (real source)', () => {
  it('extracts the real script-ctx.ts without errors', () => {
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    const real = path.resolve(REPO_ROOT, 'src/renderer/lib/script-ctx.ts');
    const sf = project.addSourceFileAtPath(real);
    const meta = extractScriptCtxMeta(sf, 'src/renderer/lib/script-ctx.ts');
    const ctx = findInterface(meta, 'ScriptCtx');
    expect(ctx).toBeDefined();
    expect(findMember(ctx!.members, 'player')).toBeDefined();
    expect(findMember(ctx!.members, 'macro')).toBeDefined();
    expect(findMember(ctx!.members, 'log')).toBeDefined();
    // Locks the public type rename (ScriptItem→Item, ScriptEntityRef→Entidade).
    expect(findInterface(meta, 'Item')).toBeDefined();
    expect(findInterface(meta, 'Entidade')).toBeDefined();
  });

  it('renderDts on the real source contains all top-level members', () => {
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    const real = path.resolve(REPO_ROOT, 'src/renderer/lib/script-ctx.ts');
    const sf = project.addSourceFileAtPath(real);
    const meta = extractScriptCtxMeta(sf, 'src/renderer/lib/script-ctx.ts');
    const dts = renderDts(meta);
    for (const name of ['player', 'npcs', 'monsters', 'otherPlayers', 'macro', 'log']) {
      expect(dts).toContain(name);
    }
    expect(dts).toContain('declare const ctx: ScriptCtx;');
  });
});
