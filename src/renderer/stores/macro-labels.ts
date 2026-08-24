import type { MPosition } from '@shared/types';
import type { MacroStep, MacroStepKind, WalkMode } from './macro-types';

export type MacroStepCategory = 'walk' | 'npc' | 'others' | 'attack' | 'portal';

export const KIND_TO_CATEGORY: Record<MacroStepKind, MacroStepCategory> = {
  walk: 'walk',
  interact: 'npc',
  follow: 'npc',
  delay: 'others',
  script: 'others',
  marker: 'others',
  portal: 'portal',
};

export const CATEGORY_LABELS: Record<MacroStepCategory, string> = {
  walk: 'Andar',
  npc: 'NPC',
  others: 'Outros',
  attack: 'Ataque',
  portal: 'Portal',
};

/** Dot background — always the category color. Never used for text. */
export const CATEGORY_COLORS: Record<MacroStepCategory, string> = {
  walk: 'bg-cyan-400',
  npc: 'bg-pink-400',
  others: 'bg-amber-400',
  attack: 'bg-purple-500',
  portal: 'bg-orange-500',
};

export const CATEGORY_BORDER_LEFT: Record<MacroStepCategory, string> = {
  walk: 'border-l-[3px] border-l-cyan-400',
  npc: 'border-l-[3px] border-l-pink-400',
  others: 'border-l-[3px] border-l-amber-400',
  attack: 'border-l-[3px] border-l-purple-500',
  portal: 'border-l-[3px] border-l-orange-500',
};

export type MacroStepSubtype =
  | 'walk-exact'
  | 'walk-approx'
  | 'npc-interact'
  | 'npc-follow'
  | 'delay'
  | 'script'
  | 'marker'
  | 'portal-teleport';

const getStepSubtype = (step: MacroStep): MacroStepSubtype => {
  switch (step.kind) {
    case 'walk':
      return step.mode === 'exact' ? 'walk-exact' : 'walk-approx';
    case 'interact':
      return 'npc-interact';
    case 'follow':
      return 'npc-follow';
    case 'delay':
      return 'delay';
    case 'script':
      return 'script';
    case 'marker':
      return 'marker';
    case 'portal':
      return 'portal-teleport';
  }
  step satisfies never;
  throw new Error('unreachable');
};

export const SUBTYPE_LABELS: Record<MacroStepSubtype, string> = {
  'walk-exact': 'Exato',
  'walk-approx': 'Aproximado',
  'npc-interact': 'Interagir',
  'npc-follow': 'Seguir',
  delay: 'Esperar',
  script: 'Script',
  marker: 'Marcador',
  'portal-teleport': 'Portal',
};

export const SUBTYPE_TEXT_COLORS: Record<MacroStepSubtype, string> = {
  'walk-exact': 'text-cyan-300',
  'walk-approx': 'text-indigo-300',
  'npc-interact': 'text-pink-300',
  'npc-follow': 'text-rose-300',
  delay: 'text-lime-300',
  script: 'text-red-300',
  marker: 'text-amber-300',
  'portal-teleport': 'text-orange-300',
};

const SUBTYPE_HINTS: Record<MacroStepSubtype, string> = {
  'walk-exact': 'X / Y',
  'walk-approx': 'X / Y · raio',
  'npc-interact': 'alvo',
  'npc-follow': 'seguir',
  delay: 'seg',
  script: '.js',
  marker: 'rótulo',
  'portal-teleport': 'X / Y',
};

const SUBTYPE_TO_CATEGORY: Record<MacroStepSubtype, MacroStepCategory> = {
  'walk-exact': 'walk',
  'walk-approx': 'walk',
  'npc-interact': 'npc',
  'npc-follow': 'npc',
  delay: 'others',
  script: 'others',
  marker: 'others',
  'portal-teleport': 'portal',
};

export interface MacroSubtypeOption {
  subtype: MacroStepSubtype;
  category: MacroStepCategory;
  label: string;
  textColorClass: string;
  hint: string;
}

/** Ordered for the dropdown form and cascade menus — same visual order in both surfaces. */
export const MACRO_SUBTYPE_OPTIONS: readonly MacroSubtypeOption[] = (
  [
    'walk-exact',
    'walk-approx',
    'npc-interact',
    'npc-follow',
    'portal-teleport',
    'delay',
    'script',
    'marker',
  ] as const
).map((subtype) => ({
  subtype,
  category: SUBTYPE_TO_CATEGORY[subtype],
  label: SUBTYPE_LABELS[subtype],
  textColorClass: SUBTYPE_TEXT_COLORS[subtype],
  hint: SUBTYPE_HINTS[subtype],
}));

/** Derived from SUBTYPE_LABELS so "Exato"/"Aproximado" live in one place. */
export const WALK_MODE_LABELS: Record<WalkMode, string> = {
  exact: SUBTYPE_LABELS['walk-exact'],
  approx: SUBTYPE_LABELS['walk-approx'],
};

export const getStepAnchor = (step: MacroStep): MPosition | null => {
  switch (step.kind) {
    case 'walk':
    case 'portal':
      return step.position;
    case 'interact':
    case 'follow':
    case 'delay':
    case 'script':
    case 'marker':
      return null;
  }
  step satisfies never;
  throw new Error('unreachable');
};

export const getStepSubtypeLabel = (step: MacroStep): string =>
  SUBTYPE_LABELS[getStepSubtype(step)];

export const getStepSubtypeTextColor = (step: MacroStep): string =>
  SUBTYPE_TEXT_COLORS[getStepSubtype(step)];

export const getStepDetailValue = (step: MacroStep): string | null => {
  switch (step.kind) {
    case 'walk':
      return null;
    case 'interact':
    case 'follow':
      return step.target.npcName;
    case 'delay':
      return `${(step.ms / 1000).toFixed(1)}s`;
    case 'script':
      return step.name;
    case 'marker':
      return step.name;
    case 'portal':
      return null;
  }
  step satisfies never;
  return null;
};
