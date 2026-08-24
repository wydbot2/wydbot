/**
 * Mount HP cap calculation. Mirrors the game formula in
 *
 *   baseHp = MountData[Itemlist[itemId].MountIndex].field_0x1C  (or 7000 fallback)
 *   maxHp  = min(baseHp × levelMultiplier, 64000)
 */

import { getItem } from './item-db';

const MOUNT_LEVEL_BONUS_PCT: Readonly<Record<number, number>> = {
  14: 20,
  15: 30,
  16: 40,
  17: 50,
  18: 65,
  19: 80,
  20: 100,
};

/**
 * Scale the base HP cap by the mount level (`MOUNTSANC` = MItem byte 8, passed raw).
 * Bytes below 0x82 get no bonus and no cap; bands outside 14..20 use the +10% default.
 */
const applyMountLevelMultiplier = (baseHp: number, levelByte: number): number => {
  if (levelByte < 0x82) return baseHp;
  const bonusPct = MOUNT_LEVEL_BONUS_PCT[Math.floor(levelByte / 10)] ?? 10;
  return Math.min(baseHp + Math.trunc((bonusPct * baseHp) / 100), 64000);
};

/**
 * Compute the mount's max HP cap. `levelByte` is the byte at MItem+8 (mount
 * level — wire `MOUNTSANC` / in-game "Level da Montaria"). Falls back to a base
 * of 7000 when the item is missing or has no `mountInfo`.
 */
export const getMountMaxHp = (itemId: number, levelByte: number): number => {
  const baseHp = getItem(itemId)?.mountInfo?.baseHp ?? 7000;
  return applyMountLevelMultiplier(baseHp, levelByte);
};
