/** `parseObjectBin` synthetic-buffer behavior. */

import { describe, expect, it } from 'vitest';

import { parseObjectBin } from '@main/game-assets/parsers';

describe('parseObjectBin', () => {
  it('throws on a truncated buffer', () => {
    expect(() => parseObjectBin(Buffer.alloc(1024))).toThrow(/truncated/);
  });
});
