import { describe, it, expect } from 'vitest';

import { formatItemDuration, TIME_EFFECT_INDICES } from '@shared/lib/item-duration-format';

describe('formatItemDuration', () => {
  it('Fada Azul 3901 with days+hours+minutes', () => {
    const result = formatItemDuration(
      [
        { index: 106, value: 3 },
        { index: 107, value: 5 },
        { index: 108, value: 30 },
      ],
      3901,
    );
    expect(result).toBe('3 Dia(s) 5 Horas(s) 30 Min(s)');
  });

  it('only days', () => {
    const result = formatItemDuration([{ index: 106, value: 7 }], 3901);
    expect(result).toBe('7 Dia(s)');
  });

  it('only hours', () => {
    const result = formatItemDuration([{ index: 107, value: 12 }], 3901);
    expect(result).toBe('12 Horas(s)');
  });

  it('only minutes', () => {
    const result = formatItemDuration([{ index: 108, value: 45 }], 3901);
    expect(result).toBe('45 Min(s)');
  });

  it('all zero values returns null', () => {
    const result = formatItemDuration(
      [
        { index: 106, value: 0 },
        { index: 107, value: 0 },
        { index: 108, value: 0 },
      ],
      3901,
    );
    expect(result).toBeNull();
  });

  it('no time effects returns null', () => {
    const result = formatItemDuration([{ index: 2, value: 100 }], 3901);
    expect(result).toBeNull();
  });

  it('later slot overwrites earlier (same effect index)', () => {
    const result = formatItemDuration(
      [
        { index: 106, value: 3 },
        { index: 106, value: 7 },
      ],
      3901,
    );
    expect(result).toBe('7 Dia(s)');
  });

  it('days + hours without minutes', () => {
    const result = formatItemDuration(
      [
        { index: 106, value: 2 },
        { index: 108, value: 0 },
      ],
      3901,
    );
    expect(result).toBe('2 Dia(s)');
  });

  it('item outside premium range returns null', () => {
    const result = formatItemDuration([{ index: 106, value: 3 }], 5000);
    expect(result).toBeNull();
  });

  it('boundary: item 0xf3c (3900) is included', () => {
    const result = formatItemDuration([{ index: 106, value: 1 }], 3900);
    expect(result).toBe('1 Dia(s)');
  });

  it('boundary: item 0xf81 (3969) is included', () => {
    const result = formatItemDuration([{ index: 106, value: 1 }], 3969);
    expect(result).toBe('1 Dia(s)');
  });

  it('boundary: item 0xf3b (3899) is excluded', () => {
    const result = formatItemDuration([{ index: 106, value: 1 }], 3899);
    expect(result).toBeNull();
  });

  it('empty effects array returns null', () => {
    expect(formatItemDuration([], 3901)).toBeNull();
  });
});

describe('TIME_EFFECT_INDICES', () => {
  it('contains 106-110', () => {
    expect(TIME_EFFECT_INDICES.has(106)).toBe(true);
    expect(TIME_EFFECT_INDICES.has(107)).toBe(true);
    expect(TIME_EFFECT_INDICES.has(108)).toBe(true);
    expect(TIME_EFFECT_INDICES.has(109)).toBe(true);
    expect(TIME_EFFECT_INDICES.has(110)).toBe(true);
  });

  it('does not contain non-time indices', () => {
    expect(TIME_EFFECT_INDICES.has(105)).toBe(false);
    expect(TIME_EFFECT_INDICES.has(111)).toBe(false);
  });
});
