/**
 * Unit coverage for the walk-recovery accountant (src/renderer/lib/walk-recovery.ts)
 * — the walker's smart circuit-breaker. Directly exercises the REAL module (no
 * verbatim state-machine replica): explicit `now` params keep it deterministic.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addAvoidTiles,
  AVOID_TILE_CAP,
  AVOID_TILE_TTL_MS,
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  clearAvoidTiles,
  computeAvoidPrefix,
  consumeAvoidSet,
  getWalkRecoverySnapshot,
  noteWalkerSuccess,
  PER_STEP_MAX_REJECTS,
  recordRejection,
  RECOVERY_MAX_REJECTS,
  RECOVERY_WINDOW_MS,
  REJECT_RIPPLE_MS,
  resetWalkRecovery,
  tileKey,
} from '@renderer/lib/walk-recovery';

const T0 = 2_000_000;
/** Spacing that always escapes the ripple dedup. */
const STEP = REJECT_RIPPLE_MS + 500;

beforeEach(() => {
  resetWalkRecovery();
  clearAvoidTiles();
});

describe('recordRejection — window + retry outcomes', () => {
  it('first rejection retries at the base backoff with windowCount 1', () => {
    const v = recordRejection('stale-walk', 0, T0);
    expect(v).toEqual({
      action: 'retry',
      backoffMs: BACKOFF_BASE_MS,
      deduped: false,
      windowCount: 1,
    });
  });

  it('ripple: a rejection < REJECT_RIPPLE_MS after the counted one is not counted', () => {
    recordRejection('queue-stale', 0, T0);
    const v = recordRejection('stale-walk', 0, T0 + REJECT_RIPPLE_MS - 1);
    expect(v.action).toBe('retry');
    if (v.action !== 'retry') return;
    expect(v.deduped).toBe(true);
    expect(v.windowCount).toBe(0);
    expect(v.backoffMs).toBe(BACKOFF_BASE_MS); // ripple does not advance the backoff
    expect(getWalkRecoverySnapshot().window).toHaveLength(1);
  });

  it('backoff doubles per consecutive counted rejection (sparse, so the window never fills)', () => {
    const sparse = RECOVERY_WINDOW_MS + 10_000; // each reject prunes the previous one
    const b1 = recordRejection('stale-walk', 0, T0);
    const b2 = recordRejection('timeout', 1, T0 + sparse);
    const b3 = recordRejection('queue-stale', 0, T0 + sparse * 2);
    const b4 = recordRejection('no-result', 1, T0 + sparse * 3);
    const b5 = recordRejection('stale-walk', 0, T0 + sparse * 4);
    const backoffs = [b1, b2, b3, b4, b5].map((v) => (v.action === 'retry' ? v.backoffMs : -1));
    expect(backoffs).toEqual([500, 1000, 2000, BACKOFF_MAX_MS, BACKOFF_MAX_MS]);
    expect(BACKOFF_MAX_MS).toBe(4000); // documents the cap asserted above
  });

  it('window aging: entries older than RECOVERY_WINDOW_MS are pruned (no false pause)', () => {
    recordRejection('stale-walk', 0, T0);
    recordRejection('stale-walk', 1, T0 + STEP);
    // +1ms past the strict `>` boundary so BOTH old entries (at T0 and T0+STEP) prune.
    const v = recordRejection('stale-walk', 0, T0 + RECOVERY_WINDOW_MS + STEP + 1);
    expect(v.action).toBe('retry');
    if (v.action !== 'retry') return;
    expect(v.windowCount).toBe(1); // only the fresh entry survives
  });

  it('pause fires beyond RECOVERY_MAX_REJECTS counted rejections (systemic, spread across steps)', () => {
    recordRejection('stale-walk', 0, T0);
    recordRejection('timeout', 1, T0 + STEP);
    recordRejection('queue-stale', 0, T0 + STEP * 2);
    const v = recordRejection('no-result', 1, T0 + STEP * 3);
    expect(RECOVERY_MAX_REJECTS).toBe(3); // documents the threshold asserted below
    expect(v.action).toBe('pause');
    if (v.action !== 'pause') return;
    expect(v.windowReasons).toEqual(['stale-walk', 'timeout', 'queue-stale', 'no-result']);
  });
});

describe('recordRejection — per-step skip', () => {
  it('PER_STEP_MAX_REJECTS counted rejections on the same step skip it', () => {
    for (let i = 0; i < PER_STEP_MAX_REJECTS - 1; i++)
      recordRejection('stale-walk', 2, T0 + STEP * i);
    const v = recordRejection('stale-walk', 2, T0 + STEP * (PER_STEP_MAX_REJECTS - 1));
    expect(PER_STEP_MAX_REJECTS).toBe(6);
    expect(v.action).toBe('skip-step');
    expect(getWalkRecoverySnapshot().perStep).toEqual({ stepIndex: 2, count: 6 });
  });

  it('a same-step streak alone never pauses (pause requires >= 2 distinct steps)', () => {
    let v = recordRejection('stale-walk', 0, T0);
    for (let i = 1; i < PER_STEP_MAX_REJECTS - 1; i++)
      v = recordRejection('stale-walk', 0, T0 + STEP * i);
    // 5 same-step entries in the window (> RECOVERY_MAX_REJECTS) but distinct = 1 → retry, not pause.
    expect(v.action).toBe('retry');
    expect(getWalkRecoverySnapshot().window).toHaveLength(PER_STEP_MAX_REJECTS - 1);
  });

  it('after a skip, one counted rejection on a DIFFERENT step pauses (systemic confirmed)', () => {
    for (let i = 0; i < PER_STEP_MAX_REJECTS; i++) recordRejection('stale-walk', 2, T0 + STEP * i); // 6th → skip-step
    const v = recordRejection('stale-walk', 3, T0 + STEP * PER_STEP_MAX_REJECTS);
    expect(v.action).toBe('pause');
  });

  it('a different step index resets the streak (skip does not fire)', () => {
    recordRejection('stale-walk', 2, T0);
    const v = recordRejection('stale-walk', 3, T0 + STEP);
    expect(v.action).toBe('retry');
    expect(getWalkRecoverySnapshot().perStep).toEqual({ stepIndex: 3, count: 1 });
  });

  it('a persistent step keeps skipping on later laps until a success', () => {
    for (let i = 0; i < PER_STEP_MAX_REJECTS; i++) recordRejection('stale-walk', 2, T0 + STEP * i); // 6th → skip (streak 6)
    const again = recordRejection('stale-walk', 2, T0 + STEP * PER_STEP_MAX_REJECTS);
    expect(again.action).toBe('skip-step'); // streak continues past the threshold
    noteWalkerSuccess();
    const afterSuccess = recordRejection('stale-walk', 2, T0 + STEP * (PER_STEP_MAX_REJECTS + 1));
    expect(afterSuccess.action).toBe('retry'); // streak cleared by the success
  });
});

describe('noteWalkerSuccess — drain + reset', () => {
  it('drains the oldest window entry and resets backoff/streak', () => {
    recordRejection('stale-walk', 0, T0);
    recordRejection('timeout', 1, T0 + STEP);
    noteWalkerSuccess();
    expect(getWalkRecoverySnapshot().window).toHaveLength(1);
    expect(getWalkRecoverySnapshot().consecutiveFailures).toBe(0);
    expect(getWalkRecoverySnapshot().perStep).toBeNull();
    const v = recordRejection('stale-walk', 0, T0 + STEP * 2);
    expect(v).toMatchObject({ action: 'retry', backoffMs: BACKOFF_BASE_MS });
  });

  it('is a no-op on an empty window', () => {
    noteWalkerSuccess();
    expect(getWalkRecoverySnapshot().window).toHaveLength(0);
  });
});

describe('resetWalkRecovery', () => {
  it('clears window, backoff and per-step streak (lifecycle transition)', () => {
    recordRejection('stale-walk', 0, T0);
    recordRejection('stale-walk', 0, T0 + STEP);
    resetWalkRecovery();
    expect(getWalkRecoverySnapshot()).toMatchObject({
      window: [],
      consecutiveFailures: 0,
      perStep: null,
    });
  });
});

describe('avoid-tile blacklist', () => {
  it('tileKey is the row-major world index', () => {
    expect(tileKey({ x: 1, y: 0 })).toBe(1);
    expect(tileKey({ x: 0, y: 1 })).toBe(4096);
    expect(tileKey({ x: 5, y: 7 })).toBe(7 * 4096 + 5);
  });

  it('added tiles are consumed until the TTL expires', () => {
    addAvoidTiles([{ x: 10, y: 20 }], T0);
    expect(AVOID_TILE_TTL_MS).toBe(20_000); // documents the seal window asserted below
    expect(consumeAvoidSet(T0).has(tileKey({ x: 10, y: 20 }))).toBe(true);
    expect(consumeAvoidSet(T0 + AVOID_TILE_TTL_MS - 1).size).toBe(1);
    expect(consumeAvoidSet(T0 + AVOID_TILE_TTL_MS + 1).size).toBe(0); // expired
  });

  it('re-adding a tile refreshes its TTL', () => {
    addAvoidTiles([{ x: 1, y: 1 }], T0);
    addAvoidTiles([{ x: 1, y: 1 }], T0 + AVOID_TILE_TTL_MS - 1000);
    expect(consumeAvoidSet(T0 + AVOID_TILE_TTL_MS + 500).size).toBe(1); // still alive
    expect(consumeAvoidSet(T0 + AVOID_TILE_TTL_MS * 2).size).toBe(0);
  });

  it('evicts the oldest tiles beyond AVOID_TILE_CAP', () => {
    const tiles = Array.from({ length: AVOID_TILE_CAP + 8 }, (_, i) => ({ x: i, y: 0 }));
    addAvoidTiles(tiles, T0);
    const set = consumeAvoidSet(T0);
    expect(set.size).toBe(AVOID_TILE_CAP);
    for (let i = 0; i < 8; i++) expect(set.has(tileKey({ x: i, y: 0 }))).toBe(false); // evicted
    for (let i = 8; i < AVOID_TILE_CAP + 8; i++)
      expect(set.has(tileKey({ x: i, y: 0 }))).toBe(true);
  });

  it('clearAvoidTiles empties the set (fresh macro run)', () => {
    addAvoidTiles([{ x: 3, y: 3 }], T0);
    clearAvoidTiles();
    expect(consumeAvoidSet(T0).size).toBe(0);
    expect(getWalkRecoverySnapshot().avoidCount).toBe(0);
  });
});

describe('computeAvoidPrefix', () => {
  const route = [
    { x: 100, y: 100 }, // origin — where the player stands
    { x: 101, y: 100 },
    { x: 102, y: 100 },
    { x: 103, y: 100 },
    { x: 104, y: 100 },
    { x: 105, y: 100 }, // goal
  ];

  it('returns only intermediate tiles, capped at maxTiles', () => {
    expect(computeAvoidPrefix(route, 3)).toEqual([
      { x: 101, y: 100 },
      { x: 102, y: 100 },
      { x: 103, y: 100 },
    ]);
  });

  it('never includes the goal tile, even when maxTiles covers the whole route', () => {
    const prefix = computeAvoidPrefix(route, 99);
    expect(prefix).toHaveLength(route.length - 2); // origin + goal excluded
    expect(prefix.some((t) => t.x === 105 && t.y === 100)).toBe(false);
  });

  it('never includes the origin tile', () => {
    const prefix = computeAvoidPrefix(route, 99);
    expect(prefix.some((t) => t.x === 100 && t.y === 100)).toBe(false);
  });

  it('a 2-tile route (origin adjacent to goal) yields nothing — no corridor to contour', () => {
    expect(
      computeAvoidPrefix(
        [
          { x: 100, y: 100 },
          { x: 101, y: 100 },
        ],
        3,
      ),
    ).toEqual([]);
  });

  it('an empty/degenerate route yields nothing', () => {
    expect(computeAvoidPrefix([], 3)).toEqual([]);
    expect(computeAvoidPrefix([{ x: 100, y: 100 }], 3)).toEqual([]);
  });
});
