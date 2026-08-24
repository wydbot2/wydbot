/**
 * Character context types — pure data shapes consumed by skill-stats and the
 * Personagem panel components. Lives in `shared/types` so the renderer doesn't
 * import a runtime module just for a type.
 */

export interface CharContext {
  str: number;
  int: number;
  dex: number;
  con: number;
  level: number;
  classMaster: number;
}

export interface DerivedStat {
  /** Display label (pt-BR, e.g. "Taxa de Acerto", "Dano Total"). */
  label: string;
  /** Pre-formatted value string. */
  value: string;
}
