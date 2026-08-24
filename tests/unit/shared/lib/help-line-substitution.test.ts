import { describe, it, expect } from 'vitest';

import { renderHelpLines } from '@shared/lib/help-line-substitution';
import type { ItemHelp } from '@shared/types/item-db-types';
import type { MItem } from '@shared/types/item-types';

const mkItem = (over: Partial<MItem> = {}): MItem => ({
  index: 5281,
  stackCount: 1,
  field04: 0,
  effects: [
    { index: 0, value: 0 },
    { index: 0, value: 0 },
    { index: 0, value: 0 },
  ],
  ...over,
});

const mkHelp = (count: number, lines: { color?: number; text: string }[]): ItemHelp => ({
  count,
  lines: lines.map((l) => ({ color: l.color ?? 0xffffffff, text: l.text })),
});

describe('renderHelpLines', () => {
  it('count=0 renders `%d` verbatim (no substitution ever)', () => {
    const help = mkHelp(0, [{ text: 'CS: %d' }]);
    expect(
      renderHelpLines(
        help,
        mkItem({
          effects: [
            { index: 7, value: 0 },
            { index: 0, value: 0 },
            { index: 0, value: 0 },
          ],
        }),
      ),
    ).toEqual([{ color: 0xffffffff, text: 'CS: %d' }]);
  });

  it('count=1 substitutes when the byte gate (effects[0].index) is non-zero', () => {
    const help = mkHelp(1, [{ text: 'CS: %d' }]);
    const item = mkItem({
      effects: [
        { index: 42, value: 0 },
        { index: 0, value: 0 },
        { index: 0, value: 0 },
      ],
    });
    expect(renderHelpLines(help, item)).toEqual([{ color: 0xffffffff, text: 'CS: 42' }]);
  });

  it('count=1 drops the slot when the byte gate is zero (canonical silent drop)', () => {
    const help = mkHelp(1, [{ text: 'CS: %d' }]);
    expect(renderHelpLines(help, mkItem())).toEqual([]);
  });

  it('count=1 renders slot 7 verbatim even when `%d` is present (slot gate `< 7`)', () => {
    const help = mkHelp(1, [
      { text: 'CS: %d' },
      { text: '' },
      { text: '' },
      { text: '' },
      { text: '' },
      { text: '' },
      { text: '' },
      { text: 'Footer: %d' },
      { text: '' },
    ]);
    const item = mkItem({
      effects: [
        { index: 0, value: 0 },
        { index: 0, value: 0 },
        { index: 0, value: 0 },
      ],
    });
    expect(renderHelpLines(help, item)).toEqual([{ color: 0xffffffff, text: 'Footer: %d' }]);
  });

  it('count=1 renders a `%d`-free line verbatim regardless of gate state', () => {
    const help = mkHelp(1, [{ text: 'Nível máximo: 15' }]);
    expect(renderHelpLines(help, mkItem())).toEqual([
      { color: 0xffffffff, text: 'Nível máximo: 15' },
    ]);
  });

  it('count=2 substitutes with "0" when the mapped byte is zero (unconditional mode)', () => {
    const help = mkHelp(2, [{ text: 'CS: %d' }]);
    expect(renderHelpLines(help, mkItem())).toEqual([{ color: 0xffffffff, text: 'CS: 0' }]);
  });

  it('count=2 substitutes from stackCount at slot 6 (read as uint16, masked to 0xffff)', () => {
    const help = mkHelp(2, [
      { text: '' },
      { text: '' },
      { text: '' },
      { text: '' },
      { text: '' },
      { text: '' },
      { text: 'Usos: %d' },
    ]);
    expect(renderHelpLines(help, mkItem({ stackCount: 42 }))).toEqual([
      { color: 0xffffffff, text: 'Usos: 42' },
    ]);
  });

  it('count=2 leaves slot 7 verbatim (slot gate still applies)', () => {
    const help = mkHelp(2, [
      { text: '' },
      { text: '' },
      { text: '' },
      { text: '' },
      { text: '' },
      { text: '' },
      { text: '' },
      { text: 'Overflow: %d' },
    ]);
    expect(renderHelpLines(help, mkItem({ stackCount: 99 }))).toEqual([
      { color: 0xffffffff, text: 'Overflow: %d' },
    ]);
  });

  it('count=2 renders a `%d`-free line verbatim', () => {
    const help = mkHelp(2, [{ text: 'Item do Evento' }]);
    expect(renderHelpLines(help, mkItem())).toEqual([
      { color: 0xffffffff, text: 'Item do Evento' },
    ]);
  });

  it('drops whitespace-only lines (mirrors the trim filter in buildDbFieldsView)', () => {
    const help = mkHelp(0, [{ text: '   ' }, { text: '\t' }, { text: '' }, { text: 'Keep' }]);
    expect(renderHelpLines(help, mkItem())).toEqual([{ color: 0xffffffff, text: 'Keep' }]);
  });
});
