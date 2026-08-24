import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock only `getItem` (the sole dependency) — no need to boot the real item DB.
const { getItem } = vi.hoisted(() => ({ getItem: vi.fn() }));
vi.mock('../../../../src/renderer/lib/item-db', () => ({ getItem }));

import { stackCapOf } from '../../../../src/renderer/lib/item-stack-utils';

describe('stackCapOf', () => {
  beforeEach(() => getItem.mockReset());

  it('returns 100 for the itemClass-gated cases (0x36 / 0x3D)', () => {
    getItem.mockReturnValue({ itemClass: 0x36, maxStack: 0 });
    expect(stackCapOf(1)).toBe(100);
    getItem.mockReturnValue({ itemClass: 0x3d, maxStack: 0 });
    expect(stackCapOf(2)).toBe(100);
  });

  it('returns maxStack when non-zero and not itemClass-gated', () => {
    getItem.mockReturnValue({ itemClass: 0x10, maxStack: 120 });
    expect(stackCapOf(3)).toBe(120);
  });

  it('returns 0 when not manually stackable (maxStack 0, other class)', () => {
    getItem.mockReturnValue({ itemClass: 0x10, maxStack: 0 });
    expect(stackCapOf(4)).toBe(0);
  });

  it('returns 0 for an unknown item', () => {
    getItem.mockReturnValue(undefined);
    expect(stackCapOf(999)).toBe(0);
  });
});
