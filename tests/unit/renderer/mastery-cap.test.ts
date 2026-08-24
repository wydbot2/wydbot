import { getMasteryCap } from '../../../src/renderer/components/game/personagem/character-helpers';
import { ECharClass } from '../../../src/shared/types/game-structures';

const NONE: readonly [number, number] = [0, 0];

const learn1Bits = (...ids: number[]): number => {
  let mask = 0;
  for (const id of ids) {
    if (id === 205) mask |= 0x020;
    else if (id === 233) mask |= 0x200;
    else if (id === 238) mask |= 0x004;
    else if (id >= 200 && id < 247 && id !== 240) {
      mask |= 1 << ((Math.floor((id - 200) / 4) * 4) & 0x1f);
    }
  }
  return mask;
};

const learn0Bits = (...ids: number[]): number => {
  let mask = 0;
  for (const id of ids) {
    if (id < 96) mask |= 1 << (id % 24);
    else if (id >= 96 && id <= 103) mask |= 1 << (id - 72);
  }
  return mask;
};

const withSkills = (...ids: number[]): readonly [number, number] => [
  learn0Bits(...ids),
  learn1Bits(...ids),
];

describe('getMasteryCap — base (no learned lifts)', () => {
  it('mortal low level → level-derived cap', () => {
    expect(getMasteryCap(ECharClass.TK, 50, false, NONE)).toEqual([76, 76, 76, 76]);
  });

  it('mortal high level → clamped at 200', () => {
    expect(getMasteryCap(ECharClass.TK, 200, false, NONE)).toEqual([200, 200, 200, 200]);
  });

  it('celestial → flat 200', () => {
    expect(getMasteryCap(ECharClass.TK, 100, true, NONE)).toEqual([200, 200, 200, 200]);
  });
});

describe('getMasteryCap — special[0] class-gated lifts', () => {
  it('TK + skill 205 → 280', () => {
    expect(getMasteryCap(ECharClass.TK, 200, false, withSkills(205))[0]).toBe(280);
  });

  it('BM + skill 233 → 230', () => {
    expect(getMasteryCap(ECharClass.BM, 200, false, withSkills(233))[0]).toBe(230);
  });

  it('BM + skill 205 does NOT lift (wrong class gate)', () => {
    expect(getMasteryCap(ECharClass.BM, 200, false, withSkills(205))[0]).toBe(200);
  });

  it('FM/HT have no special[0] lift', () => {
    expect(getMasteryCap(ECharClass.FM, 200, false, withSkills(205, 233))[0]).toBe(200);
    expect(getMasteryCap(ECharClass.HT, 200, false, withSkills(205, 233))[0]).toBe(200);
  });
});

describe('getMasteryCap — special[1] cascade', () => {
  it('skill 200 → 320', () => {
    expect(getMasteryCap(ECharClass.FM, 200, false, withSkills(200))[1]).toBe(320);
  });

  it('skill 31 → 255', () => {
    expect(getMasteryCap(ECharClass.FM, 200, false, withSkills(31))[1]).toBe(255);
  });

  it('skill 200 beats skill 31 (320 > 255)', () => {
    expect(getMasteryCap(ECharClass.FM, 200, false, withSkills(200, 31))[1]).toBe(320);
  });

  it('HT + skill 238 → 400', () => {
    expect(getMasteryCap(ECharClass.HT, 200, false, withSkills(238))[1]).toBe(400);
  });

  it('HT + 238 + 200 → 400 (override applied last)', () => {
    expect(getMasteryCap(ECharClass.HT, 200, false, withSkills(238, 200))[1]).toBe(400);
  });

  it('non-HT + skill 238 does NOT lift', () => {
    expect(getMasteryCap(ECharClass.TK, 200, false, withSkills(238))[1]).toBe(200);
  });

  it('skill 31 lift is class-agnostic (raw Learn[0] bit 7)', () => {
    expect(getMasteryCap(ECharClass.BM, 200, false, withSkills(31))[1]).toBe(255);
    expect(getMasteryCap(ECharClass.HT, 200, false, withSkills(39))[2]).toBe(255);
    expect(getMasteryCap(ECharClass.FM, 200, false, withSkills(47))[3]).toBe(255);
  });
});

describe('getMasteryCap — special[2] / special[3] cascades', () => {
  it('skill 204 → sp2 320', () => {
    expect(getMasteryCap(ECharClass.TK, 200, false, withSkills(204))[2]).toBe(320);
  });

  it('skill 39 → sp2 255', () => {
    expect(getMasteryCap(ECharClass.TK, 200, false, withSkills(39))[2]).toBe(255);
  });

  it('skill 204 beats skill 39 on sp2', () => {
    expect(getMasteryCap(ECharClass.TK, 200, false, withSkills(204, 39))[2]).toBe(320);
  });

  it('skill 208 → sp3 320', () => {
    expect(getMasteryCap(ECharClass.TK, 200, false, withSkills(208))[3]).toBe(320);
  });

  it('skill 47 → sp3 255', () => {
    expect(getMasteryCap(ECharClass.TK, 200, false, withSkills(47))[3]).toBe(255);
  });

  it('skill 208 beats skill 47 on sp3', () => {
    expect(getMasteryCap(ECharClass.TK, 200, false, withSkills(208, 47))[3]).toBe(320);
  });
});

describe('getMasteryCap — interactions', () => {
  it('lifts apply regardless of celestial tier', () => {
    expect(getMasteryCap(ECharClass.TK, 100, true, withSkills(205))[0]).toBe(280);
    expect(getMasteryCap(ECharClass.FM, 100, true, withSkills(200))[1]).toBe(320);
  });

  it('lifts apply on top of sub-200 mortal base', () => {
    expect(getMasteryCap(ECharClass.TK, 50, false, withSkills(205))[0]).toBe(280);
    expect(getMasteryCap(ECharClass.TK, 50, false, withSkills(31))[1]).toBe(255);
  });

  it('regression: learnedSkill [0,0] → all base', () => {
    expect(getMasteryCap(ECharClass.HT, 200, false, NONE)).toEqual([200, 200, 200, 200]);
  });

  it('full-loadout TK: 205+200+204+208', () => {
    expect(getMasteryCap(ECharClass.TK, 200, false, withSkills(205, 200, 204, 208))).toEqual([
      280, 320, 320, 320,
    ]);
  });
});
