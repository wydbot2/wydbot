import { describe, it, expect } from 'vitest';
import {
  pickSkillTargets,
  ADJACENT_DUAL_SKILL_IDS,
} from '../../../../src/renderer/lib/skill-target-fanout';

const player = { x: 100, y: 100 };
const primary = { index: 10, pos: { x: 103, y: 100 } }; // +3 east of player

describe('pickSkillTargets', () => {
  it('returns only primary for packetKind ≤ 1', () => {
    expect(
      pickSkillTargets({
        skillId: 33,
        packetKind: 1,
        castRange: 6,
        primary,
        playerPos: player,
        candidates: [primary, { index: 11, pos: { x: 104, y: 100 } }],
      }),
    ).toEqual([10]);
  });

  it('pk=2 adjacent dual: prefers tile adjacent to primary in approach direction', () => {
    // player→primary is +x, so adjacent beyond primary is (104, 100)
    const adj = { index: 20, pos: { x: 104, y: 100 } };
    const other = { index: 21, pos: { x: 102, y: 100 } };
    expect(ADJACENT_DUAL_SKILL_IDS.has(2)).toBe(true);
    expect(
      pickSkillTargets({
        skillId: 2,
        packetKind: 2,
        castRange: 6,
        primary,
        playerPos: player,
        candidates: [primary, other, adj],
      }),
    ).toEqual([10, 20]);
  });

  it('pk=2 without adjacent: nearest other to primary in castRange', () => {
    // Rank by distance to primary (103,100), not to player.
    const nearPrimary = { index: 30, pos: { x: 104, y: 100 } }; // dist 1 from primary
    const nearPlayer = { index: 31, pos: { x: 101, y: 100 } }; // closer to player, farther from primary
    expect(
      pickSkillTargets({
        skillId: 10, // not adjacent-dual set
        packetKind: 2,
        castRange: 6,
        primary,
        playerPos: player,
        candidates: [primary, nearPlayer, nearPrimary],
      }),
    ).toEqual([10, 30]);
  });

  it('pk≥3: primary then nearest-to-primary others capped by packetKind', () => {
    const primaryPos = { index: 99, pos: { x: 100, y: 101 } };
    const a = { index: 1, pos: { x: 101, y: 101 } }; // dist 1 from primary
    const b = { index: 2, pos: { x: 102, y: 101 } }; // dist 2
    const c = { index: 3, pos: { x: 103, y: 101 } }; // dist 3
    const d = { index: 4, pos: { x: 110, y: 110 } }; // out of castRange 3
    expect(
      pickSkillTargets({
        skillId: 35,
        packetKind: 3,
        castRange: 3,
        primary: primaryPos,
        playerPos: player,
        candidates: [a, b, c, d, primaryPos],
      }),
    ).toEqual([99, 1, 2]); // primary + 2 nearest (pk=3 → need 2 extras)
  });

  it('solo pack: primary only when no secondary candidates', () => {
    expect(
      pickSkillTargets({
        skillId: 2,
        packetKind: 2,
        castRange: 6,
        primary,
        playerPos: player,
        candidates: [primary],
      }),
    ).toEqual([10]);
  });
});
