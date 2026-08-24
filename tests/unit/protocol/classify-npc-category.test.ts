import { describe, it, expect } from 'vitest';
import { classifyNpcCategory } from '@main/protocol/mob-discriminator';

describe('classifyNpcCategory', () => {
  it('classifies bank NPCs by nibble 2', () => {
    expect(classifyNpcCategory('Anything', undefined, 0x02)).toBe('bank');
    expect(classifyNpcCategory('X', undefined, 0x42)).toBe('bank'); // 0x42 & 0xf = 2
  });

  it('classifies shop NPCs by nibble 3', () => {
    expect(classifyNpcCategory('Smith', undefined, 0x03)).toBe('shop');
    expect(classifyNpcCategory('X', undefined, 0xf3)).toBe('shop'); // 0xf3 & 0xf = 3
  });

  it('classifies compose NPCs by actionType 0x43 (overrides nibble)', () => {
    expect(classifyNpcCategory('Adventurer', 0x43, 0x01)).toBe('compose');
    expect(classifyNpcCategory('X', 0x43, 0x02)).toBe('compose');
  });

  it('returns unknown for nibble 1 (dialog — probe determines real type)', () => {
    expect(classifyNpcCategory('Galford', undefined, 0x01)).toBe('unknown');
    expect(classifyNpcCategory('SomeNPC', undefined, 0x01)).toBe('unknown');
  });

  it('returns unknown for any unmapped nibble without compose actionType', () => {
    expect(classifyNpcCategory('Anything')).toBe('unknown');
    expect(classifyNpcCategory('X', 0x10, 0x05)).toBe('unknown');
    expect(classifyNpcCategory('X', 0x3a, 0x01)).toBe('unknown');
  });
});
