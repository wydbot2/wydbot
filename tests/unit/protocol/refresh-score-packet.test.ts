/**
 * Unit tests for parseRefreshScorePacket (0x336) — combat-stat signedness.
 * The entity stats at +0xC68..0xC72 and the crit pair are signed int16
 * (game), so a negative debuff value must stay negative.
 */

import { parseRefreshScorePacket } from '../../../src/main/protocol/packet-parsers';

describe('parseRefreshScorePacket (0x336)', () => {
  it('reads the combat stats as signed (a negative debuff stays negative)', () => {
    const buf = Buffer.alloc(172); // header bytes unused — only the stat offsets matter
    buf.writeInt16LE(-10, 154); // penetration
    buf.writeInt16LE(-50, 162); // accuracy
    buf.writeInt16LE(250, 164); // evasion (positive sanity)
    buf.writeInt16LE(-5, 170); // critDamageReduction

    const p = parseRefreshScorePacket(buf);

    expect(p.penetration).toBe(-10);
    expect(p.accuracy).toBe(-50);
    expect(p.evasion).toBe(250);
    expect(p.critDamageReduction).toBe(-5);
  });
});
