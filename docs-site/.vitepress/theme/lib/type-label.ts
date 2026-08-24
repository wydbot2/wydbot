// Single source for turning a `TypeMeta` into a friendly, user-facing label
// (plus chip family and an optional link target). Shared by ApiTypeBadge and
// ApiMethod so they never drift. Framework-pure: no VitePress/Vue client API
// here, so it is safe to import from anywhere (including build-time code).
import type { TypeMeta } from '../../../../tools/vite-plugins/script-ctx-codegen-types';

/** Shared types that have a dedicated page under `/api/`. */
export const LINKABLE: Record<string, string> = {
  Item: '/api/item',
  Entidade: '/api/entidade',
  ItemShort: '/api/item-short',
};

/** Chip family — drives color + icon in ApiTypeBadge (`.api-type--*`). */
export type TypeFamily =
  | 'number'
  | 'string'
  | 'boolean'
  | 'list'
  | 'ref'
  | 'action'
  | 'obj'
  | 'enum';

export interface TypeLabel {
  /** Human-facing text, e.g. `Item`, `lista de Entidade`, `ação`. */
  readonly text: string;
  /** Chip family (color + icon). */
  readonly family: TypeFamily;
  /** When set, the badge links to `LINKABLE[linkTo]`. */
  readonly linkTo?: string;
  /** Trailing note rendered OUTSIDE the chip, e.g. `ou vazio`. */
  readonly suffix?: string;
}

const isNull = (t: TypeMeta): boolean => t.kind === 'primitive' && t.name === 'null';

export const typeLabel = (t: TypeMeta): TypeLabel => {
  // `X | null` → chip de X + sufixo `ou vazio` (mantém o link de X, se houver).
  if (t.kind === 'union') {
    const nonNull = t.variants.filter((v) => !isNull(v));
    if (t.variants.some(isNull) && nonNull.length === 1) {
      const inner = typeLabel(nonNull[0]!);
      return { ...inner, suffix: 'ou vazio' };
    }
    // União só de literais (`'direto' | 'pergaminho' | …`) → enum.
    if (t.variants.every((v) => v.kind === 'literal')) {
      return { text: 'enum', family: 'enum' };
    }
    return { text: 'objeto', family: 'obj' };
  }
  // `ReadonlyArray<X>` / `X[]` → `lista de X`; ref quando X tem página própria.
  if (t.kind === 'array') {
    const inner = typeLabel(t.element);
    return {
      text: `lista de ${inner.text}`,
      family: inner.linkTo ? 'ref' : 'list',
      linkTo: inner.linkTo,
    };
  }
  // `Promise<void>` → `ação`; `Promise<T>` → `ação que retorna T`.
  if (t.kind === 'promise') {
    if (t.resolved.kind === 'primitive' && t.resolved.name === 'void') {
      return { text: 'ação', family: 'action' };
    }
    return { text: `ação que retorna ${typeLabel(t.resolved).text}`, family: 'action' };
  }
  // Shared named type → chip ref com link para a página do tipo.
  if (t.kind === 'reference' && t.typeArgs.length === 0 && LINKABLE[t.name]) {
    return { text: t.name, family: 'ref', linkTo: t.name };
  }
  if (t.kind === 'primitive') {
    if (t.name === 'number') return { text: 'number', family: 'number' };
    if (t.name === 'string') return { text: 'string', family: 'string' };
    if (t.name === 'boolean') return { text: 'boolean', family: 'boolean' };
  }
  return { text: 'objeto', family: 'obj' };
};
