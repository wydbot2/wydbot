/**
 * Mount-feed whitelist — bit-exact mirror of the game client's feed gate.
 * 18 clauses → 64 mount ids.
 *
 * Returns `true` iff (mountId, foodId) is a valid (equipped-mount, candidate
 * food) pair that the canonical server will accept. Used as the **sole** gate
 * for food-slot selection in the auto-feed ambient module (see
 * `macro-auto-mount-feed.ts`).
 *
 * **DO NOT widen the set heuristically.** A pair outside this table either
 * fails server-side silently (wasting a 500 ms cooldown bucket) or is a real
 * gap (e.g. `0xb92`, which is NOT in the canonical whitelist). When in doubt,
 */

const range = (lo: number, hi: number): number[] => {
  const out: number[] = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
};

// Cluster G — wide range + extras (N merged in): all share foods {0x97a, 0xd2d}
const G_MOUNTS: readonly number[] = [
  ...range(0x920, 0x929),
  ...range(0x93e, 0x947),
  0xb90,
  0xb91,
  0x935, // N — extras outside the main range, same foods
  0x953, // N
];

// Cluster L — short ranges + extras (O merged in): all share foods {0x97d, 0xd30}
const L_MOUNTS: readonly number[] = [
  ...range(0x92f, 0x931),
  ...range(0x94d, 0x94f),
  0x936, // O — extras, same foods
  0x954, // O
];

// Cluster M — short ranges: foods {0x97e, 0xd31}
const M_MOUNTS: readonly number[] = [...range(0x932, 0x934), ...range(0x950, 0x952)];

interface FoodCluster {
  readonly mounts: readonly number[];
  readonly foods: readonly number[];
}

const CLUSTERS: readonly FoodCluster[] = [
  { mounts: [0x91a, 0x938], foods: [0x974] }, // A — asymmetric (only food)
  { mounts: [0x91b, 0x939], foods: [0x975, 0xd28] }, // B
  { mounts: [0x91c, 0x93a], foods: [0x976, 0xd29] }, // C
  { mounts: [0x91d, 0x93b], foods: [0x977, 0xd2a] }, // D
  { mounts: [0x91e, 0x93c], foods: [0x978, 0xd2b] }, // E
  { mounts: [0x91f, 0x93d], foods: [0x979, 0xd2c] }, // F
  { mounts: G_MOUNTS, foods: [0x97a, 0xd2d] }, // G + N
  { mounts: [0x92a, 0x948], foods: [0x984, 0xd37] }, // H
  { mounts: [0x92b, 0x949], foods: [0x985, 0xd38] }, // I
  { mounts: [0x92d, 0x94b], foods: [0x97b, 0xd2e] }, // J
  { mounts: [0x92e, 0x94c], foods: [0x97c, 0xd2f] }, // K
  { mounts: L_MOUNTS, foods: [0x97d, 0xd30] }, // L + O
  { mounts: M_MOUNTS, foods: [0x97e, 0xd31] }, // M
  { mounts: [0x94a, 0x92c], foods: [0xd89, 0x986] }, // P — Pantera Negra
  { mounts: [0x955, 0x937], foods: [0xd8a, 0x987] }, // Q
  { mounts: [0xb93, 0xb94], foods: [0x173f, 0x1740] }, // R — Jackal
];

/**
 * Mount item-id → list of valid ração ids. Built once at module load by
 * inverting CLUSTERS. O(1) lookup at runtime.
 */
export const MOUNT_FOOD_PAIRS: ReadonlyMap<number, readonly number[]> = (() => {
  const out = new Map<number, number[]>();
  for (const { mounts, foods } of CLUSTERS) {
    for (const m of mounts) {
      const existing = out.get(m) ?? [];
      for (const f of foods) {
        if (!existing.includes(f)) existing.push(f);
      }
      out.set(m, existing);
    }
  }
  return out;
})();

/**
 * Returns `1` (true) if `foodId` is a valid ração for the equipped `mountId`.
 *
 * **Gap awareness:** mount id `0xb92` is NOT in the whitelist by design
 * (canonical leaves it unpaired). Callers must not assume contiguity in the
 * 0xb9X range.
 */
export const isFoodForMount = (mountId: number, foodId: number): boolean =>
  MOUNT_FOOD_PAIRS.get(mountId)?.includes(foodId) ?? false;
