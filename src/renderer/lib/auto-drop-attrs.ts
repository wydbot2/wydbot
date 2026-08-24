import type { AutoDropAttr, AutoDropAttrOp } from '@shared/app-config';
import { MItemDefinition } from '@shared/constants/item-definitions';
import { getEffectDisplayFormat, getEffectLabel } from './item-enrich';

/** Curated set of effect indexes the rules editor exposes — the ones that
 *  actually appear on lootable instance rolls (the ADD lines of the tooltip).
 *  Matching is wire-only (see `wireAddValues` in macro-auto-drop). The full
 *  EF_* table lives in `MItemDefinition`; this is just the filter for the
 *  dropdown. Ordered by semantic group
 *  (combate · atributos · vitais · defesa · resistências · PvP · skill). */
export const AUTO_DROP_ATTR_INDEXES: readonly number[] = [
  // Combate
  MItemDefinition.DAMAGE,
  MItemDefinition.MAGIC,
  MItemDefinition.ATTSPEED,
  MItemDefinition.CRITICAL,
  MItemDefinition.HITRATE,
  MItemDefinition.EVASION,
  // Atributos
  MItemDefinition.STR,
  MItemDefinition.INT,
  MItemDefinition.DEX,
  MItemDefinition.CON,
  // Vitais
  MItemDefinition.HP,
  MItemDefinition.MP,
  MItemDefinition.HPADD,
  MItemDefinition.MPADD,
  MItemDefinition.SAVEMANA,
  MItemDefinition.REGENHP,
  MItemDefinition.REGENMP,
  // Defesa
  MItemDefinition.ACADD,
  // Resistências
  MItemDefinition.RESIST1,
  MItemDefinition.RESIST2,
  MItemDefinition.RESIST3,
  MItemDefinition.RESIST4,
  MItemDefinition.RESISTALL,
  // PvP
  MItemDefinition.PVPDAMAGE,
  MItemDefinition.PVPAC,
  // Skill
  MItemDefinition.SPECIALALL,
];

/** Canonical full label — same string the inventory tooltip shows. */
export const attrLabelFull = (index: number): string => getEffectLabel(index) ?? `EF_${index}`;

/** True when the tooltip shows this effect as a percentage (rule value is in the same units). */
export const attrShowsPercent = (index: number): boolean => {
  const fmt = getEffectDisplayFormat(index);
  return fmt === 'percent' || fmt === 'plainpercent' || fmt === 'hpadd';
};

/** False for `absent`/`present` — they test ADD presence and take no value. */
export const attrOpNeedsValue = (op: AutoDropAttrOp): boolean =>
  op !== 'absent' && op !== 'present';

/** pt-BR operator label for the rule editor dropdown and the rule summary chip. */
export const attrOpLabel = (op: AutoDropAttrOp): string => {
  if (op === 'absent') return 'sem ADD';
  if (op === 'present') return 'com ADD';
  return op;
};

/** Right-hand side of a predicate as display text (`sem ADD`, `< 21`, `12%`). */
export const attrPredicateValue = (a: AutoDropAttr): string => {
  if (!attrOpNeedsValue(a.op)) return attrOpLabel(a.op);
  const suffix = attrShowsPercent(a.index) ? '%' : '';
  return `${attrOpLabel(a.op)} ${a.value}${suffix}`;
};
