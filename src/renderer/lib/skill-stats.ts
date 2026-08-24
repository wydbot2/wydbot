/**
 * Skill-derived stats calculator (hitrate + total damage for tooltips).
 *
 * `soulValue=0`, `penalty=0`, `serverMode=1` are placeholders for runtime data
 * we don't capture yet — see .
 */

import { MItemDefinition } from '@shared/constants/item-definitions';
import type { SkillRow } from '@shared/types/skill-types';
import type { CharContext, DerivedStat } from '@shared/types/character-types';
import type { ViewItem } from '@shared/types/item-types';
import { getSkill } from './item-db';

const getEffectValue = (item: ViewItem, index: number): number | undefined => {
  const ef = item.effects.find((e) => e.index === index);
  return ef?.value;
};

/**
 * Weapon category from item ID (RE section 5).
 * Items 5000-5104 and 5400-5447 are weapons.
 */
const getWeaponCategory = (itemId: number): number | null => {
  if (itemId >= 5400 && itemId <= 5447) return itemId - 5200;
  if (itemId >= 5000 && itemId <= 5104) return itemId - 5000;
  return null;
};

/**
 * Get SkillData entry for a weapon.
 * Uses WTYPE effect if present, otherwise derives from item ID.
 */
const getSkillEntry = (item: ViewItem): SkillRow | null => {
  const wtype = getEffectValue(item, MItemDefinition.WTYPE);
  if (wtype !== undefined && wtype > 0) {
    return getSkill(wtype)?.row ?? null;
  }
  const cat = getWeaponCategory(item.index);
  if (cat === null) return null;
  return getSkill(cat)?.row ?? null;
};

/** Get weapon category (WTYPE or derived from item ID) */
const getWeaponCat = (item: ViewItem): number | null => {
  const wtype = getEffectValue(item, MItemDefinition.WTYPE);
  if (wtype !== undefined && wtype > 0) return wtype;
  return getWeaponCategory(item.index);
};

/**
 * Select primary stat based on weapon category (RE section 8).
 * primaryStat = charStats[(weaponCat % 24) / 8]
 * Index 0=STR, 1=INT, 2=DEX
 */
const getPrimaryStat = (ctx: CharContext, weaponCat: number): number => {
  const statIndex = Math.trunc((weaponCat % 24) / 8);
  switch (statIndex) {
    case 0:
      return ctx.str;
    case 1:
      return ctx.int;
    case 2:
      return ctx.dex;
    default:
      return ctx.str;
  }
};

/**
 * HitRate (RE section 7).
 * hitrate = ((charStat / 2 + 100) * baseHitrate / 100) * (100 - penalty) / 100
 * charStat selected by (category % 24) / 8
 * penalty from char offset 0xF2F — not available, using 0
 */
const calcHitRate = (item: ViewItem, ctx: CharContext): DerivedStat | null => {
  const skill = getSkillEntry(item);
  const weaponCat = getWeaponCat(item);
  if (!skill || !weaponCat || skill.baseHitrate <= 0) return null;

  const charStat = getPrimaryStat(ctx, weaponCat);
  const penalty = 0; // CONSTRAINT: offset 0xF2F not in current packet
  const hitrate = Math.trunc(
    (Math.trunc(((charStat / 2 + 100) * skill.baseHitrate) / 100) * (100 - penalty)) / 100,
  );

  return {
    label: 'Taxa de Acerto',
    value: `${hitrate}`,
  };
};

/**
 * Total Damage (RE section 8).
 * Complex formula with branches by weaponStatType.
 */
const calcTotalDamage = (item: ViewItem, ctx: CharContext): DerivedStat | null => {
  const skill = getSkillEntry(item);
  const weaponCat = getWeaponCat(item);
  if (!skill || weaponCat === null) return null;

  const { weaponStatType, baseDamage, auxDamage } = skill;
  const primaryStat = getPrimaryStat(ctx, weaponCat);
  const classMaster = ctx.classMaster;
  const classBase = classMaster % 4; // 0=TK, 1=FM, 2=BM, 3=HT
  const evolution = Math.trunc(classMaster / 4);
  const isCelestial = evolution >= 3;
  const level = ctx.level;
  const soulValue = 0; // CONSTRAINT: not available in current packet
  const serverMode = 1; // CONSTRAINT: assume mode 1

  let damage: number;

  switch (weaponStatType) {
    case 0: {
      // Direct/simple — specific weapon categories
      switch (weaponCat) {
        case 11:
          damage = Math.trunc(primaryStat / 10) + auxDamage;
          break;
        case 13:
          damage = auxDamage + primaryStat * 3;
          break;
        case 41:
          damage = Math.trunc(primaryStat / 25) + 2;
          break;
        case 43:
          damage = Math.trunc(primaryStat / 3) + 15 + auxDamage;
          break;
        case 44:
          damage = (Math.trunc(primaryStat / 3) + 15) * 5;
          break;
        case 45:
          damage = Math.trunc(primaryStat / 10) + auxDamage;
          break;
        default:
          damage = baseDamage;
          break;
      }
      break;
    }

    case 1:
    case 2:
    case 3:
    case 4:
    case 5: {
      // Physical weapons with scaling — depends on class
      const group = Math.trunc(weaponCat / 8);
      const isGroup1 = group % 3 === 1;

      if (!isCelestial) {
        if ((classBase === 0 || classBase === 3) && isGroup1) {
          // TK/HT group 1
          damage = Math.trunc(level / 2) + baseDamage + (ctx.str + soulValue) * 3 + primaryStat;
        } else if (classBase === 0 || classBase === 3) {
          // TK/HT other groups
          damage =
            Math.trunc(level / 2) +
            baseDamage +
            Math.trunc(ctx.int / 40) +
            Math.trunc(ctx.int / 4) +
            primaryStat +
            soulValue;
        } else {
          // FM/BM
          damage =
            Math.trunc(level / 2) +
            baseDamage +
            Math.trunc(ctx.int / 3) +
            Math.trunc(ctx.int / 30) +
            primaryStat;
        }
      } else {
        if ((classBase === 0 || classBase === 3) && isGroup1) {
          // Celestial TK/HT group 1
          damage = baseDamage + (ctx.str + soulValue) * 3 + primaryStat + level;
        } else {
          // Celestial FM/BM (or TK/HT non-group1)
          damage =
            Math.trunc(ctx.int / 3) +
            baseDamage +
            Math.trunc(ctx.int / 30) +
            primaryStat * 2 +
            level;
        }
      }

      // Subtype multiplier
      if (serverMode === 1 && weaponStatType === 2) {
        damage = Math.trunc((damage * 90) / 100);
      } else if (serverMode === 1 && weaponStatType === 5) {
        damage = Math.trunc((damage * 130) / 100);
      }

      // Soul stone bonus (skip for cat 97, 79)
      if (weaponCat !== 97 && weaponCat !== 79) {
        damage = Math.trunc(((soulValue * 4 + 100) * damage) / 100);
      }

      // Fixed multiplier x1.25
      damage = Math.trunc((damage * 5) / 4);

      break;
    }

    case 6: {
      // Magic
      damage = Math.trunc((primaryStat * 3) / 2) + baseDamage;
      break;
    }

    case 11: {
      // Special — direct from table
      damage = baseDamage;
      break;
    }

    default:
      return null;
  }

  if (damage <= 0) return null;

  return {
    label: 'Dano Total',
    value: `${damage}`,
  };
};

export const calculateSkillStats = (item: ViewItem, ctx: CharContext): DerivedStat[] => {
  const stats: DerivedStat[] = [];

  const hitRate = calcHitRate(item, ctx);
  if (hitRate) stats.push(hitRate);

  const totalDamage = calcTotalDamage(item, ctx);
  if (totalDamage) stats.push(totalDamage);

  return stats;
};
