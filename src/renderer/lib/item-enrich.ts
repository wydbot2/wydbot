import { CLASS_DISPLAY_NAMES } from '@shared/constants/character-classes';
import { CANONICAL_EFFECT_INDICES } from '@shared/constants/effect-labels';
import { MItemDefinition } from '@shared/constants/item-definitions';
import { getSancMultiplier } from '@shared/constants/sanc-scaling';
import { renderHelpLines } from '@shared/lib/help-line-substitution';
import { formatItemDuration, TIME_EFFECT_INDICES } from '@shared/lib/item-duration-format';
import type {
  ImmovableTier,
  MItem,
  MItemEffect,
  ViewItem,
  ViewItemEffect,
} from '@shared/types/item-types';
import type { Item } from '@shared/types/item-db-types';
import { getItem } from './item-db';

/* ── Mount class predicates (used only here) ── */
// nMountType 0x15 (baby) and 0x16 (adult) carry mount struct in wire bytes 6-11.
// nMountType 0x17 (special) ignores wire slots — stats come from MountData table.
const hasMountStruct = (nMountType: number): boolean => nMountType === 0x15 || nMountType === 0x16;
const isSpecialMount = (nMountType: number): boolean => nMountType === 0x17;

/* ── ARGB1555 → CSS color (16-bpp DirectDraw legacy) ── */
// Bit layout `[a:1][r:5][g:5][b:5]`; each 5-bit channel scaled to 8 bits via
// `(c5 << 3) | (c5 >> 2)` (linear extension that maps 0→0 and 31→255).
const helpColorToCss = (mask16: number): string => {
  const c = mask16 & 0xffff;
  const r5 = (c >> 10) & 0x1f;
  const g5 = (c >> 5) & 0x1f;
  const b5 = c & 0x1f;
  const r = (r5 << 3) | (r5 >> 2);
  const g = (g5 << 3) | (g5 >> 2);
  const b = (b5 << 3) | (b5 >> 2);
  return `rgb(${r}, ${g}, ${b})`;
};

/* ── Helpers that derive enrichment inputs directly from the canonical ItemDb ── */

// LEVEL synth uses `level + 1`: the canonical equip predicate compares `<` against player level.
const computeBaseEffects = (db: Item | undefined): MItemEffect[] => {
  if (!db) return [];
  const out: MItemEffect[] = [];
  for (const slot of db.effectSlots) {
    if (slot.idx !== 0 && slot.idx !== 255) {
      out.push({ index: slot.idx, value: slot.value });
    }
  }
  if (db.level > 0 && !out.some((e) => e.index === MItemDefinition.LEVEL)) {
    out.push({ index: MItemDefinition.LEVEL, value: db.level + 1 });
  }
  return out;
};

/** Render-friendly fallback name. Cosmetic `_`→` `. */
const fallbackName = (db: Item | undefined, id: number): string => {
  if (!db?.name || db.name === '') return `Item #${id}`;
  return db.name.replace(/_/g, ' ');
};

const computeImmovableTier = (item: MItem, db: Item | undefined): ImmovableTier | undefined => {
  if (!db) return undefined;
  const bucketFromValue = (value: number): ImmovableTier => (value === 2 ? 2 : value === 3 ? 3 : 1);

  // Rule 5: wire scan for idx=0x6F (NOTRADE) with non-zero value.
  for (const ef of item.effects) {
    if (ef.index === 0x6f && ef.value > 0) return bucketFromValue(ef.value);
  }
  // Rule 6: DB row scan for idx=0x6F.
  for (const slot of db.effectSlots) {
    if (slot.idx === 0x6f && slot.value > 0) return bucketFromValue(slot.value);
  }
  // Rule 1: VOLATILE (0x26) == 0x10 AND grade >= 10.
  if (db.grade >= 10 && db.effectSlots.some((s) => s.idx === 0x26 && s.value === 0x10)) {
    return 1;
  }
  // Rule 4: itemId in [0xf3c..0xf9f] AND wire bytes 7+9 are zero.
  if (
    item.index >= 0xf3c &&
    item.index < 0xfa0 &&
    item.effects[0].value === 0 &&
    item.effects[1].value === 0
  ) {
    return 1;
  }
  return undefined;
};

/* ── Effect configuration table ── */

interface EffectConfig {
  label: string;
  format: 'plain' | 'percent' | 'class' | 'label-only' | 'hpadd' | 'plainpercent';
  alwaysColor?: 'pvp' | 'blue';
  wireTier?: { yellow: number; orange: number };
}

const EFFECT_CONFIG: Record<number, EffectConfig> = {
  [MItemDefinition.LEVEL]: { label: 'Level necessário', format: 'plain' },
  [MItemDefinition.DAMAGE]: {
    label: 'Aumento de Dano',
    format: 'plain',
    wireTier: { yellow: 18, orange: 18 },
  },
  [MItemDefinition.AC1]: { label: 'Defesa', format: 'plain', wireTier: { yellow: 15, orange: 15 } },
  [MItemDefinition.HP]: {
    label: 'Aumento de HP Máximo',
    format: 'plain',
    wireTier: { yellow: 40, orange: 40 },
  },
  [MItemDefinition.MP]: { label: 'MP', format: 'plain' },
  [MItemDefinition.EXP]: { label: 'Experiência', format: 'plain' },
  [MItemDefinition.STR]: { label: 'Força', format: 'plain' },
  [MItemDefinition.INT]: { label: 'Inteligência', format: 'plain' },
  [MItemDefinition.DEX]: { label: 'Destreza', format: 'plain' },
  [MItemDefinition.CON]: { label: 'Constituição', format: 'plain' },
  [MItemDefinition.SPECIAL1]: { label: 'Aprender Arma', format: 'plain' },
  [MItemDefinition.SPECIAL2]: {
    label: 'Confiança/Magia Branca/Elemental/Sobrevivência',
    format: 'plain',
  },
  [MItemDefinition.SPECIAL3]: { label: 'Trans/Magia Negra/Evocação/Troca', format: 'plain' },
  [MItemDefinition.SPECIAL4]: {
    label: 'Espada Mágica/Magia Especial/Natureza/Captura',
    format: 'plain',
  },
  [MItemDefinition.CLASS]: { label: 'Classe', format: 'class' },
  [MItemDefinition.REQ_STR]: { label: 'Força necessária', format: 'plain' },
  [MItemDefinition.REQ_INT]: { label: 'Inteligência necessária', format: 'plain' },
  [MItemDefinition.REQ_DEX]: { label: 'Destreza necessária', format: 'plain' },
  [MItemDefinition.REQ_CON]: { label: 'Constituição necessária', format: 'plain' },
  [MItemDefinition.ATTSPEED]: {
    label: 'Aumento da Velocidade de Ataque',
    format: 'percent',
    wireTier: { yellow: 12, orange: 12 },
  },
  [MItemDefinition.RANGE]: { label: 'Alcance', format: 'plain' },
  [MItemDefinition.RUNSPEED]: { label: 'Aumento da Velocidade de Movimento', format: 'plain' },
  [MItemDefinition.EVASION]: { label: 'Índice de Evasão', format: 'percent' },
  [MItemDefinition.HITRATE]: { label: 'HitRate', format: 'plain' },
  [MItemDefinition.CRITICAL]: {
    label: 'Crítico',
    format: 'percent',
    wireTier: { yellow: 50, orange: 60 },
  },
  [MItemDefinition.SAVEMANA]: { label: 'Economia de Mana', format: 'plain' },
  [MItemDefinition.HPADD]: {
    label: 'Índice de aumento de HP Máximo',
    format: 'hpadd',
    wireTier: { yellow: 40, orange: 40 },
  },
  [MItemDefinition.MPADD]: { label: 'Índice de aumento de MP Máximo', format: 'hpadd' },
  [MItemDefinition.REGENHP]: { label: 'Índice de Regeneração de HP', format: 'plain' },
  [MItemDefinition.REGENMP]: { label: 'Índice de Regeneração de MP', format: 'plain' },
  [MItemDefinition.RESIST1]: { label: 'Resistência a Fogo', format: 'plain' },
  [MItemDefinition.RESIST2]: { label: 'Resistência a Gelo', format: 'plain' },
  [MItemDefinition.RESIST3]: { label: 'Resistência a Sagrado', format: 'plain' },
  [MItemDefinition.RESIST4]: { label: 'Resistência a Relâmpago', format: 'plain' },
  [MItemDefinition.ACADD]: {
    label: 'Defesa',
    format: 'plain',
    wireTier: { yellow: 15, orange: 15 },
  },
  [MItemDefinition.RESISTALL]: { label: 'Aumento de Imunidades', format: 'plain' },
  [MItemDefinition.BONUS]: { label: 'Bônus', format: 'plain' },
  [MItemDefinition.PVPDAMAGE]: { label: 'Ataque PvP', format: 'percent', alwaysColor: 'pvp' },
  [MItemDefinition.PVPAC]: { label: 'Defesa PvP', format: 'percent', alwaysColor: 'pvp' },
  [MItemDefinition.MAGIC]: {
    label: 'Ataque Mágico',
    format: 'plainpercent',
    wireTier: { yellow: 12, orange: 12 },
  },
  [MItemDefinition.AMOUNT]: { label: 'Quantidade', format: 'plain' },
  [MItemDefinition.DAMAGEADD]: {
    label: 'Aumento de Dano',
    format: 'plain',
    wireTier: { yellow: 18, orange: 18 },
  },
  [MItemDefinition.MAGICADD]: {
    label: 'Ataque Mágico',
    format: 'plain',
    wireTier: { yellow: 12, orange: 12 },
  },
  [MItemDefinition.HPADD2]: {
    label: 'Índice de aumento de HP Máximo',
    format: 'hpadd',
    wireTier: { yellow: 40, orange: 40 },
  },
  [MItemDefinition.MPADD2]: { label: 'Índice de aumento de MP Máximo', format: 'hpadd' },
  [MItemDefinition.CRITICAL2]: {
    label: 'Crítico',
    format: 'percent',
    wireTier: { yellow: 50, orange: 60 },
  },
  [MItemDefinition.ACADD2]: {
    label: 'Defesa Add 2',
    format: 'plain',
    wireTier: { yellow: 15, orange: 15 },
  },
  [MItemDefinition.DAMAGE2]: {
    label: 'Aumento de Dano',
    format: 'plain',
    wireTier: { yellow: 18, orange: 18 },
  },
  [MItemDefinition.SPECIALALL]: {
    label: 'Aumento de Aprendizagem de Skill.',
    format: 'plain',
    wireTier: { yellow: 12, orange: 12 },
  },
  [MItemDefinition.CURKILL]: { label: 'Dano de Perfuração.', format: 'plain' },
  [MItemDefinition.LTOTKILL]: { label: 'Dano Crítico causado', format: 'plain' },
  [MItemDefinition.HTOTKILL]: { label: 'Redução de Dano Crítico', format: 'plain' },
  [MItemDefinition.MOUNTLIFE]: { label: 'Vitalidade', format: 'plain' },
  [MItemDefinition.MOUNTHP]: { label: 'HP da Montaria', format: 'plain' },
  [MItemDefinition.MOUNTSANC]: { label: 'Crescimento', format: 'plain' },
  [MItemDefinition.MOUNTFEED]: { label: 'Ração', format: 'plain' },
  [MItemDefinition.MOUNTKILL]: { label: 'EXP da Montaria', format: 'plain' },
  [MItemDefinition.ABSDAM]: { label: 'Absorção Dano', format: 'plain' },
  [MItemDefinition.ABSAC]: { label: 'Absorção Defesa', format: 'plain' },
  [MItemDefinition.MAGIC_CRIT]: { label: 'Chance de Crítico Mágico', format: 'percent' },
  [MItemDefinition.HP_REGEN_BONUS]: { label: 'Regeneração de HP bônus', format: 'plainpercent' },
  [MItemDefinition.INIT1]: {
    label: 'Reiniciar Confiança/Magia Branca/Elemental/Sobrevivência',
    format: 'label-only',
  },
  [MItemDefinition.INIT2]: {
    label: 'Reiniciar Trans/Magia Negra/Evocação/Troca',
    format: 'label-only',
  },
  [MItemDefinition.INIT3]: {
    label: 'Reiniciar Espada Mágica/Magia Especial/Natureza/Captura',
    format: 'label-only',
  },
  [MItemDefinition.INCUBATE]: { label: 'Valor Crítico de Incubação.', format: 'plain' },
  [MItemDefinition.INCUDELAY]: { label: 'Tempo de Espera para Incubação', format: 'plain' },
};

/* ── Hardcoded bonus indices ── */

export const HARDCODED_BONUS = {
  DEFENSE: -1,
  SKILL_DELAY: -2,
  MAGIC_ATTACK: -3,
  DAMAGE_BOOST: -4,
  PENETRATION: -5,
  ABSORPTION: -6,
  DROP_RATE: -7,
  EXPERIENCE: -8,
} as const;

export const TIME_BONUS = {
  DURATION: -9,
} as const;

/* ── Display text builder ── */

/** CLASS bitmask → class names. bit0=TK, bit1=FM, bit2=BM, bit3=HT */
const formatClassBitmask = (value: number): string => {
  if (value === 255 || value === 0) return 'Sem limite';
  const names: string[] = [];
  for (let i = 0; i < CLASS_DISPLAY_NAMES.length; i++) {
    if ((value >> i) & 1) names.push(CLASS_DISPLAY_NAMES[i]);
  }
  return names.length > 0 ? names.join(', ') : `${value}`;
};

export const getEffectLabel = (index: number): string | undefined => EFFECT_CONFIG[index]?.label;

/** Display format used by the inventory tooltip for this effect index (if known). */
export const getEffectDisplayFormat = (index: number): EffectConfig['format'] | undefined =>
  EFFECT_CONFIG[index]?.format;

/**
 * Numeric value as the user reads it on the tooltip (ignoring % / labels).
 * Used by auto-drop so rule thresholds match what the inventory shows.
 * - `percent` (ATTSPEED, critical, …): internal 110 → 11 (tooltip "11.0%")
 * - `plainpercent` / `hpadd` / `plain`: same integer as on the tooltip
 */
export const effectTooltipComparable = (index: number, value: number): number => {
  const cfg = EFFECT_CONFIG[index];
  // Only `percent` (e.g. ATTSPEED) is stored in tenths; tooltip shows value/10.
  if (cfg?.format === 'percent') return value / 10;
  return value;
};

export const formatEffectValueText = (index: number, value: number): string => {
  const cfg = EFFECT_CONFIG[index];
  if (!cfg) return `${value}`;
  switch (cfg.format) {
    case 'percent': {
      const whole = Math.trunc(value / 10);
      const frac = Math.abs(value % 10);
      return `${whole}.${frac}%`;
    }
    case 'hpadd':
      return `${value}%`;
    case 'plainpercent':
      return `${value}%`;
    case 'class':
      return formatClassBitmask(value);
    case 'label-only':
      return '';
    default:
      return `${value}`;
  }
};

const buildDisplayText = (effect: ViewItemEffect): string => {
  if (effect.index === HARDCODED_BONUS.DROP_RATE || effect.index === HARDCODED_BONUS.EXPERIENCE) {
    return effect.label;
  }
  const cfg = EFFECT_CONFIG[effect.index];
  if (cfg?.format === 'label-only') {
    return effect.label;
  }
  if (effect.index === HARDCODED_BONUS.MAGIC_ATTACK) {
    return `${effect.label} : ${effect.value}%`;
  }
  if (
    effect.source === 'wire' &&
    effect.rawValue !== undefined &&
    effect.rawValue !== effect.value
  ) {
    const rawText = formatEffectValueText(effect.index, effect.rawValue);
    const scaledText = formatEffectValueText(effect.index, effect.value);
    return `${effect.label} : ${rawText} (${scaledText})`;
  }
  return `${effect.label} : ${formatEffectValueText(effect.index, effect.value)}`;
};

/* ── Color tier resolver ── */

const resolveColorTier = (
  effectIndex: number,
  source: 'base' | 'wire' | 'hardcoded',
  rawValue: number,
  pos: number,
): ViewItemEffect['colorTier'] => {
  if (source === 'hardcoded') return 'blue';

  const cfg = EFFECT_CONFIG[effectIndex];

  if (cfg?.alwaysColor === 'pvp') return 'pvp';
  if (cfg?.alwaysColor === 'blue') return 'blue';

  if (source !== 'wire') return 'normal';

  if (!cfg?.wireTier) return 'green';

  let { yellow, orange } = cfg.wireTier;

  if (
    effectIndex === MItemDefinition.DAMAGE ||
    effectIndex === MItemDefinition.DAMAGE2 ||
    effectIndex === MItemDefinition.DAMAGEADD
  ) {
    if (pos === 0x20) orange = 30;
  }
  if (
    effectIndex === MItemDefinition.AC1 ||
    effectIndex === MItemDefinition.ACADD ||
    effectIndex === MItemDefinition.ACADD2
  ) {
    if (pos === 0x10) {
      yellow = 30;
      orange = 30;
    }
  }
  if (effectIndex === MItemDefinition.MAGIC || effectIndex === MItemDefinition.MAGICADD) {
    if (pos >= 0x40) {
      yellow = 20;
      orange = 20;
    }
  }

  if (rawValue > orange) return 'orange';
  if (rawValue >= yellow) return 'yellow';
  return 'green';
};

const enrichEffect = (e: MItemEffect, source: 'base' | 'wire' = 'base'): ViewItemEffect => {
  const cfg = EFFECT_CONFIG[e.index];
  const label = cfg?.label ?? `Efeito ${e.index}`;
  const hidden = !CANONICAL_EFFECT_INDICES.has(e.index);
  const partial: ViewItemEffect = {
    index: e.index,
    value: e.value,
    label,
    hidden,
    displayText: '',
    source,
  };
  partial.displayText = buildDisplayText(partial);
  return partial;
};

/** Display order: base effects shown in this priority (matching game tooltip) */
const EFFECT_DISPLAY_ORDER: number[] = [
  MItemDefinition.CLASS,
  MItemDefinition.LEVEL,
  MItemDefinition.REQ_STR,
  MItemDefinition.REQ_INT,
  MItemDefinition.REQ_DEX,
  MItemDefinition.REQ_CON,
  MItemDefinition.DAMAGE,
  MItemDefinition.AC1,
  MItemDefinition.HP,
  MItemDefinition.MP,
  MItemDefinition.HPADD,
  MItemDefinition.MPADD,
  MItemDefinition.SAVEMANA,
  MItemDefinition.CRITICAL,
  MItemDefinition.REGENHP,
  MItemDefinition.REGENMP,
  MItemDefinition.RESISTALL,
  MItemDefinition.EVASION,
  MItemDefinition.RUNSPEED,
  MItemDefinition.RESIST1,
  MItemDefinition.RESIST2,
  MItemDefinition.RESIST3,
  MItemDefinition.RESIST4,
  MItemDefinition.SPECIAL1,
  MItemDefinition.SPECIAL2,
  MItemDefinition.SPECIAL3,
  MItemDefinition.SPECIAL4,
  MItemDefinition.ATTSPEED,
  MItemDefinition.SPECIALALL,
  MItemDefinition.STR,
  MItemDefinition.INT,
  MItemDefinition.DEX,
  MItemDefinition.CON,
  MItemDefinition.MAGIC,
  MItemDefinition.HP_REGEN_BONUS,
  MItemDefinition.INIT1,
  MItemDefinition.INIT2,
  MItemDefinition.INIT3,
  MItemDefinition.ACADD,
  MItemDefinition.DAMAGEADD,
  MItemDefinition.MAGICADD,
  MItemDefinition.DAMAGE2,
  MItemDefinition.INCUBATE,
  MItemDefinition.MOUNTLIFE,
  MItemDefinition.MOUNTHP,
  MItemDefinition.MOUNTSANC,
  MItemDefinition.MOUNTFEED,
  MItemDefinition.INCUDELAY,
  MItemDefinition.MOUNTKILL,
  MItemDefinition.LTOTKILL,
  MItemDefinition.HTOTKILL,
  MItemDefinition.HITRATE,
  MItemDefinition.CURKILL,
  MItemDefinition.MAGIC_CRIT,
  MItemDefinition.PVPDAMAGE,
  MItemDefinition.PVPAC,
];
const EFFECT_ORDER_MAP = new Map(EFFECT_DISPLAY_ORDER.map((idx, pos) => [idx, pos]));
const SOURCE_ORDER: Record<string, number> = { base: 0, wire: 1, hardcoded: 2 };
const sortEffects = (effects: ViewItemEffect[]): ViewItemEffect[] =>
  [...effects].sort((a, b) => {
    // base → wire → hardcoded
    const srcA = SOURCE_ORDER[a.source ?? 'base'] ?? 0;
    const srcB = SOURCE_ORDER[b.source ?? 'base'] ?? 0;
    if (srcA !== srcB) return srcA - srcB;
    // then by display order
    const oA = EFFECT_ORDER_MAP.get(a.index) ?? 999;
    const oB = EFFECT_ORDER_MAP.get(b.index) ?? 999;
    return oA - oB;
  });

/* ── SANC (refinement) scaling ── */

/**
 * range `0x73..0x7E` (SANC2/SANC3 family — 12 indices, including the DYE_*
 * range that the canonical reader treats as SANC family). 13 indices total.
 */
const isSancIndex = (idx: number): boolean => idx === 0x2b || (idx >= 0x73 && idx <= 0x7e);

/** REGENHP/REGENMP use score × value (not percentage scaling) */
const SCALE_BY_SCORE = new Set<number>([MItemDefinition.REGENHP, MItemDefinition.REGENMP]);

/** Effects that are NOT scaled by SANC — returned as-is */
const NO_SANC_SCALE = new Set<number>([
  MItemDefinition.LEVEL,
  MItemDefinition.POS,
  MItemDefinition.CLASS,
  MItemDefinition.WTYPE,
  MItemDefinition.REQ_STR,
  MItemDefinition.REQ_INT,
  MItemDefinition.REQ_DEX,
  MItemDefinition.REQ_CON,
  MItemDefinition.RANGE,
  MItemDefinition.VOLATILE,
  MItemDefinition.REGENHP,
  MItemDefinition.REGENMP,
  MItemDefinition.INCUBATE,
  MItemDefinition.INCUDELAY,
  MItemDefinition.PREVBONUS,
  MItemDefinition.ITEMTYPE,
  MItemDefinition.TERRITORY,
  MItemDefinition.REQ_EVO,
  MItemDefinition.UNIQUE_FLAG,
  MItemDefinition.PVPDAMAGE,
  MItemDefinition.PVPAC,
  MItemDefinition.CONTMES,
  MItemDefinition.CONTHOR,
  MItemDefinition.CONTMIN,
  MItemDefinition.CONTANO,
  MItemDefinition.CONTDIA,
]);

/** Decode SANC level from wire value */
const decodeSancLevel = (value: number): number => {
  if (value < 230) return value % 10;
  const raw = value - 220;
  return Math.floor((raw - 10) / 4) + 10;
};

export const getRefineLevel = (item: MItem): number => {
  for (const ef of item.effects) {
    if (isSancIndex(ef.index)) return decodeSancLevel(ef.value);
  }
  return 0;
};

/**
 * Used for wire SANC phase calculation in hardcoded bonuses.
 * raw < 230 → raw % 10, raw >= 230 → raw - 220
 */
const decodeSancIntermediate = (value: number): number => {
  if (value < 230) return value % 10;
  return value - 220;
};

/**
 * Wire SANC phase system — if intermediate > 9:
 * phase = (intermediate - 10) % 4 + 1 (1-4)
 * wireLvl = floor((intermediate - 10) / 4) + 1
 */
const getWireSancPhase = (intermediate: number): { phase: number; wireLvl: number } => {
  if (intermediate <= 9) return { phase: 0, wireLvl: 0 };
  return {
    phase: ((intermediate - 10) % 4) + 1,
    wireLvl: Math.floor((intermediate - 10) / 4) + 1,
  };
};

/* ── Gem detection & remap ── */

/** Wire effect indices 0x45-0x49 indicate a socketed gem */
const GEM_EFFECT_INDICES = new Set<number>([
  MItemDefinition.HPADD2, // 69 = 0x45 = gem 'E'
  MItemDefinition.MPADD2, // 70 = 0x46 = gem 'F'
  MItemDefinition.CRITICAL2, // 71 = 0x47 = gem 'G'
  MItemDefinition.ACADD2, // 72 = 0x48 = gem 'H'
  MItemDefinition.DAMAGE2, // 73 = 0x49 = gem 'I'
]);

const GEM_LETTER: Record<number, string> = {
  69: 'E',
  70: 'F',
  71: 'G',
  72: 'H',
  73: 'I',
};

/**
 * Gem remap: when a gem is present, certain base effects are redirected.
 * Maps gem effect index → source base effect index that gets remapped.
 * E.g. gem F (0x46=70) causes base MPADD(46) → MPADD2(70).
 */
const GEM_REMAP_SOURCE: Record<number, number> = {
  69: MItemDefinition.HPADD, // gem E: HPADD(45) → HPADD2(69)
  70: MItemDefinition.MPADD, // gem F: MPADD(46) → MPADD2(70)
  71: MItemDefinition.CRITICAL, // gem G: CRITICAL(42) → CRITICAL2(71)
  72: MItemDefinition.ACADD, // gem H: ACADD(53) → ACADD2(72)
  // gem I: DAMAGE(2) → DAMAGE2(73) — only for itemType 0x20, handled separately
};

/**
 * Hardcoded tooltip bonuses (shown in blue in the original client).
 * Block 1: SANC > 8 + POS-based bonuses
 * Block 3: Grade switch + Wire SANC phase bonuses
 */
const getHardcodedBonuses = (
  sancLevel: number,
  rawSancByte: number,
  pos: number,
  mesh: number,
  grade: number,
): ViewItemEffect[] => {
  const bonuses: ViewItemEffect[] = [];

  // ── Block 1: SANC > 8 + POS ──
  if (sancLevel > 8) {
    if (pos === 0x04 || pos === 0x08 || pos === 0x80) {
      const b: ViewItemEffect = {
        index: HARDCODED_BONUS.DEFENSE,
        value: 25,
        label: 'Defesa',
        hidden: false,
        displayText: '',
        source: 'hardcoded',
        colorTier: 'blue',
      };
      b.displayText = buildDisplayText(b);
      bonuses.push(b);
    }
    if (pos === 0x10) {
      const b: ViewItemEffect = {
        index: HARDCODED_BONUS.SKILL_DELAY,
        value: 1,
        label: 'Diminua o delay antes de usar a próxima skill.',
        hidden: false,
        displayText: '',
        source: 'hardcoded',
        colorTier: 'blue',
      };
      b.displayText = buildDisplayText(b);
      bonuses.push(b);
    }
    if (pos === 0x40 || pos === 0xc0) {
      if (mesh === 47 || mesh === 44) {
        const b: ViewItemEffect = {
          index: HARDCODED_BONUS.MAGIC_ATTACK,
          value: 16,
          label: 'Ataque Mágico',
          hidden: false,
          displayText: '',
          source: 'hardcoded',
          colorTier: 'blue',
        };
        b.displayText = buildDisplayText(b);
        bonuses.push(b);
      } else {
        const b: ViewItemEffect = {
          index: HARDCODED_BONUS.DAMAGE_BOOST,
          value: 40,
          label: 'Aumento de Dano',
          hidden: false,
          displayText: '',
          source: 'hardcoded',
          colorTier: 'blue',
        };
        b.displayText = buildDisplayText(b);
        bonuses.push(b);
      }
    }
  }

  // ── Block 3: Grade switch + Wire SANC phase ──
  const intermediate = decodeSancIntermediate(rawSancByte);
  const { phase, wireLvl } = getWireSancPhase(intermediate);

  let dropRate = 0;
  let penetration = 0;
  let experience = 0;
  let absorption = 0;

  const adjustedSanc = sancLevel >= 9 ? sancLevel + 1 : sancLevel;
  const base = adjustedSanc + 10;

  switch (grade) {
    case 5:
      dropRate = 8;
      break;
    case 6:
      penetration = 40;
      break;
    case 7:
      experience = 2;
      break;
    case 8:
      absorption = 40;
      break;
    case 9:
      penetration = base;
      break;
    case 10:
      absorption = base;
      break;
    case 20:
      penetration = Math.trunc(base * 1.5);
      break;
    case 21:
      absorption = Math.trunc(base * 1.5);
      break;
    case 22:
      penetration = Math.trunc(base * 1.5);
      absorption = Math.trunc(base * 1.5);
      break;
    case 25:
      penetration = base * 3;
      break;
    case 26:
      penetration = base * 3;
      absorption = base * 3 + 15;
      break;
  }

  // Wire SANC phase modifiers
  if (phase === 1) dropRate += Math.min(wireLvl, 1) * 8;
  if (phase === 2) penetration += Math.trunc((wireLvl * 40) / 100);
  if (phase === 3) experience += Math.min(wireLvl, 1) * 2;
  if (phase === 4) absorption += Math.trunc((wireLvl * 40) / 100);

  if (penetration > 0) {
    const b: ViewItemEffect = {
      index: HARDCODED_BONUS.PENETRATION,
      value: penetration,
      label: 'Dano de Perfuração.',
      hidden: false,
      displayText: '',
      source: 'hardcoded',
      colorTier: 'blue',
    };
    b.displayText = buildDisplayText(b);
    bonuses.push(b);
  }
  if (absorption > 0) {
    const b: ViewItemEffect = {
      index: HARDCODED_BONUS.ABSORPTION,
      value: absorption,
      label: 'Absorver Dano.',
      hidden: false,
      displayText: '',
      source: 'hardcoded',
      colorTier: 'blue',
    };
    b.displayText = buildDisplayText(b);
    bonuses.push(b);
  }
  if (dropRate > 0) {
    const b: ViewItemEffect = {
      index: HARDCODED_BONUS.DROP_RATE,
      value: dropRate,
      label: `Aumento de ${dropRate}% na Taxa de Drop.`,
      hidden: false,
      displayText: '',
      source: 'hardcoded',
      colorTier: 'blue',
    };
    b.displayText = buildDisplayText(b);
    bonuses.push(b);
  }
  if (experience > 0) {
    const b: ViewItemEffect = {
      index: HARDCODED_BONUS.EXPERIENCE,
      value: experience,
      label: `Aumento de ${experience}% de Experiência.`,
      hidden: false,
      displayText: '',
      source: 'hardcoded',
      colorTier: 'blue',
    };
    b.displayText = buildDisplayText(b);
    bonuses.push(b);
  }

  return bonuses;
};

/**
 * Pull help lines, mount visual, and mount runtime from the unified item DB.
 * Empty help lines (whitespace-only) are filtered out to keep tooltips tight.
 *
 * IMPORTANT — mount projection gating uses the game's predicate:
 *
 *   The ItemList row +0x40 (`equipModelId`) is populated in ~60% of items
 *   (3866/6500). For non-mount items it is just a per-slot model id (copied
 *   from +0x40 is ONLY consumed by the game when the item's
 *   class field at +0x98 ∈ {0x16, 0x17, 0x18}. The builder already gates
 *   `mountInfo.visual` on this predicate, but we re-check `itemClass` here
 *   to also gate `mountRuntime` (so non-mount items with a chance MountData
 *   row don't masquerade as mount items in the tooltip).
 */
const MOUNT_CLASS_GATE = new Set<number>([0x16, 0x17, 0x18]);

const buildDbFieldsView = (
  itemId: number,
  item: MItem,
): Partial<Pick<ViewItem, 'helpLines' | 'mountVisual' | 'mountRuntime'>> => {
  const dbItem = getItem(itemId);
  if (!dbItem) return {};
  const result: Partial<Pick<ViewItem, 'helpLines' | 'mountVisual' | 'mountRuntime'>> = {};

  if (dbItem.help && dbItem.help.lines.length > 0) {
    const lines = renderHelpLines(dbItem.help, item).map((l) => ({
      color: helpColorToCss(l.color),
      text: l.text,
    }));
    if (lines.length > 0) result.helpLines = lines;
  }

  // Canonical gate: project mount fields only when the item's class indicates
  if (dbItem.mountInfo && MOUNT_CLASS_GATE.has(dbItem.itemClass)) {
    result.mountRuntime = { baseHp: dbItem.mountInfo.baseHp };
    if (dbItem.mountInfo.visual) {
      result.mountVisual = {
        mountClass: dbItem.mountInfo.visual.mountClass,
        slotColors: dbItem.mountInfo.visual.slotColors,
        scaleRatio: dbItem.mountInfo.visual.scaleRatio,
        refineBonusIndex: dbItem.mountInfo.visual.refineBonusIndex,
      };
    }
  }

  return result;
};

/** Canonical empty bag/equip slot (item-enrich convention: `index === 0`). */
export const EMPTY_VIEW_ITEM: ViewItem = Object.freeze({
  index: 0,
  name: '',
  displayName: '',
  effects: [],
});

export const enrichItem = (item: MItem): ViewItem => {
  if (item.index === 0) {
    return EMPTY_VIEW_ITEM;
  }

  // Read canonical Item once and derive all legacy meta fields from
  // it. This single getItem() call is O(1) and replaces the old per-field
  // lookup maps.
  const dbItem = getItem(item.index);
  const nMountType = dbItem?.itemClass ?? 0;
  const mountDataId = dbItem?.mountIndex ?? 0;

  // ── Path 1: Special mount (0x17) — stats directly from MountData table ──
  if (isSpecialMount(nMountType)) {
    const mountInfo = getItem(item.index)?.mountInfo;
    const effects: ViewItemEffect[] = mountInfo
      ? [
          {
            index: MItemDefinition.DAMAGE,
            value: mountInfo.damage,
            label: 'Aumento de Dano',
            hidden: false,
            source: 'base',
            displayText: `Aumento de Dano : ${mountInfo.damage}`,
          },
          {
            index: MItemDefinition.MAGIC,
            value: mountInfo.magic,
            label: 'Ataque Mágico',
            hidden: false,
            source: 'base',
            displayText: `Ataque Mágico : ${mountInfo.magic}%`,
          },
          {
            index: MItemDefinition.EVASION,
            value: mountInfo.evasion,
            label: 'Índice de Evasão',
            hidden: false,
            source: 'base',
            displayText: `Índice de Evasão : ${Math.trunc(mountInfo.evasion / 10)}.${Math.abs(mountInfo.evasion % 10)}%`,
          },
          {
            index: MItemDefinition.RESISTALL,
            value: mountInfo.resistAll,
            label: 'Aumento de Imunidades',
            hidden: false,
            source: 'base',
            displayText: `Aumento de Imunidades : ${mountInfo.resistAll}`,
          },
        ]
      : [];

    // Add base effects (filtered effectSlots + LEVEL synthesis from canonical Item)
    const baseRaw = computeBaseEffects(dbItem);
    for (const ef of baseRaw) {
      const enriched = enrichEffect({ index: ef.index, value: ef.value });
      enriched.displayText = buildDisplayText(enriched);
      effects.push(enriched);
    }
    if (dbItem && dbItem.level > 0) {
      const enriched = enrichEffect({ index: MItemDefinition.LEVEL, value: dbItem.level });
      enriched.displayText = buildDisplayText(enriched);
      effects.push(enriched);
    }

    const name = fallbackName(dbItem, item.index);
    return {
      index: item.index,
      name,
      displayName: name,
      effects,
      immovable: computeImmovableTier(item, dbItem),
      ...buildDbFieldsView(item.index, item),
    };
  }

  // ── Path 2: Baby/Adult mount (0x15/0x16) — mount struct in bytes 6-11 ──
  if (hasMountStruct(nMountType)) {
    const mountHp = item.effects[0].index | (item.effects[0].value << 8);
    const mountSanc = item.effects[1].index;
    const mountLife = item.effects[1].value;
    const mountFeed = item.effects[2].index;
    const mountKill = item.effects[2].value;

    // Base effects (filtered effectSlots + LEVEL synthesis from canonical Item)
    const effects: ViewItemEffect[] = [];
    const baseRawMount = computeBaseEffects(dbItem);
    for (const ef of baseRawMount) {
      const enriched = enrichEffect({ index: ef.index, value: ef.value });
      enriched.displayText = buildDisplayText(enriched);
      effects.push(enriched);
    }
    if (dbItem && dbItem.level > 0) {
      const enriched = enrichEffect({ index: MItemDefinition.LEVEL, value: dbItem.level });
      enriched.displayText = buildDisplayText(enriched);
      effects.push(enriched);
    }

    // Mount struct data
    const pushMountEffect = (index: number, value: number): void => {
      const eff = enrichEffect({ index, value });
      eff.displayText = buildDisplayText(eff);
      effects.push(eff);
    };
    pushMountEffect(MItemDefinition.MOUNTHP, mountHp);
    pushMountEffect(MItemDefinition.MOUNTSANC, mountSanc);
    pushMountEffect(MItemDefinition.MOUNTLIFE, mountLife);
    pushMountEffect(MItemDefinition.MOUNTFEED, mountFeed);
    pushMountEffect(MItemDefinition.MOUNTKILL, mountKill);

    const mountInfo = getItem(item.index)?.mountInfo;
    if (nMountType === 0x16 && mountInfo && mountHp > 0 && mountDataId >= 2) {
      let damage = Math.trunc(((mountSanc + 20) * mountInfo.damage) / 100);
      let magic = Math.trunc(((mountSanc + 15) * mountInfo.magic) / 100);

      if (mountKill > 0) {
        damage = Math.trunc(((mountKill + 100) * damage) / 100);
        magic = Math.trunc(((mountKill + 100) * magic) / 100);
      }

      effects.push(
        {
          index: MItemDefinition.DAMAGE,
          value: damage,
          label: 'Aumento de Dano',
          hidden: false,
          source: 'base',
          displayText: `Aumento de Dano : ${damage}`,
        },
        {
          index: MItemDefinition.MAGIC,
          value: magic,
          label: 'Ataque Mágico',
          hidden: false,
          source: 'base',
          displayText: `Ataque Mágico : ${magic}%`,
        },
        {
          index: MItemDefinition.EVASION,
          value: mountInfo.evasion,
          label: 'Índice de Evasão',
          hidden: false,
          source: 'base',
          displayText: `Índice de Evasão : ${Math.trunc(mountInfo.evasion / 10)}.${Math.abs(mountInfo.evasion % 10)}%`,
        },
        {
          index: MItemDefinition.RESISTALL,
          value: mountInfo.resistAll,
          label: 'Aumento de Imunidades',
          hidden: false,
          source: 'base',
          displayText: `Aumento de Imunidades : ${mountInfo.resistAll}`,
        },
      );
    }

    const name = fallbackName(dbItem, item.index);
    return {
      index: item.index,
      name,
      displayName: name,
      effects,
      immovable: computeImmovableTier(item, dbItem),
      ...buildDbFieldsView(item.index, item),
    };
  }

  // ── Path 3: Normal items — 3 wire effect slots (bytes 6-11) + SANC scaling ──
  // Wire bytes 2-3 carry stackCount (read by codec); 4-5 are field_04 (unmapped).
  const wireSlots = item.effects;

  // Detect SANC level from wire effects (canonical scan: idx 0x2B + range 0x73..0x7E).
  let sancLevel = 0;
  let rawSancByte = 0;
  for (const ef of wireSlots) {
    if (isSancIndex(ef.index)) {
      rawSancByte = ef.value;
      sancLevel = decodeSancLevel(ef.value);
      break;
    }
  }
  const sancMult = getSancMultiplier(sancLevel, item.index);

  // Detect gem from wire effects (index 0x45-0x49 = gem E/F/G/H/I)
  let gemIndex: number | null = null;
  for (const ef of wireSlots) {
    if (GEM_EFFECT_INDICES.has(ef.index)) {
      gemIndex = ef.index;
      break;
    }
  }

  const itemPos = dbItem?.pos ?? 0;

  const wireEffects: ViewItemEffect[] = [];
  for (const ef of wireSlots) {
    if (ef.index === 0 || isSancIndex(ef.index)) continue;
    if (GEM_EFFECT_INDICES.has(ef.index)) continue;
    if (TIME_EFFECT_INDICES.has(ef.index)) continue;
    const rawValue = ef.value;
    let value: number;
    if (SCALE_BY_SCORE.has(ef.index)) {
      value = ef.value * sancLevel;
    } else if (!NO_SANC_SCALE.has(ef.index) && sancLevel > 0) {
      value = Math.trunc((ef.value * sancMult) / 100);
    } else {
      value = ef.value;
    }
    const enriched = enrichEffect({ index: ef.index, value }, 'wire');
    if (!SCALE_BY_SCORE.has(ef.index) && value !== rawValue) enriched.rawValue = rawValue;
    enriched.colorTier = resolveColorTier(ef.index, 'wire', rawValue, itemPos);
    enriched.displayText = buildDisplayText(enriched);
    wireEffects.push(enriched);
  }

  const baseRaw = computeBaseEffects(dbItem);
  const merged = new Map<number, ViewItemEffect>();

  for (const ef of baseRaw) {
    let index = ef.index;
    let value = ef.value;

    // Gem remap — redirect base effect to gem variant (E/F/G/H)
    if (gemIndex !== null && GEM_REMAP_SOURCE[gemIndex] === index) {
      index = gemIndex;
    }

    // ATTSPEED remap value==1→100 before SANC scaling
    if (index === MItemDefinition.ATTSPEED && value === 1) {
      value = 100;
    }

    let scaled: number;
    if (SCALE_BY_SCORE.has(index)) {
      scaled = value * sancLevel;
    } else if (!NO_SANC_SCALE.has(index) && sancLevel > 0) {
      scaled = Math.trunc((value * sancMult) / 100);
    } else {
      scaled = value;
    }

    if (scaled === 0) continue;

    const enriched = enrichEffect({ index, value: scaled });
    enriched.colorTier = resolveColorTier(index, 'base', scaled, itemPos);
    enriched.displayText = buildDisplayText(enriched);
    merged.set(index, enriched);
  }

  const allEffects: ViewItemEffect[] = [...merged.values()];
  for (const ef of wireEffects) {
    allEffects.push(ef);
  }

  // SANC stored in data but hidden (shown in item name instead)
  if (sancLevel > 0) {
    allEffects.push({
      index: MItemDefinition.SANC1,
      value: sancLevel,
      label: 'Refinamento',
      hidden: true,
      displayText: `Refinamento : ${sancLevel}`,
    });
  }

  // Hardcoded tooltip bonuses (shown in blue in the original client)
  const pos = dbItem?.pos ?? 0;
  const mesh = dbItem?.mesh ?? 0;
  const grade = dbItem?.grade ?? 0;
  const hardcoded = getHardcodedBonuses(sancLevel, rawSancByte, pos, mesh, grade);
  for (const b of hardcoded) {
    allEffects.push(b);
  }

  const durationText = formatItemDuration(wireSlots, item.index);
  if (durationText) {
    allEffects.push({
      index: TIME_BONUS.DURATION,
      value: 0,
      label: durationText,
      hidden: false,
      displayText: durationText,
      source: 'hardcoded',
      colorTier: 'blue',
    });
  }

  const displayName = fallbackName(dbItem, item.index);
  const refineLevel = sancLevel > 0 ? sancLevel : undefined;
  const gemLetter = gemIndex !== null ? GEM_LETTER[gemIndex] : undefined;
  const itemClass = dbItem?.itemClass ?? 0;
  const passesAmountGate =
    (itemPos === 0 || itemClass === 0x37) && (itemClass === 0 || itemClass > 0x31);
  const stackCount =
    item.stackCount >= 2 && item.stackCount < 500 && passesAmountGate ? item.stackCount : undefined;
  // else wire bytes 2-3 for class 0x37.
  const isAmagoIdRange = item.index >= 0x956 && item.index < 0x974;
  let titleCountValue: number | undefined;
  if (refineLevel !== undefined && itemClass === 0x37) {
    if (isAmagoIdRange && item.effects[1].value > 0) {
      titleCountValue = item.effects[1].value;
    } else if (stackCount !== undefined) {
      titleCountValue = stackCount;
    }
  }
  const titleCountSuffix = titleCountValue !== undefined ? ` (${titleCountValue})` : '';
  const name =
    displayName +
    (refineLevel !== undefined ? ` +${refineLevel}` : '') +
    titleCountSuffix +
    (gemLetter !== undefined ? ` [${gemLetter}]` : '');

  return {
    index: item.index,
    name,
    displayName,
    refineLevel,
    gemLetter,
    stackCount,
    titleCount: titleCountValue,
    immovable: computeImmovableTier(item, dbItem),
    effects: sortEffects(allEffects),
    ...buildDbFieldsView(item.index, item),
  };
};

// Icon URL lookup lives in `./item-icons`.
