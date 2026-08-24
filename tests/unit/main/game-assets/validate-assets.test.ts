/**
 * The boot-critical asset validator turns "file present" into "file parseable".
 * It must collect a typed failure per unparseable/missing asset and never throw —
 * the gate and the boot sequence both rely on this to fail visibly (block +
 * on-screen error) instead of promoting or booting on an unreadable store.
 */
import { describe, expect, it } from 'vitest';
import { validateBootCriticalAssets } from '@main/game-assets/validate-assets';

// Minimal all-zero buffers sized to each parser's derived layout (all parse to
// empty-but-valid structures, so a clean store yields zero failures).
const GOOD: Record<string, Buffer> = {
  'ItemList.bin': Buffer.alloc(1000 * 168 + 4), // 1000 rows × 168 + trailer
  'extraitem.bin': Buffer.alloc(170 * 5), // 5 records × 170
  'itemname.bin': Buffer.alloc(68 * 4), // 4 records × 68
  'MountData.bin': Buffer.alloc(140 * 2 + 4),
  'MountDataV.bin': Buffer.alloc(28 * 2 + 4),
  'SkillData.bin': Buffer.alloc(104 * 1 + 4),
  'itemicon.bin': Buffer.alloc(10 * 4),
};

describe('validateBootCriticalAssets', () => {
  it('returns no failures when every asset parses', async () => {
    const failures = await validateBootCriticalAssets((name) =>
      Promise.resolve(GOOD[name] ?? null),
    );
    expect(failures).toHaveLength(0);
  });

  it('reports a missing file as a failure (never throws)', async () => {
    const failures = await validateBootCriticalAssets(() => Promise.resolve(null));
    expect(failures.length).toBeGreaterThan(0);
    expect(failures.every((f) => f.actual === 'missing')).toBe(true);
    // ItemList is one of the boot-critical assets covered.
    expect(failures.some((f) => f.asset === 'ItemList.bin')).toBe(true);
  });

  it('reports only the asset that fails to parse (isolated slice)', async () => {
    const failures = await validateBootCriticalAssets((name) =>
      Promise.resolve(name === 'ItemList.bin' ? Buffer.alloc(12345) : (GOOD[name] ?? null)),
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].asset).toBe('ItemList.bin');
    expect(failures[0].reason).toBe('unknown-layout');
  });
});
