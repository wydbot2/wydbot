import { type ComponentType, type SVGProps } from 'react';
import { BoltIcon, FireIcon, SparklesIcon, StarIcon } from '@heroicons/react/20/solid';
import { MItemDefinition } from '@shared/constants/item-definitions';
import type { ViewItem } from '@shared/types/item-types';
import {
  EQUIP_SLOT_AMULET,
  EQUIP_SLOT_ARMOR,
  EQUIP_SLOT_BOOTS,
  EQUIP_SLOT_CAPE,
  EQUIP_SLOT_GEM,
  EQUIP_SLOT_GLOVES,
  EQUIP_SLOT_HELMET,
  EQUIP_SLOT_INCONCLUSIVE_16,
  EQUIP_SLOT_INCONCLUSIVE_17,
  EQUIP_SLOT_MEDAL,
  EQUIP_SLOT_MOUNT,
  EQUIP_SLOT_OFFHAND,
  EQUIP_SLOT_ORB,
  EQUIP_SLOT_PANTS,
  EQUIP_SLOT_RING,
  EQUIP_SLOT_SPECIAL,
  EQUIP_SLOT_WEAPON,
} from '@shared/constants/equip-slots';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export interface ClassTheme {
  hue: string;
  glow: string;
  ring: string;
}

export const CLASS_THEME: Record<string, ClassTheme> = {
  '0-0': { hue: '#ef4444', glow: 'rgb(239 68 68 / 0.18)', ring: 'rgb(248 113 113 / 0.55)' },
  '0-1': { hue: '#dc2626', glow: 'rgb(220 38 38 / 0.20)', ring: 'rgb(248 113 113 / 0.65)' },
  '0-2': { hue: '#b91c1c', glow: 'rgb(185 28 28 / 0.22)', ring: 'rgb(252 165 165 / 0.7)' },
  '1-0': { hue: '#a855f7', glow: 'rgb(168 85 247 / 0.18)', ring: 'rgb(192 132 252 / 0.55)' },
  '1-1': { hue: '#9333ea', glow: 'rgb(147 51 234 / 0.20)', ring: 'rgb(192 132 252 / 0.65)' },
  '1-2': { hue: '#7e22ce', glow: 'rgb(126 34 206 / 0.22)', ring: 'rgb(216 180 254 / 0.7)' },
  '2-0': { hue: '#f59e0b', glow: 'rgb(245 158 11 / 0.18)', ring: 'rgb(251 191 36 / 0.55)' },
  '2-1': { hue: '#d97706', glow: 'rgb(217 119 6 / 0.20)', ring: 'rgb(251 191 36 / 0.65)' },
  '2-2': { hue: '#b45309', glow: 'rgb(180 83 9 / 0.22)', ring: 'rgb(252 211 77 / 0.7)' },
  '3-0': { hue: '#22d3ee', glow: 'rgb(34 211 238 / 0.18)', ring: 'rgb(103 232 249 / 0.55)' },
  '3-1': { hue: '#06b6d4', glow: 'rgb(6 182 212 / 0.20)', ring: 'rgb(103 232 249 / 0.65)' },
  '3-2': { hue: '#0891b2', glow: 'rgb(8 145 178 / 0.22)', ring: 'rgb(165 243 252 / 0.7)' },
};

export type PaperDollSlot =
  | 'capacete'
  | 'peitoral'
  | 'calca'
  | 'bota'
  | 'arma'
  | 'escudo'
  | 'luva'
  | 'anel'
  | 'amuleto'
  | 'orb'
  | 'gema'
  | 'medalha'
  | 'especial'
  | 'montaria'
  | 'capa'
  | 'inconclusive-16'
  | 'inconclusive-17';

export interface SlotMeta {
  index: number;
  label: string;
  icon: string;
  x: number;
  y: number;
}

/** Layout positions rescaled from canonical Inventory.pane (226×425) to renderer 320×290. */
export const SLOT_META: Record<PaperDollSlot, SlotMeta> = {
  montaria: {
    index: EQUIP_SLOT_MOUNT,
    label: 'Montaria',
    icon: 'game-icons:horse-head',
    x: 4,
    y: 8,
  },
  capa: { index: EQUIP_SLOT_CAPE, label: 'Capa', icon: 'game-icons:cloak', x: 262, y: 8 },
  capacete: {
    index: EQUIP_SLOT_HELMET,
    label: 'Capacete',
    icon: 'game-icons:cracked-helm',
    x: 132,
    y: 10,
  },
  arma: {
    index: EQUIP_SLOT_WEAPON,
    label: 'Arma',
    icon: 'game-icons:crossed-swords',
    x: 67,
    y: 44,
  },
  escudo: {
    index: EQUIP_SLOT_OFFHAND,
    label: 'Escudo',
    icon: 'game-icons:edged-shield',
    x: 197,
    y: 45,
  },
  medalha: { index: EQUIP_SLOT_MEDAL, label: 'Traje', icon: 'game-icons:robe', x: 2, y: 76 },
  especial: {
    index: EQUIP_SLOT_SPECIAL,
    label: 'Fada',
    icon: 'game-icons:fairy',
    x: 262,
    y: 76,
  },
  peitoral: {
    index: EQUIP_SLOT_ARMOR,
    label: 'Peitoral',
    icon: 'game-icons:breastplate',
    x: 132,
    y: 92,
  },
  luva: { index: EQUIP_SLOT_GLOVES, label: 'Luvas', icon: 'game-icons:gauntlet', x: 67, y: 138 },
  'inconclusive-16': {
    index: EQUIP_SLOT_INCONCLUSIVE_16,
    label: 'Colar',
    icon: 'game-icons:necklace',
    x: 197,
    y: 138,
  },
  anel: { index: EQUIP_SLOT_RING, label: 'Brinco', icon: 'game-icons:earrings', x: 2, y: 146 },
  amuleto: {
    index: EQUIP_SLOT_AMULET,
    label: 'Especial2',
    icon: 'game-icons:crystal-cluster',
    x: 262,
    y: 146,
  },
  calca: { index: EQUIP_SLOT_PANTS, label: 'Calça', icon: 'game-icons:trousers', x: 132, y: 177 },
  orb: { index: EQUIP_SLOT_ORB, label: 'Especial1', icon: 'game-icons:rune-stone', x: 2, y: 214 },
  'inconclusive-17': {
    index: EQUIP_SLOT_INCONCLUSIVE_17,
    label: 'Cinto',
    icon: 'game-icons:belt',
    x: 67,
    y: 214,
  },
  bota: { index: EQUIP_SLOT_BOOTS, label: 'Botas', icon: 'game-icons:boots', x: 197, y: 214 },
  gema: {
    index: EQUIP_SLOT_GEM,
    label: 'Especial3',
    icon: 'game-icons:star-formation',
    x: 262,
    y: 214,
  },
};

export interface ResistMeta {
  label: string;
  icon: Icon;
  iconColor: string;
  gradient: string;
}

/** Wire ordering: resist[0]=Fogo, resist[1]=Gelo, resist[2]=Sagrado, resist[3]=Trovão. */
export const RESIST_META: ReadonlyArray<ResistMeta> = [
  {
    label: 'Fogo',
    icon: FireIcon,
    iconColor: '#fb923c',
    gradient: 'linear-gradient(90deg, #c2410c, #fb923c)',
  },
  {
    label: 'Gelo',
    icon: SparklesIcon,
    iconColor: '#67e8f9',
    gradient: 'linear-gradient(90deg, #0e7490, #67e8f9)',
  },
  {
    label: 'Sagrado',
    icon: StarIcon,
    iconColor: '#c084fc',
    gradient: 'linear-gradient(90deg, #6b21a8, #c084fc)',
  },
  {
    label: 'Trovão',
    icon: BoltIcon,
    iconColor: '#facc15',
    gradient: 'linear-gradient(90deg, #a16207, #facc15)',
  },
];

export type ItemRarity = 'common' | 'rare' | 'epic' | 'legend';

export const RARITY: Record<ItemRarity, string> = {
  common: '#4b5563',
  rare: '#3b82f6',
  epic: 'var(--color-epic)',
  legend: 'var(--color-gold)',
};

// TODO(personagem): backend rarity not yet mapped — proper item rarity needs
// an item-class enum from ItemDb (item.grade).
export const TIER_TO_RARITY: Record<
  NonNullable<ViewItem['effects'][number]['colorTier']>,
  ItemRarity
> = {
  normal: 'common',
  green: 'common',
  yellow: 'rare',
  orange: 'epic',
  blue: 'epic',
  pvp: 'legend',
};

export const PRIMARY_STAT_INDEX = {
  str: MItemDefinition.STR,
  int: MItemDefinition.INT,
  dex: MItemDefinition.DEX,
  con: MItemDefinition.CON,
} as const;

export interface AffectMeta {
  name: string;
  /**
   * 'mount' = hidden in the buff strip (ride/cosmetic state, own HUD); currently
   * only `0x21` (2nd "Transformação"). 'debuff' = behavioral debuff.
   * 'buff' = everything else.
   *
   * `0x05`/`0x28`/`0x2c`/`0x2d` share flag bytes with mount state but are
   * CC/evasion `debuff`s, not mounts.
   */
  kind: 'buff' | 'debuff' | 'mount';
}

/**
 * Affect type ID → label.
 *
 * **Source of truth:** `resources/EffectString.txt`,
 * also bundled with the original WYD2 client (Korean/PT-BR). 53 lines,
 * Latin-1, CRLF, **1-based indexing** — line `N` is the label for
 * `affect_type == N`. Underscores in the file render as spaces in-game.
 *
 * Note: `itemname.bin[type+5000]` is NOT a valid source for these names —
 * that lookup yields the **skill name** registered in that item-id band,
 * not the affect name.
 *
 * The kind is inferred from the label, except `0x10` "Transformação" which is
 * the BM combat-transform `buff` (not mount):
 * - `(-)` suffix or known-debuff word → `debuff`
 * - `0x21` "Transformação" → `mount` (heuristic; in-game trigger unverified)
 * - Everything else → `buff`
 *
 * Unmapped IDs (54..255) fall back to `Efeito #XX` via `resolveAffect()`.
 */
export const AFFECT_NAME_MAP: Record<number, AffectMeta> = {
  0x01: { name: 'Lentidão', kind: 'debuff' },
  0x02: { name: 'Velocidade(+)', kind: 'buff' },
  0x03: { name: 'Resistência(-)', kind: 'debuff' },
  0x04: { name: 'Ataque Bônus', kind: 'buff' },
  0x05: { name: 'Evasão(-)', kind: 'debuff' },
  0x06: { name: 'Evasão(+)', kind: 'buff' },
  0x07: { name: 'Velocidade(-)', kind: 'debuff' },
  0x08: { name: 'Jóia(s)', kind: 'buff' },
  0x09: { name: 'Dano(+)', kind: 'buff' },
  0x0a: { name: 'Ataque(-)', kind: 'debuff' },
  0x0b: { name: 'Escudo Mágico', kind: 'buff' },
  0x0c: { name: 'Defesa(-)', kind: 'debuff' },
  0x0d: { name: 'Assalto', kind: 'buff' },
  0x0e: { name: 'Possuído', kind: 'debuff' },
  0x0f: { name: 'Técnica(+)', kind: 'buff' },
  0x10: { name: 'Transformação', kind: 'buff' },
  0x11: { name: 'Aura da Vida', kind: 'buff' },
  0x12: { name: 'Controle de Mana', kind: 'buff' },
  0x13: { name: 'Imunidade', kind: 'buff' },
  0x14: { name: 'Veneno', kind: 'debuff' },
  0x15: { name: 'Meditação', kind: 'buff' },
  0x16: { name: 'Trovão', kind: 'buff' },
  0x17: { name: 'Aura Bestial', kind: 'buff' },
  0x18: { name: 'Samaritano', kind: 'buff' },
  0x19: { name: 'Proteção Elemental', kind: 'buff' },
  0x1a: { name: 'Evasão(+)', kind: 'buff' },
  0x1b: { name: 'Congelamento', kind: 'debuff' },
  0x1c: { name: 'Invisibilidade', kind: 'buff' },
  0x1d: { name: 'Limite da Alma', kind: 'buff' },
  0x1e: { name: 'Bônus PvM', kind: 'buff' },
  0x1f: { name: 'Escudo Dourado', kind: 'buff' },
  0x20: { name: 'Cancelamento', kind: 'debuff' },
  0x21: { name: 'Transformação', kind: 'mount' },
  0x22: { name: 'Comida', kind: 'buff' },
  0x23: { name: 'Bônus HP/MP', kind: 'buff' },
  0x24: { name: 'Veneno', kind: 'debuff' },
  0x25: { name: 'Ligação Espectral', kind: 'buff' },
  0x26: { name: 'Troca de Espírito', kind: 'buff' },
  0x27: { name: 'Bônus EXP', kind: 'buff' },
  0x28: { name: 'Atordoado', kind: 'debuff' },
  0x29: { name: 'Esquiva(-)', kind: 'debuff' },
  0x2a: { name: 'Magia Misteriosa', kind: 'buff' },
  0x2b: { name: 'Anti Magia', kind: 'buff' },
  0x2c: { name: 'Movimento Zero', kind: 'debuff' },
  0x2d: { name: 'Congelar', kind: 'debuff' },
  0x2e: { name: 'Chama Resistente', kind: 'buff' },
  0x2f: { name: 'Sangrar', kind: 'debuff' },
  0x30: { name: 'Última Resistência', kind: 'buff' },
  0x31: { name: 'Lucky', kind: 'buff' },
  0x32: { name: 'RoyalArena', kind: 'buff' },
  0x33: { name: 'Guild', kind: 'buff' },
  0x34: { name: 'Ignite', kind: 'debuff' },
  0x35: { name: 'Sede de Vingança', kind: 'buff' },
};

export const SPECIAL_LABELS: ReadonlyArray<ReadonlyArray<string>> = [
  ['Aprender Arma', 'Confiança', 'Trans', 'Espada Mágica'],
  ['Aprender Arma', 'Magia Branca', 'Magia Negra', 'Magia Especial'],
  ['Aprender Arma', 'Elemental', 'Evocação', 'Natureza'],
  ['Aprender Arma', 'Sobrevivência', 'Troca', 'Captura'],
];

/** Lockable bags (the last two); index order matches PlayerState.bagUnlock[]. */
export const LOCKABLE_BAG_INDEXES: readonly number[] = [2, 3];

/** Locked unless the bag's unlock token is present; bags 1-2 never lock (game). */
export const isBagLocked = (bagIndex: number, bagUnlock: readonly boolean[]): boolean => {
  const tokenIndex = LOCKABLE_BAG_INDEXES.indexOf(bagIndex);
  if (tokenIndex === -1) return false;
  return !(bagUnlock[tokenIndex] ?? false);
};

export const BAG_SIZE = 15;
export const BAG_COUNT = 4;

/** Bank/cargo (Armazém) mirror: 120 slots = 3 pages × 40 (wire idx = page*40 + slot). */
export const BAU_PAGE_COUNT = 3;
export const BAU_PAGE_SIZE = 40;
