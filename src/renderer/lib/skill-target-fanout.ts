/**
 *
 * packetKind caps live slots; skill types 2/0xC/0x1C prefer adjacent secondary.
 *
 * v1 deliberately skips heightmap LOS and line-angle filters (aoeMode 5).
 */

import type { MPosition } from '@shared/types';
import { attackDistance } from '@shared/lib/movement-math';

/** Skill types that fill slot 1 from the tile adjacent to primary (sign direction). */
export const ADJACENT_DUAL_SKILL_IDS: ReadonlySet<number> = new Set([0x2, 0xc, 0x1c]);

export interface SkillFanoutCandidate {
  readonly index: number;
  readonly pos: MPosition;
}

export interface PickSkillTargetsArgs {
  readonly skillId: number;
  readonly packetKind: number;
  readonly castRange: number;
  readonly primary: SkillFanoutCandidate;
  readonly playerPos: MPosition;
  /** Other hostiles already filtered (whitelist, freshness). Primary may be present. */
  readonly candidates: readonly SkillFanoutCandidate[];
}

const sign = (n: number): -1 | 0 | 1 => (n < 0 ? -1 : n > 0 ? 1 : 0);

/**
 * Pick ordered target ids for a skill cast: `[primary, ...secondaries]`.
 * Always returns at least the primary index.
 */
export const pickSkillTargets = (args: PickSkillTargetsArgs): number[] => {
  const { skillId, packetKind, castRange, primary, playerPos, candidates } = args;
  const pk = Number.isFinite(packetKind) ? Math.floor(packetKind) : 1;

  if (pk <= 1) {
    return [primary.index];
  }

  const others = candidates.filter((c) => c.index !== primary.index);
  const maxSlots = pk === 2 ? 2 : Math.min(13, Math.max(2, pk));
  const need = maxSlots - 1;
  if (need <= 0 || others.length === 0) {
    return [primary.index];
  }

  // Prefer hostiles near the primary (AoE cluster), not only near the caster.
  const inRange = others.filter((c) => attackDistance(primary.pos, c.pos) <= castRange);

  if (pk === 2 && ADJACENT_DUAL_SKILL_IDS.has(skillId)) {
    const dx = sign(primary.pos.x - playerPos.x);
    const dy = sign(primary.pos.y - playerPos.y);
    const adjX = primary.pos.x + dx;
    const adjY = primary.pos.y + dy;
    const adjacent = inRange.find((c) => c.pos.x === adjX && c.pos.y === adjY);
    if (adjacent) {
      return [primary.index, adjacent.index];
    }
  }

  const ranked = [...inRange].sort((a, b) => {
    const da = attackDistance(primary.pos, a.pos);
    const db = attackDistance(primary.pos, b.pos);
    if (da !== db) return da - db;
    return a.index - b.index;
  });

  const extras = ranked.slice(0, need).map((c) => c.index);
  return [primary.index, ...extras];
};
