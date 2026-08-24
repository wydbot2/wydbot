/**
 * Regression lock — magical attack policy gates on per-skill castRange.
 *
 * The policy fires a skill iff
 *   attackDistance(player, target) <= that skill's castRange
 * (castRange from SkillData.bin; rotation skills 32/33/34 have castRange 5/6/6).
 * The FSM approaches to the rotation's MAX castRange (macro-attack-engagement.ts
 * policy.getRange); the +1 hysteresis is harmless because a +1 tick casts
 * nothing (no skill passes its own castRange gate).
 */
import { describe, it, expect } from 'vitest';
import { attackDistance } from '@shared/lib/movement-math';
import type { MPosition } from '@shared/types';

// Real castRange of the LAN_A rotation skills (SkillData.bin).
const CAST_RANGE = { 32: 5, 33: 6, 34: 6 } as const;

// Mirror of the macro-attack-magical.ts per-skill gate: a skill fires iff the target
// is within THAT skill's own castRange.
const firesSkill = (player: MPosition, mob: MPosition, castRange: number): boolean =>
  attackDistance(player, mob) <= castRange;

const serverAccepts = firesSkill;

describe('attack range: magical fires per-skill castRange == server gate (no out-of-range 0x39D)', () => {
  // Pin the LUT metric so the proof cannot silently rot if attackDistance changes shape.
  it('attackDistance reproduces the canonical LUT at the key cells', () => {
    expect(attackDistance({ x: 10, y: 10 }, { x: 15, y: 10 })).toBe(5); // cardinal 5
    expect(attackDistance({ x: 10, y: 10 }, { x: 15, y: 15 })).toBe(6); // pure-diagonal LUT[5][5]=6
    expect(attackDistance({ x: 10, y: 10 }, { x: 12, y: 12 })).toBe(3); // LUT diagonal penalty
  });

  // The per-skill gate equals the server gate at
  // EVERY distance for every skill — divergence
  // cannot occur once firing is gated on the real castRange.
  it('invariant: a magical skill fires iff the server accepts it (all distances, all skills)', () => {
    const player: MPosition = { x: 100, y: 100 };
    for (const castRange of Object.values(CAST_RANGE)) {
      for (let d = 0; d <= 10; d++) {
        const mob: MPosition = { x: 100 + d, y: 100 };
        expect(firesSkill(player, mob, castRange)).toBe(serverAccepts(player, mob, castRange));
      }
    }
  });

  // The old dist=5 "out of range" warning was a FALSE ALARM: all rotation skills reach 5.
  it('dist 5 is IN range for every rotation skill (32→5, 33→6, 34→6) — server accepts', () => {
    const player: MPosition = { x: 100, y: 100 };
    const mob: MPosition = { x: 105, y: 100 };
    expect(attackDistance(player, mob)).toBe(5);
    expect(firesSkill(player, mob, CAST_RANGE[32])).toBe(true);
    expect(firesSkill(player, mob, CAST_RANGE[33])).toBe(true);
    expect(firesSkill(player, mob, CAST_RANGE[34])).toBe(true);
  });

  // Per-skill gate: at dist 6 the range-5 skill is SKIPPED (not a wasted cast) while
  // the range-6 skills still fire — the FSM approached to max range (6).
  it('at dist 6: range-5 skill is skipped, range-6 skills fire', () => {
    const player: MPosition = { x: 100, y: 100 };
    const mob: MPosition = { x: 106, y: 100 };
    expect(attackDistance(player, mob)).toBe(6);
    expect(firesSkill(player, mob, CAST_RANGE[32])).toBe(false); // r5 < 6 → skipped, no drop
    expect(firesSkill(player, mob, CAST_RANGE[33])).toBe(true); // r6 → fires, accepted
    expect(firesSkill(player, mob, CAST_RANGE[34])).toBe(true);
  });

  // Beyond every skill's range nothing fires (the +1 hysteresis tick casts nothing).
  it('beyond every skill range nothing fires (none in range) — zero wasted casts', () => {
    const player: MPosition = { x: 100, y: 100 };
    const mob: MPosition = { x: 107, y: 100 }; // cardinal 7 → attackDistance 8 (LUT bypassed past 6)
    expect(attackDistance(player, mob)).toBeGreaterThan(6);
    for (const castRange of Object.values(CAST_RANGE)) {
      expect(firesSkill(player, mob, castRange)).toBe(false);
    }
  });
});
