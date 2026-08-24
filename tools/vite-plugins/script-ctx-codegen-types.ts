/**
 * Schema types for the script-ctx codegen pipeline.
 *
 * These types describe the metadata extracted from `src/renderer/lib/script-ctx.ts`
 * via ts-morph and serialized to `script-ctx-meta.generated.json`. The same shape
 * also drives DTS rendering (`script-ctx-dts.generated.ts`).
 *
 * Single source of truth: the `Item`, `Entidade` and `ScriptCtx` interfaces in
 * `src/renderer/lib/script-ctx.ts`. JSDoc on those interfaces is in pt-BR — see
 * `docs/script-api-codegen.md` for the language policy.
 */

/** Root metadata bundle written to disk as JSON. */
export interface ScriptCtxMeta {
  /** Schema version. Bump when the shape changes in a breaking way. */
  readonly schemaVersion: 1;
  /** Source file path relative to repo root, for traceability in tools. */
  readonly sourcePath: string;
  /**
   * ISO-8601 generation timestamp. Excluded from the in-memory diff cache so
   * idempotent runs do not rewrite the file. CLI `--check` mode normalizes
   * this to an empty string before byte-comparison.
   */
  readonly generatedAt: string;
  /** Top-level interfaces forming the script API surface. Order is source order. */
  readonly interfaces: readonly InterfaceMeta[];
}

/** A top-level interface like `ScriptCtx`, `Item` or `Entidade`. */
export interface InterfaceMeta {
  readonly name: string;
  readonly jsDoc: JsDocMeta | null;
  readonly members: readonly MemberMeta[];
}

/** Discriminated union for property vs method members on an interface or object literal. */
export type MemberMeta = PropertyMemberMeta | MethodMemberMeta;

/** Property: `readonly hp: number`, nested object literal, type reference. */
export interface PropertyMemberMeta {
  readonly kind: 'property';
  readonly name: string;
  readonly readonly: boolean;
  readonly optional: boolean;
  readonly jsDoc: JsDocMeta | null;
  readonly type: TypeMeta;
}

/** Method: `move(x: number, y: number): Promise<void>`. */
export interface MethodMemberMeta {
  readonly kind: 'method';
  readonly name: string;
  readonly optional: boolean;
  readonly jsDoc: JsDocMeta | null;
  readonly params: readonly ParamMeta[];
  readonly returns: TypeMeta;
}

export interface ParamMeta {
  readonly name: string;
  readonly optional: boolean;
  readonly type: TypeMeta;
  /** From the `@param name desc` JSDoc tag, when present. */
  readonly description: string | null;
  /** `description` rendered to HTML by the doc-site loader (see {@link JsDocMeta.descriptionHtml}). */
  readonly descriptionHtml?: string;
}

/**
 * Discriminated union for type representation. Preserves enough fidelity to
 * round-trip back to canonical TypeScript source (for the DTS render) AND to
 * link references in a future doc UI.
 */
export type TypeMeta =
  | { readonly kind: 'primitive'; readonly name: PrimitiveTypeName }
  | { readonly kind: 'literal'; readonly value: string | number | boolean }
  | { readonly kind: 'reference'; readonly name: string; readonly typeArgs: readonly TypeMeta[] }
  | { readonly kind: 'array'; readonly element: TypeMeta; readonly readonly: boolean }
  | { readonly kind: 'object'; readonly members: readonly MemberMeta[] }
  | { readonly kind: 'promise'; readonly resolved: TypeMeta }
  | { readonly kind: 'union'; readonly variants: readonly TypeMeta[] }
  | { readonly kind: 'unsupported'; readonly raw: string };

export type PrimitiveTypeName =
  | 'number'
  | 'string'
  | 'boolean'
  | 'void'
  | 'undefined'
  | 'null'
  | 'unknown'
  | 'any';

/**
 * JSDoc captured per declaration. For `ScriptCtx` and its members the text is
 * pt-BR — that is the language for the user-facing script API. Tags are split
 * out so a doc UI can render them distinctly (e.g., `@example` blocks).
 */
export interface JsDocMeta {
  /** Free-text description appearing before any tags. Multi-line preserved. */
  readonly description: string;
  /**
   * `description` rendered from markdown to HTML. NOT produced by the codegen
   * (the emitted JSON never contains it) — populated at build time by the
   * doc-site data loader so Vue components can `v-html` it.
   */
  readonly descriptionHtml?: string;
  /** Inline `@param name desc` lookup. */
  readonly params: Readonly<Record<string, string>>;
  /** Inline `@returns desc`, when present. */
  readonly returns: string | null;
  /** All other tags (`@example`, `@see`, custom) in source order. */
  readonly tags: readonly {
    readonly tag: string;
    readonly text: string;
    /**
     * `text` rendered from markdown to HTML (for `@example` code blocks).
     * NOT produced by the codegen — populated by the doc-site data loader.
     */
    readonly textHtml?: string;
  }[];
}
