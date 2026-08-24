/** `parseFieldDat` synthetic-buffer behavior. */

import { describe, expect, it } from 'vitest';

import { parseFieldDat } from '@main/game-assets/parsers';

describe('parseFieldDat', () => {
  it('throws on a desynced (truncated) buffer', () => {
    expect(() => parseFieldDat(Buffer.alloc(10))).toThrow();
  });
});
