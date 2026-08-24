const WEAPON_TYPE1_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0e19, 0x0e1c],
  [0x0e2d, 0x0e30],
  [0x0e41, 0x0e44],
  [0x0e55, 0x0e58],
  [0x0e69, 0x0e6c],
  [0x0e7d, 0x0e80],
  [0x0e99, 0x0ea0],
  [0x0eb9, 0x0ebc],
  [0x0ecd, 0x0ed0],
  [0x04da, 0x04e1],
  [0x0561, 0x0568],
  [0x05f7, 0x05fe],
  [0x068d, 0x0694],
];

const WEAPON_TYPE1_EXACT_IDS: ReadonlySet<number> = new Set([0x06b3, 0x06b4]);

const SPECIAL_SANC_IDS: ReadonlySet<number> = new Set([0x0db5, 0x0db6]);

export const isWeaponType1 = (itemId: number): boolean => {
  for (const [lo, hi] of WEAPON_TYPE1_RANGES) {
    if (itemId >= lo && itemId <= hi) return true;
  }
  if (WEAPON_TYPE1_EXACT_IDS.has(itemId)) return true;
  return ((itemId + 0xe6be) & 0xffff) < 0x10;
};

export const isWeaponSubType1 = (itemId: number): boolean => ((itemId + 0xe6be) & 0xffff) < 0x10;

const SANC_TABLE_A: Readonly<Record<number, number>> = {
  1: 400,
  2: 405,
  3: 410,
  4: 415,
  5: 420,
  6: 425,
  7: 435,
  8: 445,
  9: 455,
  10: 465,
  11: 475,
  12: 495,
  13: 515,
  14: 535,
  15: 560,
};

const SANC_TABLE_B: Readonly<Record<number, number>> = {
  1: 230,
  2: 250,
  3: 270,
  4: 290,
  5: 310,
  6: 330,
  7: 350,
  8: 370,
  9: 380,
  10: 390,
  11: 410,
  12: 440,
  13: 470,
  14: 510,
  15: 560,
};

const SANC_TABLE_SPECIAL: Readonly<Record<number, number>> = {
  1: 220,
  2: 230,
  3: 240,
  4: 250,
  5: 260,
  6: 270,
  7: 280,
  8: 290,
  9: 300,
  10: 310,
  11: 320,
  12: 340,
  13: 360,
  14: 380,
  15: 400,
};

const SANC_TABLE_HIGH: Readonly<Record<number, number>> = {
  11: 220,
  12: 250,
  13: 280,
  14: 320,
  15: 370,
  16: 420,
};

export const getSancMultiplier = (sancLevel: number, itemId: number): number => {
  if (sancLevel <= 0) return 100;

  if (SPECIAL_SANC_IDS.has(itemId)) {
    return SANC_TABLE_SPECIAL[sancLevel] ?? 400;
  }

  if (isWeaponType1(itemId)) {
    if (isWeaponSubType1(itemId)) {
      return SANC_TABLE_A[sancLevel] ?? 560;
    }
    return SANC_TABLE_B[sancLevel] ?? 560;
  }

  if (sancLevel > 10) {
    return SANC_TABLE_HIGH[sancLevel] ?? 420;
  }

  return (sancLevel + 10) * 10;
};
