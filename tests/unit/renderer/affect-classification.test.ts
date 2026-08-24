/** Affect 0x10 ("Transformação") is a buff, not a mount, so it shows in the buff strip. */
import { AFFECT_NAME_MAP } from '../../../src/renderer/components/game/personagem/character-tables';

describe('affect classification — Transformação', () => {
  it('0x10 is a buff named "Transformação"', () => {
    expect(AFFECT_NAME_MAP[0x10]).toEqual({ name: 'Transformação', kind: 'buff' });
  });

  it('0x21 stays mount (a distinct 2nd "Transformação")', () => {
    expect(AFFECT_NAME_MAP[0x21].kind).toBe('mount');
  });
});
