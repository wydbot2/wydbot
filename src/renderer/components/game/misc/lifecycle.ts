import type { ModuleLifecycle } from '../../../lib/ambient-module-types';

interface LifecycleMeta {
  mini: string;
  tooltip: string;
}

/** Ambient lifecycles plus session features (e.g. Reconnect) that are not ambient. */
export type MiscFeatureKind = ModuleLifecycle | 'session';

export const LIFECYCLE_META: Record<ModuleLifecycle, LifecycleMeta> = {
  'lifecycle-controller': {
    mini: 'POR EVENTO',
    tooltip: 'Disparado por evento do jogo (a morte do personagem).',
  },
  'always-on': {
    mini: 'SEMPRE',
    tooltip: 'Roda sempre que ligado, independente do macro.',
  },
  'macro-coupled': {
    mini: 'COM MACRO',
    tooltip: 'Só executa enquanto o macro está rodando.',
  },
};

export const FEATURE_KIND_META: Record<MiscFeatureKind, LifecycleMeta> = {
  ...LIFECYCLE_META,
  session: {
    mini: 'SESSÃO',
    tooltip: 'Cuida da conexão com o jogo, independente do macro.',
  },
};
